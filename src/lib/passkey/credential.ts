import {
  createWebAuthnCredential,
  toWebAuthnAccount,
} from 'viem/account-abstraction'
import { bytesToHex } from 'viem'
import { PublicKey } from 'ox'
import { Authentication } from 'ox/webauthn'

import type { WalletSession } from '../storage/walletSession'
import { createMockOwner, createMockSession, isMockPasskeyEnabled } from './mock'

const DEFAULT_RP_NAME = 'WebWallet'

export function isPasskeySupported() {
  if (isMockPasskeyEnabled()) {
    return true
  }

  return typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window
}

export function getRelyingPartyId() {
  if (typeof window === 'undefined') {
    return 'localhost'
  }

  return window.location.hostname || 'localhost'
}

export async function registerPasskey(label: string) {
  if (isMockPasskeyEnabled()) {
    return createMockSession(label)
  }

  const rpId = getRelyingPartyId()
  const credential = await createWebAuthnCredential({
    authenticatorSelection: {
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'required',
    },
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

function createVerificationChallenge() {
  const challenge = new Uint8Array(32)
  window.crypto.getRandomValues(challenge)
  return bytesToHex(challenge)
}

export async function verifyRecoveryPasskey(session: WalletSession) {
  if (isMockPasskeyEnabled()) {
    return
  }

  const challenge = createVerificationChallenge()
  const response = await Authentication.sign({
    challenge,
    rpId: session.rpId,
    userVerification: 'required',
  })

  const isValid = Authentication.verify({
    challenge,
    metadata: response.metadata,
    origin: window.location.origin,
    publicKey: PublicKey.fromHex(session.credential.publicKey),
    rpId: session.rpId,
    signature: response.signature,
  })

  if (!isValid) {
    throw new Error('The selected passkey does not match this recovery file.')
  }
}

export function restorePasskeyOwner(session: WalletSession) {
  if (isMockPasskeyEnabled()) {
    return createMockOwner()
  }

  return toWebAuthnAccount({
    credential: session.credential,
    rpId: session.rpId,
  })
}
