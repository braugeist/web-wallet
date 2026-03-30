import type { WalletBalance } from '../../lib/chains/types'
import { formatAmount } from '../../lib/utils/amounts'

type PortfolioPanelProps = {
  balances: WalletBalance[]
  isRefreshing: boolean
}

export function PortfolioPanel({ balances, isRefreshing }: PortfolioPanelProps) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>Tracked assets</h2>
        </div>
        {isRefreshing ? <span className="chip">Refreshing...</span> : null}
      </div>

      <div className="asset-list">
        {balances.map((balance) => (
          <article className="asset-row" key={balance.asset.type === 'native' ? 'native' : balance.asset.address}>
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
    </section>
  )
}
