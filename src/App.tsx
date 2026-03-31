import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getAddress, isAddress } from 'viem'

import { formatAmount, normalizeAmountInput } from './lib/utils/amounts'
import { truncateAddress, getTransactionExplorerUrl } from './lib/utils/format'
import { useWalletState } from './state/useWalletState'
import type { TransferQuote, TransferResult, WalletAsset } from './lib/chains/types'

type AppScreen = 'assets' | 'receive' | 'send' | 'backup'
type SendStep = 'asset' | 'recipient' | 'amount' | 'preview' | 'confirm'

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
  { id: 'preview', label: 'Preview' },
  { id: 'confirm', label: 'Confirm' },
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
    createWallet,
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
    setSelectedChainId,
    statusMessage,
  } = useWalletState()

  const [activeScreen, setActiveScreen] = useState<AppScreen>('assets')
  const [selectedAssetKey, setSelectedAssetKey] = useState(() => getAssetKey(assets[0]))
  const [sendStep, setSendStep] = useState<SendStep>('asset')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrScannerError, setQrScannerError] = useState<string | null>(null)
  const [qrScannerReady, setQrScannerReady] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const networkPickerRef = useRef<HTMLDivElement>(null)
  const networkTriggerRef = useRef<HTMLButtonElement>(null)
  const qrVideoRef = useRef<HTMLVideoElement>(null)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const qrAnimationFrameRef = useRef<number | null>(null)
  const qrDetectorRef = useRef<QrCodeDetectorLike | null>(null)

  useEffect(() => {
    if (!assets.some((asset) => getAssetKey(asset) === selectedAssetKey)) {
      setSelectedAssetKey(getAssetKey(assets[0]))
    }
  }, [assets, selectedAssetKey])

  useEffect(() => {
    setSendStep('asset')
    setRecipient('')
    setAmount('')
    resetTransfer()
    setQrScannerOpen(false)
  }, [resetTransfer, selectedChainId])

  useEffect(() => {
    const open = menuOpen || networkPickerOpen
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
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, networkPickerOpen])

  useEffect(() => {
    if (!addressCopied) return
    const timeoutId = window.setTimeout(() => setAddressCopied(false), 1500)
    return () => window.clearTimeout(timeoutId)
  }, [addressCopied])

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
  const selectedBalance = balances.find((balance) => getAssetKey(balance.asset) === getAssetKey(selectedAsset))
  const recipientValue = recipient.trim()
  const amountValue = amount.trim()
  const recipientIsValid = recipientValue.length > 0 && isAddress(recipientValue)
  const normalizedRecipient = recipientIsValid ? getAddress(recipientValue) : null
  const sendStepNumber = getSendStepNumber(sendStep)
  const resultUrl = result ? getTransactionExplorerUrl(network, result.transactionHash) : undefined

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
  }

  function handleToggleMenu() {
    setMenuOpen((prev) => {
      const next = !prev
      if (next) {
        setNetworkPickerOpen(false)
      }
      return next
    })
  }

  function handleToggleNetworkPicker() {
    setNetworkPickerOpen((prev) => {
      const next = !prev
      if (next) {
        setMenuOpen(false)
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
    const nextQuote = await prepareTransfer(selectedAsset, recipientValue, amountValue)

    if (nextQuote) {
      setSendStep('preview')
    }
  }

  async function handleConfirmTransfer() {
    const nextResult = await sendTransfer()

    if (nextResult) {
      setSendStep('confirm')
    }
  }

  function handleStartNewTransfer() {
    resetTransfer()
    setRecipient('')
    setAmount('')
    setQrScannerOpen(false)
    setSendStep('asset')
  }

  if (!session) {
    return (
      <main className="app-shell app-center">
        <Brand />
        <div className="button-row onboarding-actions">
          <button onClick={() => void createWallet()} disabled={isCreating}>
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

      {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <section className="panel screen-panel">
        {networkPickerOpen ? (
          <div className="network-picker" ref={networkPickerRef}>
            <span className="network-picker-title">Select network</span>
            <button
              className={selectedChainId === 11155111 ? 'network-option active' : 'network-option'}
              onClick={() => { setSelectedChainId(11155111); setNetworkPickerOpen(false) }}
            >
              Sepolia
            </button>
            <button
              className={selectedChainId === 1 ? 'network-option active' : 'network-option'}
              onClick={() => { setSelectedChainId(1); setNetworkPickerOpen(false) }}
            >
              Ethereum Mainnet
            </button>
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
              className={activeScreen === 'backup' ? 'app-menu-action active' : 'app-menu-action'}
              onClick={() => handleNavigate('backup')}
            >
              Backup wallet
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
              {balances.map((balance) => (
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
              ))}
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
                <button
                  type="button"
                  className="copy-address-button"
                  onClick={() => void handleCopyAddress()}
                  aria-label={addressCopied ? 'Address copied' : 'Copy wallet address'}
                  title={addressCopied ? 'Address copied' : 'Copy address'}
                >
                  {addressCopied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeScreen === 'send' ? (
          <div className="screen-content send-content">
            <div className="screen-copy">
              <p className="screen-eyebrow">Transfer</p>
              <h1 className="screen-title">Send</h1>
              <p className="screen-subtitle">Move through the steps below to review and confirm the transfer.</p>
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
                    {balances.map((balance) => {
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
                  <div className="button-row">
                    <button onClick={() => setSendStep('recipient')}>Continue</button>
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
                  <div className="button-row">
                    <button className="button-secondary" onClick={() => setSendStep('recipient')}>
                      Back
                    </button>
                    <button
                      onClick={() => void handlePreviewTransfer()}
                      disabled={!amountValue || isPreparing || isSending}
                    >
                      {isPreparing ? 'Preparing...' : 'Preview transfer'}
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'preview' ? (
                <div className="card-stack">
                  <p className="muted">Review the transfer details before moving to the final confirmation step.</p>
                  {renderQuote(quote)}
                  <div className="button-row">
                    <button className="button-secondary" onClick={() => setSendStep('amount')}>
                      Back
                    </button>
                    <button disabled={!quote} onClick={() => setSendStep('confirm')}>
                      Continue to confirm
                    </button>
                  </div>
                </div>
              ) : null}

              {sendStep === 'confirm' ? (
                <div className="card-stack">
                  <p className="muted">Confirming will prompt the passkey signature and submit the transfer.</p>
                  {quote ? renderQuote(quote) : null}
                  {result ? (
                    <div className="button-row">
                      <button className="button-secondary" onClick={handleStartNewTransfer}>
                        Start another transfer
                      </button>
                    </div>
                  ) : (
                    <div className="button-row">
                      <button className="button-secondary" onClick={() => setSendStep('preview')}>
                        Back
                      </button>
                      <button
                        onClick={() => void handleConfirmTransfer()}
                        disabled={!quote || isPreparing || isSending}
                      >
                        {isSending ? 'Sending...' : 'Confirm transfer'}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {renderResult(result, resultUrl)}

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

        {activeScreen === 'backup' ? (
          <div className="screen-content backup-content">
            <div className="screen-copy">
              <p className="screen-eyebrow">Recovery</p>
              <h1 className="screen-title">Back up your wallet</h1>
              <p className="screen-subtitle">
                Create a recovery file you can use to restore this wallet later with the original passkey.
              </p>
            </div>

            <div className="backup-card">
              <div className="card-stack">
                <div className="backup-checklist" aria-label="Backup guidance">
                  <div className="backup-checklist-item">
                    <span className="backup-checklist-step">1</span>
                    <div>
                      <p>Download the recovery file from this screen.</p>
                      <p className="muted">A JSON file will be saved to your device.</p>
                    </div>
                  </div>
                  <div className="backup-checklist-item">
                    <span className="backup-checklist-step">2</span>
                    <div>
                      <p>Move it to a safe place.</p>
                      <p className="muted">Use encrypted storage or another location you control.</p>
                    </div>
                  </div>
                  <div className="backup-checklist-item">
                    <span className="backup-checklist-step">3</span>
                    <div>
                      <p>Test the restore flow when convenient.</p>
                      <p className="muted">Use “Restore existing wallet” and choose the saved file.</p>
                    </div>
                  </div>
                </div>

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
      <p className="muted">Max fee: {formatAmount(quote.estimatedFee, 18)} ETH</p>
    </div>
  )
}

function renderResult(result: TransferResult | null, resultUrl?: string) {
  if (!result) return null

  return (
    <div className="callout success">
      <p>{result.success ? 'Confirmed' : 'Reverted'}</p>
      {resultUrl ? (
        <a href={resultUrl} target="_blank" rel="noreferrer">
          View on explorer
        </a>
      ) : null}
    </div>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5 9.5 17 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
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
