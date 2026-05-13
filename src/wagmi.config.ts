import { createConfig, http } from 'wagmi'
import { mainnet, base, polygon, arbitrum, sepolia, baseSepolia } from 'wagmi/chains'
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

// WalletConnect 프로젝트 ID
// 무료 발급: https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = 'b0572e82ad0132dd362d89cbdd5b6d8b'

export const wagmiConfig = createConfig({
  chains: [mainnet, base, polygon, arbitrum, arcTestnet, sepolia, baseSepolia],
  connectors: [
    injected(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
    coinbaseWallet({ appName: 'USDC Portal' }),
  ],
  transports: {
    [mainnet.id]:     http('https://cloudflare-eth.com'),
    [base.id]:        http('https://mainnet.base.org'),
    [polygon.id]:     http('https://polygon-rpc.com'),
    [arbitrum.id]:    http('https://arb1.arbitrum.io/rpc'),
    [arcTestnet.id]:  http('https://rpc.testnet.arc.network'),
    [sepolia.id]:     http(),
    [baseSepolia.id]: http(),
  },
})
