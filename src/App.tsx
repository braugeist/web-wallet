import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import { formatAmount } from './lib/utils/amounts'
import { truncateAddress, getTransactionExplorerUrl } from './lib/utils/format'
import { useWalletState } from './state/useWalletState'
import type { WalletAsset, TransferQuote } from './lib/chains/types'

type Tab = 'assets' | 'receive' | 'send'

function getAssetKey(asset: WalletAsset) {
  return asset.type === 'native' ? `native:${asset.chainId}` : `erc20:${asset.address}`
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
    isPreparing,
    isRefreshing,
    isRestoringFromFile,
    isSending,
    network,
    prepareTransfer,
    quote,
    restoreFromRecoveryFile,
    refreshCurrentWallet,
    result,
    selectedChainId,
    sendTransfer,
    session,
    setSelectedChainId,
    statusMessage,
  } = useWalletState()

  const [tab, setTab] = useState<Tab>('assets')
  const [selectedAssetKey, setSelectedAssetKey] = useState(() => getAssetKey(assets[0]))
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const networkPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const open = settingsOpen || networkPickerOpen
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (settingsOpen && settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
      if (networkPickerOpen && networkPickerRef.current && !networkPickerRef.current.contains(event.target as Node)) {
        setNetworkPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [settingsOpen, networkPickerOpen])

  const selectedAsset = assets.find((a) => getAssetKey(a) === selectedAssetKey) ?? assets[0]
  const resultUrl = result ? getTransactionExplorerUrl(network, result.transactionHash) : undefined

  if (!session) {
    return (
      <main className="app-shell app-center">
        <div className="brand">WebWallet</div>
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
          <div className="brand">WebWallet</div>
          <div className="topbar-meta">
            <button
              className="topbar-network"
              onClick={() => setNetworkPickerOpen((prev) => !prev)}
            >
              {network.label}
            </button>
            {address ? (
              <button
                className="topbar-address"
                onClick={() => setTab('receive')}
                title="Copy address"
              >
                {truncateAddress(address)}
              </button>
            ) : null}
          </div>
        </div>
        <button
          className="button-secondary button-sm settings-trigger"
          onClick={() => setSettingsOpen((prev) => !prev)}
          aria-label="Settings"
        >
          &#9776;
        </button>
      </header>

      {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <nav className="tab-bar">
        <button className={tab === 'assets' ? 'tab active' : 'tab'} onClick={() => setTab('assets')}>
          Assets
        </button>
        <button className={tab === 'receive' ? 'tab active' : 'tab'} onClick={() => setTab('receive')}>
          Receive
        </button>
        <button className={tab === 'send' ? 'tab active' : 'tab'} onClick={() => setTab('send')}>
          Send
        </button>
      </nav>

      <section className="panel tab-content" style={{ position: 'relative' }}>
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
        {settingsOpen ? (
          <div className="settings-menu" ref={settingsRef}>
            <span className="settings-menu-title">Settings</span>
            {refreshCurrentWallet ? (
              <button
                className="settings-action"
                onClick={() => { void refreshCurrentWallet(); setSettingsOpen(false) }}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh balances'}
              </button>
            ) : null}
            <button
              className="settings-action"
              onClick={() => { void exportRecoveryFile(); setSettingsOpen(false) }}
            >
              Backup wallet
            </button>
          </div>
        ) : null}
        {tab === 'assets' ? (
          <div className="asset-list">
            {balances.map((balance) => (
              <article
                className="asset-row clickable"
                key={balance.asset.type === 'native' ? 'native' : balance.asset.address}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedAssetKey(getAssetKey(balance.asset))
                  setTab('send')
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
        ) : null}

        {tab === 'receive' && address ? (
          <div className="receive-content">
            <div className="qr-card">
              <QRCodeSVG value={address} size={176} bgColor="transparent" fgColor="currentColor" />
            </div>
            <div className="card-stack">
              <p className="muted">{network.label}</p>
              <code className="block-code">{address}</code>
            </div>
          </div>
        ) : null}

        {tab === 'send' ? (
          <div className="card-stack">
            <label className="field">
              <span>Asset</span>
              <select
                value={getAssetKey(selectedAsset)}
                onChange={(event) => setSelectedAssetKey(event.target.value)}
              >
                {assets.map((asset) => (
                  <option value={getAssetKey(asset)} key={getAssetKey(asset)}>
                    {asset.symbol} {asset.type === 'native' ? '(native)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Recipient</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x..."
              />
            </label>

            <label className="field">
              <span>Amount</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`0.0 ${selectedAsset.symbol}`}
              />
            </label>

            <div className="button-row">
              <button
                onClick={() => void prepareTransfer(selectedAsset, recipient, amount)}
                disabled={isPreparing || isSending}
              >
                {isPreparing ? 'Preparing...' : 'Preview'}
              </button>
              <button
                className="button-secondary"
                onClick={() => void sendTransfer()}
                disabled={!quote || isPreparing || isSending}
              >
                {isSending ? 'Sending...' : 'Confirm'}
              </button>
            </div>

            {renderQuote(quote)}
            {renderResult(result, resultUrl)}
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

function renderResult(result: { success: boolean; userOperationHash: string } | null, resultUrl?: string) {
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

export default App
