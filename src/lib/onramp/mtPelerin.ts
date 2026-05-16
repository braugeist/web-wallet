import type { WalletAsset } from '../chains/types'

export const MT_PELERIN_WIDGET_ORIGIN = 'https://widget.mtpelerin.com'
export const MT_PELERIN_LOCAL_TEST_KEY = 'bec6626e-8913-497d-9835-6e6ae9edb144'

const MT_PELERIN_WIDGET_URL = `${MT_PELERIN_WIDGET_ORIGIN}/`
const DEFAULT_FIAT_CURRENCY = 'USD'
const DEFAULT_PRIMARY_COLOR = '#111111'
const DEFAULT_SUCCESS_COLOR = '#111111'
const SUPPORTED_CHAIN_ID = 1
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

type BuildMtPelerinOnrampUrlOptions = {
  address?: string | null
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

export function buildMtPelerinOnrampUrl({
  address,
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
