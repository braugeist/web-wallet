import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'

import { getCuratedAssets } from '../config/tokens'
import { defaultNetwork, getSupportedNetwork, type SupportedChainId } from '../config/networks'
import { evmChainAdapter } from '../lib/chains/evm/adapter'
import type { TransferQuote, TransferResult, WalletAsset, WalletBalance } from '../lib/chains/types'
import { isPasskeySupported, registerPasskey } from '../lib/passkey/credential'
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
  const [selectedChainId, setSelectedChainId] = useState<SupportedChainId>(defaultNetwork.chainId)
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
  const [isSending, setIsSending] = useState(false)

  const network = useMemo(() => getSupportedNetwork(selectedChainId), [selectedChainId])
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

  const createWallet = useCallback(
    async (label: string) => {
      if (!isPasskeySupported()) {
        setError('Passkeys require a secure browser context with WebAuthn support.')
        return
      }

      setIsCreating(true)
      setError(null)
      setStatusMessage(null)

      try {
        const nextSession = await registerPasskey(label.trim() || 'Primary wallet')
        saveWalletSession(nextSession)
        setSession(nextSession)
        setStatusMessage('Passkey wallet created. Fund the address to start sending.')
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
      } finally {
        setIsCreating(false)
      }
    },
    [],
  )

  const reconnectWallet = useCallback(async () => {
    const nextSession = loadWalletSession()

    if (!nextSession) {
      setError('No saved wallet was found in this browser.')
      return
    }

    setSession(nextSession)
    setStatusMessage('Wallet restored from this browser profile.')
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

  const prepareTransfer = useCallback(
    async (asset: WalletAsset, recipient: string, amount: string) => {
      if (!session) {
        setError('Create or restore a wallet first.')
        return
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
          network,
          recipient,
          session,
        })

        setQuote(nextQuote)
        setStatusMessage('Transfer preview is ready. Confirm to sign with your passkey.')
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
      } finally {
        setIsPreparing(false)
      }
    },
    [network, session],
  )

  const sendTransfer = useCallback(async () => {
    if (!session || !quote) {
      setError('Prepare a transfer before sending it.')
      return
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
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
    } finally {
      setIsSending(false)
    }
  }, [network, quote, refresh, session])

  return {
    address,
    assets,
    balances,
    createWallet,
    disconnectWallet,
    error,
    hasSavedSession: Boolean(loadWalletSession()),
    isCreating,
    isPreparing,
    isRefreshing,
    isSending,
    network,
    prepareTransfer,
    quote,
    reconnectWallet,
    refreshCurrentWallet: session ? () => refresh(session) : undefined,
    result,
    selectedChainId,
    sendTransfer,
    session,
    setSelectedChainId,
    statusMessage,
  }
}
