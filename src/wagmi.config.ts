import { createConfig, http, fallback } from 'wagmi'
import { mainnet, base, polygon, arbitrum, optimism, avalanche, sepolia, baseSepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

// Arc Testnet 커스텀 체인
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
} as const

const WALLETCONNECT_PROJECT_ID = 'b0572e82ad0132dd362d89cbdd5b6d8b'

export const wagmiConfig = createConfig({
  chains: [mainnet, base, polygon, arbitrum, optimism, avalanche, arcTestnet, sepolia, baseSepolia],
  connectors: [
    injected(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
    coinbaseWallet({ appName: 'USDC Portal' }),
  ],
  transports: {
    [mainnet.id]:    fallback([http('https://eth.llamarpc.com'),              http('https://1rpc.io/eth')]),
    [base.id]:       fallback([http('https://mainnet.base.org'),              http('https://1rpc.io/base')]),
    [polygon.id]:    fallback([http('https://polygon.llamarpc.com'),          http('https://1rpc.io/matic')]),
    [arbitrum.id]:   fallback([http('https://arb1.arbitrum.io/rpc'),          http('https://1rpc.io/arb')]),
    [optimism.id]:   fallback([http('https://mainnet.optimism.io'),           http('https://1rpc.io/op')]),
    [avalanche.id]:  fallback([http('https://api.avax.network/ext/bc/C/rpc'), http('https://1rpc.io/avax/c')]),
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
    [sepolia.id]:    http(),
    [baseSepolia.id]:http(),
  },
})
