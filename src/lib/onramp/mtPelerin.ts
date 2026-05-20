import { hexToBytes, type Hex } from 'viem'

import type { SupportedNetworkConfig } from '../../config/networks'
import type { WalletAsset } from '../chains/types'
import type { WalletSession } from '../storage/walletSession'
import { createSmartWalletAccount } from '../wallet/account'

export const MT_PELERIN_WIDGET_ORIGIN = 'https://widget.mtpelerin.com'
export const MT_PELERIN_LOCAL_TEST_KEY = 'bec6626e-8913-497d-9835-6e6ae9edb144'

const MT_PELERIN_WIDGET_URL = `${MT_PELERIN_WIDGET_ORIGIN}/`
const DEFAULT_FIAT_CURRENCY = 'USD'
const DEFAULT_PRIMARY_COLOR = '#111111'
const DEFAULT_SUCCESS_COLOR = '#111111'
const SUPPORTED_CHAIN_ID = 1
const MT_PELERIN_ADDRESS_VALIDATION_CHAIN = 'mainnet'
const SUPPORTED_ONRAMP_ASSETS = new Set([
  'DAI',
  'ETH',
  'USDC',
])

const env = import.meta.env

export type MtPelerinWidgetEvent =
  | {
    type: 'paymentSubmitted'
    data: {
      paymentId?: string
      paymentType?: string
    }
  }
  | {
    type: 'orderCreated'
    data: {
      id?: string
      type?: string
    }
  }

export type MtPelerinAddressValidationParameters = {
  chain?: string
  code: string
  hash: string
}

type BuildMtPelerinOnrampUrlOptions = {
  address?: string | null
  addressValidation?: MtPelerinAddressValidationParameters | null
  allowedCryptoCurrencies?: string[]
  cryptoCurrency: string
  fiatCurrency?: string
  integrationKey?: string
  primaryColor?: string
  referralCode?: string
  successColor?: string
}

function getConfiguredValue(value: string | undefined) {
  const configuredValue = value?.trim()
  return configuredValue || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createMtPelerinValidationCode() {
  const minimumCode = 1000
  const codeCount = 9000

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return String(minimumCode + (values[0] % codeCount))
  }

  return String(minimumCode + Math.floor(Math.random() * codeCount))
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export function mtPelerinSignatureToBase64Hash(signature: Hex) {
  return bytesToBase64(hexToBytes(signature))
}

export function getMtPelerinIntegrationKey() {
  return getConfiguredValue(env.VITE_MT_PELERIN_INTEGRATION_KEY) ?? MT_PELERIN_LOCAL_TEST_KEY
}

export function getMtPelerinDefaultFiatCurrency() {
  return getConfiguredValue(env.VITE_MT_PELERIN_DEFAULT_FIAT) ?? DEFAULT_FIAT_CURRENCY
}

export function getMtPelerinPrimaryColor() {
  return getConfiguredValue(env.VITE_MT_PELERIN_PRIMARY_COLOR) ?? DEFAULT_PRIMARY_COLOR
}

export function getMtPelerinReferralCode() {
  return getConfiguredValue(env.VITE_MT_PELERIN_REFERRAL_CODE)
}

export function getMtPelerinSuccessColor() {
  return getConfiguredValue(env.VITE_MT_PELERIN_SUCCESS_COLOR) ?? DEFAULT_SUCCESS_COLOR
}

export function isMtPelerinSupportedAsset(asset: WalletAsset) {
  return asset.chainId === SUPPORTED_CHAIN_ID && SUPPORTED_ONRAMP_ASSETS.has(asset.symbol)
}

export async function createMtPelerinAddressValidation({
  address,
  network,
  session,
}: {
  address: string
  network: SupportedNetworkConfig
  session: WalletSession
}): Promise<MtPelerinAddressValidationParameters> {
  if (network.chainId !== SUPPORTED_CHAIN_ID) {
    throw new Error('Mt Pelerin address validation is only configured for Ethereum Mainnet.')
  }

  const { account } = await createSmartWalletAccount(network, session)

  if (account.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Mt Pelerin address validation address does not match the active wallet.')
  }

  const code = createMtPelerinValidationCode()
  const signature = await account.signMessage({
    message: `MtPelerin-${code}`,
  })

  return {
    chain: MT_PELERIN_ADDRESS_VALIDATION_CHAIN,
    code,
    hash: mtPelerinSignatureToBase64Hash(signature),
  }
}

export function buildMtPelerinOnrampUrl({
  address,
  addressValidation,
  allowedCryptoCurrencies = [...SUPPORTED_ONRAMP_ASSETS],
  cryptoCurrency,
  fiatCurrency = getMtPelerinDefaultFiatCurrency(),
  integrationKey = getMtPelerinIntegrationKey(),
  primaryColor = getMtPelerinPrimaryColor(),
  referralCode = getMtPelerinReferralCode(),
  successColor = getMtPelerinSuccessColor(),
}: BuildMtPelerinOnrampUrlOptions) {
  const url = new URL(MT_PELERIN_WIDGET_URL)
  const supportedCurrencies = allowedCryptoCurrencies.filter(Boolean)
  const params = url.searchParams

  params.set('_ctkn', integrationKey)
  params.set('type', 'web')
  params.set('lang', 'en')
  params.set('tabs', 'buy')
  params.set('tab', 'buy')
  params.set('net', 'mainnet')
  params.set('nets', 'mainnet')
  params.set('dnet', 'mainnet')
  params.set('bsc', fiatCurrency)
  params.set('bdc', cryptoCurrency)
  params.set('primary', primaryColor)
  params.set('success', successColor)

  if (supportedCurrencies.length > 0) {
    params.set('crys', supportedCurrencies.join(','))
  }

  if (address) {
    params.set('addr', address)
  }

  if (addressValidation) {
    params.set('code', addressValidation.code)
    params.set('hash', addressValidation.hash)

    if (addressValidation.chain) {
      params.set('chain', addressValidation.chain)
    }
  }

  if (referralCode) {
    params.set('rfr', referralCode)
  }

  return url.toString()
}

export function parseMtPelerinWidgetEvent(value: unknown): MtPelerinWidgetEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.data)) {
    return null
  }

  if (value.type === 'paymentSubmitted') {
    return {
      type: 'paymentSubmitted',
      data: {
        paymentId: typeof value.data.paymentId === 'string' ? value.data.paymentId : undefined,
        paymentType: typeof value.data.paymentType === 'string' ? value.data.paymentType : undefined,
      },
    }
  }

  if (value.type === 'orderCreated') {
    return {
      type: 'orderCreated',
      data: {
        id: typeof value.data.id === 'string' ? value.data.id : undefined,
        type: typeof value.data.type === 'string' ? value.data.type : undefined,
      },
    }
  }

  return null
}
