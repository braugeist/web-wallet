import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getAddress, isAddress } from 'viem'

import type { SupportedNetworkConfig } from './config/networks'
import { supportedNetworks } from './config/networks'
import { formatAmount, normalizeAmountInput } from './lib/utils/amounts'
import { isSupportedErc20GasAsset } from './lib/chains/evm/paymaster'
import { truncateAddress, getAddressExplorerUrl, getTransactionExplorerUrl } from './lib/utils/format'
import { useWalletState } from './state/useWalletState'
import type { TransferQuote, WalletAsset } from './lib/chains/types'

type AppScreen = 'assets' | 'receive' | 'send' | 'settings'
type SendStep = 'asset' | 'recipient' | 'amount' | 'review' | 'summary'

type BarcodeDetectorResultLike = {
  rawValue?: string
}

type NativeBarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<BarcodeDetectorResultLike[]>
}

type NativeBarcodeDetectorConstructorLike = {
  new (options?: { formats?: string[] }): NativeBarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

type QrCodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<string | null>
}

const ADDRESS_QR_PATTERN = /0x[a-fA-F0-9]{40}/
const FAVICON_URL = `${import.meta.env.BASE_URL}favicon.svg`
const QR_SCAN_INTERVAL_MS = 150
const SEND_STEP_LABELS: Array<{ id: SendStep; label: string }> = [
  { id: 'asset', label: 'Asset' },
  { id: 'recipient', label: 'Recipient' },
  { id: 'amount', label: 'Amount' },
  { id: 'review', label: 'Review' },
  { id: 'summary', label: 'Summary' },
]

function createJsQrDetector(): QrCodeDetectorLike {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Could not initialize the QR scanner.')
  }

  return {
    async detect(source) {
      const width = source.videoWidth
      const height = source.videoHeight

      if (!width || !height) {
        return null
      }

      if (canvas.width !== width) {
        canvas.width = width
      }

      if (canvas.height !== height) {
        canvas.height = height
      }

      context.drawImage(source, 0, 0, width, height)
      const imageData = context.getImageData(0, 0, width, height)
      return jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
    },
  }
}

async function createQrDetector(): Promise<QrCodeDetectorLike> {
  const BarcodeDetectorApi = (window as Window & { BarcodeDetector?: NativeBarcodeDetectorConstructorLike }).BarcodeDetector

  if (!BarcodeDetectorApi) {
    return createJsQrDetector()
  }

  const supportedFormats = BarcodeDetectorApi.getSupportedFormats
    ? await BarcodeDetectorApi.getSupportedFormats()
    : []

  const nativeDetector = new BarcodeDetectorApi(
    supportedFormats.length > 0 && supportedFormats.includes('qr_code')
      ? { formats: ['qr_code'] }
      : undefined,
  )

  return {
    async detect(source) {
      const detectedBarcodes = await nativeDetector.detect(source)
      return detectedBarcodes.find((barcode) => barcode.rawValue)?.rawValue ?? null
    },
  }
}

function getAssetKey(asset: WalletAsset) {
  return asset.type === 'native' ? `native:${asset.chainId}` : `erc20:${asset.address}`
}

function getSendStepNumber(step: SendStep) {
  return SEND_STEP_LABELS.findIndex((entry) => entry.id === step) + 1
}

function getDefaultGasAsset(assets: WalletAsset[]) {
  return assets.find((asset) => asset.type === 'native') ?? assets[0]
}

function isAvailableGasAsset(network: SupportedNetworkConfig, asset: WalletAsset) {
  return asset.type === 'native' || isSupportedErc20GasAsset(network, asset)
}

function getGasPaymentSummary(quote: TransferQuote) {
  if (quote.gasPaymentMode === 'native') {
    return `Maximum transaction fee: ${formatAmount(quote.estimatedGasFee, 18)} ETH`
  }

  const usdSuffix = typeof quote.estimatedUsdFee === 'bigint'
    ? ` (~$${formatAmount(quote.estimatedUsdFee, 6, 2)})`
    : ''

  return `Estimated transaction fee: ${formatAmount(quote.estimatedGasFee, quote.gasAsset.decimals)} ${quote.gasAsset.symbol}${usdSuffix}`
}

function parseRecipientFromQr(rawValue: string) {
  const value = rawValue.trim()

  if (!value) return null

  if (isAddress(value)) {
    return getAddress(value)
  }

  if (value.toLowerCase().startsWith('ethereum:')) {
    const ethereumValue = value.slice('ethereum:'.length).replace(/^\/\//, '').replace(/^pay-/i, '')
    const candidate = ethereumValue.split(/[/?@]/, 1)[0]

    if (isAddress(candidate)) {
      return getAddress(candidate)
    }
  }

  const matchedAddress = value.match(ADDRESS_QR_PATTERN)?.[0]
  return matchedAddress && isAddress(matchedAddress) ? getAddress(matchedAddress) : null
}

function isValidRpcUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function BackupRecoveryChecklist() {
  return (
    <div className="backup-checklist" aria-label="Backup guidance">
      <div className="backup-checklist-item">
        <span className="backup-checklist-step">1</span>
        <div>
          <p>Download the recovery file.</p>
          <p className="muted">Public data only—no private keys. Your passkey stays in the enclave.</p>
        </div>
      </div>
      <div className="backup-checklist-item">
        <span className="backup-checklist-step">2</span>
        <div>
          <p>Keep it somewhere you will find it.</p>
          <p className="muted">You still need your passkey to sign.</p>
        </div>
      </div>
      <div className="backup-checklist-item">
        <span className="backup-checklist-step">3</span>
        <div>
          <p>Optional: try restore.</p>
          <p className="muted">Restore existing wallet, then the same passkey.</p>
        </div>
      </div>
    </div>
  )
}

function Brand({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <img className="brand-logo" src={FAVICON_URL} alt="" aria-hidden="true" />
      <span>WebWallet</span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="brand brand-button"
        onClick={onClick}
        aria-label="Go to assets"
      >
        {content}
      </button>
    )
  }

  return <div className="brand">{content}</div>
}

function App() {
  const {
    address,
    assets,
    balances,
    clearNetworkRpcUrl,
    createWallet,
    defaultNetworkRpcUrl,
    error,
    exportRecoveryFile,
    isCreating,
    isExportingRecoveryFile,
    isPreparing,
    isRefreshing,
    isRestoringFromFile,
    isSending,
    network,
    prepareTransfer,
    quote,
    resetTransfer,
    restoreFromRecoveryFile,
    refreshCurrentWallet,
    result,
    selectedChainId,
    sendTransfer,
    session,
    setNetworkRpcUrl,
    setSelectedChainId,
    statusMessage,
    usesCustomRpcUrl,
  } = useWalletState()

  const [activeScreen, setActiveScreen] = useState<AppScreen>('assets')
  const [selectedAssetKey, setSelectedAssetKey] = useState(() => getAssetKey(assets[0]))
  const [selectedGasAssetKey, setSelectedGasAssetKey] = useState(() => getAssetKey(getDefaultGasAsset(assets)))
  const [sendStep, setSendStep] = useState<SendStep>('asset')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const [receiveActionsOpen, setReceiveActionsOpen] = useState(false)
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrScannerError, setQrScannerError] = useState<string | null>(null)
  const [qrScannerReady, setQrScannerReady] = useState(false)
  const [rpcUrlInput, setRpcUrlInput] = useState(() => network.rpcUrl)
  const [rpcUrlMessage, setRpcUrlMessage] = useState<string | null>(null)
  const [rpcUrlError, setRpcUrlError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const receiveActionsRef = useRef<HTMLDivElement>(null)
  const networkPickerRef = useRef<HTMLDivElement>(null)
  const networkTriggerRef = useRef<HTMLButtonElement>(null)
  const qrVideoRef = useRef<HTMLVideoElement>(null)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const qrAnimationFrameRef = useRef<number | null>(null)
  const qrDetectorRef = useRef<QrCodeDetectorLike | null>(null)
  const [postCreateBackupOpen, setPostCreateBackupOpen] = useState(false)

  useEffect(() => {
    if (!assets.some((asset) => getAssetKey(asset) === selectedAssetKey)) {
      setSelectedAssetKey(getAssetKey(assets[0]))
    }
  }, [assets, selectedAssetKey])

  useEffect(() => {
    if (!assets.some((asset) => getAssetKey(asset) === selectedGasAssetKey)) {
      setSelectedGasAssetKey(getAssetKey(getDefaultGasAsset(assets)))
    }
  }, [assets, selectedGasAssetKey])

  useEffect(() => {
    setSendStep('asset')
    setRecipient('')
    setAmount('')
    resetTransfer()
    setQrScannerOpen(false)
    setSelectedGasAssetKey(getAssetKey(getDefaultGasAsset(assets)))
  }, [assets, resetTransfer, selectedChainId])

  useEffect(() => {
    const open = menuOpen || networkPickerOpen || receiveActionsOpen
    if (!open) return
    function handleClick(event: MouseEvent) {
      const target = event.target as Node
      if (
        menuOpen
        && menuRef.current
        && !menuRef.current.contains(target)
        && !menuTriggerRef.current?.contains(target)
      ) {
        setMenuOpen(false)
      }
      if (
        networkPickerOpen
        && networkPickerRef.current
        && !networkPickerRef.current.contains(target)
        && !networkTriggerRef.current?.contains(target)
      ) {
        setNetworkPickerOpen(false)
      }
      if (
        receiveActionsOpen
        && receiveActionsRef.current
        && !receiveActionsRef.current.contains(target)
      ) {
        setReceiveActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, networkPickerOpen, receiveActionsOpen])

  useEffect(() => {
    if (!receiveActionsOpen) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setReceiveActionsOpen(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [receiveActionsOpen])

  useEffect(() => {
    if (!addressCopied) return
    const timeoutId = window.setTimeout(() => setAddressCopied(false), 1500)
    return () => window.clearTimeout(timeoutId)
  }, [addressCopied])

  useEffect(() => {
    setRpcUrlInput(network.rpcUrl)
  }, [network.rpcUrl])

  useEffect(() => {
    setRpcUrlMessage(null)
    setRpcUrlError(null)
  }, [selectedChainId])

  const handleRecipientChange = useCallback((nextRecipient: string) => {
    setRecipient(nextRecipient)
    if (quote || result) {
      resetTransfer()
    }
  }, [quote, resetTransfer, result])

  const handleAmountChange = useCallback((nextAmount: string) => {
    setAmount(normalizeAmountInput(nextAmount))
    if (quote || result) {
      resetTransfer()
    }
  }, [quote, resetTransfer, result])

  const handleGasAssetChange = useCallback((nextGasAssetKey: string) => {
    setSelectedGasAssetKey(nextGasAssetKey)
    if (quote || result) {
      resetTransfer()
    }
  }, [quote, resetTransfer, result])

  const stopQrScanner = useCallback(() => {
    if (qrAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(qrAnimationFrameRef.current)
      qrAnimationFrameRef.current = null
    }

    qrDetectorRef.current = null
    setQrScannerReady(false)

    const videoElement = qrVideoRef.current
    if (videoElement) {
      videoElement.pause()
      videoElement.srcObject = null
    }

    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop())
      qrStreamRef.current = null
    }
  }, [])

  useEffect(() => stopQrScanner, [stopQrScanner])

  useEffect(() => {
    if (!qrScannerOpen) {
      setQrScannerError(null)
      stopQrScanner()
      return
    }

    let cancelled = false
    let scanPending = false
    let lastScanAt = 0

    const scanFrame = async () => {
      if (cancelled) return

      const detector = qrDetectorRef.current
      const videoElement = qrVideoRef.current

      if (!detector || !videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        qrAnimationFrameRef.current = window.requestAnimationFrame(() => {
          void scanFrame()
        })
        return
      }

      const now = window.performance.now()
      if (now - lastScanAt < QR_SCAN_INTERVAL_MS) {
        qrAnimationFrameRef.current = window.requestAnimationFrame(() => {
          void scanFrame()
        })
        return
      }

      if (scanPending) {
        qrAnimationFrameRef.current = window.requestAnimationFrame(() => {
          void scanFrame()
        })
        return
      }

      scanPending = true
      lastScanAt = now

      try {
        const rawValue = await detector.detect(videoElement)

        if (rawValue) {
          const scannedRecipient = parseRecipientFromQr(rawValue)

          if (scannedRecipient) {
            handleRecipientChange(scannedRecipient)
            setQrScannerError(null)
            setQrScannerOpen(false)
            return
          }

          setQrScannerError('QR code does not contain a valid EVM address.')
        }
      } catch {
        setQrScannerError('Could not scan QR code. Try again.')
      } finally {
        scanPending = false
      }

      qrAnimationFrameRef.current = window.requestAnimationFrame(() => {
        void scanFrame()
      })
    }

    async function startQrScanner() {
      if (!window.isSecureContext) {
        setQrScannerError('Camera access requires HTTPS or localhost.')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setQrScannerError('Camera access is not available in this browser.')
        return
      }

      try {
        qrDetectorRef.current = await createQrDetector()

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        qrStreamRef.current = stream

        const videoElement = qrVideoRef.current
        if (!videoElement) {
          stream.getTracks().forEach((track) => track.stop())
          setQrScannerError('Could not start the camera preview.')
          return
        }

        videoElement.srcObject = stream
        await videoElement.play()

        if (cancelled) return

        setQrScannerReady(true)
        setQrScannerError(null)
        void scanFrame()
      } catch (error) {
        if (cancelled) return

        const errorName = error instanceof DOMException ? error.name : ''
        const message = error instanceof Error ? error.message : 'Could not open the camera.'

        if (errorName === 'NotAllowedError' || message.toLowerCase().includes('permission')) {
          setQrScannerError('Camera permission was denied.')
        } else if (errorName === 'NotReadableError' || message.toLowerCase().includes('could not start')) {
          setQrScannerError('Could not start the camera. Close other camera apps or open this page in Safari.')
        } else {
          setQrScannerError(message)
        }
      }
    }

    void startQrScanner()

    return () => {
      cancelled = true
      stopQrScanner()
    }
  }, [handleRecipientChange, qrScannerOpen, stopQrScanner])

  const selectedAsset = assets.find((a) => getAssetKey(a) === selectedAssetKey) ?? assets[0]
  const gasPaymentOptions = balances
    .map((balance) => balance.asset)
    .filter((asset) => isAvailableGasAsset(network, asset))
  const selectedGasAsset = gasPaymentOptions.find((asset) => getAssetKey(asset) === selectedGasAssetKey)
    ?? gasPaymentOptions[0]
    ?? getDefaultGasAsset(assets)
  const nonZeroBalances = balances.filter((balance) => balance.value > 0n)
  const selectedBalance = balances.find((balance) => getAssetKey(balance.asset) === getAssetKey(selectedAsset))
  const selectedGasBalance = balances.find((balance) => getAssetKey(balance.asset) === getAssetKey(selectedGasAsset))
  const recipientValue = recipient.trim()
  const amountValue = amount.trim()
  const recipientIsValid = recipientValue.length > 0 && isAddress(recipientValue)
  const normalizedRecipient = recipientIsValid ? getAddress(recipientValue) : null
  const sendStepNumber = getSendStepNumber(sendStep)
  const resultUrl = result ? getTransactionExplorerUrl(network, result.transactionHash) : undefined
  const receiveExplorerUrl = address ? getAddressExplorerUrl(network, address) : undefined

  async function handleCopyAddress() {
    if (!address) return

    try {
      await navigator.clipboard.writeText(address)
      setAddressCopied(true)
    } catch {
      setAddressCopied(false)
    }
  }

  function handleNavigate(nextScreen: AppScreen) {
    setActiveScreen(nextScreen)
    setMenuOpen(false)
    setNetworkPickerOpen(false)
    setReceiveActionsOpen(false)
  }

  function handleToggleMenu() {
    setMenuOpen((prev) => {
      const next = !prev
      if (next) {
        setNetworkPickerOpen(false)
        setReceiveActionsOpen(false)
      }
      return next
    })
  }

  function handleToggleNetworkPicker() {
    setNetworkPickerOpen((prev) => {
      const next = !prev
      if (next) {
        setMenuOpen(false)
        setReceiveActionsOpen(false)
      }
      return next
    })
  }

  function handleSelectedAssetChange(nextAssetKey: string, nextStep?: SendStep) {
    if (nextAssetKey !== selectedAssetKey) {
      resetTransfer()
    }
    setSelectedAssetKey(nextAssetKey)
    if (nextStep) {
      setSendStep(nextStep)
    }
  }

  async function handlePreviewTransfer() {
    const nextQuote = await prepareTransfer(selectedAsset, recipientValue, amountValue, selectedGasAsset)

    if (nextQuote) {
      setSendStep('review')
    }
  }

  async function handleConfirmTransfer() {
    const nextResult = await sendTransfer()

    if (nextResult) {
      setSendStep('summary')
    }
  }

  function handleStartNewTransfer() {
    resetTransfer()
    setRecipient('')
    setAmount('')
    setQrScannerOpen(false)
    setSendStep('asset')
  }

  async function handleCreateWallet() {
    const created = await createWallet()
    if (created) {
      setPostCreateBackupOpen(true)
    }
  }

  function handleSaveRpcUrl() {
    const nextRpcUrl = rpcUrlInput.trim()

    if (!nextRpcUrl) {
      setRpcUrlError('RPC URL is required.')
      setRpcUrlMessage(null)
      return
    }

    if (!isValidRpcUrl(nextRpcUrl)) {
      setRpcUrlError('Enter a valid HTTP or HTTPS RPC URL.')
      setRpcUrlMessage(null)
      return
    }

    setNetworkRpcUrl(nextRpcUrl)
    setRpcUrlInput(nextRpcUrl)
    setRpcUrlError(null)
    setRpcUrlMessage(`RPC URL updated for ${network.label}.`)
  }

  function handleResetRpcUrl() {
    clearNetworkRpcUrl()
    setRpcUrlInput(defaultNetworkRpcUrl)
    setRpcUrlError(null)
    setRpcUrlMessage(`Using the default RPC URL for ${network.label}.`)
  }

  if (!session) {
    return (
      <main className="app-shell app-center">
        <Brand />
        <div className="button-row onboarding-actions">
          <button onClick={() => void handleCreateWallet()} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create new wallet'}
          </button>
          <button
            className="button-secondary"
            onClick={() => document.getElementById('recovery-input')?.click()}
            disabled={isRestoringFromFile}
          >
            {isRestoringFromFile ? 'Restoring...' : 'Restore existing wallet'}
          </button>
        </div>
        <input
          id="recovery-input"
          key={fileInputKey}
          hidden
          accept="application/json,.json"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            setFileInputKey((k) => k + 1)
            if (file) void restoreFromRecoveryFile(file)
          }}
        />
        {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Brand onClick={() => handleNavigate('assets')} />
          <div className="topbar-meta">
            <button
              className="topbar-network"
              ref={networkTriggerRef}
              onClick={handleToggleNetworkPicker}
            >
              {network.label}
            </button>
            {address ? (
              <button
                className="topbar-address"
                onClick={() => handleNavigate('receive')}
                title="Open receive screen"
              >
                {truncateAddress(address)}
              </button>
            ) : null}
          </div>
        </div>
        <button
          className="button-secondary button-sm settings-trigger"
          ref={menuTriggerRef}
          onClick={handleToggleMenu}
          aria-label="Open menu"
        >
          &#9776;
        </button>
      </header>

      {!postCreateBackupOpen && statusMessage ? (
        <div className="banner success">{statusMessage}</div>
      ) : null}
      {!postCreateBackupOpen && error ? <div className="banner error">{error}</div> : null}

      <section className="panel screen-panel">
        {networkPickerOpen ? (
          <div className="network-picker" ref={networkPickerRef}>
            <span className="network-picker-title">Select network</span>
            {supportedNetworks.map((net) => (
              <button
                key={net.chainId}
                type="button"
                className={selectedChainId === net.chainId ? 'network-option active' : 'network-option'}
                onClick={() => {
                  setSelectedChainId(net.chainId)
                  setNetworkPickerOpen(false)
                }}
              >
                {net.label}
              </button>
            ))}
          </div>
        ) : null}
        {menuOpen ? (
          <div className="app-menu" ref={menuRef}>
            <span className="app-menu-title">Menu</span>
            <button
              className={activeScreen === 'assets' ? 'app-menu-action active' : 'app-menu-action'}
              onClick={() => handleNavigate('assets')}
            >
              Assets
            </button>
            <button
              className={activeScreen === 'send' ? 'app-menu-action active' : 'app-menu-action'}
              onClick={() => handleNavigate('send')}
            >
              Send
            </button>
            <button
              className={activeScreen === 'receive' ? 'app-menu-action active' : 'app-menu-action'}
              onClick={() => handleNavigate('receive')}
            >
              Receive
            </button>
            <button
              className={activeScreen === 'settings' ? 'app-menu-action active' : 'app-menu-action'}
              onClick={() => handleNavigate('settings')}
            >
              Settings
            </button>
          </div>
        ) : null}
        {activeScreen === 'assets' ? (
          <div className="screen-content">
            <div className="screen-header">
              <div className="screen-copy">
                <p className="screen-eyebrow">Portfolio</p>
                <h1 className="screen-title">Assets</h1>
                <p className="screen-subtitle">Tap any balance to start a transfer.</p>
              </div>
              {refreshCurrentWallet ? (
                <button
                  type="button"
                  className={isRefreshing ? 'title-icon-button spinning' : 'title-icon-button'}
                  onClick={() => void refreshCurrentWallet()}
                  disabled={isRefreshing}
                  aria-label="Refresh balances"
                  title="Refresh balances"
                >
                  <RefreshIcon />
                </button>
              ) : null}
            </div>

            <div className="asset-list">
              {nonZeroBalances.length > 0 ? (
                nonZeroBalances.map((balance) => (
                  <article
                    className="asset-row clickable"
                    key={balance.asset.type === 'native' ? 'native' : balance.asset.address}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      handleSelectedAssetChange(getAssetKey(balance.asset), 'recipient')
                      setActiveScreen('send')
                    }}
                  >
                    <div>
                      <p className="asset-symbol">{balance.asset.symbol}</p>
                      <p className="muted">{balance.asset.name}</p>
                    </div>
                    <div className="asset-value">
                      {formatAmount(balance.value, balance.asset.decimals)} {balance.asset.symbol}
                    </div>
                  </article>
                ))
              ) : (
                <div className="callout">
                  <p>No funded assets yet.</p>
                  <p className="muted">Only balances above zero appear here.</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeScreen === 'receive' && address ? (
          <div className="screen-content receive-content">
            <div className="screen-copy screen-copy-center">
              <p className="screen-eyebrow">Receive</p>
              <h1 className="screen-title">Share your address</h1>
              <p className="screen-subtitle">Use the QR code or copy the wallet address below.</p>
            </div>

            <div className="qr-card">
              <QRCodeSVG value={address} size={176} bgColor="#ffffff" fgColor="#000000" />
            </div>

            <div className="card-stack receive-details">
              <p className="muted">{network.label}</p>
              <div className={addressCopied ? 'block-code address-copy-field copied' : 'block-code address-copy-field'}>
                <code>{address}</code>
                <div className="address-actions-dropdown" ref={receiveActionsRef}>
                  <button
                    type="button"
                    className="copy-address-button"
                    aria-expanded={receiveActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Address actions"
                    title="Address actions"
                    onClick={() => setReceiveActionsOpen((open) => !open)}
                  >
                    <MoreVerticalIcon />
                  </button>
                  {receiveActionsOpen ? (
                    <div className="address-actions-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="address-actions-menu-item"
                        onClick={() => {
                          void handleCopyAddress()
                          setReceiveActionsOpen(false)
                        }}
                      >
                        <span className="address-actions-menu-icon" aria-hidden>
                          <CopyIcon />
                        </span>
                        Copy
                      </button>
                      {receiveExplorerUrl ? (
                        <a
                          href={receiveExplorerUrl}
                          role="menuitem"
                          className="address-actions-menu-item"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setReceiveActionsOpen(false)}
                        >
                          <span className="address-actions-menu-icon" aria-hidden>
                            <ExplorerLinkIcon />
                          </span>
                          Explorer
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeScreen === 'send' ? (
          <div className="screen-content send-content">
            <div className="screen-copy">
              <p className="screen-eyebrow">Transfer</p>
              <h1 className="screen-title">Send</h1>
              <p className="screen-subtitle">Move through the steps below to review, confirm, and finish the transfer.</p>
            </div>

            <div className="send-stepper" role="list" aria-label="Send steps">
              {SEND_STEP_LABELS.map((step, index) => {
                const stepNumber = index + 1
                const stateClass = stepNumber < sendStepNumber
                  ? 'completed'
                  : stepNumber === sendStepNumber
                    ? 'active'
                    : ''

                return (
                  <div className={`send-step ${stateClass}`.trim()} key={step.id} role="listitem">
                    <span className="send-step-number">{stepNumber}</span>
                    <span>{step.label}</span>
                  </div>
                )
              })}
            </div>

            <div className="send-step-panel">
              <div className="send-step-header">
                <div>
                  <p className="send-step-kicker">Step {sendStepNumber} of 5</p>
                  <p className="send-step-title">{SEND_STEP_LABELS[sendStepNumber - 1]?.label}</p>
                </div>
                {selectedBalance ? (
                  <p className="muted">
                    Balance: {formatAmount(selectedBalance.value, selectedBalance.asset.decimals)} {selectedBalance.asset.symbol}
                  </p>
                ) : null}
              </div>

              {sendStep === 'asset' ? (
                <div className="card-stack">
                  <p className="muted">Choose which asset you want to send.</p>
                  <div className="asset-list">
                    {nonZeroBalances.map((balance) => {
                      const assetKey = getAssetKey(balance.asset)
                      const isSelected = assetKey === getAssetKey(selectedAsset)

                      return (
                        <article
                          className={isSelected ? 'asset-row clickable selected' : 'asset-row clickable'}
                          key={balance.asset.type === 'native' ? 'native' : balance.asset.address}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectedAssetChange(assetKey)}
                        >
                          <div>
                            <p className="asset-symbol">
                              {balance.asset.symbol} {balance.asset.type === 'native' ? '(native)' : ''}
                            </p>
                            <p className="muted">{balance.asset.name}</p>
                          </div>
                          <div className="asset-value">
                            {formatAmount(balance.value, balance.asset.decimals)} {balance.asset.symbol}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  {nonZeroBalances.length === 0 ? (
                    <div className="banner warning">Fund this wallet first to send assets.</div>
                  ) : null}
                  <div className="button-row">
                    <button onClick={() => setSendStep('recipient')} disabled={nonZeroBalances.length === 0}>
                      Continue
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'recipient' ? (
                <div className="card-stack">
                  <div className="callout">
                    <p>
                      Sending {selectedAsset.symbol} on {network.label}
                    </p>
                    <p className="muted">You can change the asset by going back.</p>
                  </div>
                  <label className="field">
                    <span>Recipient</span>
                    <div className="field-input-action">
                      <input
                        value={recipient}
                        onChange={(event) => handleRecipientChange(event.target.value)}
                        placeholder="0x..."
                      />
                      <button
                        type="button"
                        className="button-secondary scan-button"
                        onClick={() => setQrScannerOpen(true)}
                      >
                        <ScanIcon />
                        Scan QR
                      </button>
                    </div>
                  </label>
                  {recipientValue && !recipientIsValid ? (
                    <div className="banner warning">Recipient must be a valid EVM address.</div>
                  ) : null}
                  <div className="button-row">
                    <button className="button-secondary" onClick={() => setSendStep('asset')}>
                      Back
                    </button>
                    <button disabled={!recipientIsValid} onClick={() => setSendStep('amount')}>
                      Continue
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'amount' ? (
                <div className="card-stack">
                  <div className="callout">
                    <p>
                      Recipient: {normalizedRecipient ? truncateAddress(normalizedRecipient) : 'Add a recipient'}
                    </p>
                    <p className="muted">Enter how much {selectedAsset.symbol} you want to send.</p>
                  </div>
                  <label className="field">
                    <span>Amount</span>
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => handleAmountChange(event.target.value)}
                      placeholder={`0.0 ${selectedAsset.symbol}`}
                    />
                  </label>
                  {gasPaymentOptions.length > 0 ? (
                    <label className="field">
                      <span>Pay transaction fees with</span>
                      <select
                        value={getAssetKey(selectedGasAsset)}
                        onChange={(event) => handleGasAssetChange(event.target.value)}
                      >
                        {gasPaymentOptions.map((asset) => {
                          const balance = balances.find(
                            (candidate) => getAssetKey(candidate.asset) === getAssetKey(asset),
                          )

                          return (
                            <option key={getAssetKey(asset)} value={getAssetKey(asset)}>
                              {asset.symbol}
                              {asset.type === 'native' ? ` (${network.nativeSymbol})` : ' via paymaster'}
                              {balance
                                ? ` • ${formatAmount(balance.value, asset.decimals)} ${asset.symbol}`
                                : ''}
                            </option>
                          )
                        })}
                      </select>
                    </label>
                  ) : null}
                  <p className="muted">
                    {selectedGasAsset.type === 'native'
                      ? `Transaction fees will be paid in ${network.nativeSymbol}.`
                      : `Transaction fees will be paid in ${selectedGasAsset.symbol} through the paymaster on ${network.label}.`}
                  </p>
                  {selectedGasAsset.type === 'erc20' && selectedGasBalance?.value === 0n ? (
                    <div className="banner warning">
                      Add some {selectedGasAsset.symbol} to this wallet before sending, or switch gas payment back to ETH.
                    </div>
                  ) : null}
                  <div className="button-row">
                    <button className="button-secondary" onClick={() => setSendStep('recipient')}>
                      Back
                    </button>
                    <button
                      onClick={() => void handlePreviewTransfer()}
                      disabled={!amountValue || isPreparing || isSending}
                    >
                      {isPreparing ? 'Preparing...' : 'Review transfer'}
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'review' ? (
                <div className="card-stack">
                  <p className="muted">Review the transfer details and confirm when you're ready to send.</p>
                  {renderQuote(quote)}
                  {quote?.includesGasTokenApproval ? (
                    <div className="banner warning">
                      This transaction will also approve the paymaster to spend {quote.gasAsset.symbol} for future
                      transaction fees.
                    </div>
                  ) : null}
                  <p className="muted">Confirming will prompt the passkey signature and submit the transfer.</p>
                  <div className="button-row">
                    <button className="button-secondary" onClick={() => setSendStep('amount')}>
                      Back
                    </button>
                    <button
                      onClick={() => void handleConfirmTransfer()}
                      disabled={!quote || isPreparing || isSending}
                    >
                      {isSending ? 'Sending...' : 'Confirm transfer'}
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'summary' ? (
                <div className="card-stack">
                  <p className="muted">
                    {result?.success
                      ? 'The transfer has been submitted. Review the final details below.'
                      : 'The transfer attempt finished without completing. Review the details below.'}
                  </p>
                  {quote ? (
                    <div className={result?.success ? 'callout success' : 'callout'}>
                      <p>
                        {result?.success ? 'Sent' : 'Attempted'} {formatAmount(quote.value, quote.asset.decimals)} {quote.asset.symbol} to{' '}
                        {truncateAddress(quote.recipient)}
                      </p>
                      <p className="muted">{getGasPaymentSummary(quote)}</p>
                      {quote.gasPaymentMode === 'erc20' ? (
                        <p className="muted">
                          ETH equivalent: {formatAmount(quote.estimatedNativeFee, 18)} ETH
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {result ? (
                    <div className={result.success ? 'callout success' : 'callout'}>
                      <p>{result.success ? 'Transfer complete' : 'Transfer reverted'}</p>
                      {resultUrl ? (
                        <a href={resultUrl} target="_blank" rel="noreferrer">
                          View on explorer
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="button-row">
                    <button className="button-secondary" onClick={handleStartNewTransfer}>
                      Start another transfer
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {qrScannerOpen ? (
              <div className="qr-scanner-overlay" role="dialog" aria-modal="true" aria-label="Scan recipient QR code">
                <div className="qr-scanner-card">
                  <div className="qr-scanner-header">
                    <div>
                      <p className="qr-scanner-title">Scan recipient QR</p>
                      <p className="muted">Point your camera at a wallet address QR code.</p>
                    </div>
                    <button
                      type="button"
                      className="button-secondary qr-scanner-close"
                      onClick={() => setQrScannerOpen(false)}
                      aria-label="Close scanner"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <div className={qrScannerReady ? 'qr-scanner-preview ready' : 'qr-scanner-preview'}>
                    <video ref={qrVideoRef} autoPlay muted playsInline />
                    {!qrScannerReady ? <span className="qr-scanner-status">Opening camera...</span> : null}
                  </div>

                  {qrScannerError ? <div className="banner warning">{qrScannerError}</div> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeScreen === 'settings' ? (
          <div className="screen-content settings-content">
            <div className="screen-copy">
              <p className="screen-eyebrow">Preferences</p>
              <h1 className="screen-title">Settings</h1>
              <p className="screen-subtitle">
                Configure the network RPC endpoint and manage your wallet backup.
              </p>
            </div>

            <div className="backup-card">
              <div className="card-stack">
                <label className="field">
                  <span>Network RPC URL</span>
                  <input
                    value={rpcUrlInput}
                    onChange={(event) => {
                      setRpcUrlInput(event.target.value)
                      setRpcUrlError(null)
                      setRpcUrlMessage(null)
                    }}
                    placeholder={defaultNetworkRpcUrl}
                    type="url"
                  />
                </label>
                <p className="muted">Current network: {network.label}</p>
                {rpcUrlMessage ? <div className="banner success">{rpcUrlMessage}</div> : null}
                {rpcUrlError ? <div className="banner error">{rpcUrlError}</div> : null}
                <div className="button-row">
                  <button
                    type="button"
                    onClick={handleSaveRpcUrl}
                    disabled={!rpcUrlInput.trim() || rpcUrlInput.trim() === network.rpcUrl}
                  >
                    Save RPC URL
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={handleResetRpcUrl}
                    disabled={!usesCustomRpcUrl}
                  >
                    Use default RPC URL
                  </button>
                </div>
              </div>
            </div>

            <div className="backup-card">
              <div className="card-stack">
                <div className="screen-copy">
                  <p className="screen-eyebrow">Recovery</p>
                  <h2 className="settings-section-title">Backup wallet</h2>
                  <p className="screen-subtitle">
                    Public wallet data for restore elsewhere - not private keys. Passkey stays in the enclave.
                  </p>
                </div>
                <BackupRecoveryChecklist />
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void exportRecoveryFile()}
                    disabled={isExportingRecoveryFile}
                  >
                    {isExportingRecoveryFile ? 'Creating backup...' : 'Create recovery file'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {postCreateBackupOpen ? (
        <div
          className="qr-scanner-overlay onboarding-backup-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-backup-title"
        >
          <div className="onboarding-backup-dialog">
            <div className="screen-copy onboarding-backup-copy">
              <p className="screen-eyebrow">Almost done</p>
              <h1 id="onboarding-backup-title" className="screen-title">
                Create your recovery file
              </h1>
              <p className="screen-subtitle">
                Save a file to restore on another device. No private keys in the file.
              </p>
            </div>

            <div className="backup-card">
              <div className="card-stack">
                <BackupRecoveryChecklist />
                {error ? <div className="banner error">{error}</div> : null}
                <div className="button-row onboarding-backup-actions">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await exportRecoveryFile()
                      if (ok) {
                        setPostCreateBackupOpen(false)
                      }
                    }}
                    disabled={isExportingRecoveryFile}
                  >
                    {isExportingRecoveryFile ? 'Creating backup...' : 'Create recovery file'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={isExportingRecoveryFile}
                    onClick={() => setPostCreateBackupOpen(false)}
                  >
                    Continue without file
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function renderQuote(quote: TransferQuote | null) {
  if (!quote) return null

  return (
    <div className="callout">
      <p>
        {formatAmount(quote.value, quote.asset.decimals)} {quote.asset.symbol} to {truncateAddress(quote.recipient)}
      </p>
      <p className="muted">{getGasPaymentSummary(quote)}</p>
      {quote.gasPaymentMode === 'erc20' ? (
        <p className="muted">ETH equivalent: {formatAmount(quote.estimatedNativeFee, 18)} ETH</p>
      ) : null}
    </div>
  )
}

function MoreVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="6" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="18" r="1.75" fill="currentColor" />
    </svg>
  )
}

function ExplorerLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4H5a1 1 0 0 0-1 1v2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M4 17v2a1 1 0 0 0 1 1h2M7 12h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 2v6h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12a9 9 0 0 1 15.55-6.36L21 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 22v-6h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12a9 9 0 0 1-15.55 6.36L3 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default App
