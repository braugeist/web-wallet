import { useMemo, useState } from 'react'

import type { TransferQuote, TransferResult, WalletAsset } from '../../lib/chains/types'
import { formatAmount } from '../../lib/utils/amounts'

type SendPanelProps = {
  assets: WalletAsset[]
  isPreparing: boolean
  isSending: boolean
  onPrepare: (asset: WalletAsset, recipient: string, amount: string) => Promise<void>
  onSend: () => Promise<void>
  quote: TransferQuote | null
  result: TransferResult | null
  resultUrl?: string
}

function getAssetKey(asset: WalletAsset) {
  return asset.type === 'native' ? `native:${asset.chainId}` : `erc20:${asset.address}`
}

export function SendPanel({
  assets,
  isPreparing,
  isSending,
  onPrepare,
  onSend,
  quote,
  result,
  resultUrl,
}: SendPanelProps) {
  const [selectedAssetKey, setSelectedAssetKey] = useState(() => getAssetKey(assets[0]))
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')

  const selectedAsset = useMemo(() => {
    return assets.find((asset) => getAssetKey(asset) === selectedAssetKey) ?? assets[0]
  }, [assets, selectedAssetKey])

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Send</p>
          <h2>Transfer native assets or ERC-20s</h2>
        </div>
      </div>

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
            onClick={() => void onPrepare(selectedAsset, recipient, amount)}
            disabled={isPreparing || isSending}
          >
            {isPreparing ? 'Preparing...' : 'Preview transfer'}
          </button>
          <button
            className="button-secondary"
            onClick={() => void onSend()}
            disabled={!quote || isPreparing || isSending}
          >
            {isSending ? 'Sending...' : 'Send with passkey'}
          </button>
        </div>

        {quote ? (
          <div className="callout">
            <p>
              {formatAmount(quote.value, quote.asset.decimals)} {quote.asset.symbol} to {quote.recipient}
            </p>
            <p className="muted">
              Estimated max network cost: {formatAmount(quote.estimatedFee, 18)} ETH
            </p>
          </div>
        ) : null}

        {result ? (
          <div className="callout success">
            <p>
              Last transfer: {result.success ? 'confirmed' : 'reverted'} with user operation{' '}
              <code>{result.userOperationHash}</code>
            </p>
            {resultUrl ? (
              <a href={resultUrl} target="_blank" rel="noreferrer">
                View transaction
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
