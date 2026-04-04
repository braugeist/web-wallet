import { createPublicClient, hexToBigInt, http, type Hex } from 'viem'
import { createBundlerClient } from 'viem/account-abstraction'
import { estimateFeesPerGas } from 'viem/actions'

import type { SupportedNetworkConfig } from '../../config/networks'

type PimlicoUserOperationGasPriceResult = {
  slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }
  standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }
  fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }
}

export function createWalletClients(network: SupportedNetworkConfig) {
  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
  })

  const bundlerClient = createBundlerClient({
    client: publicClient,
    chain: network.chain,
    transport: http(network.bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient: bc }) => {
        try {
          const request = bc.request as (parameters: {
            method: string
            params?: unknown[]
          }) => Promise<unknown>
          const result = (await request({
            method: 'pimlico_getUserOperationGasPrice',
            params: [],
          })) as PimlicoUserOperationGasPriceResult
          const tier = result.standard
          return {
            maxFeePerGas: hexToBigInt(tier.maxFeePerGas),
            maxPriorityFeePerGas: hexToBigInt(tier.maxPriorityFeePerGas),
          }
        } catch {
          const fees = await estimateFeesPerGas(publicClient, {
            chain: network.chain,
            type: 'eip1559',
          })
          return {
            maxFeePerGas: 2n * fees.maxFeePerGas,
            maxPriorityFeePerGas: 2n * fees.maxPriorityFeePerGas,
          }
        }
      },
    },
  })

  return {
    bundlerClient,
    publicClient,
  }
}
