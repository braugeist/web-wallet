import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

import type { WalletSession } from '../storage/walletSession'

const MOCK_PRIVATE_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const MOCK_CREDENTIAL_ID = 'mock-passkey-credential'

export function isMockPasskeyEnabled() {
  return import.meta.env.VITE_MOCK_PASSKEY === 'true'
}

export function createMockSession(label: string): WalletSession {
  const account = privateKeyToAccount(MOCK_PRIVATE_KEY)

  return {
    createdAt: new Date().toISOString(),
    credential: {
      id: MOCK_CREDENTIAL_ID,
      publicKey: account.address,
    },
    label,
    rpId: 'localhost',
    version: 1,
  }
}

export function createMockOwner() {
  return privateKeyToAccount(MOCK_PRIVATE_KEY)
}
