import { describe, expect, it } from 'vitest'

import {
  buildMtPelerinOnrampUrl,
  mtPelerinSignatureToBase64Hash,
  MT_PELERIN_WIDGET_ORIGIN,
  parseMtPelerinWidgetEvent,
} from './mtPelerin'

describe('buildMtPelerinOnrampUrl', () => {
  it('builds a mainnet funding widget URL with the wallet address prefilled', () => {
    const url = new URL(buildMtPelerinOnrampUrl({
      address: '0x0000000000000000000000000000000000000001',
      addressValidation: {
        chain: 'mainnet',
        code: '1234',
        hash: 'signature-hash',
      },
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
    expect(url.searchParams.get('code')).toBe('1234')
    expect(url.searchParams.get('hash')).toBe('signature-hash')
    expect(url.searchParams.get('chain')).toBe('mainnet')
    expect(url.searchParams.get('rfr')).toBe('web-wallet')
  })
})

describe('mtPelerinSignatureToBase64Hash', () => {
  it('base64 encodes a hex signature for the hash parameter', () => {
    expect(mtPelerinSignatureToBase64Hash(
      '0xcab5cd25298c738c2f572284ccde1c1262d3bc46ab89d8ea4d42d901f33060030ce4f801cf87c2a0858d2ebe4dc0a87139888fa48daf84c94a0a285669d530e71b',
    )).toBe('yrXNJSmMc4wvVyKEzN4cEmLTvEaridjqTULZAfMwYAMM5PgBz4fCoIWNLr5NwKhxOYiPpI2vhMlKCihWadUw5xs=')
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
