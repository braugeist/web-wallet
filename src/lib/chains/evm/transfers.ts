import { encodeFunctionData, erc20Abi } from 'viem'

import type { WalletAsset, TransferQuote, PreparedCall } from '../types'
import { parseAmountInput } from '../../utils/amounts'
import { validateRecipientAddress } from './validation'

export function buildTransferCalls(
  asset: WalletAsset,
  recipient: string,
  amount: string,
): {
  calls: PreparedCall[]
  recipientAddress: `0x${string}`
  value: bigint
} {
  const recipientAddress = validateRecipientAddress(recipient)
  const value = parseAmountInput(amount, asset.decimals)

  if (asset.type === 'native') {
    return {
      calls: [
        {
          to: recipientAddress,
          value,
        },
      ],
      recipientAddress,
      value,
    }
  }

  if (!asset.address) {
    throw new Error(`Token ${asset.symbol} is missing a contract address.`)
  }

  return {
    calls: [
      {
        data: encodeFunctionData({
          abi: erc20Abi,
          args: [recipientAddress, value],
          functionName: 'transfer',
        }),
        to: asset.address,
        value: 0n,
      },
    ],
    recipientAddress,
    value,
  }
}

export function getEstimatedUserOperationFee(quote: Pick<
  TransferQuote,
  'callGasLimit' | 'maxFeePerGas' | 'preVerificationGas' | 'verificationGasLimit'
>) {
  return (
    (quote.callGasLimit + quote.preVerificationGas + quote.verificationGasLimit) *
    quote.maxFeePerGas
  )
}
