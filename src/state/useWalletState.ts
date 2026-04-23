import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'

import { getCuratedAssets } from '../config/tokens'
import { defaultNetwork, getSupportedNetwork, type SupportedChainId } from '../config/networks'
import { evmChainAdapter } from '../lib/chains/evm/adapter'
import type { TransferQuote, TransferResult, WalletAsset, WalletBalance } from '../lib/chains/types'
import {
  isPasskeySupported,
  registerPasskey,
  verifyRecoveryPasskey,
} from '../lib/passkey/credential'
import {
  parseRecoveryFile,
  triggerRecoveryFileDownload,
} from '../lib/storage/recoveryFile'
import { loadNetworkRpcUrls, saveNetworkRpcUrls } from '../lib/storage/networkRpcUrl'
import { loadSelectedChainId, saveSelectedChainId } from '../lib/storage/selectedChain'
import {
  clearWalletSession,
  loadWalletSession,
  saveWalletSession,
  type WalletSession,
} from '../lib/storage/walletSession'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

export function useWalletState() {
  const [selectedChainId, setSelectedChainId] = useState<SupportedChainId>(
    () => loadSelectedChainId() ?? defaultNetwork.chainId,
  )

  useEffect(() => {
    saveSelectedChainId(selectedChainId)
  }, [selectedChainId])
  const [networkRpcUrls, setNetworkRpcUrls] = useState(() => loadNetworkRpcUrls())
  const [session, setSession] = useState<WalletSession | null>(() => loadWalletSession())
  const [address, setAddress] = useState<Address | null>(null)
  const [balances, setBalances] = useState<WalletBalance[]>([])
  const [quote, setQuote] = useState<TransferQuote | null>(null)
  const [result, setResult] = useState<TransferResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRestoringFromFile, setIsRestoringFromFile] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isExportingRecoveryFile, setIsExportingRecoveryFile] = useState(false)

  const baseNetwork = useMemo(() => getSupportedNetwork(selectedChainId), [selectedChainId])
  const customRpcUrl = networkRpcUrls[selectedChainId]?.trim()
  const network = useMemo(
    () => (
      customRpcUrl
        ? {
            ...baseNetwork,
            rpcUrl: customRpcUrl,
          }
        : baseNetwork
    ),
    [baseNetwork, customRpcUrl],
  )
  const assets = useMemo(() => getCuratedAssets(selectedChainId), [selectedChainId])

  const refresh = useCallback(
    async (activeSession: WalletSession) => {
      setIsRefreshing(true)
      setError(null)

      try {
        const [nextAddress, nextBalances] = await Promise.all([
          evmChainAdapter.getAddress({
            network,
            session: activeSession,
          }),
          evmChainAdapter.getBalances({
            assets,
            network,
            session: activeSession,
          }),
        ])

        setAddress(nextAddress)
        setBalances(nextBalances)
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
      } finally {
        setIsRefreshing(false)
      }
    },
    [assets, network],
  )

  useEffect(() => {
    if (!session) {
      setAddress(null)
      setBalances([])
      setQuote(null)
      return
    }

    void refresh(session)
  }, [refresh, session])

  const createWallet = useCallback(async (): Promise<boolean> => {
    if (!isPasskeySupported()) {
      setError('Passkeys require a secure browser context with WebAuthn support.')
      return false
    }

    setIsCreating(true)
    setError(null)
    setStatusMessage(null)

    try {
      const nextSession = await registerPasskey('WebWallet')
      saveWalletSession(nextSession)
      setSession(nextSession)
      setStatusMessage('Wallet created. Fund the address to start sending.')
      return true
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return false
    } finally {
      setIsCreating(false)
    }
  }, [])

  const reconnectWallet = useCallback(async () => {
    const nextSession = loadWalletSession()

    if (!nextSession) {
      setError('No saved wallet was found in this browser.')
      return
    }

    setSession(nextSession)
    setStatusMessage('Wallet restored from this browser profile.')
  }, [])

  const restoreFromRecoveryFile = useCallback(async (file: File) => {
    setIsRestoringFromFile(true)
    setError(null)
    setStatusMessage('Select the original passkey to verify this recovery file.')

    try {
      const nextSession = await parseRecoveryFile(await file.text())
      await verifyRecoveryPasskey(nextSession)
      saveWalletSession(nextSession)
      setSession(nextSession)
      setStatusMessage('Wallet restored from the recovery file.')
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      setStatusMessage(null)
    } finally {
      setIsRestoringFromFile(false)
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    clearWalletSession()
    setSession(null)
    setAddress(null)
    setBalances([])
    setQuote(null)
    setResult(null)
    setError(null)
    setStatusMessage('Saved wallet metadata removed from this browser.')
  }, [])

  const exportRecoveryFile = useCallback(async (): Promise<boolean> => {
    if (!session) {
      setError('Create or restore a wallet first.')
      return false
    }

    setIsExportingRecoveryFile(true)
    setError(null)
    setStatusMessage(null)

    try {
      await triggerRecoveryFileDownload(session)
      setStatusMessage('Recovery file saved (no private keys).')
      return true
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return false
    } finally {
      setIsExportingRecoveryFile(false)
    }
  }, [session])

  const resetTransfer = useCallback(() => {
    setQuote(null)
    setResult(null)
    setError(null)
    setStatusMessage(null)
  }, [])

  const prepareTransfer = useCallback(
    async (asset: WalletAsset, recipient: string, amount: string, gasAsset: WalletAsset) => {
      if (!session) {
        setError('Create or restore a wallet first.')
        return null
      }

      setIsPreparing(true)
      setQuote(null)
      setResult(null)
      setError(null)
      setStatusMessage(null)

      try {
        const nextQuote = await evmChainAdapter.prepareTransfer({
          amount,
          asset,
          gasAsset,
          network,
          recipient,
          session,
        })

        setQuote(nextQuote)
        setStatusMessage('Transfer preview is ready. Confirm to sign with your passkey.')
        return nextQuote
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return null
      } finally {
        setIsPreparing(false)
      }
    },
    [network, session],
  )

  const sendTransfer = useCallback(async () => {
    if (!session || !quote) {
      setError('Prepare a transfer before sending it.')
      return null
    }

    setIsSending(true)
    setError(null)
    setStatusMessage('Waiting for passkey signature and user operation confirmation...')

    try {
      const nextResult = await evmChainAdapter.sendTransfer({
        network,
        quote,
        session,
      })

      setQuote(null)
      setResult(nextResult)
      setStatusMessage(nextResult.success ? 'Transfer confirmed on-chain.' : 'Transfer reverted.')
      await refresh(session)
      return nextResult
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsSending(false)
    }
  }, [network, quote, refresh, session])

  const setNetworkRpcUrl = useCallback(
    (rpcUrl: string) => {
      const nextRpcUrl = rpcUrl.trim()
      if (!nextRpcUrl) return

      setNetworkRpcUrls((current) => {
        const next = {
          ...current,
          [selectedChainId]: nextRpcUrl,
        }
        saveNetworkRpcUrls(next)
        return next
      })
    },
    [selectedChainId],
  )

  const clearNetworkRpcUrl = useCallback(() => {
    setNetworkRpcUrls((current) => {
      if (!current[selectedChainId]) {
        return current
      }

      const next = { ...current }
      delete next[selectedChainId]
      saveNetworkRpcUrls(next)
      return next
    })
  }, [selectedChainId])

  return {
    clearNetworkRpcUrl,
    defaultNetworkRpcUrl: baseNetwork.rpcUrl,
    address,
    assets,
    balances,
    createWallet,
    disconnectWallet,
    error,
    exportRecoveryFile,
    hasSavedSession: Boolean(loadWalletSession()),
    isCreating,
    isExportingRecoveryFile,
    isPreparing,
    isRefreshing,
    isRestoringFromFile,
    isSending,
    network,
    setNetworkRpcUrl,
    prepareTransfer,
    quote,
    reconnectWallet,
    resetTransfer,
    restoreFromRecoveryFile,
    refreshCurrentWallet: session ? () => refresh(session) : undefined,
    result,
    selectedChainId,
    sendTransfer,
    session,
    setSelectedChainId,
    statusMessage,
    usesCustomRpcUrl: Boolean(customRpcUrl),
  }
}
