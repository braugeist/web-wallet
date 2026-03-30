import { getAddress, isAddress } from 'viem'

export function validateRecipientAddress(recipient: string) {
  const value = recipient.trim()

  if (!value) {
    throw new Error('Enter a recipient address.')
  }

  if (!isAddress(value)) {
    throw new Error('Recipient must be a valid EVM address.')
  }

  return getAddress(value)
}
