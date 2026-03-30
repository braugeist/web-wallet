import type { Hex } from 'viem'

const STORAGE_KEY = 'webwallet.session'

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

export function parseWalletSession(value: unknown): WalletSession | null {
  const parsed = value as WalletSession

  if (
    parsed?.version !== 1 ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.label !== 'string' ||
    typeof parsed.rpId !== 'string' ||
    typeof parsed.credential?.id !== 'string' ||
    typeof parsed.credential?.publicKey !== 'string'
  ) {
    return null
  }

  return parsed
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
    return parseWalletSession(JSON.parse(raw))
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
