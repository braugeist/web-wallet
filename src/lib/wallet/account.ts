import { toCoinbaseSmartAccount } from 'viem/account-abstraction'

import type { SupportedNetworkConfig } from '../../config/networks'
import { restorePasskeyOwner } from '../passkey/credential'
import type { WalletSession } from '../storage/walletSession'
import { createWalletClients } from './clients'

export async function createSmartWalletAccount(
  network: SupportedNetworkConfig,
  session: WalletSession,
) {
  const { bundlerClient, publicClient } = createWalletClients(network)
  const owner = restorePasskeyOwner(session)
  const account = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [owner],
    version: '1.1',
  })

  return {
    account,
    bundlerClient,
    publicClient,
  }
}
