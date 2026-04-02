import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  hexToBigInt,
  maxUint256,
  numberToHex,
  type Address,
  type Hex,
} from 'viem'

import type { SupportedNetworkConfig } from '../../../config/networks'
import { supportsErc20GasPayments } from '../../../config/networks'
import type { PreparedCall, WalletAsset } from '../types'
import { getEstimatedUserOperationFee } from './transfers'

const EXCHANGE_RATE_SCALE = 10n ** 18n

type SmartAccountLike = {
  address: Address
  entryPoint: {
    address: Address
  }
}

type PreparedUserOperationLike = {
  callGasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  preVerificationGas: bigint
  verificationGasLimit: bigint
  paymasterPostOpGasLimit?: bigint
  paymasterVerificationGasLimit?: bigint
}

type BundlerClientLike = {
  prepareUserOperation(parameters: {
    account: SmartAccountLike
    calls: PreparedCall[]
    paymaster: true
    paymasterContext: { token: Address }
  }): Promise<PreparedUserOperationLike>
  request: unknown
}

type PublicClientLike = {
  readContract(parameters: {
    abi: typeof erc20Abi
    address: Address
    functionName: 'allowance'
    args: [Address, Address]
  }): Promise<bigint>
}

type PimlicoTokenQuoteRpc = {
  exchangeRate: Hex
  exchangeRateNativeToUsd: Hex
  paymaster: Address
  postOpGas: Hex
  token: Address
}

type PimlicoTokenQuote = {
  exchangeRate: bigint
  exchangeRateNativeToUsd: bigint
  paymaster: Address
  postOpGas: bigint
  token: Address
}

export type PreparedErc20GasPayment = {
  calls: PreparedCall[]
  estimatedGasFee: bigint
  estimatedNativeFee: bigint
  estimatedUsdFee: bigint
  includesGasTokenApproval: boolean
  prepared: PreparedUserOperationLike
}

export function isSupportedErc20GasAsset(
  network: SupportedNetworkConfig,
  asset: WalletAsset,
) {
  if (!supportsErc20GasPayments(network) || asset.type !== 'erc20' || !asset.address) {
    return false
  }

  return (
    network.erc20GasPaymentTokens?.some(
      (supportedToken) => supportedToken.toLowerCase() === asset.address?.toLowerCase(),
    ) ?? false
  )
}

export function buildApproveSpenderCall(
  tokenAddress: Address,
  spender: Address,
): PreparedCall {
  return {
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [spender, maxUint256],
      functionName: 'approve',
    }),
    to: tokenAddress,
    value: 0n,
  }
}

export function getUserOperationMaxGas(userOperation: PreparedUserOperationLike) {
  return (
    userOperation.callGasLimit +
    userOperation.preVerificationGas +
    userOperation.verificationGasLimit +
    (userOperation.paymasterPostOpGasLimit ?? 0n) +
    (userOperation.paymasterVerificationGasLimit ?? 0n)
  )
}

export function estimateErc20GasFee(
  userOperation: PreparedUserOperationLike,
  quote: PimlicoTokenQuote,
) {
  const userOperationMaxCost = getUserOperationMaxGas(userOperation) * userOperation.maxFeePerGas

  return (
    ((userOperationMaxCost + quote.postOpGas * userOperation.maxFeePerGas) * quote.exchangeRate)
    / EXCHANGE_RATE_SCALE
  )
}

export function estimateUsdGasFee(
  userOperation: PreparedUserOperationLike,
  quote: PimlicoTokenQuote,
) {
  const userOperationMaxCost = getUserOperationMaxGas(userOperation) * userOperation.maxFeePerGas

  return (
    ((userOperationMaxCost + quote.postOpGas * userOperation.maxFeePerGas)
      * quote.exchangeRateNativeToUsd)
    / EXCHANGE_RATE_SCALE
  )
}

export async function prepareErc20GasPayment(parameters: {
  account: SmartAccountLike
  bundlerClient: BundlerClientLike
  calls: PreparedCall[]
  gasAsset: WalletAsset
  network: SupportedNetworkConfig
  publicClient: PublicClientLike
}): Promise<PreparedErc20GasPayment> {
  const { account, bundlerClient, calls, gasAsset, network, publicClient } = parameters

  if (!isSupportedErc20GasAsset(network, gasAsset) || !gasAsset.address) {
    throw new Error(`ERC-20 gas payments are not supported for ${gasAsset.symbol} on ${network.label}.`)
  }

  const tokenQuote = await getPimlicoTokenQuote(
    bundlerClient,
    account.entryPoint.address,
    network.chainId,
    gasAsset.address,
  )
  const currentAllowance = await getErc20Allowance(publicClient, gasAsset.address, account.address, tokenQuote.paymaster)

  const callsWithExistingAllowance = calls
  const callsWithApproval = [
    buildApproveSpenderCall(gasAsset.address, tokenQuote.paymaster),
    ...calls,
  ]

  if (currentAllowance === 0n) {
    const prepared = await prepareWithErc20Paymaster(
      bundlerClient,
      account,
      callsWithApproval,
      gasAsset.address,
    )

    return {
      calls: callsWithApproval,
      estimatedGasFee: estimateErc20GasFee(prepared, tokenQuote),
      estimatedNativeFee: getEstimatedUserOperationFee(prepared),
      estimatedUsdFee: estimateUsdGasFee(prepared, tokenQuote),
      includesGasTokenApproval: true,
      prepared,
    }
  }

  try {
    const prepared = await prepareWithErc20Paymaster(
      bundlerClient,
      account,
      callsWithExistingAllowance,
      gasAsset.address,
    )
    const estimatedGasFee = estimateErc20GasFee(prepared, tokenQuote)

    if (currentAllowance >= estimatedGasFee) {
      return {
        calls: callsWithExistingAllowance,
        estimatedGasFee,
        estimatedNativeFee: getEstimatedUserOperationFee(prepared),
        estimatedUsdFee: estimateUsdGasFee(prepared, tokenQuote),
        includesGasTokenApproval: false,
        prepared,
      }
    }
  } catch {
    // Fall through to the approval path when the paymaster rejects the existing allowance.
  }

  const prepared = await prepareWithErc20Paymaster(
    bundlerClient,
    account,
    callsWithApproval,
    gasAsset.address,
  )

  return {
    calls: callsWithApproval,
    estimatedGasFee: estimateErc20GasFee(prepared, tokenQuote),
    estimatedNativeFee: getEstimatedUserOperationFee(prepared),
    estimatedUsdFee: estimateUsdGasFee(prepared, tokenQuote),
    includesGasTokenApproval: true,
    prepared,
  }
}

async function prepareWithErc20Paymaster(
  bundlerClient: BundlerClientLike,
  account: SmartAccountLike,
  calls: PreparedCall[],
  token: Address,
) {
  return bundlerClient.prepareUserOperation({
    account,
    calls,
    paymaster: true,
    paymasterContext: { token },
  })
}

async function getPimlicoTokenQuote(
  bundlerClient: BundlerClientLike,
  entryPointAddress: Address,
  chainId: number,
  tokenAddress: Address,
): Promise<PimlicoTokenQuote> {
  const request = bundlerClient.request as (parameters: {
    method: string
    params: unknown[]
  }) => Promise<unknown>
  let response: { quotes?: PimlicoTokenQuoteRpc[] }

  try {
    response = await request({
      method: 'pimlico_getTokenQuotes',
      params: [
        { tokens: [tokenAddress] },
        entryPointAddress,
        numberToHex(chainId),
      ],
    }) as { quotes?: PimlicoTokenQuoteRpc[] }
  } catch (error) {
    const message = error instanceof Error ? ` ${error.message}` : ''
    throw new Error(
      'ERC-20 gas payments require a Pimlico-compatible Sepolia bundler/paymaster endpoint. '
      + `Set VITE_SEPOLIA_BUNDLER_URL if your current RPC does not expose token quote methods.${message}`,
    )
  }

  const quote = response.quotes?.find(
    (candidate) => getAddress(candidate.token) === getAddress(tokenAddress),
  )

  if (!quote) {
    throw new Error('The configured Pimlico endpoint did not return a gas quote for this token.')
  }

  return {
    exchangeRate: hexToBigInt(quote.exchangeRate),
    exchangeRateNativeToUsd: hexToBigInt(quote.exchangeRateNativeToUsd),
    paymaster: getAddress(quote.paymaster),
    postOpGas: hexToBigInt(quote.postOpGas),
    token: getAddress(quote.token),
  }
}

async function getErc20Allowance(
  publicClient: PublicClientLike,
  tokenAddress: Address,
  owner: Address,
  spender: Address,
) {
  return publicClient.readContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'allowance',
    args: [owner, spender],
  })
}
