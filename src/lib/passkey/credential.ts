import {
  createWebAuthnCredential,
  toWebAuthnAccount,
} from 'viem/account-abstraction'

import type { WalletSession } from '../storage/walletSession'

const DEFAULT_RP_NAME = 'Passkey Wallet'

export function isPasskeySupported() {
  return typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window
}

export function getRelyingPartyId() {
  if (typeof window === 'undefined') {
    return 'localhost'
  }

  return window.location.hostname || 'localhost'
}

export async function registerPasskey(label: string) {
  const rpId = getRelyingPartyId()
  const credential = await createWebAuthnCredential({
    name: label,
    rp: {
      id: rpId,
      name: DEFAULT_RP_NAME,
    },
  })

  const session: WalletSession = {
    createdAt: new Date().toISOString(),
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
    },
    label,
    rpId,
    version: 1,
  }

  return session
}

export function restorePasskeyOwner(session: WalletSession) {
  return toWebAuthnAccount({
    credential: session.credential,
    rpId: session.rpId,
  })
}
