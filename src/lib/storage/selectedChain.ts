import { supportedNetworks, type SupportedChainId } from '../../config/networks'

const STORAGE_KEY = 'webwallet.selectedChainId'

const supportedChainIds = new Set(supportedNetworks.map((network) => network.chainId))

function isSupportedChainId(value: number): value is SupportedChainId {
  return supportedChainIds.has(value as SupportedChainId)
}

export function loadSelectedChainId(): SupportedChainId | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    return null
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || !isSupportedChainId(parsed)) {
    return null
  }

  return parsed
}

export function saveSelectedChainId(chainId: SupportedChainId) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, String(chainId))
}
