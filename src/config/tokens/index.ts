import { getAddress, isAddress } from 'viem'

import type { SupportedChainId } from '../networks'
import { getSupportedNetwork } from '../networks'
import type { WalletAsset } from '../../lib/chains/types'

import mainnetTokens from './mainnet.json'
import sepoliaTokens from './sepolia.json'

type RawTokenConfig = {
  address: string
  decimals: number
  name: string
  symbol: string
}

const tokenConfigByChainId: Record<SupportedChainId, RawTokenConfig[]> = {
  1: mainnetTokens,
  11155111: sepoliaTokens,
}

export function createNativeAsset(chainId: SupportedChainId): WalletAsset {
  const network = getSupportedNetwork(chainId)

  return {
    chainId,
    decimals: 18,
    name: network.label,
    symbol: network.nativeSymbol,
    type: 'native',
  }
}

export function normalizeTokenConfig(
  chainId: SupportedChainId,
  tokens: RawTokenConfig[],
): WalletAsset[] {
  const seen = new Set<string>()

  return tokens.map((token) => {
    if (!token.name.trim() || !token.symbol.trim()) {
      throw new Error(`Token metadata is incomplete for chain ${chainId}`)
    }

    if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) {
      throw new Error(`Token decimals are invalid for ${token.symbol}`)
    }

    if (!isAddress(token.address)) {
      throw new Error(`Token address is invalid for ${token.symbol}`)
    }

    const address = getAddress(token.address)
    const key = `${chainId}:${address}`
    if (seen.has(key)) {
      throw new Error(`Duplicate token address detected for ${token.symbol}`)
    }

    seen.add(key)

    return {
      address,
      chainId,
      decimals: token.decimals,
      name: token.name.trim(),
      symbol: token.symbol.trim().toUpperCase(),
      type: 'erc20' as const,
    }
  })
}

export function getCuratedAssets(chainId: SupportedChainId): WalletAsset[] {
  return [createNativeAsset(chainId), ...normalizeTokenConfig(chainId, tokenConfigByChainId[chainId])]
}
