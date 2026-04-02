import type { Address, Chain } from 'viem'
import { getAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

export type SupportedChainId = 1 | 11155111

export type SupportedNetworkConfig = {
  bundlerUrl: string
  chain: Chain
  chainId: SupportedChainId
  erc20GasPaymentTokens?: Address[]
  explorerUrl: string
  label: string
  nativeSymbol: string
  rpcUrl: string
}

const env = import.meta.env

export const supportedNetworks: SupportedNetworkConfig[] = [
  {
    bundlerUrl: env.VITE_MAINNET_BUNDLER_URL ?? 'https://public.pimlico.io/v2/1/rpc',
    chain: mainnet,
    chainId: 1,
    explorerUrl: 'https://etherscan.io',
    label: 'Ethereum Mainnet',
    nativeSymbol: 'ETH',
    rpcUrl: env.VITE_MAINNET_RPC_URL ?? 'https://ethereum-rpc.publicnode.com',
  },
  {
    bundlerUrl:
      env.VITE_SEPOLIA_BUNDLER_URL ?? 'https://public.pimlico.io/v2/11155111/rpc',
    chain: sepolia,
    chainId: 11155111,
    erc20GasPaymentTokens: [
      getAddress('0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'),
    ],
    explorerUrl: 'https://sepolia.etherscan.io',
    label: 'Sepolia',
    nativeSymbol: 'ETH',
    rpcUrl: env.VITE_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  },
]

export const defaultNetwork = supportedNetworks[1]

export function getSupportedNetwork(chainId: number) {
  const network = supportedNetworks.find((candidate) => candidate.chainId === chainId)

  if (!network) {
    throw new Error(`Unsupported chain id: ${chainId}`)
  }

  return network
}

export function supportsErc20GasPayments(network: SupportedNetworkConfig) {
  return Boolean(network.erc20GasPaymentTokens?.length)
}
