import { OnboardingPanel } from './features/onboarding/OnboardingPanel'
import { PortfolioPanel } from './features/portfolio/PortfolioPanel'
import { ReceivePanel } from './features/receive/ReceivePanel'
import { SendPanel } from './features/send/SendPanel'
import { getTransactionExplorerUrl } from './lib/utils/format'
import { useWalletState } from './state/useWalletState'

function App() {
  const {
    address,
    assets,
    balances,
    createWallet,
    disconnectWallet,
    error,
    hasSavedSession,
    isCreating,
    isPreparing,
    isRefreshing,
    isSending,
    network,
    prepareTransfer,
    quote,
    reconnectWallet,
    refreshCurrentWallet,
    result,
    selectedChainId,
    sendTransfer,
    session,
    setSelectedChainId,
    statusMessage,
  } = useWalletState()

  const nativeBalance = balances.find((balance) => balance.asset.type === 'native')
  const resultUrl = result ? getTransactionExplorerUrl(network, result.transactionHash) : undefined

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MVP</p>
          <strong>Passkey Wallet</strong>
        </div>

        <div className="topbar-actions">
          <label className="field compact-field">
            <span>Network</span>
            <select
              value={selectedChainId}
              onChange={(event) => setSelectedChainId(Number(event.target.value) as 1 | 11155111)}
            >
              <option value={11155111}>Sepolia</option>
              <option value={1}>Ethereum Mainnet</option>
            </select>
          </label>

          {refreshCurrentWallet ? (
            <button className="button-secondary" onClick={() => void refreshCurrentWallet()}>
              Refresh
            </button>
          ) : null}
        </div>
      </header>

      <OnboardingPanel
        hasSavedSession={hasSavedSession}
        isCreating={isCreating}
        onCreate={createWallet}
        onDisconnect={disconnectWallet}
        onReconnect={reconnectWallet}
        walletLabel={session?.label}
      />

      {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}
      {session && nativeBalance?.value === 0n ? (
        <div className="banner warning">
          This wallet has no ETH on {network.label}. Smart-account transactions still need native
          gas.
        </div>
      ) : null}

      {session && address ? (
        <section className="dashboard">
          <section className="panel hero-panel">
            <div>
              <p className="eyebrow">Wallet</p>
              <h2>{session.label}</h2>
              <code className="block-code">{address}</code>
            </div>
            <div className="hero-facts">
              <div>
                <p className="muted">Smart account</p>
                <strong>Coinbase Smart Wallet</strong>
              </div>
              <div>
                <p className="muted">Owner type</p>
                <strong>WebAuthn passkey</strong>
              </div>
            </div>
          </section>

          <div className="dashboard-grid">
            <PortfolioPanel balances={balances} isRefreshing={isRefreshing} />
            <ReceivePanel address={address} chainLabel={network.label} />
          </div>

          <SendPanel
            assets={assets}
            isPreparing={isPreparing}
            isSending={isSending}
            onPrepare={prepareTransfer}
            onSend={sendTransfer}
            quote={quote}
            result={result}
            resultUrl={resultUrl}
          />
        </section>
      ) : null}
    </main>
  )
}

export default App
