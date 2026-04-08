import type { Address, Hex } from 'viem'

import type { SupportedNetworkConfig } from '../../config/networks'

export function truncateAddress(value: string, leading = 6, trailing = 4) {
  if (value.length <= leading + trailing) {
    return value
  }

  return `${value.slice(0, leading)}...${value.slice(-trailing)}`
}

export function getTransactionExplorerUrl(network: SupportedNetworkConfig, hash: Hex) {
  return `${network.explorerUrl}/tx/${hash}`
}

export function getAddressExplorerUrl(network: SupportedNetworkConfig, address: Address) {
  return `${network.explorerUrl}/address/${address}`
}
