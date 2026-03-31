import { formatUnits, parseUnits } from 'viem'

export function normalizeAmountInput(amount: string) {
  return amount.replace(/,/g, '.')
}

export function parseAmountInput(amount: string, decimals: number) {
  const normalized = normalizeAmountInput(amount).trim()

  if (!normalized) {
    throw new Error('Enter an amount.')
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Enter a valid numeric amount.')
  }

  const value = parseUnits(normalized, decimals)
  if (value <= 0n) {
    throw new Error('Amount must be greater than zero.')
  }

  return value
}

export function formatAmount(value: bigint, decimals: number, maximumFractionDigits = 6) {
  const [whole, fraction = ''] = formatUnits(value, decimals).split('.')
  const trimmedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, '')

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}
