import { useState } from 'react'

type OnboardingPanelProps = {
  hasSavedSession: boolean
  isCreating: boolean
  onCreate: (label: string) => Promise<void>
  onDisconnect: () => void
  onReconnect: () => Promise<void>
  walletLabel?: string
}

export function OnboardingPanel({
  hasSavedSession,
  isCreating,
  onCreate,
  onDisconnect,
  onReconnect,
  walletLabel,
}: OnboardingPanelProps) {
  const [label, setLabel] = useState(walletLabel ?? 'Primary wallet')

  return (
    <section className="panel panel-grid">
      <div>
        <p className="eyebrow">Passkey Wallet</p>
        <h1>Static Ethereum wallet secured by a passkey.</h1>
        <p className="lead">
          Create a Coinbase Smart Wallet owner from WebAuthn, then send and receive ETH and a
          curated ERC-20 set on Mainnet and Sepolia.
        </p>
      </div>

      <div className="card-stack">
        <label className="field">
          <span>Wallet label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Primary wallet"
          />
        </label>

        <div className="button-row">
          <button onClick={() => void onCreate(label)} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create wallet'}
          </button>
          <button
            className="button-secondary"
            onClick={() => void onReconnect()}
            disabled={!hasSavedSession}
          >
            Restore saved wallet
          </button>
        </div>

        <p className="muted">
          Your passkey stays with your device or passkey provider. This app only stores public
          wallet metadata locally in the browser.
        </p>

        {hasSavedSession ? (
          <button className="button-secondary" onClick={onDisconnect}>
            Forget saved wallet metadata
          </button>
        ) : null}
      </div>
    </section>
  )
}
