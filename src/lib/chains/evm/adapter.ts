import type {
  AdapterAddressParameters,
  AdapterBalanceParameters,
  AdapterSendParameters,
  AdapterTransferParameters,
  ChainAdapter,
} from '../types'
import { getEvmBalances } from './balances'
import { buildTransferCalls, getEstimatedUserOperationFee } from './transfers'
import { createSmartWalletAccount } from '../../wallet/account'

async function getAddress(parameters: AdapterAddressParameters) {
  const { account } = await createSmartWalletAccount(parameters.network, parameters.session)
  return account.address
}

async function getBalances(parameters: AdapterBalanceParameters) {
  return getEvmBalances(parameters.network, parameters.session, parameters.assets)
}

async function prepareTransfer(parameters: AdapterTransferParameters) {
  const { account, bundlerClient } = await createSmartWalletAccount(
    parameters.network,
    parameters.session,
  )
  const { calls, recipientAddress, value } = buildTransferCalls(
    parameters.asset,
    parameters.recipient,
    parameters.amount,
  )

  const prepared = await bundlerClient.prepareUserOperation({
    account,
    calls,
  })

  return {
    asset: parameters.asset,
    callGasLimit: prepared.callGasLimit,
    calls,
    estimatedFee: getEstimatedUserOperationFee({
      callGasLimit: prepared.callGasLimit,
      maxFeePerGas: prepared.maxFeePerGas,
      preVerificationGas: prepared.preVerificationGas,
      verificationGasLimit: prepared.verificationGasLimit,
    }),
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
    preVerificationGas: prepared.preVerificationGas,
    recipient: recipientAddress,
    value,
    verificationGasLimit: prepared.verificationGasLimit,
  }
}

async function sendTransfer(parameters: AdapterSendParameters) {
  const { account, bundlerClient } = await createSmartWalletAccount(
    parameters.network,
    parameters.session,
  )

  const userOperationHash = await bundlerClient.sendUserOperation({
    account,
    calls: parameters.quote.calls,
  })

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOperationHash,
    pollingInterval: 2_000,
    retryCount: 30,
    timeout: 120_000,
  })

  return {
    success: receipt.success,
    transactionHash: receipt.receipt.transactionHash,
    userOperationHash,
  }
}

export const evmChainAdapter: ChainAdapter = {
  getAddress,
  getBalances,
  kind: 'evm',
  prepareTransfer,
  sendTransfer,
}
