import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

import type { WalletSession } from '../storage/walletSession'

const env = import.meta.env

const MOCK_PRIVATE_KEY = getMockPrivateKey()

const MOCK_CREDENTIAL_ID = 'mock-passkey-credential'

function getMockPrivateKey(): Hex {
  const envPrivateKey = env.VITE_MOCK_PRIVATE_KEY?.trim()

  if (isPrivateKey(envPrivateKey)) {
    return envPrivateKey
  }

  const privateKey = generatePrivateKey()

  console.info(
    `[mock-passkey] Generated private key. Add this to .env.development to reuse it:\nVITE_MOCK_PRIVATE_KEY=${privateKey}`,
  )

  return privateKey
}

function isPrivateKey(value: string | undefined): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? '')
}

export function isMockPasskeyEnabled() {
  return env.VITE_MOCK_PASSKEY === 'true'
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
