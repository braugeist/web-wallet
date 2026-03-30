import { QRCodeSVG } from 'qrcode.react'

import { truncateAddress } from '../../lib/utils/format'

type ReceivePanelProps = {
  address: string
  chainLabel: string
}

export function ReceivePanel({ address, chainLabel }: ReceivePanelProps) {
  return (
    <section className="panel panel-receive">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Receive</p>
          <h2>Fund this wallet</h2>
        </div>
      </div>

      <div className="receive-layout">
        <div className="qr-card">
          <QRCodeSVG value={address} size={176} bgColor="transparent" fgColor="currentColor" />
        </div>

        <div className="card-stack">
          <div>
            <p className="muted">Selected network</p>
            <p className="asset-symbol">{chainLabel}</p>
          </div>
          <div>
            <p className="muted">Wallet address</p>
            <code className="block-code">{address}</code>
            <p className="muted">Short form: {truncateAddress(address)}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
