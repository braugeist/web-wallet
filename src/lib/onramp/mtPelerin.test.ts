import { describe, expect, it } from 'vitest'

import {
  buildMtPelerinOnrampUrl,
  MT_PELERIN_WIDGET_ORIGIN,
  parseMtPelerinWidgetEvent,
} from './mtPelerin'

describe('buildMtPelerinOnrampUrl', () => {
  it('builds a mainnet buy widget URL with the wallet address prefilled', () => {
    const url = new URL(buildMtPelerinOnrampUrl({
      address: '0x0000000000000000000000000000000000000001',
      allowedCryptoCurrencies: ['ETH', 'USDC'],
      cryptoCurrency: 'USDC',
      fiatCurrency: 'EUR',
      integrationKey: 'test-key',
      primaryColor: '#111111',
      referralCode: 'web-wallet',
      successColor: '#111111',
    }))

    expect(url.origin).toBe(MT_PELERIN_WIDGET_ORIGIN)
    expect(url.searchParams.get('_ctkn')).toBe('test-key')
    expect(url.searchParams.get('type')).toBe('web')
    expect(url.searchParams.get('tabs')).toBe('buy')
    expect(url.searchParams.get('tab')).toBe('buy')
    expect(url.searchParams.get('net')).toBe('mainnet')
    expect(url.searchParams.get('dnet')).toBe('mainnet')
    expect(url.searchParams.get('bsc')).toBe('EUR')
    expect(url.searchParams.get('bdc')).toBe('USDC')
    expect(url.searchParams.get('primary')).toBe('#111111')
    expect(url.searchParams.get('success')).toBe('#111111')
    expect(url.searchParams.get('crys')).toBe('ETH,USDC')
    expect(url.searchParams.get('addr')).toBe('0x0000000000000000000000000000000000000001')
    expect(url.searchParams.get('rfr')).toBe('web-wallet')
  })
})

describe('parseMtPelerinWidgetEvent', () => {
  it('parses known widget events', () => {
    expect(parseMtPelerinWidgetEvent({
      type: 'paymentSubmitted',
      data: {
        paymentId: 'payment-1',
        paymentType: 'card',
      },
    })).toEqual({
      type: 'paymentSubmitted',
      data: {
        paymentId: 'payment-1',
        paymentType: 'card',
      },
    })
  })

  it('ignores unknown widget events', () => {
    expect(parseMtPelerinWidgetEvent({ type: 'ignored', data: {} })).toBeNull()
    expect(parseMtPelerinWidgetEvent(null)).toBeNull()
  })
})
