import { describe, expect, it } from 'vitest'

import { createNativeAsset, normalizeTokenConfig } from './index'

describe('token config normalization', () => {
  it('normalizes casing and symbol format', () => {
    const [token] = normalizeTokenConfig(11155111, [
      {
        address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'usdc',
      },
    ])

    expect(token.address).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
    expect(token.symbol).toBe('USDC')
  })

  it('rejects duplicate addresses', () => {
    expect(() =>
      normalizeTokenConfig(1, [
        {
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          decimals: 6,
          name: 'USD Coin',
          symbol: 'USDC',
        },
        {
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          decimals: 6,
          name: 'USD Coin Duplicate',
          symbol: 'USDC2',
        },
      ]),
    ).toThrow('Duplicate token address detected')
  })

  it('creates a native ETH asset for supported chains', () => {
    expect(createNativeAsset(1)).toMatchObject({
      chainId: 1,
      decimals: 18,
      symbol: 'ETH',
      type: 'native',
    })
  })
})
