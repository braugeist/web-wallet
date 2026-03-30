import { erc20Abi } from 'viem'

import type { WalletAsset, WalletBalance } from '../types'
import type { SupportedNetworkConfig } from '../../../config/networks'
import type { WalletSession } from '../../storage/walletSession'
import { createSmartWalletAccount } from '../../wallet/account'

export async function getEvmBalances(
  network: SupportedNetworkConfig,
  session: WalletSession,
  assets: WalletAsset[],
): Promise<WalletBalance[]> {
  const { account, publicClient } = await createSmartWalletAccount(network, session)

  return Promise.all(
    assets.map(async (asset) => {
      if (asset.type === 'native') {
        const value = await publicClient.getBalance({
          address: account.address,
        })

        return { asset, value }
      }

      if (!asset.address) {
        throw new Error(`Token ${asset.symbol} is missing a contract address.`)
      }

      const value = await publicClient.readContract({
        abi: erc20Abi,
        address: asset.address,
        args: [account.address],
        functionName: 'balanceOf',
      })

      return { asset, value }
    }),
  )
}
