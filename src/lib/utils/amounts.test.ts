import { describe, expect, it } from 'vitest'

import { formatAmount, parseAmountInput } from './amounts'

describe('parseAmountInput', () => {
  it('parses decimal values using token decimals', () => {
    expect(parseAmountInput('1.25', 6)).toBe(1_250_000n)
  })

  it('rejects empty amounts', () => {
    expect(() => parseAmountInput('', 18)).toThrow('Enter an amount.')
  })

  it('rejects non-numeric values', () => {
    expect(() => parseAmountInput('abc', 18)).toThrow('Enter a valid numeric amount.')
  })

  it('rejects zero amounts', () => {
    expect(() => parseAmountInput('0', 18)).toThrow('Amount must be greater than zero.')
  })
})

describe('formatAmount', () => {
  it('trims trailing zeros', () => {
    expect(formatAmount(1_250_000n, 6)).toBe('1.25')
  })

  it('renders whole numbers cleanly', () => {
    expect(formatAmount(2_000_000n, 6)).toBe('2')
  })
})
