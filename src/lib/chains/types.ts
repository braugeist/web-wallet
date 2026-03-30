import type { Address, Hex } from 'viem'

import type { SupportedNetworkConfig } from '../../config/networks'
import type { WalletSession } from '../storage/walletSession'

export type ChainKind = 'evm'
export type AssetType = 'native' | 'erc20'

export type WalletAsset = {
  address?: Address
  chainId: number
  decimals: number
  name: string
  symbol: string
  type: AssetType
}

export type WalletBalance = {
  asset: WalletAsset
  value: bigint
}

export type PreparedCall = {
  data?: Hex
  to: Address
  value?: bigint
}

export type TransferQuote = {
  asset: WalletAsset
  calls: PreparedCall[]
  estimatedFee: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  preVerificationGas: bigint
  recipient: Address
  value: bigint
  verificationGasLimit: bigint
  callGasLimit: bigint
}

export type TransferResult = {
  success: boolean
  transactionHash: Hex
  userOperationHash: Hex
}

export type AdapterAddressParameters = {
  network: SupportedNetworkConfig
  session: WalletSession
}

export type AdapterBalanceParameters = AdapterAddressParameters & {
  assets: WalletAsset[]
}

export type AdapterTransferParameters = AdapterAddressParameters & {
  asset: WalletAsset
  amount: string
  recipient: string
}

export type AdapterSendParameters = AdapterAddressParameters & {
  quote: TransferQuote
}

export interface ChainAdapter {
  readonly kind: ChainKind
  getAddress(parameters: AdapterAddressParameters): Promise<Address>
  getBalances(parameters: AdapterBalanceParameters): Promise<WalletBalance[]>
  prepareTransfer(parameters: AdapterTransferParameters): Promise<TransferQuote>
  sendTransfer(parameters: AdapterSendParameters): Promise<TransferResult>
}
