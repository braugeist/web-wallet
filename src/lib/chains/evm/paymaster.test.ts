import { describe, expect, it } from 'vitest'

import { getSupportedNetwork } from '../../../config/networks'
import type { WalletAsset } from '../types'
import {
  buildApproveSpenderCall,
  estimateErc20GasFee,
  estimateUsdGasFee,
  getUserOperationMaxGas,
  isSupportedErc20GasAsset,
} from './paymaster'

const sepoliaNetwork = getSupportedNetwork(11155111)

const usdcAsset: WalletAsset = {
  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  chainId: 11155111,
  decimals: 6,
  name: 'USD Coin',
  symbol: 'USDC',
  type: 'erc20',
}

describe('isSupportedErc20GasAsset', () => {
  it('accepts Sepolia USDC for gas payments', () => {
    expect(isSupportedErc20GasAsset(sepoliaNetwork, usdcAsset)).toBe(true)
  })
})

describe('buildApproveSpenderCall', () => {
  it('encodes an unlimited approval', () => {
    const call = buildApproveSpenderCall(
      '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      '0x0000000000000039cd5e8ae05257ce51c473ddd1',
    )

    expect(call.to).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
    expect(call.value).toBe(0n)
    expect(call.data?.startsWith('0x095ea7b3')).toBe(true)
  })
})

describe('ERC-20 paymaster estimates', () => {
  const preparedUserOperation = {
    callGasLimit: 100n,
    maxFeePerGas: 10n,
    maxPriorityFeePerGas: 1n,
    preVerificationGas: 25n,
    verificationGasLimit: 50n,
  }

  const quote = {
    exchangeRate: 2n * 10n ** 18n,
    exchangeRateNativeToUsd: 3n * 10n ** 18n,
    paymaster: '0x0000000000000039cd5e8ae05257ce51c473ddd1' as const,
    postOpGas: 20n,
    token: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
  }

  it('adds all gas buckets before converting to token cost', () => {
    expect(getUserOperationMaxGas(preparedUserOperation)).toBe(175n)
    expect(estimateErc20GasFee(preparedUserOperation, quote)).toBe(3900n)
  })

  it('uses the USD exchange rate for fiat estimates', () => {
    expect(estimateUsdGasFee(preparedUserOperation, quote)).toBe(5850n)
  })
})
