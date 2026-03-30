import type { Hex } from 'viem'

const STORAGE_KEY = 'passkey-wallet.session'

export type WalletSession = {
  createdAt: string
  credential: {
    id: string
    publicKey: Hex
  }
  label: string
  rpId: string
  version: 1
}

export function loadWalletSession(): WalletSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as WalletSession

    if (
      parsed?.version !== 1 ||
      typeof parsed.label !== 'string' ||
      typeof parsed.rpId !== 'string' ||
      typeof parsed.credential?.id !== 'string' ||
      typeof parsed.credential?.publicKey !== 'string'
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveWalletSession(session: WalletSession) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearWalletSession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
