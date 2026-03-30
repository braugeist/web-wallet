import { createPublicClient, http } from 'viem'
import { createBundlerClient } from 'viem/account-abstraction'

import type { SupportedNetworkConfig } from '../../config/networks'

export function createWalletClients(network: SupportedNetworkConfig) {
  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
  })

  const bundlerClient = createBundlerClient({
    client: publicClient,
    chain: network.chain,
    transport: http(network.bundlerUrl),
  })

  return {
    bundlerClient,
    publicClient,
  }
}
