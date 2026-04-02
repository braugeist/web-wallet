import type {
  AdapterAddressParameters,
  AdapterBalanceParameters,
  AdapterSendParameters,
  AdapterTransferParameters,
  ChainAdapter,
} from '../types'
import { getEvmBalances } from './balances'
import { isSupportedErc20GasAsset, prepareErc20GasPayment } from './paymaster'
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
  const { account, bundlerClient, publicClient } = await createSmartWalletAccount(
    parameters.network,
    parameters.session,
  )
  const { calls, recipientAddress, value } = buildTransferCalls(
    parameters.asset,
    parameters.recipient,
    parameters.amount,
  )

  const gasAsset = parameters.gasAsset

  if (gasAsset.type === 'erc20' && !isSupportedErc20GasAsset(parameters.network, gasAsset)) {
    throw new Error(`ERC-20 gas payments are not supported for ${gasAsset.symbol} on ${parameters.network.label}.`)
  }

  const {
    calls: quotedCalls,
    estimatedGasFee,
    estimatedNativeFee,
    estimatedUsdFee,
    gasPaymentMode,
    includesGasTokenApproval,
    prepared,
  } = gasAsset.type === 'erc20'
    ? {
        ...(await prepareErc20GasPayment({
          account,
          bundlerClient,
          calls,
          gasAsset,
          network: parameters.network,
          publicClient,
        })),
        gasPaymentMode: 'erc20' as const,
      }
    : {
        calls,
        estimatedGasFee: 0n,
        estimatedNativeFee: 0n,
        estimatedUsdFee: undefined,
        gasPaymentMode: 'native' as const,
        includesGasTokenApproval: false,
        prepared: await bundlerClient.prepareUserOperation({
          account,
          calls,
        }),
      }

  const nextEstimatedNativeFee
    = gasPaymentMode === 'native'
      ? getEstimatedUserOperationFee({
          callGasLimit: prepared.callGasLimit,
          maxFeePerGas: prepared.maxFeePerGas,
          preVerificationGas: prepared.preVerificationGas,
          verificationGasLimit: prepared.verificationGasLimit,
        })
      : estimatedNativeFee

  return {
    asset: parameters.asset,
    callGasLimit: prepared.callGasLimit,
    calls: quotedCalls,
    estimatedGasFee:
      gasPaymentMode === 'native'
        ? nextEstimatedNativeFee
        : estimatedGasFee,
    estimatedNativeFee: nextEstimatedNativeFee,
    estimatedUsdFee,
    gasAsset,
    gasPaymentMode,
    includesGasTokenApproval,
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
    ...(parameters.quote.gasPaymentMode === 'erc20' && parameters.quote.gasAsset.address
      ? {
          paymaster: true,
          paymasterContext: {
            token: parameters.quote.gasAsset.address,
          },
        }
      : {}),
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
