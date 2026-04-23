import { supportedNetworks, type SupportedChainId } from '../../config/networks'

const STORAGE_KEY = 'webwallet.networkRpcUrls'
const supportedChainIds = new Set(supportedNetworks.map((network) => network.chainId))

type RpcUrlMap = Partial<Record<SupportedChainId, string>>

function isSupportedChainId(value: number): value is SupportedChainId {
  return supportedChainIds.has(value as SupportedChainId)
}

function isValidRpcUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function loadNetworkRpcUrls(): RpcUrlMap {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>

    return Object.entries(parsed).reduce<RpcUrlMap>((result, [rawChainId, rawRpcUrl]) => {
      const chainId = Number.parseInt(rawChainId, 10)
      if (!Number.isFinite(chainId) || !isSupportedChainId(chainId)) {
        return result
      }

      if (typeof rawRpcUrl !== 'string') {
        return result
      }

      const rpcUrl = rawRpcUrl.trim()
      if (!rpcUrl || !isValidRpcUrl(rpcUrl)) {
        return result
      }

      result[chainId] = rpcUrl
      return result
    }, {})
  } catch {
    return {}
  }
}

export function saveNetworkRpcUrls(urls: RpcUrlMap) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
}
