import { describe, expect, it } from 'vitest'

import type { WalletAsset } from '../types'
import { buildTransferCalls, getEstimatedUserOperationFee } from './transfers'

const nativeAsset: WalletAsset = {
  chainId: 11155111,
  decimals: 18,
  name: 'Ether',
  symbol: 'ETH',
  type: 'native',
}

const tokenAsset: WalletAsset = {
  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  chainId: 11155111,
  decimals: 6,
  name: 'USD Coin',
  symbol: 'USDC',
  type: 'erc20',
}

describe('buildTransferCalls', () => {
  it('builds a native transfer call', () => {
    const result = buildTransferCalls(
      nativeAsset,
      '0x000000000000000000000000000000000000dead',
      '0.01',
    )

    expect(result.value).toBe(10_000_000_000_000_000n)
    expect(result.calls).toEqual([
      {
        to: '0x000000000000000000000000000000000000dEaD',
        value: 10_000_000_000_000_000n,
      },
    ])
  })

  it('builds an erc20 transfer call', () => {
    const result = buildTransferCalls(
      tokenAsset,
      '0x000000000000000000000000000000000000dead',
      '15.5',
    )

    expect(result.value).toBe(15_500_000n)
    expect(result.calls[0]?.to).toBe(tokenAsset.address)
    expect(result.calls[0]?.data?.startsWith('0xa9059cbb')).toBe(true)
  })
})

describe('getEstimatedUserOperationFee', () => {
  it('adds gas buckets before multiplying by max fee per gas', () => {
    expect(
      getEstimatedUserOperationFee({
        callGasLimit: 10n,
        maxFeePerGas: 100n,
        preVerificationGas: 5n,
        verificationGasLimit: 20n,
      }),
    ).toBe(3_500n)
  })
})
