import { useState, useEffect, useCallback, useRef } from 'react'
import { useConnect, useDisconnect, useConnections, useSwitchChain, useSendTransaction } from 'wagmi'
import { createPublicClient, fallback, http, formatUnits, isAddress } from 'viem'
import { mainnet, base, polygon, arbitrum, optimism, avalanche, sepolia, baseSepolia } from 'wagmi/chains'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import {
  Sun, Moon, Plus, X, RefreshCw, ArrowRight, Copy, Check,
  Wallet, ExternalLink, AlertTriangle, QrCode, ChevronDown,
  ArrowUpRight, Repeat2, Layers, BookUser,
  Fuel, Trash2, Download, Zap, ShieldCheck, CircleDollarSign, Bot,
  Lock, Upload, BookOpen, LayoutDashboard, ArrowRightLeft, Network,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { arcTestnet } from './wagmi.config'
import './App.css'

const kit = new AppKit()

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// ??? USDCPaymentHub 而⑦듃?숉듃 ??????????????????????????????????????????????
const PAYMENT_HUB_ADDRESS = '0x5292C3d44e374a794d4b3477e2C81417BE5Db211' as `0x${string}`
const PAYMENT_HUB_ABI = [
  { name: 'pay',        type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'note', type: 'string' }], outputs: [] },
  { name: 'withdraw',   type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'getBalance', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'owner',      type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

// ??? CCTP V2 (Testnet) ????????????????????????????????????????????????????
const SEPOLIA_USDC        = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`
const ARC_MSG_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as `0x${string}`

// ??? ArcOnboarder ?????????????????????????????????????????????????????????
// TODO: Remix濡?Sepolia 諛고룷 ????二쇱냼瑜??ㅼ젣 而⑦듃?숉듃 二쇱냼濡?援먯껜
const ARC_ONBOARDER = '0x495825fF81B048B2A6e1FE10571625496f8fF1FD' as `0x${string}`

// ??? ArcEscrow ????????????????????????????????????????????????????????????
const ARC_ESCROW = '0xc73821142DeD9Ab7f0F299389Fd3a186475676d5' as `0x${string}`
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as `0x${string}`


// CCTP V2 Arc TokenMessenger (Arc -> Sepolia burn) — CREATE2, same addr on both chains
const ARC_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as `0x${string}`

const DEPOSIT_FOR_BURN_ABI = [
  { name: 'depositForBurn', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount',                type: 'uint256' },
      { name: 'destinationDomain',     type: 'uint32'  },
      { name: 'mintRecipient',         type: 'bytes32' },
      { name: 'burnToken',             type: 'address' },
      { name: 'destinationCaller',     type: 'bytes32' }, // 0x0 = anyone can relay
      { name: 'maxFee',                type: 'uint256' }, // 0 on testnet
      { name: 'minFinalityThreshold',  type: 'uint32'  }, // 1000 = confirmed, 2000 = finalized
    ], outputs: [{ name: '_nonce', type: 'uint64' }] },
] as const

// ERC-8183 AgenticCommerce (Arc Testnet official standard)
const ERC8183_CONTRACT = '0x0747EEf0706327138c69792bF28Cd525089e4583' as `0x${string}`
const ERC8183_ABI = [
  { name: 'createJob', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider',    type: 'address' },
      { name: 'evaluator',   type: 'address' },
      { name: 'expiredAt',   type: 'uint256' },
      { name: 'description', type: 'string'  },
      { name: 'hook',        type: 'address' },
    ], outputs: [{ name: 'jobId', type: 'uint256' }] },
  { name: 'setBudget', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'amount',    type: 'uint256' },
      { name: 'optParams', type: 'bytes'   },
    ], outputs: [] },
  { name: 'fund', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'optParams', type: 'bytes'   },
    ], outputs: [] },
  { name: 'submit', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',       type: 'uint256' },
      { name: 'deliverable', type: 'bytes32' },
      { name: 'optParams',   type: 'bytes'   },
    ], outputs: [] },
  { name: 'complete', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'reason',    type: 'bytes32' },
      { name: 'optParams', type: 'bytes'   },
    ], outputs: [] },
  { name: 'getJob', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'id',          type: 'uint256'  },
      { name: 'client',      type: 'address'  },
      { name: 'provider',    type: 'address'  },
      { name: 'evaluator',   type: 'address'  },
      { name: 'description', type: 'string'   },
      { name: 'budget',      type: 'uint256'  },
      { name: 'expiredAt',   type: 'uint256'  },
      { name: 'status',      type: 'uint8'    },
      { name: 'hook',        type: 'address'  },
    ] },
  { name: 'nextJobId', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const
const ARC_ESCROW_ABI = [
  { name: 'createJob', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent',       type: 'address' },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint256' },
      { name: 'description', type: 'string'  },
    ], outputs: [{ name: 'jobId', type: 'uint256' }] },
  { name: 'submitWork', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'resultUri', type: 'string'  },
    ], outputs: [] },
  { name: 'approveWork', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] },
  { name: 'claimRefund', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] },
  { name: 'getJob', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'client',      type: 'address' },
      { name: 'agent',       type: 'address' },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint256' },
      { name: 'description', type: 'string'  },
      { name: 'resultUri',   type: 'string'  },
      { name: 'status',      type: 'uint8'   },
    ] },
] as const

const NEXT_JOB_ID_ABI = [
  { name: 'nextJobId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

const APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
] as const


const ARC_ONBOARDER_ABI = [
  { name: 'bridgeUSDCToArc', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount',       type: 'uint256' },
      { name: 'arcRecipient', type: 'bytes32' },
    ],
    outputs: [] },
] as const

const RECEIVE_MSG_ABI = [
  { name: 'receiveMessage', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'message', type: 'bytes' }, { name: 'attestation', type: 'bytes' }],
    outputs: [{ name: 'success', type: 'bool' }] },
] as const

const MESSAGE_SENT_EVENT = [
  { name: 'MessageSent', type: 'event',
    inputs: [{ name: 'message', type: 'bytes', indexed: false }] },
] as const

// ??? 泥댁씤 硫뷀? ????????????????????????????????????????????????????????????
export const CHAINS = [mainnet, base, polygon, arbitrum, optimism, avalanche, arcTestnet, sepolia, baseSepolia] as const

export const CHAIN_META: Record<number, { label: string; color: string; isTestnet: boolean; explorer?: string }> = {
  [mainnet.id]:     { label: 'Ethereum',    color: '#627eea', isTestnet: false, explorer: 'https://etherscan.io' },
  [base.id]:        { label: 'Base',         color: '#0052ff', isTestnet: false, explorer: 'https://basescan.org' },
  [polygon.id]:     { label: 'Polygon',      color: '#8247e5', isTestnet: false, explorer: 'https://polygonscan.com' },
  [arbitrum.id]:    { label: 'Arbitrum',     color: '#12aaff', isTestnet: false, explorer: 'https://arbiscan.io' },
  [optimism.id]:    { label: 'Optimism',     color: '#ff0420', isTestnet: false, explorer: 'https://optimistic.etherscan.io' },
  [avalanche.id]:   { label: 'Avalanche',    color: '#e84142', isTestnet: false, explorer: 'https://snowscan.xyz' },
  [arcTestnet.id]:  { label: 'Arc Testnet',  color: '#00c2ff', isTestnet: true,  explorer: 'https://testnet.arcscan.app' },
  [sepolia.id]:     { label: 'Eth Sepolia',  color: '#627eea', isTestnet: true  },
  [baseSepolia.id]: { label: 'Base Sepolia', color: '#0052ff', isTestnet: true  },
}

const TOKEN_COLORS: Record<string, string> = {
  ETH: '#627eea', WETH: '#627eea', USDC: '#2775ca', 'USDC (gas)': '#2775ca',
  USDT: '#26a17b', DAI: '#f5ac37', POL: '#8247e5', MATIC: '#8247e5',
  ARB: '#12aaff', OP: '#ff0420', AVAX: '#e84142',
}

type TokenInfo = { symbol: string; address: `0x${string}`; decimals: number; coingeckoId: string }

const TOKENS: Record<number, TokenInfo[]> = {
  [mainnet.id]: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  coingeckoId: 'tether' },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai' },
  ],
  [base.id]: [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, coingeckoId: 'dai' },
  ],
  [polygon.id]: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  coingeckoId: 'tether' },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth' },
  ],
  [arbitrum.id]: [
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  coingeckoId: 'tether' },
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'ARB',  address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, coingeckoId: 'arbitrum' },
  ],
  [optimism.id]: [
    { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6,  coingeckoId: 'tether' },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'OP',   address: '0x4200000000000000000000000000000000000042', decimals: 18, coingeckoId: 'optimism' },
  ],
  [avalanche.id]: [
    { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6,  coingeckoId: 'tether' },
  ],
  [arcTestnet.id]:  [],
  [sepolia.id]: [
    { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, coingeckoId: 'tether' },
  ],
  [baseSepolia.id]: [{ symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, coingeckoId: 'usd-coin' }],
}

// LI.FI EVM 泥댁씤 紐⑸줉
const LIFI_CHAINS = [
  { id: mainnet.id,   label: 'Ethereum',  nativeSymbol: 'ETH' },
  { id: base.id,      label: 'Base',      nativeSymbol: 'ETH' },
  { id: polygon.id,   label: 'Polygon',   nativeSymbol: 'POL' },
  { id: arbitrum.id,  label: 'Arbitrum',  nativeSymbol: 'ETH' },
  { id: optimism.id,  label: 'Optimism',  nativeSymbol: 'ETH' },
  { id: avalanche.id, label: 'Avalanche', nativeSymbol: 'AVAX' },
]

const INSTALL_LINKS: Record<string, { url: string; label: string }> = {
  MetaMask:          { url: 'https://metamask.io/download/',             label: 'Install MetaMask' },
  'Coinbase Wallet': { url: 'https://www.coinbase.com/wallet/downloads', label: 'Install Coinbase Wallet' },
  WalletConnect:     { url: 'https://walletconnect.com/',                label: 'Open WalletConnect' },
}

function friendlyConnectError(error: Error | null, name: string): string | null {
  if (!error) return null
  const msg = error.message.toLowerCase()
  if (msg.includes('provider') || msg.includes('not found') || msg.includes('install')) return `${name} is not installed.`
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Connection cancelled.'
  return 'Connection failed. Please try again.'
}

// ??? 媛寃?API ?????????????????????????????????????????????????????????????
interface PriceData { usd: number; change24h: number }

async function fetchPrices(ids: string[]): Promise<Record<string, PriceData>> {
  if (!ids.length) return {}
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`
    const res = await fetch(url)
    const data = await res.json()
    return Object.fromEntries(ids.map((id) => [id, { usd: data[id]?.usd ?? 0, change24h: data[id]?.usd_24h_change ?? 0 }]))
  } catch { return {} }
}

// ??? ????????????????????????????????????????????????????????????????????
interface AssetRow {
  wallet: string; chain: number; symbol: string
  balance: string; usdcValue: string; coingeckoId: string; change24h: number
}

interface TxRecord {
  type: 'swap' | 'bridge' | 'send' | 'cross'
  summary: string; txHash: string; timestamp: number; status: 'success' | 'fail'
}

interface ConfirmState {
  title: string; lines: string[]; warnings: string[]; onConfirm: () => void
}

type Toast = {
  id: string
  type: 'success' | 'error' | 'loading'
  message: string
  txHash?: string
  explorerBase?: string
}

type TransferSeg = 'send' | 'pay'
type DefiSeg     = 'cross' | 'swap' | 'bridge' | 'agent'
type FaucetPollState = 'idle' | 'polling' | 'received'
type NetworkMode = 'mainnet' | 'testnet'
type MainTab     = 'assets' | 'history' | 'faucet'
type Theme       = 'dark' | 'light'
type InAppFaucetChain = 'ARC-TESTNET' | 'ETH-SEPOLIA' | 'BASE-SEPOLIA'
type MarketRequestStatus = 'open' | 'matched' | 'escrow-ready'

interface Contact { id: string; name: string; address: string }
interface MarketRequest {
  id: string
  title: string
  category: string
  budget: string
  deadlineDays: string
  description: string
  deliverable: string
  client: string
  agent?: string
  status: MarketRequestStatus
  createdAt: string
}

const CONTACTS_KEY = 'usdc_portal_contacts'
const REQUESTS_KEY = 'usdc_portal_requests'
function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]') } catch { return [] }
}
function saveContacts(c: Contact[]) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)) }
function seedMarketRequests(): MarketRequest[] {
  return [
    {
      id: 'req-demo-1',
      title: 'Audit landing page copy and UX flow',
      category: 'Design Review',
      budget: '25',
      deadlineDays: '3',
      description: 'Review the USDC Portal landing page, identify confusing sections, and propose clearer copy for marketplace users.',
      deliverable: 'A short UX critique with rewritten hero, workflow, and CTA copy.',
      client: 'Demo client',
      status: 'open',
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: 'req-demo-2',
      title: 'Build an Arc escrow explainer diagram',
      category: 'Visual Design',
      budget: '40',
      deadlineDays: '5',
      description: 'Create a clean diagram that explains Wallet -> USDC Route -> Arc Contract -> Verification -> Payout.',
      deliverable: 'SVG or image-ready diagram plus short implementation notes.',
      client: 'Demo client',
      status: 'open',
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
    },
  ]
}
function loadMarketRequests(): MarketRequest[] {
  try {
    const stored = JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? '[]')
    return Array.isArray(stored) && stored.length ? stored : seedMarketRequests()
  } catch { return seedMarketRequests() }
}
function saveMarketRequests(requests: MarketRequest[]) {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
}

// LI.FI
interface LiFiQuote {
  estimate: {
    fromAmount: string; toAmount: string; toAmountMin: string
    executionDuration: number
    feeCosts: Array<{ name: string; amount: string; token: { symbol: string; decimals: number } }>
  }
  transactionRequest: {
    from: string; to: string; data: string
    value: string; gasPrice: string; gasLimit: string; chainId: number
  }
  action: {
    fromChainId: number; toChainId: number
    fromToken: { symbol: string; decimals: number; address: string }
    toToken: { symbol: string; decimals: number }
  }
}

const MAINNET_IDS = new Set<number>([mainnet.id, base.id, polygon.id, arbitrum.id, optimism.id, avalanche.id])
const TESTNET_IDS = new Set<number>([arcTestnet.id, sepolia.id, baseSepolia.id])

interface FaucetInfo {
  chain: string; chainId: number; name: string; url: string
  tokens: string[]; desc: string; cooldownHours: number
  pollToken?: { address: `0x${string}`; decimals: number } | 'native'
}

const FAUCETS: FaucetInfo[] = [
  { chain: 'Arc Testnet', chainId: arcTestnet.id, name: 'Circle Faucet', url: 'https://faucet.circle.com/?allow=true',
    tokens: ['USDC'], desc: 'Official Circle faucet - 20 USDC every 2 hours', cooldownHours: 2,
    pollToken: { address: '0x3600000000000000000000000000000000000000', decimals: 6 } },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Alchemy Faucet', url: 'https://sepoliafaucet.com',
    tokens: ['ETH'], desc: 'Sepolia test ETH ??0.5 ETH/day', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Chainlink Faucet', url: 'https://faucets.chain.link/sepolia',
    tokens: ['ETH', 'LINK'], desc: 'ETH + LINK in one request', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Base Faucet', url: 'https://faucet.quicknode.com/base/sepolia',
    tokens: ['ETH'], desc: 'Base Sepolia test ETH', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Coinbase Faucet', url: 'https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
    tokens: ['ETH'], desc: 'Coinbase official Base faucet', cooldownHours: 24, pollToken: 'native' },
]

const IN_APP_FAUCETS: Record<InAppFaucetChain, { label: string; chainId: number; token: string; url: string; desc: string }> = {
  'ARC-TESTNET':  { label: 'Arc Testnet',      chainId: arcTestnet.id,   token: 'USDC', url: 'https://faucet.circle.com/?allow=true', desc: 'Official Circle public faucet. Open it, paste the active wallet, and this portal will watch for the incoming USDC.' },
  'ETH-SEPOLIA':  { label: 'Ethereum Sepolia', chainId: sepolia.id,      token: 'USDC', url: 'https://faucet.circle.com/?allow=true', desc: 'Use Circle public faucet for Sepolia USDC before CCTP bridge testing into Arc.' },
  'BASE-SEPOLIA': { label: 'Base Sepolia',     chainId: baseSepolia.id,  token: 'USDC', url: 'https://faucet.circle.com/?allow=true', desc: 'Use Circle public faucet for Base Sepolia USDC before route testing.' },
}

// ??? Public clients ???????????????????????????????????????????????????????
const publicClients = Object.fromEntries(
  CHAINS.map((chain) => {
    const rpcs: Record<number, string[]> = {
      [mainnet.id]:    ['https://eth.llamarpc.com', 'https://1rpc.io/eth'],
      [base.id]:       ['https://mainnet.base.org', 'https://1rpc.io/base'],
      [polygon.id]:    ['https://polygon.llamarpc.com', 'https://1rpc.io/matic'],
      [arbitrum.id]:   ['https://arb1.arbitrum.io/rpc', 'https://1rpc.io/arb'],
      [optimism.id]:   ['https://mainnet.optimism.io', 'https://1rpc.io/op'],
      [avalanche.id]:  ['https://api.avax.network/ext/bc/C/rpc', 'https://1rpc.io/avax/c'],
      [arcTestnet.id]: ['https://rpc.testnet.arc.network'],
      [sepolia.id]:    ['https://ethereum-sepolia-rpc.publicnode.com', 'https://1rpc.io/sepolia'],
    }
    const urls = rpcs[chain.id]
    return [chain.id, createPublicClient({ chain, transport: urls ? fallback(urls.map((u) => http(u))) : http() })]
  })
)

// ??? TX ?덉뒪?좊━ ???????????????????????????????????????????????????????????
const TX_KEY = 'usdc_portal_history'
function loadHistory(): TxRecord[] {
  try { return JSON.parse(localStorage.getItem(TX_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(records: TxRecord[]) { localStorage.setItem(TX_KEY, JSON.stringify(records.slice(0, 50))) }
function addHistory(records: TxRecord[], entry: TxRecord): TxRecord[] {
  const next = [entry, ...records].slice(0, 50); saveHistory(next); return next
}

function isNonceAlreadyUsedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('nonce already used') || msg.includes('nonce has already been used')
}

function isReceiptTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.toLowerCase().includes('timed out while waiting for transaction')
}

// ??? ?좏떥 而댄룷?뚰듃 ????????????????????????????????????????????????????????
function TokenIconWithChain({ symbol, chainId }: { symbol: string; chainId: number }) {
  const color = TOKEN_COLORS[symbol] ?? '#555'
  const chainColor = CHAIN_META[chainId]?.color ?? '#555'
  return (
    <div className="token-icon-wrap">
      <div className="token-icon" style={{ background: color + '22', color }}>
        {symbol.replace(' (gas)', '').charAt(0)}
      </div>
      <span className="chain-badge-dot" style={{ background: chainColor }} />
    </div>
  )
}

function Change24h({ value }: { value: number }) {
  if (value === 0) return null
  const pos = value > 0
  return <span className={`change24 ${pos ? 'pos' : 'neg'}`}>{pos ? '+' : ''}{value.toFixed(2)}%</span>
}

function SkeletonRows() {
  return <>{[1,2,3,4,5].map((i) => (
    <tr key={i} className="skeleton-row">
      {[120, 80, 80, 90, 70].map((w, j) => <td key={j}><div className="skel" style={{ width: w }} /></td>)}
    </tr>
  ))}</>
}

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{state.title}</h3>
          <button className="modal-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="modal-lines">
          {state.lines.map((l, i) => <div key={i} className="modal-line">{l}</div>)}
        </div>
        {state.warnings.length > 0 && (
          <div className="modal-warnings">
            {state.warnings.map((w, i) => (
              <div key={i} className="modal-warning"><AlertTriangle size={14} />{w}</div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-primary btn-confirm" onClick={() => { state.onConfirm(); onCancel() }}>Confirm & Sign</button>
        </div>
      </div>
    </div>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <div className="toast-icon">
            {t.type === 'loading' && <div className="toast-spinner" />}
            {t.type === 'success' && <Check size={14} style={{ color: 'var(--success)' }} />}
            {t.type === 'error'   && <AlertTriangle size={14} style={{ color: 'var(--error)' }} />}
          </div>
          <div className="toast-body">
            <span className="toast-message">{t.message}</span>
            {t.txHash && (
              <a className="toast-link"
                href={`${t.explorerBase ?? 'https://testnet.arcscan.app'}/tx/${t.txHash}`}
                target="_blank" rel="noopener noreferrer">
                View on explorer <ExternalLink size={10} />
              </a>
            )}
          </div>
          {t.type !== 'loading' && (
            <button className="toast-close" onClick={() => onRemove(t.id)}><X size={13} /></button>
          )}
        </div>
      ))}
    </div>
  )
}

type PendingBridge = {
  burnHash: string; messageBytes: string; messageHash: string
  direction: 'to-arc' | 'to-sepolia'; amount: string; savedAt: number; attestation?: string
}

// ??? ?濡쒓렇?섑뵿 鍮꾩＜??????????????????????????????????????????????????????
function SettlementFlowDiagram() {
  const steps = [
    {
      icon: '↓',
      title: 'Lock Funds',
      caption: 'Client deposits Arc USDC into escrow.',
      color: '#2775ca',
    },
    {
      icon: '↑',
      title: 'Submit Work',
      caption: 'Agent submits a deliverable, file, or public URI.',
      color: '#627eea',
    },
    {
      icon: '◈',
      title: 'Claude Review',
      caption: 'Claude evaluates the submitted result against the job description.',
      color: '#d4a574',
    },
    {
      icon: '→',
      title: 'Release Payout',
      caption: 'Approved work unlocks Arc USDC settlement to the agent.',
      color: '#00c2ff',
    },
  ]
  return (
    <div className="sfd-wrap">
      <div className="sfd-label">Settlement lifecycle</div>
      <div className="sfd-steps">
        {steps.map((s, i) => (
          <div key={i} className="sfd-step" style={{ '--sfd-color': s.color, '--sfd-i': i } as React.CSSProperties}>
            <div className="sfd-icon-col">
              <div className="sfd-icon">{s.icon}</div>
              {i < steps.length - 1 && <div className="sfd-connector" />}
            </div>
            <div className="sfd-content">
              <div className="sfd-title">{s.title}</div>
              <div className="sfd-caption">{s.caption}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ??? 硫붿씤 ????????????????????????????????????????????????????????????????
export default function App() {
  const connections = useConnections()
  const { connectors, connect, isPending: isConnecting, error: connectError, variables: connectVariables } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()

  const [theme, setTheme]           = useState<Theme>(() => (localStorage.getItem('theme') as Theme) ?? 'dark')
  const [networkMode, setNetworkMode] = useState<NetworkMode>(() => (localStorage.getItem('networkMode') as NetworkMode) ?? 'mainnet')
  const [mainTab, setMainTab]       = useState<MainTab>('assets')
  const [transferSeg, setTransferSeg] = useState<TransferSeg>('send')
  const [defiSeg, setDefiSeg]       = useState<DefiSeg>('cross')
  const [moveFundsTab, setMoveFundsTab] = useState<'bridge' | 'cross' | 'send'>('bridge')
  const [activePage, setActivePage] = useState<'overview' | 'marketplace' | 'portfolio' | 'pay' | 'funds' | 'escrow' | 'activity' | 'docs'>('overview')

  // ?? ArcEscrow ?곹깭 ????????????????????????????????????????????????????????
  const [escrowAgent,  setEscrowAgent]  = useState('')
  const [escrowAmount, setEscrowAmount] = useState('')
  const [escrowDays,   setEscrowDays]   = useState('3')
  const [escrowDesc,   setEscrowDesc]   = useState('')
  const [escrowJobId,  setEscrowJobId]  = useState('')
  const [escrowJob,    setEscrowJob]    = useState<{
    client: string; agent: string; amount: bigint; deadline: bigint;
    description: string; resultUri: string; status: number
  } | null>(null)
  const [escrowWorkText,     setEscrowWorkText]     = useState('')
  const [escrowWorkFile,     setEscrowWorkFile]     = useState<File | null>(null)
  const [escrowWorkUploading,setEscrowWorkUploading]= useState(false)
  const [escrowLoading,      setEscrowLoading]      = useState(false)
  const [aiVerdict,          setAiVerdict]          = useState<{ verdict: 'approve' | 'reject'; reasoning: string } | null>(null)
  const [aiLoading,          setAiLoading]          = useState(false)
  const [escrowMyTab,    setEscrowMyTab]    = useState<'new' | 'jobs'>('new')
  const [escrowProtocol, setEscrowProtocol] = useState<'arc-escrow' | 'erc8183'>('arc-escrow')
  const [recentJobIds,   setRecentJobIds]   = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('arc_escrow_jobs') ?? '[]') } catch { return [] }
  })
  const [marketRequests, setMarketRequests] = useState<MarketRequest[]>(loadMarketRequests)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketTab, setMarketTab] = useState<'browse' | 'create'>('browse')
  const [requestTitle, setRequestTitle] = useState('')
  const [requestCategory, setRequestCategory] = useState('AI Work')
  const [requestBudget, setRequestBudget] = useState('')
  const [requestDays, setRequestDays] = useState('3')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestDeliverable, setRequestDeliverable] = useState('')
  const [sortBy, setSortBy]         = useState<'value' | 'symbol' | 'chain'>('value')

  const [assets, setAssets]         = useState<AssetRow[]>([])
  const [prices, setPrices]         = useState<Record<string, PriceData>>({})
  const [totalUsdc, setTotalUsdc]   = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [cctpBalances, setCctpBalances] = useState<{ sepolia: string; arc: string; loading: boolean }>({ sepolia: '—', arc: '—', loading: false })
  const [history, setHistory]       = useState<TxRecord[]>(loadHistory)

  const [showConnectors, setShowConnectors] = useState(false)
  const [connectingId, setConnectingId]     = useState<string | null>(null)
  const [confirmState, setConfirmState]     = useState<ConfirmState | null>(null)
  const [copiedAddr, setCopiedAddr]         = useState(false)
  const [showQR, setShowQR]                 = useState(false)

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])

  const [contacts, setContacts]           = useState<Contact[]>(loadContacts)
  const [showContacts, setShowContacts]   = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactAddr, setNewContactAddr] = useState('')

  // 媛?ㅻ퉬
  const [gasPrices, setGasPrices] = useState<Record<number, string>>({})

  // ?뚯슦???대쭅
  const [faucetPoll, setFaucetPoll] = useState<Record<number, FaucetPollState>>({})
  const [inAppFaucetChain, setInAppFaucetChain] = useState<InAppFaucetChain>('ARC-TESTNET')
  const [inAppFaucetLoading, setInAppFaucetLoading] = useState(false)
  const [inAppFaucetMessage, setInAppFaucetMessage] = useState('')
  const pollTimers = useRef<Record<number, ReturnType<typeof setInterval>>>({})

  // ???곹깭
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount]       = useState('')
  // fromChain kept for Circle AppKit compatibility (kit.unifiedBalance)
  const _fromChain = 'Base_Sepolia' as const; void _fromChain
  const [txLoading, setTxLoading] = useState(false)

  // CCTP Bridge ?곹깭
  type CCTPStep = 'idle' | 'approving' | 'burning' | 'attesting' | 'minting' | 'done' | 'error'
  const [cctpAmount,    setCctpAmount]    = useState('')
  const [cctpRecipient, setCctpRecipient] = useState('')
  const [cctpStep,      setCctpStep]      = useState<CCTPStep>('idle')
  const [cctpBurnHash,  setCctpBurnHash]  = useState('')
  const [cctpDirection, setCctpDirection] = useState<'to-arc' | 'to-sepolia'>('to-arc')

  const [pendingBridge, setPendingBridge] = useState<PendingBridge | null>(() => {
    try { return JSON.parse(localStorage.getItem('cctp_pending_bridge') ?? 'null') } catch { return null }
  })
  const [claimLoading, setClaimLoading] = useState(false)
  const [recoverHash,  setRecoverHash]  = useState('')

  // ERC-8183 state
  type E8183Step = 'idle' | 'creating' | 'funding' | 'submitting' | 'completing' | 'done' | 'error'
  const [e8183Tab,       setE8183Tab]       = useState<'create' | 'lookup'>('create')
  const [e8183Provider,  setE8183Provider]  = useState('')
  const [e8183Amount,    setE8183Amount]    = useState('')
  const [e8183Days,      setE8183Days]      = useState('3')
  const [e8183Desc,      setE8183Desc]      = useState('')
  const [e8183JobId,     setE8183JobId]     = useState('')
  const [e8183Job,       setE8183Job]       = useState<{
    id: bigint; client: string; provider: string; evaluator: string;
    description: string; budget: bigint; expiredAt: bigint; status: number
  } | null>(null)
  const [e8183DelivUri,  setE8183DelivUri]  = useState('')
  const [e8183Step,      setE8183Step]      = useState<E8183Step>('idle')
  const [e8183Loading,   setE8183Loading]   = useState(false)

  // LI.FI
  const [lifiFromChainId, setLifiFromChainId] = useState<number>(mainnet.id)
  const [lifiToChainId, setLifiToChainId]     = useState<number>(base.id)
  const [lifiFromToken, setLifiFromToken]     = useState('ETH')
  const [lifiToToken, setLifiToToken]         = useState('USDC')
  const [lifiAmount, setLifiAmount]           = useState('')
  const [lifiQuote, setLifiQuote]             = useState<LiFiQuote | null>(null)
  const [lifiLoading, setLifiLoading]         = useState(false)
  const [lifiError, setLifiError]             = useState('')
  const [lifiExecuting, setLifiExecuting]     = useState(false)

  // Payment Hub
  const [payNote, setPayNote]                 = useState('')
  const [payAmount, setPayAmount]             = useState('')
  const [contractBalance, setContractBalance] = useState<string>('')
  const [contractOwner, setContractOwner]     = useState<string>('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const allAddresses = [...new Set(connections.flatMap((c) => c.accounts))]
  const isConnected  = connections.length > 0
  const activeChainId = connections[0]?.chainId
  const activeWallet = allAddresses[0]
  const activeWalletShort = activeWallet ? `${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}` : 'Not connected'
  const activeChainMeta = activeChainId ? CHAIN_META[activeChainId] : undefined

  // ??? Toast ?ы띁 ??????????????????????????????????????????????????????????
  function addToast(t: Omit<Toast, 'id'>): string {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    if (t.type === 'success') setTimeout(() => removeToast(id), 6000)
    // errors stay until dismissed (click X on toast)
    return id
  }
  function removeToast(id: string) { setToasts((prev) => prev.filter((x) => x.id !== id)) }
  // updateToast available for future use
  // function updateToast(id: string, t: Partial<Toast>) { ... }

  useEffect(() => { localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('networkMode', networkMode) }, [networkMode])
  useEffect(() => { saveMarketRequests(marketRequests) }, [marketRequests])
  useEffect(() => { loadMarketRequestsFromApi() }, [])
  useEffect(() => { if (allAddresses.length) loadAssets() }, [connections.length, allAddresses.join(',')])

  // 60珥??먮룞 ?덈줈怨좎묠
  useEffect(() => {
    if (!isConnected) return
    const t = setInterval(() => loadAssets(), 60000)
    return () => clearInterval(t)
  }, [isConnected])

  // ?대쭅 ?대┛??  useEffect(() => () => { Object.values(pollTimers.current).forEach(clearInterval) }, [])

  // ??? 媛?ㅻ퉬 議고쉶 ?????????????????????????????????????????????????????????
  useEffect(() => {
    async function fetchGas() {
      const results: Record<number, string> = {}
      const targets = networkMode === 'mainnet'
        ? [mainnet, base, optimism, arbitrum]
        : [arcTestnet, sepolia, baseSepolia]
      await Promise.allSettled(targets.map(async (chain) => {
        try {
          const fee = await publicClients[chain.id].estimateFeesPerGas()
          const gwei = fee.maxFeePerGas ? parseFloat(formatUnits(fee.maxFeePerGas, 9)).toFixed(2) : null
          if (gwei && parseFloat(gwei) < 10000) results[chain.id] = gwei
        } catch { /* ignore */ }
      }))
      setGasPrices(results)
    }
    fetchGas()
    const t = setInterval(fetchGas, 30000)
    return () => clearInterval(t)
  }, [networkMode])

  // ??? ?먯궛 議고쉶 ???????????????????????????????????????????????????????????
  const loadAssets = useCallback(async () => {
    if (!allAddresses.length) return
    setLoadingAssets(true)
    try {
      // All RPC calls fire in parallel — no sequential chain/token loop
      const balanceTasks: Promise<AssetRow | null>[] = []
      for (const address of allAddresses) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`
        for (const chain of CHAINS) {
          const client = publicClients[chain.id]
          const isArc  = chain.id === arcTestnet.id
          const isPoly = chain.id === polygon.id
          const isAvax = chain.id === avalanche.id
          balanceTasks.push(
            client.getBalance({ address }).then(bal => {
              if (bal === 0n) return null
              return {
                wallet: shortAddr, chain: chain.id, change24h: 0,
                symbol: isArc ? 'USDC (gas)' : isPoly ? 'POL' : isAvax ? 'AVAX' : 'ETH',
                balance: parseFloat(formatUnits(bal, 18)).toFixed(6),
                usdcValue: '0',
                coingeckoId: isArc ? 'usd-coin' : isPoly ? 'polygon-ecosystem-token' : isAvax ? 'avalanche-2' : 'ethereum',
              } as AssetRow
            }).catch(() => null)
          )
          for (const token of TOKENS[chain.id] ?? []) {
            balanceTasks.push(
              client.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
                .then(bal => {
                  if ((bal as bigint) === 0n) return null
                  return {
                    wallet: shortAddr, chain: chain.id, symbol: token.symbol, change24h: 0,
                    balance: parseFloat(formatUnits(bal as bigint, token.decimals)).toFixed(6),
                    usdcValue: '0', coingeckoId: token.coingeckoId,
                  } as AssetRow
                }).catch(() => null)
            )
          }
        }
      }
      // Price fetch runs in parallel with all balance queries
      const allCgIds = ['ethereum', 'usd-coin', 'tether', 'weth', 'dai',
        'polygon-ecosystem-token', 'arbitrum', 'optimism', 'avalanche-2']
      const [settled, priceMap] = await Promise.all([
        Promise.allSettled(balanceTasks),
        fetchPrices(allCgIds),
      ])
      const rows = settled
        .filter((r): r is PromiseFulfilledResult<AssetRow | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((r): r is AssetRow => r !== null)
      setPrices(priceMap)
      let total = 0
      const enriched = rows.map((r) => {
        const p = priceMap[r.coingeckoId] ?? { usd: 1, change24h: 0 }
        const val = parseFloat(r.balance) * p.usd
        total += val
        return { ...r, usdcValue: val.toFixed(2), change24h: p.change24h }
      }).sort((a, b) => parseFloat(b.usdcValue) - parseFloat(a.usdcValue))
      setAssets(enriched)
      setTotalUsdc(total.toFixed(2))
    } finally { setLoadingAssets(false) }
  }, [allAddresses.join(',')])

  const loadCctpBalances = useCallback(async () => {
    const addr = allAddresses[0] as `0x${string}` | undefined
    if (!addr) return
    setCctpBalances(b => ({ ...b, loading: true }))
    try {
      const [sepoliaBal, arcBal] = await Promise.all([
        publicClients[11155111].readContract({
          address: SEPOLIA_USDC as `0x${string}`,
          abi: ERC20_ABI, functionName: `balanceOf`, args: [addr],
        }).catch(() => 0n),
        publicClients[5042002].readContract({
          address: ARC_TESTNET_USDC,
          abi: ERC20_ABI, functionName: `balanceOf`, args: [addr],
        }).catch(() => 0n),
      ])
      setCctpBalances({
        sepolia: parseFloat(formatUnits(sepoliaBal as bigint, 6)).toFixed(2),
        arc:     parseFloat(formatUnits(arcBal as bigint, 6)).toFixed(2),
        loading: false,
      })
    } catch {
      setCctpBalances(b => ({ ...b, loading: false }))
    }
  }, [allAddresses.join(',')])

  useEffect(() => { if (isConnected && allAddresses[0]) loadCctpBalances() }, [isConnected, allAddresses.join(',')])

  useEffect(() => {
    if (activePage !== 'overview') return
    let obs: IntersectionObserver
    const timer = setTimeout(() => {
      const els = document.querySelectorAll<HTMLElement>('.reveal-section')
      obs = new IntersectionObserver(
        (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view') }),
        { threshold: 0.08 }
      )
      els.forEach(el => obs.observe(el))
    }, 80)
    return () => { clearTimeout(timer); obs?.disconnect() }
  }, [activePage])

  // ??? 二쇱냼濡???????????????????????????????????????????????????????????????
  function addContact() {
    if (!newContactName.trim() || !isAddress(newContactAddr)) return
    const next = [...contacts, { id: Date.now().toString(), name: newContactName.trim(), address: newContactAddr }]
    setContacts(next); saveContacts(next)
    setNewContactName(''); setNewContactAddr('')
  }
  function removeContact(id: string) {
    const next = contacts.filter((c) => c.id !== id)
    setContacts(next); saveContacts(next)
  }

  async function loadMarketRequestsFromApi() {
    setMarketLoading(true)
    try {
      const res = await fetch('/api/requests')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load requests')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load shared requests'
      addToast({ type: 'error', message: `${msg}. Showing local fallback.` })
    } finally {
      setMarketLoading(false)
    }
  }

  async function createMarketRequest() {
    if (!isConnected || !activeWallet) return addToast({ type: 'error', message: 'Connect a wallet first' })
    if (!requestTitle.trim()) return addToast({ type: 'error', message: 'Enter a request title' })
    if (!requestDescription.trim()) return addToast({ type: 'error', message: 'Describe the work request' })
    if (!requestDeliverable.trim()) return addToast({ type: 'error', message: 'Define the expected deliverable' })
    const budget = parseFloat(requestBudget)
    if (!budget || budget <= 0) return addToast({ type: 'error', message: 'Enter a USDC budget' })
    setMarketLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: requestTitle,
          category: requestCategory,
          budget,
          deadlineDays: requestDays,
          description: requestDescription,
          deliverable: requestDeliverable,
          client: activeWallet,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not post request')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
      setRequestTitle(''); setRequestBudget(''); setRequestDays('3')
      setRequestDescription(''); setRequestDeliverable(''); setRequestCategory('AI Work')
      setMarketTab('browse')
      addToast({ type: 'success', message: 'Request posted to the shared board' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not post request' })
    } finally {
      setMarketLoading(false)
    }
  }

  async function acceptMarketRequest(id: string) {
    if (!isConnected || !activeWallet) return addToast({ type: 'error', message: 'Connect a wallet first' })
    setMarketLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'accept', agent: activeWallet }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not accept request')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
      addToast({ type: 'success', message: 'Request accepted on the shared board' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not accept request' })
    } finally {
      setMarketLoading(false)
    }
  }

  function useRequestForEscrow(request: MarketRequest) {
    setEscrowAgent(request.agent ?? '')
    setEscrowAmount(request.budget)
    setEscrowDays(request.deadlineDays)
    setEscrowDesc(`${request.title}: ${request.deliverable}`)
    setEscrowProtocol('arc-escrow')
    setEscrowMyTab('new')
    setActivePage('escrow')
    setMarketRequests((prev) => prev.map((r) => r.id === request.id ? { ...r, status: 'escrow-ready' } : r))
    addToast({ type: 'success', message: 'Escrow form prepared from request' })
  }

  // ??? ?뚯슦???대쭅 ?????????????????????????????????????????????????????????
  async function getTokenBalance(address: `0x${string}`, faucet: FaucetInfo): Promise<bigint> {
    const client = publicClients[faucet.chainId]
    if (!client) return 0n
    if (faucet.pollToken === 'native') return client.getBalance({ address }).catch(() => 0n)
    if (faucet.pollToken) {
      return client.readContract({ address: faucet.pollToken.address, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [address] }).catch(() => 0n) as Promise<bigint>
    }
    return 0n
  }

  function startFaucetPoll(idx: number) {
    const addr = allAddresses[0] as `0x${string}` | undefined
    if (!addr || !FAUCETS[idx].pollToken) return
    setFaucetPoll((p) => ({ ...p, [idx]: 'polling' }))
    const faucet = FAUCETS[idx]
    let snapshot: bigint | null = null
    getTokenBalance(addr, faucet).then((bal) => { snapshot = bal })
    const timer = setInterval(async () => {
      if (snapshot === null) return
      const current = await getTokenBalance(addr, faucet)
      if (current > snapshot) {
        clearInterval(timer); delete pollTimers.current[idx]
        setFaucetPoll((p) => ({ ...p, [idx]: 'received' }))
        loadAssets()
      }
    }, 5000)
    pollTimers.current[idx] = timer
    setTimeout(() => {
      if (pollTimers.current[idx]) {
        clearInterval(pollTimers.current[idx]); delete pollTimers.current[idx]
        setFaucetPoll((p) => p[idx] === 'polling' ? { ...p, [idx]: 'idle' } : p)
      }
    }, 180000)
  }

  function requestInAppFaucet() {
    const addr = allAddresses[0]
    if (!addr) return addToast({ type: 'error', message: 'Connect a wallet first' })

    setInAppFaucetLoading(true)
    setInAppFaucetMessage('')
    const selected = IN_APP_FAUCETS[inAppFaucetChain]
    const loadId = addToast({ type: 'loading', message: 'Opening Circle public faucet and watching your wallet...' })
    try {
      navigator.clipboard?.writeText(addr).catch(() => undefined)
      window.open(selected.url, '_blank', 'noopener,noreferrer')
      removeToast(loadId)
      setInAppFaucetMessage(`Active wallet copied: ${addr.slice(0, 6)}...${addr.slice(-4)}. Complete the Circle faucet tab, then this portal will detect the incoming ${selected.token}.`)
      addToast({ type: 'success', message: 'Circle faucet opened. Wallet address copied.' })
      const faucetIdx = FAUCETS.findIndex((f) => f.chainId === selected.chainId && f.tokens.includes('USDC'))
      if (faucetIdx >= 0) startFaucetPoll(faucetIdx)
    } catch (e) {
      removeToast(loadId)
      const msg = e instanceof Error ? e.message : 'Faucet request failed'
      setInAppFaucetMessage(msg)
      addToast({ type: 'error', message: msg })
    } finally {
      setInAppFaucetLoading(false)
    }
  }

  // ??? CSV ?대낫?닿린 ?????????????????????????????????????????????????????????
  function exportCSV() {
    const rows = ['Token,Chain,Wallet,Balance,Value (USD),24h Change']
    displayed.forEach((a) => {
      rows.push(`${a.symbol},${CHAIN_META[a.chain]?.label ?? a.chain},${a.wallet},${a.balance},${a.usdcValue},${a.change24h.toFixed(2)}%`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`; el.click()
    URL.revokeObjectURL(url)
  }

  // ??? Payment Hub ??????????????????????????????????????????????????????????
  async function loadContractInfo() {
    try {
      const client = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      const [bal, owner] = await Promise.all([
        client.readContract({ address: PAYMENT_HUB_ADDRESS, abi: PAYMENT_HUB_ABI, functionName: 'getBalance' }),
        client.readContract({ address: PAYMENT_HUB_ADDRESS, abi: PAYMENT_HUB_ABI, functionName: 'owner' }),
      ])
      setContractBalance(formatUnits(bal as bigint, 6))
      setContractOwner((owner as string).toLowerCase())
    } catch { /* ignore */ }
  }

  async function payToContract() {
    if (!payAmount || parseFloat(payAmount) <= 0) return addToast({ type: 'error', message: 'Enter an amount' })
    const addrs = connections.flatMap((c) => [...c.accounts] as string[])
    if (!addrs.length) return addToast({ type: 'error', message: 'Connect a wallet first' })
    const loadId = addToast({ type: 'loading', message: 'Processing payment...' })
    setTxLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      const amountWei = BigInt(Math.round(parseFloat(payAmount) * 1e6))
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({ abi: PAYMENT_HUB_ABI, functionName: 'pay', args: [payNote || ''] })
      const hash = await sendTransactionAsync({ to: PAYMENT_HUB_ADDRESS, data, value: amountWei })
      removeToast(loadId)
      addToast({ type: 'success', message: `Paid ${payAmount} USDC to contract`, txHash: hash, explorerBase: 'https://testnet.arcscan.app' })
      setPayAmount(''); setPayNote('')
      setTimeout(loadContractInfo, 3000)
    } catch (e: unknown) {
      removeToast(loadId)
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Payment failed' })
    } finally { setTxLoading(false) }
  }

  async function withdrawFromContract() {
    setWithdrawLoading(true)
    const loadId = addToast({ type: 'loading', message: 'Withdrawing...' })
    try {
      await switchChain({ chainId: arcTestnet.id })
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({ abi: PAYMENT_HUB_ABI, functionName: 'withdraw', args: [] })
      const hash = await sendTransactionAsync({ to: PAYMENT_HUB_ADDRESS, data })
      removeToast(loadId)
      addToast({ type: 'success', message: 'Withdrawal successful', txHash: hash, explorerBase: 'https://testnet.arcscan.app' })
      setTimeout(loadContractInfo, 3000)
    } catch (e: unknown) {
      removeToast(loadId)
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Withdrawal failed' })
    } finally { setWithdrawLoading(false) }
  }

  // ??? LI.FI ???????????????????????????????????????????????????????????????
  function getLifiTokenAddress(chainId: number, symbol: string): string {
    if (symbol === 'ETH' || symbol === 'POL' || symbol === 'AVAX') return '0x0000000000000000000000000000000000000000'
    return TOKENS[chainId]?.find((t) => t.symbol === symbol)?.address ?? '0x0000000000000000000000000000000000000000'
  }
  function getLifiTokenDecimals(chainId: number, symbol: string): number {
    if (symbol === 'ETH' || symbol === 'POL' || symbol === 'AVAX') return 18
    return TOKENS[chainId]?.find((t) => t.symbol === symbol)?.decimals ?? 18
  }
  function getLifiFromTokens(chainId: number) {
    const chain = LIFI_CHAINS.find((c) => c.id === chainId)
    const native = chain?.nativeSymbol ?? 'ETH'
    return [native, ...(TOKENS[chainId]?.map((t) => t.symbol) ?? [])]
  }

  async function fetchLiFiQuote() {
    if (!lifiAmount || parseFloat(lifiAmount) <= 0) return setLifiError('Enter an amount')
    if (!allAddresses[0]) return setLifiError('Connect a wallet first')
    setLifiLoading(true); setLifiError(''); setLifiQuote(null)
    try {
      const decimals = getLifiTokenDecimals(lifiFromChainId, lifiFromToken)
      const fromAmountRaw = BigInt(Math.floor(parseFloat(lifiAmount) * 10 ** decimals)).toString()
      const params = new URLSearchParams({
        fromChain: lifiFromChainId.toString(), toChain: lifiToChainId.toString(),
        fromToken: getLifiTokenAddress(lifiFromChainId, lifiFromToken),
        toToken:   getLifiTokenAddress(lifiToChainId, lifiToToken),
        fromAmount: fromAmountRaw, fromAddress: allAddresses[0],
      })
      const res = await fetch(`https://li.quest/v1/quote?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Quote failed')
      setLifiQuote(data)
    } catch (e) {
      setLifiError(e instanceof Error ? e.message : 'Quote failed. Try a different route.')
    } finally { setLifiLoading(false) }
  }

  async function executeLiFiSwap() {
    if (!lifiQuote) return
    setLifiExecuting(true)
    const loadId = addToast({ type: 'loading', message: 'Executing cross-chain swap...' })
    try {
      const req = lifiQuote.transactionRequest
      if (activeChainId !== req.chainId) await switchChain({ chainId: req.chainId })
      const hash = await sendTransactionAsync({
        to: req.to as `0x${string}`,
        data: req.data as `0x${string}`,
        value: BigInt(req.value || '0'),
        gas: req.gasLimit ? BigInt(req.gasLimit) : undefined,
      })
      const fromSym = lifiQuote.action.fromToken.symbol
      const toSym   = lifiQuote.action.toToken.symbol
      const toAmt   = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmount), lifiQuote.action.toToken.decimals)).toFixed(4)
      removeToast(loadId)
      addToast({ type: 'success', message: `${lifiAmount} ${fromSym} ??${toAmt} ${toSym}`, txHash: hash,
        explorerBase: CHAIN_META[lifiQuote.action.fromChainId]?.explorer })
      setHistory((prev) => addHistory(prev, { type: 'cross', summary: `${lifiAmount} ${fromSym} ??${toAmt} ${toSym}`,
        txHash: hash, timestamp: Date.now(), status: 'success' }))
      setLifiQuote(null); setLifiAmount(''); loadAssets()
    } catch (e) {
      removeToast(loadId)
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Swap failed' })
      setHistory((prev) => addHistory(prev, { type: 'cross', summary: `${lifiAmount} ${lifiFromToken} ??${lifiToToken}`,
        txHash: '', timestamp: Date.now(), status: 'fail' }))
    } finally { setLifiExecuting(false) }
  }

  // ??? ?붿빟 ?섏튂 ????????????????????????????????????????????????????????????
  const ethValue      = assets.filter((a) => a.symbol === 'ETH').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const usdcTotalVal  = assets.filter((a) => a.symbol.includes('USDC')).reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const otherValue    = parseFloat(totalUsdc) - ethValue - usdcTotalVal

  const chainBreakdown = CHAINS
    .map((c) => ({ id: c.id, val: assets.filter((a) => a.chain === c.id).reduce((s, a) => s + parseFloat(a.usdcValue), 0) }))
    .filter((c) => c.val > 0)

  // ??? 蹂댁븞 & ?대뙌?????????????????????????????????????????????????????????
  function validateSend(to: string, amt: string): string[] {
    const warnings: string[] = []
    if (allAddresses.some((a) => a.toLowerCase() === to.toLowerCase())) warnings.push('Sending to your own wallet address')
    if (parseFloat(amt) <= 0) warnings.push('Amount is zero')
    return warnings
  }

  async function getAdapter() {
    const provider = (window as { ethereum?: Parameters<typeof createViemAdapterFromProvider>[0]['provider'] }).ethereum
    if (!provider) throw new Error('Please connect a wallet first')
    return createViemAdapterFromProvider({ provider })
  }

  async function execTx(type: 'swap' | 'bridge' | 'send', summary: string, fn: () => Promise<string>) {
    setTxLoading(true)
    const label = type === 'swap' ? 'Swapping' : type === 'bridge' ? 'Bridging' : 'Sending'
    const loadId = addToast({ type: 'loading', message: `${label}...` })
    try {
      const hash = await fn()
      removeToast(loadId)
      addToast({ type: 'success', message: summary, txHash: hash, explorerBase: 'https://testnet.arcscan.app' })
      setHistory((prev) => addHistory(prev, { type, summary, txHash: hash, timestamp: Date.now(), status: 'success' }))
      setAmount(''); setRecipient(''); loadAssets()
    } catch (e) {
      removeToast(loadId)
      const msg = e instanceof Error ? e.message : String(e)
      addToast({ type: 'error', message: msg })
      setHistory((prev) => addHistory(prev, { type, summary, txHash: '', timestamp: Date.now(), status: 'fail' }))
    } finally { setTxLoading(false) }
  }

  function openSwapConfirm() {
    if (!amount) return addToast({ type: 'error', message: 'Enter an amount' })
    setConfirmState({
      title: 'Confirm Swap',
      lines: [`${amount} ETH ??USDC`, 'Network: Arc Testnet', 'Fee: calculated by Arc App Kit'],
      warnings: parseFloat(amount) > 1 ? ['Large swap amount ??please double-check'] : [],
      onConfirm: () => execTx('swap', `${amount} ETH ??USDC`, async () => {
        const adapter = await getAdapter()
        const r = await (kit as unknown as { swap: { execute: (p: { fromToken: string; toToken: string; amount: string; adapter: unknown; networkType: string }) => Promise<{ txHash?: string }> } })
          .swap.execute({ fromToken: 'ETH', toToken: 'USDC', amount, adapter, networkType: 'testnet' })
        return r.txHash ?? ''
      }),
    })
  }

  // ??? CCTP Bridge: Sepolia USDC ??Arc Testnet USDC ???????????????????????
  async function executeCCTPBridge() {
    const amt = parseFloat(cctpAmount)
    if (!amt || amt <= 0) return addToast({ type: 'error', message: 'Enter an amount' })
    const recipientAddr = (cctpRecipient || allAddresses[0]) as `0x${string}`
    if (!recipientAddr) return addToast({ type: 'error', message: 'Connect wallet or enter Arc address' })

    const { encodeFunctionData, decodeEventLog, keccak256 } = await import('viem')
    const usdcAmount = BigInt(Math.round(amt * 1e6)) // USDC 6 decimals
    // Arc recipient: EVM address ??bytes32 (right-aligned, left-zero-padded)
    const mintRecipient = `0x${'0'.repeat(24)}${recipientAddr.replace('0x', '')}` as `0x${string}`

    try {
      // ?? Step 1: Sepolia濡?泥댁씤 ?꾪솚 ?????????????????????????????????
      await switchChain({ chainId: sepolia.id })

      // ?? Step 2: USDC approve ??ArcOnboarder ?????????????????????????
      setCctpStep('approving')
      addToast({ type: 'loading', message: '1/4 Approving USDC on Sepolia...' })
      await sendTransactionAsync({
        to: SEPOLIA_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ARC_ONBOARDER, usdcAmount] }),
      })

      // ?? Step 3: ArcOnboarder.bridgeUSDCToArc ?????????????????????????
      setCctpStep('burning')
      addToast({ type: 'loading', message: '2/4 Bridging USDC ??Arc via ArcOnboarder...' })
      const burnHash = await sendTransactionAsync({
        to: ARC_ONBOARDER,
        data: encodeFunctionData({ abi: ARC_ONBOARDER_ABI, functionName: 'bridgeUSDCToArc',
          args: [usdcAmount, mintRecipient] }),
      })
      setCctpBurnHash(burnHash)

      // ?? Step 4: MessageSent ?대깽?몄뿉??message 異붿텧 ?????????????????
      const sepoliaClient = createPublicClient({
        chain: sepolia,
        transport: http('https://rpc.sepolia.org'),
      })
      const receipt = await sepoliaClient.waitForTransactionReceipt({ hash: burnHash })
      const msgLog = receipt.logs.find(
        (l) => l.address.toLowerCase() === '0xe737e5cebeeba77efe34d4aa090756590b1ce275'
      )
      if (!msgLog) throw new Error('MessageSent event not found in receipt')

      const { args } = decodeEventLog({
        abi: MESSAGE_SENT_EVENT,
        data: msgLog.data,
        topics: msgLog.topics,
      })
      const messageBytes = args.message as `0x${string}`
      const messageHash  = keccak256(messageBytes)

      // Save to localStorage so user can close tab and claim later
      const pendingToArc: PendingBridge = { burnHash, messageBytes, messageHash, direction: 'to-arc', amount: cctpAmount, savedAt: Date.now() }
      localStorage.setItem('cctp_pending_bridge', JSON.stringify(pendingToArc))
      setPendingBridge(pendingToArc)

      // ?? Step 5: Circle Attestation API ?대쭅 ?????????????????????????
      setCctpStep('attesting')
      addToast({ type: 'loading', message: '3/4 Waiting Circle attestation...' })
      let attestation = ''
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const res  = await fetch(`/api/attestation?messageHash=${messageHash}`)
        const json = await res.json()
        if (json.status === 'complete') { attestation = json.attestation; break }
      }
      if (!attestation) throw new Error('Attestation timeout ??retry later')

      // ?? Step 6: Arc Testnet?먯꽌 receiveMessage ???????????????????????
      setCctpStep('minting')
      addToast({ type: 'loading', message: '4/4 Minting USDC on Arc Testnet...' })
      await switchChain({ chainId: arcTestnet.id })
      await sendTransactionAsync({
        to: ARC_MSG_TRANSMITTER,
        data: encodeFunctionData({ abi: RECEIVE_MSG_ABI, functionName: 'receiveMessage',
          args: [messageBytes, attestation as `0x${string}`] }),
      })

      setCctpStep('done')
      localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
      addToast({ type: 'success', message: `${cctpAmount} USDC arrived on Arc!`, txHash: burnHash })
      setCctpAmount('')

    } catch (e: unknown) {
      setCctpStep('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Bridge failed' })
    }
  }

  // CCTP Bridge: Arc Testnet USDC -> Sepolia USDC (reverse direction)
  async function executeCCTPBridgeArcToSepolia() {
    const amt = parseFloat(cctpAmount)
    if (!amt || amt <= 0) return addToast({ type: 'error', message: 'Enter an amount' })
    const recipientAddr = (cctpRecipient || allAddresses[0]) as `0x${string}`
    if (!recipientAddr) return addToast({ type: 'error', message: 'Connect wallet or enter Sepolia address' })

    const { encodeFunctionData, decodeEventLog, keccak256 } = await import('viem')
    const usdcAmount = BigInt(Math.round(amt * 1e6))
    // Sepolia recipient: EVM address -> bytes32 (right-aligned, left-zero-padded)
    const mintRecipient = `0x${'0'.repeat(24)}${recipientAddr.replace('0x', '')}` as `0x${string}`

    try {
      // Step 1: Switch to Arc Testnet
      await switchChain({ chainId: arcTestnet.id })

      // Step 2: Approve ARC_TESTNET_USDC to ARC_TOKEN_MESSENGER
      setCctpStep('approving')
      addToast({ type: 'loading', message: '1/4 Approving USDC on Arc Testnet...' })
      await sendTransactionAsync({
        to: ARC_TESTNET_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ARC_TOKEN_MESSENGER, usdcAmount] }),
      })

      // Step 3: depositForBurn -> Sepolia (domain 0)
      setCctpStep('burning')
      addToast({ type: 'loading', message: '2/4 Burning USDC on Arc -> Sepolia...' })
      const burnHash = await sendTransactionAsync({
        to: ARC_TOKEN_MESSENGER,
        data: encodeFunctionData({ abi: DEPOSIT_FOR_BURN_ABI, functionName: 'depositForBurn',
          args: [usdcAmount, 0, mintRecipient, ARC_TESTNET_USDC, `0x${'0'.repeat(64)}` as `0x${string}`, 500n, 1000] }),
      })
      setCctpBurnHash(burnHash)

      // Step 4: Find MessageSent log — filter by topic hash, not address (Arc MessageTransmitter may differ)
      const arcClient = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      const receipt = await arcClient.waitForTransactionReceipt({ hash: burnHash })
      if (receipt.status === 'reverted') throw new Error(`depositForBurn reverted on Arc. Check ARC_TOKEN_MESSENGER address or USDC approval.`)
      // keccak256('MessageSent(bytes)') = 0x8c5261...
      const MSG_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'
      const msgLog = receipt.logs.find(
        (l) => l.topics[0]?.toLowerCase() === MSG_SENT_TOPIC
      )
      if (!msgLog) throw new Error(`MessageSent not found. Contract addrs in receipt: ${[...new Set(receipt.logs.map(l => l.address))].join(' | ')}`)

      const { args } = decodeEventLog({
        abi: MESSAGE_SENT_EVENT,
        data: msgLog.data,
        topics: msgLog.topics,
      })
      const messageBytes = args.message as `0x${string}`
      const messageHash  = keccak256(messageBytes)

      // Save to localStorage so user can close tab and claim later
      const pendingToSep: PendingBridge = { burnHash, messageBytes, messageHash, direction: 'to-sepolia', amount: cctpAmount, savedAt: Date.now() }
      localStorage.setItem('cctp_pending_bridge', JSON.stringify(pendingToSep))
      setPendingBridge(pendingToSep)

      // Step 5: Poll Circle attestation
      setCctpStep('attesting')
      addToast({ type: 'loading', message: '3/4 Waiting Circle attestation...' })
      let attestation = ''
      let apiMessage  = ''
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 10000))
        const res  = await fetch(`/api/attestation?txHash=${burnHash}&sourceDomain=26`)
        const json = await res.json()
        if (json.status === 'complete' && json.message) {
          attestation = json.attestation; apiMessage = json.message; break
        }
      }
      if (!attestation || !apiMessage) {
        addToast({ type: 'success', message: 'Burn complete! Close this tab and use Check & Claim when ready (15-20 min).' })
        setCctpStep('idle')
        return
      }

      // Step 6: Switch to Sepolia and receiveMessage — use API message (CCTP V2), not event-log message
      setCctpStep('minting')
      addToast({ type: 'loading', message: '4/4 Minting USDC on Sepolia...' })
      await switchChain({ chainId: sepolia.id })
      let mintHash: `0x${string}` | undefined
      try {
        mintHash = await sendTransactionAsync({
          to: ARC_MSG_TRANSMITTER,
          data: encodeFunctionData({ abi: RECEIVE_MSG_ABI, functionName: 'receiveMessage',
            args: [apiMessage as `0x${string}`, attestation as `0x${string}`] }),
        })
      } catch (sendError: unknown) {
        if (isNonceAlreadyUsedError(sendError)) {
          setCctpStep('done')
          localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
          addToast({ type: 'success', message: `${cctpAmount} USDC was already bridged to Sepolia. Refresh balances in a minute.` })
          setCctpAmount('')
          return
        }
        throw sendError
      }
      if (!mintHash) throw new Error('receiveMessage transaction was not submitted')
      try {
        const mintRcpt = await publicClients[11155111].waitForTransactionReceipt({ hash: mintHash, timeout: 90_000 })
        if (mintRcpt.status === 'reverted') {
          setCctpStep('done')
          localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
          addToast({ type: 'success', message: `${cctpAmount} USDC appears already claimed or relayed on Sepolia. Refresh balances to confirm.`, txHash: mintHash })
          setCctpAmount('')
          return
        }
      } catch (re: unknown) {
        if (!isReceiptTimeout(re)) throw re
        // receipt polling timed out — tx is submitted, just couldn't confirm in time
      }

      setCctpStep('done')
      localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
      addToast({ type: 'success', message: `${cctpAmount} USDC bridged to Sepolia! Refresh balances in a minute.`, txHash: mintHash })
      setCctpAmount('')

    } catch (e: unknown) {
      setCctpStep('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Bridge failed' })
    }
  }

  // Claim a pending CCTP bridge after attestation is ready
  async function claimPendingBridge() {
    if (!pendingBridge) return
    setClaimLoading(true)
    let loadId = ''
    try {
      loadId = addToast({ type: 'loading', message: 'Checking attestation...' })
      // Arc->Sepolia is CCTP V2 (query by txHash); Sepolia->Arc is V1 (query by messageHash)
      const isV2 = pendingBridge.direction === 'to-sepolia'
      const attUrl = isV2
        ? `/api/attestation?txHash=${pendingBridge.burnHash}&sourceDomain=26`
        : `/api/attestation?messageHash=${pendingBridge.messageHash}`
      const res  = await fetch(attUrl)
      const json = await res.json()
      if (json.status !== 'complete') {
        removeToast(loadId)
        addToast({ type: 'error', message: `Circle status: "${json.status ?? 'unknown'}" — still processing. Try again in a few minutes.` })
        return
      }
      const attestation = json.attestation as `0x${string}`
      // CCTP V2 requires the message from the API; V1 uses the event-log message
      const message = (isV2 ? json.message : pendingBridge.messageBytes) as `0x${string}`
      if (!message) throw new Error('Message bytes missing from attestation response')
      const { encodeFunctionData } = await import('viem')
      await switchChain({ chainId: isV2 ? sepolia.id : arcTestnet.id })
      removeToast(loadId)
      loadId = addToast({ type: 'loading', message: 'Claiming — sign the receiveMessage tx...' })
      let claimHash: `0x${string}` | undefined
      try {
        claimHash = await sendTransactionAsync({
          to: ARC_MSG_TRANSMITTER,
          data: encodeFunctionData({ abi: RECEIVE_MSG_ABI, functionName: 'receiveMessage',
            args: [message, attestation] }),
        })
      } catch (sendError: unknown) {
        if (isNonceAlreadyUsedError(sendError)) {
          removeToast(loadId); loadId = ''
          localStorage.removeItem('cctp_pending_bridge')
          setPendingBridge(null)
          addToast({ type: 'success', message: `This bridge was already claimed or relayed to ${isV2 ? 'Sepolia' : 'Arc'}. Refresh balances to confirm.` })
          return
        }
        throw sendError
      }
      if (!claimHash) throw new Error('receiveMessage transaction was not submitted')
      removeToast(loadId)
      loadId = addToast({ type: 'loading', message: 'Confirming on destination chain...' })
      try {
        const rcpt = await publicClients[isV2 ? 11155111 : 5042002].waitForTransactionReceipt({ hash: claimHash, timeout: 90_000 })
        if (rcpt.status === 'reverted') {
          removeToast(loadId); loadId = ''
          localStorage.removeItem('cctp_pending_bridge')
          setPendingBridge(null)
          addToast({ type: 'success', message: `This bridge appears already claimed or relayed to ${isV2 ? 'Sepolia' : 'Arc'}. Refresh balances to confirm.`, txHash: claimHash })
          return
        }
      } catch (re: unknown) {
        if (!isReceiptTimeout(re)) throw re
        // receipt polling timed out — tx is submitted
      }
      removeToast(loadId); loadId = ''
      localStorage.removeItem('cctp_pending_bridge')
      setPendingBridge(null)
      addToast({ type: 'success', message: `✅ ${pendingBridge.amount} USDC bridged to ${isV2 ? 'Sepolia' : 'Arc'}! Refresh balances in a minute.`, txHash: claimHash })
    } catch (e: unknown) {
      if (loadId) removeToast(loadId)
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Claim failed' })
    } finally {
      setClaimLoading(false)
    }
  }

  // Recover a stuck Arc->Sepolia bridge by its Arc burn tx hash
  async function recoverStuckBridge() {
    const h = recoverHash.trim()
    if (!h.startsWith('0x') || h.length !== 66) {
      return addToast({ type: 'error', message: 'Enter a valid Arc burn tx hash (0x… 66 chars)' })
    }
    setClaimLoading(true)
    let loadId = ''
    try {
      loadId = addToast({ type: 'loading', message: 'Looking up burn tx on Circle...' })
      const res  = await fetch(`/api/attestation?txHash=${h}&sourceDomain=26`)
      const json = await res.json()
      if (json.status !== 'complete' || !json.message || !json.attestation) {
        removeToast(loadId)
        addToast({ type: 'error', message: `Circle status: "${json.status ?? 'unknown'}" — not ready, try again later.` })
        return
      }
      const { encodeFunctionData } = await import('viem')
      await switchChain({ chainId: sepolia.id })
      removeToast(loadId)
      loadId = addToast({ type: 'loading', message: 'Claiming — sign receiveMessage on Sepolia...' })
      let claimHash: `0x${string}` | undefined
      try {
        claimHash = await sendTransactionAsync({
          to: ARC_MSG_TRANSMITTER,
          data: encodeFunctionData({ abi: RECEIVE_MSG_ABI, functionName: 'receiveMessage',
            args: [json.message as `0x${string}`, json.attestation as `0x${string}`] }),
        })
      } catch (sendError: unknown) {
        if (isNonceAlreadyUsedError(sendError)) {
          removeToast(loadId); loadId = ''
          setRecoverHash('')
          addToast({ type: 'success', message: 'This burn was already claimed or relayed to Sepolia. Refresh balances to confirm.' })
          return
        }
        throw sendError
      }
      if (!claimHash) throw new Error('receiveMessage transaction was not submitted')
      removeToast(loadId)
      loadId = addToast({ type: 'loading', message: 'Confirming on Sepolia...' })
      try {
        const rcpt = await publicClients[11155111].waitForTransactionReceipt({ hash: claimHash, timeout: 90_000 })
        if (rcpt.status === 'reverted') {
          removeToast(loadId); loadId = ''
          setRecoverHash('')
          addToast({ type: 'success', message: 'This burn appears already claimed or relayed to Sepolia. Refresh balances to confirm.', txHash: claimHash })
          return
        }
      } catch (re: unknown) {
        if (!isReceiptTimeout(re)) throw re
        // receipt polling timed out — tx is submitted
      }
      removeToast(loadId); loadId = ''
      setRecoverHash('')
      addToast({ type: 'success', message: '✅ USDC recovered on Sepolia! Refresh balances in a minute.', txHash: claimHash })
    } catch (e: unknown) {
      if (loadId) removeToast(loadId)
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Recovery failed' })
    } finally {
      setClaimLoading(false)
    }
  }

  // ERC-8183 AgenticCommerce functions

  async function e8183CreateAndFund() {
    const amt = parseFloat(e8183Amount)
    if (!isAddress(e8183Provider)) return addToast({ type: 'error', message: 'Invalid provider address' })
    if (!amt || amt <= 0)          return addToast({ type: 'error', message: 'Enter USDC amount' })
    if (!e8183Desc.trim())         return addToast({ type: 'error', message: 'Enter job description' })
    const { encodeFunctionData } = await import('viem')
    const clientAddr = allAddresses[0] as `0x${string}`
    if (!clientAddr) return addToast({ type: 'error', message: 'Connect wallet' })

    const usdcAmt  = BigInt(Math.round(amt * 1e6))
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + parseInt(e8183Days) * 86400)

    setE8183Loading(true)
    setE8183Step('creating')
    try {
      await switchChain({ chainId: arcTestnet.id })

      // createJob: provider=e8183Provider, evaluator=clientAddr (so client can approve)
      addToast({ type: 'loading', message: '1/3 Creating ERC-8183 job...' })
      const createHash = await sendTransactionAsync({
        to: ERC8183_CONTRACT,
        data: encodeFunctionData({ abi: ERC8183_ABI, functionName: 'createJob',
          args: [e8183Provider as `0x${string}`, clientAddr, expiredAt, e8183Desc, '0x0000000000000000000000000000000000000000' as `0x${string}`] }),
      })

      // Wait for receipt to get jobId from event (fallback: use nextJobId read)
      const arcClient = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      await arcClient.waitForTransactionReceipt({ hash: createHash })
      const nextId = await arcClient.readContract({
        address: ERC8183_CONTRACT, abi: ERC8183_ABI, functionName: 'nextJobId',
      }) as bigint
      const jobId = nextId - 1n
      setE8183JobId(jobId.toString())

      // setBudget + approve + fund
      setE8183Step('funding')
      addToast({ type: 'loading', message: '2/3 Setting budget...' })
      await sendTransactionAsync({
        to: ERC8183_CONTRACT,
        data: encodeFunctionData({ abi: ERC8183_ABI, functionName: 'setBudget',
          args: [jobId, usdcAmt, '0x' as `0x${string}`] }),
      })

      addToast({ type: 'loading', message: '3/3 Approving & funding job...' })
      await sendTransactionAsync({
        to: ARC_TESTNET_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ERC8183_CONTRACT, usdcAmt] }),
      })
      await sendTransactionAsync({
        to: ERC8183_CONTRACT,
        data: encodeFunctionData({ abi: ERC8183_ABI, functionName: 'fund',
          args: [jobId, '0x' as `0x${string}`] }),
      })

      setE8183Step('done')
      addToast({ type: 'success', message: `Job #${jobId} funded with ${amt} USDC!` })
      await e8183LookupJob(jobId.toString())

    } catch (e: unknown) {
      setE8183Step('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'ERC-8183 create failed' })
    } finally {
      setE8183Loading(false)
    }
  }

  async function e8183Submit() {
    if (!e8183JobId) return addToast({ type: 'error', message: 'Enter job ID' })
    if (!e8183DelivUri.trim()) return addToast({ type: 'error', message: 'Enter deliverable URI' })
    const { encodeFunctionData, keccak256, toBytes } = await import('viem')
    const delivHash = keccak256(toBytes(e8183DelivUri)) as `0x${string}`

    setE8183Loading(true)
    setE8183Step('submitting')
    try {
      await switchChain({ chainId: arcTestnet.id })
      addToast({ type: 'loading', message: 'Submitting deliverable on-chain...' })
      await sendTransactionAsync({
        to: ERC8183_CONTRACT,
        data: encodeFunctionData({ abi: ERC8183_ABI, functionName: 'submit',
          args: [BigInt(e8183JobId), delivHash, '0x' as `0x${string}`] }),
      })
      addToast({ type: 'success', message: 'Deliverable submitted!' })
      await e8183LookupJob(e8183JobId)
    } catch (e: unknown) {
      setE8183Step('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Submit failed' })
    } finally {
      setE8183Loading(false)
    }
  }

  async function e8183Complete(approved: boolean) {
    if (!e8183JobId) return addToast({ type: 'error', message: 'Enter job ID' })
    const { encodeFunctionData, keccak256, toBytes } = await import('viem')
    const reason = keccak256(toBytes(approved ? 'approved' : 'rejected')) as `0x${string}`

    setE8183Loading(true)
    setE8183Step('completing')
    try {
      await switchChain({ chainId: arcTestnet.id })
      addToast({ type: 'loading', message: approved ? 'Approving job...' : 'Rejecting job...' })
      await sendTransactionAsync({
        to: ERC8183_CONTRACT,
        data: encodeFunctionData({ abi: ERC8183_ABI, functionName: 'complete',
          args: [BigInt(e8183JobId), reason, '0x' as `0x${string}`] }),
      })
      addToast({ type: 'success', message: approved ? 'Job approved - provider paid!' : 'Job rejected - funds returned!' })
      await e8183LookupJob(e8183JobId)
    } catch (e: unknown) {
      setE8183Step('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Complete failed' })
    } finally {
      setE8183Loading(false)
    }
  }

  async function e8183LookupJob(idOverride?: string) {
    const id = idOverride ?? e8183JobId
    if (!id) return addToast({ type: 'error', message: 'Enter job ID' })
    setE8183Loading(true)
    try {
      const arcClient = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      const raw = await arcClient.readContract({
        address: ERC8183_CONTRACT, abi: ERC8183_ABI, functionName: 'getJob', args: [BigInt(id)],
      }) as unknown as readonly [bigint, string, string, string, string, bigint, bigint, number, string]
      const job = { id: raw[0], client: raw[1], provider: raw[2], evaluator: raw[3], description: raw[4], budget: raw[5], expiredAt: raw[6], status: raw[7] }
      setE8183Job(job)
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Lookup failed' })
    } finally {
      setE8183Loading(false)
    }
  }

  // ??? ArcEscrow ?⑥닔??????????????????????????????????????????????????????

  async function escrowCreateJob() {
    const { encodeFunctionData } = await import('viem')
    const amt = parseFloat(escrowAmount)
    if (!isAddress(escrowAgent)) return addToast({ type: 'error', message: 'Invalid agent address' })
    if (!amt || amt <= 0)        return addToast({ type: 'error', message: 'Enter USDC amount' })
    if (!escrowDesc.trim())      return addToast({ type: 'error', message: 'Enter job description' })

    const usdcAmt  = BigInt(Math.round(amt * 1e6))
    const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(escrowDays) * 86400)

    setEscrowLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })

      // approve USDC to ArcEscrow
      await sendTransactionAsync({
        to: ARC_TESTNET_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ARC_ESCROW, usdcAmt] }),
      })

      // createJob
      await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'createJob',
          args: [escrowAgent as `0x${string}`, usdcAmt, deadline, escrowDesc] }),
      })

      // read nextJobId to get the new job's ID
      const arcClient = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      const nextId = await arcClient.readContract({ address: ARC_ESCROW, abi: NEXT_JOB_ID_ABI, functionName: 'nextJobId' })
      const newJobId = Number(nextId) - 1
      setRecentJobIds(prev => {
        const updated = [newJobId, ...prev.filter(id => id !== newJobId)]
        localStorage.setItem('arc_escrow_jobs', JSON.stringify(updated))
        return updated
      })
      setEscrowJobId(String(newJobId))
      setEscrowMyTab('jobs')
      addToast({ type: 'success', message: `Job #${newJobId} created! ${amt} USDC locked in escrow.` })
      setEscrowAgent(''); setEscrowAmount(''); setEscrowDesc('')
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Transaction failed' })
    } finally {
      setEscrowLoading(false)
    }
  }

  async function evaluateWithAI() {
    if (!escrowJob) return
    setAiLoading(true)
    setAiVerdict(null)
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobDescription: escrowJob.description, resultUri: escrowJob.resultUri }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAiVerdict(data)
    } catch (e) {
      addToast({ type: 'error', message: 'AI evaluation failed ??check API key config' })
    } finally {
      setAiLoading(false)
    }
  }

  async function escrowLookupJob(overrideId?: number) {
    const id = overrideId ?? parseInt(escrowJobId)
    if (isNaN(id) || id < 0) return addToast({ type: 'error', message: 'Enter valid Job ID' })
    if (overrideId !== undefined) {
      setEscrowJobId(String(overrideId))
      setRecentJobIds(prev => {
        const updated = [overrideId, ...prev.filter(j => j !== overrideId)]
        localStorage.setItem('arc_escrow_jobs', JSON.stringify(updated))
        return updated
      })
    }

    setAiVerdict(null)
    setEscrowLoading(true)
    try {
      const { encodeFunctionData, decodeFunctionResult } = await import('viem')
      const arcClient = createPublicClient({
        chain: arcTestnet,
        transport: http('https://rpc.testnet.arc.network'),
      })
      const data = encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'getJob', args: [BigInt(id)] })
      const raw  = await arcClient.call({ to: ARC_ESCROW, data })
      if (!raw.data) throw new Error('No data returned')
      const [client, agent, amount, deadline, description, resultUri, status] =
        decodeFunctionResult({ abi: ARC_ESCROW_ABI, functionName: 'getJob', data: raw.data }) as
        [string, string, bigint, bigint, string, string, number]
      setEscrowJob({ client, agent, amount, deadline, description, resultUri, status })
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Lookup failed' })
      setEscrowJob(null)
    } finally {
      setEscrowLoading(false)
    }
  }

  async function uploadToBlob(file: File): Promise<string> {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, data: base64 }),
    })
    if (!res.ok) throw new Error('File upload failed')
    const { url } = await res.json()
    return url
  }

  async function uploadTextToBlob(text: string): Promise<string> {
    const base64 = btoa(unescape(encodeURIComponent(text)))
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'result.txt', contentType: 'text/plain', data: base64 }),
    })
    if (!res.ok) throw new Error('Upload failed')
    const { url } = await res.json()
    return url
  }

  async function escrowSubmitWork() {
    const { encodeFunctionData } = await import('viem')
    if (!escrowWorkText.trim() && !escrowWorkFile) return addToast({ type: 'error', message: 'Enter result text or attach a file' })
    setEscrowWorkUploading(true)
    try {
      let resultUrl = ''
      if (escrowWorkFile) {
        resultUrl = await uploadToBlob(escrowWorkFile)
      } else {
        resultUrl = await uploadTextToBlob(escrowWorkText)
      }
      setEscrowWorkUploading(false)
      setEscrowLoading(true)
      await switchChain({ chainId: arcTestnet.id })
      await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'submitWork',
          args: [BigInt(parseInt(escrowJobId)), resultUrl] }),
      })
      addToast({ type: 'success', message: 'Work submitted! Claude will read the actual content.' })
      setEscrowWorkText('')
      setEscrowWorkFile(null)
      await escrowLookupJob()
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Submission failed' })
    } finally {
      setEscrowLoading(false)
      setEscrowWorkUploading(false)
    }
  }

  async function escrowApproveWork() {
    const { encodeFunctionData } = await import('viem')
    setEscrowLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'approveWork',
          args: [BigInt(parseInt(escrowJobId))] }),
      })
      addToast({ type: 'success', message: 'Work approved ??USDC sent to agent!' })
      await escrowLookupJob()
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Transaction failed' })
    } finally {
      setEscrowLoading(false)
    }
  }

  async function escrowClaimRefund() {
    const { encodeFunctionData } = await import('viem')
    setEscrowLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'claimRefund',
          args: [BigInt(parseInt(escrowJobId))] }),
      })
      addToast({ type: 'success', message: 'Refund claimed!' })
      await escrowLookupJob()
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Transaction failed' })
    } finally {
      setEscrowLoading(false)
    }
  }

  function openSendConfirm() {
    if (!recipient || !amount) return addToast({ type: 'error', message: 'Enter address and amount' })
    if (!isAddress(recipient)) return addToast({ type: 'error', message: 'Invalid Ethereum address' })
    if (parseFloat(amount) <= 0) return addToast({ type: 'error', message: 'Amount must be greater than 0' })
    const warnings = validateSend(recipient, amount)
    setConfirmState({
      title: 'Confirm Send',
      lines: [`${amount} USDC`, `To: ${recipient.slice(0, 10)}...${recipient.slice(-6)}`, 'Network: Arc Testnet'],
      warnings,
      onConfirm: () => execTx('send', `${amount} USDC ??${recipient.slice(0, 8)}...`, async () => {
        const adapter = await getAdapter()
        const r = await kit.unifiedBalance.spend({ amount, token: 'USDC', from: [{ adapter }],
          to: { adapter, chain: 'Arc_Testnet', recipientAddress: recipient as `0x${string}` } })
        return (r as { txHash?: string }).txHash ?? ''
      }),
    })
  }

  function copyAddress() {
    const addr = allAddresses[0]; if (!addr) return
    navigator.clipboard.writeText(addr).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000) })
  }

  // ??? ?꾪꽣 & ?뺣젹 ??????????????????????????????????????????????????????????
  const displayed = assets
    .filter((a) => networkMode === 'mainnet' ? MAINNET_IDS.has(a.chain) : TESTNET_IDS.has(a.chain))
    .sort((a, b) => sortBy === 'value' ? parseFloat(b.usdcValue) - parseFloat(a.usdcValue)
      : sortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : a.chain - b.chain)

  // ??? 而ㅻ꽖??紐⑸줉 ??????????????????????????????????????????????????????????
  function ConnectorList() {
    return (
      <div className="connector-list">
        {connectors.map((connector) => {
          const isThis = isConnecting && connectingId === connector.uid
          const hasErr = connectError && connectVariables?.connector === connector
          const errMsg = hasErr ? friendlyConnectError(connectError, connector.name) : null
          const info   = INSTALL_LINKS[connector.name]
          return (
            <div key={connector.uid} className="connector-item">
              <button className={`btn-connector ${errMsg ? 'has-error' : ''}`} disabled={isConnecting}
                onClick={() => { setConnectingId(connector.uid); connect({ connector }); setShowConnectors(false) }}>
                <Wallet size={15} />
                {isThis ? 'Connecting...' : connector.name}
              </button>
              {errMsg && <div className="connector-error"><span>{errMsg}</span>{info && <a href={info.url} target="_blank" rel="noopener noreferrer">{info.label} <ExternalLink size={11} /></a>}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  // ??? LI.FI 寃ъ쟻 移대뱶 ??????????????????????????????????????????????????????
  function LiFiQuoteCard() {
    if (!lifiQuote) return null
    const toAmt    = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmount), lifiQuote.action.toToken.decimals))
    const toAmtMin = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmountMin), lifiQuote.action.toToken.decimals))
    const duration = lifiQuote.estimate.executionDuration
    const fromLabel = CHAIN_META[lifiQuote.action.fromChainId]?.label ?? lifiQuote.action.fromChainId
    const toLabel   = CHAIN_META[lifiQuote.action.toChainId]?.label   ?? lifiQuote.action.toChainId
    return (
      <div className="lifi-quote">
        <div className="lifi-quote-row">
          <span className="lifi-quote-label">You receive</span>
          <span className="lifi-quote-value">{toAmt.toFixed(4)} {lifiQuote.action.toToken.symbol}</span>
        </div>
        <div className="lifi-quote-row">
          <span className="lifi-quote-label">Minimum</span>
          <span className="lifi-quote-value muted">{toAmtMin.toFixed(4)} {lifiQuote.action.toToken.symbol}</span>
        </div>
        <div className="lifi-quote-row">
          <span className="lifi-quote-label">Route</span>
          <span className="lifi-quote-value">{fromLabel} ??{toLabel}</span>
        </div>
        <div className="lifi-quote-row">
          <span className="lifi-quote-label">Est. time</span>
          <span className="lifi-quote-value">{duration < 60 ? `${duration}s` : `${Math.round(duration / 60)}m`}</span>
        </div>
      </div>
    )
  }

  // ??? ?뚮뜑 ?????????????????????????????????????????????????????????????????
  const NAV_ITEMS = [
    { id: 'overview'  as const, label: 'Overview',     icon: <LayoutDashboard size={13} /> },
    { id: 'marketplace' as const, label: 'Requests',    icon: <BookUser size={13} /> },
    { id: 'portfolio' as const, label: 'Portfolio',    icon: <Wallet size={13} /> },
    { id: 'pay'       as const, label: 'Pay',          icon: <CircleDollarSign size={13} /> },
    { id: 'funds'     as const, label: 'Move Funds',   icon: <ArrowRightLeft size={13} /> },
    { id: 'escrow'    as const, label: 'Agent Escrow', icon: <Lock size={13} /> },
    { id: 'activity'  as const, label: 'Activity',     icon: <Network size={13} /> },
    { id: 'docs'      as const, label: 'Docs',         icon: <BookOpen size={13} /> },
  ]

  return (
    <div className="root" data-theme={theme}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {confirmState && <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} />}

      {/* QR Modal */}
      {showQR && isConnected && (
        <div className="modal-overlay" onClick={() => setShowQR(false)}>
          <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Receive</h3>
              <button className="modal-close" onClick={() => setShowQR(false)}><X size={16} /></button>
            </div>
            <p className="qr-desc">Scan to send assets to this wallet</p>
            <div className="qr-wrap">
              <QRCodeSVG value={allAddresses[0]} size={200} bgColor="transparent" fgColor={theme === 'dark' ? '#ededed' : '#111111'} />
            </div>
            <div className="faucet-addr-row" style={{ marginTop: 8 }}>
              <span className="faucet-addr-text">{allAddresses[0]}</span>
              <button className={`btn-copy ${copiedAddr ? 'copied' : ''}`} onClick={copyAddress}>
                {copiedAddr ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Address Book Modal */}
      {showContacts && (
        <div className="modal-overlay" onClick={() => setShowContacts(false)}>
          <div className="modal contacts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Address Book</h3>
              <button className="modal-close" onClick={() => setShowContacts(false)}><X size={16} /></button>
            </div>
            <div className="contacts-add">
              <input className="action-input" placeholder="Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
              <input className="action-input" placeholder="0x address" value={newContactAddr} onChange={(e) => setNewContactAddr(e.target.value)} />
              <button className="btn-primary" style={{ padding: '9px' }} onClick={addContact}
                disabled={!newContactName.trim() || !isAddress(newContactAddr)}>Add</button>
            </div>
            <div className="contacts-list">
              {contacts.length === 0
                ? <div className="empty-cell">No contacts yet</div>
                : contacts.map((c) => (
                  <div key={c.id} className="contact-row">
                    <div className="contact-info">
                      <span className="contact-name">{c.name}</span>
                      <span className="contact-addr">{c.address.slice(0, 10)}...{c.address.slice(-8)}</span>
                    </div>
                    <div className="contact-actions">
                      <button className="btn-icon" title="Use address"
                        onClick={() => { setRecipient(c.address); setMoveFundsTab('send'); setActivePage('funds'); setShowContacts(false) }}>
                        <ArrowUpRight size={13} />
                      </button>
                      <button className="btn-icon danger" title="Delete" onClick={() => removeContact(c.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ??? NAVBAR ??? */}
      <nav className="navbar">
        <div className="nav-left">
          <span className="nav-logo">
            <CircleDollarSign size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />
            USDC Portal
          </span>
          <div className="nav-links">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={`nav-link ${activePage === item.id ? 'active' : ''}`}
                onClick={() => setActivePage(item.id)}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="nav-right">
          <div className="network-toggle">
            <button className={`net-btn ${networkMode === 'mainnet' ? 'active' : ''}`} onClick={() => setNetworkMode('mainnet')}>Mainnet</button>
            <button className={`net-btn ${networkMode === 'testnet' ? 'active' : ''}`} onClick={() => setNetworkMode('testnet')}>Testnet</button>
          </div>

          {isConnected && (
            <div className="chain-select-wrap">
              <select className="chain-select" value={activeChainId ?? ''}
                onChange={(e) => switchChain({ chainId: Number(e.target.value) })}>
                {CHAINS.filter((c) => networkMode === 'mainnet' ? MAINNET_IDS.has(c.id) : TESTNET_IDS.has(c.id))
                  .map((c) => <option key={c.id} value={c.id}>{CHAIN_META[c.id].label}</option>)}
              </select>
              <ChevronDown size={12} className="chain-select-icon" />
            </div>
          )}

          <div className="nav-wallets">
            {connections.map((conn) =>
              conn.accounts.map((addr) => (
                <div key={addr} className="nav-wallet-chip">
                  <span className="wallet-dot" />
                  <span>{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                  <button className="chip-disconnect" onClick={() => disconnect({ connector: conn.connector })}><X size={12} /></button>
                </div>
              ))
            )}
            <button className="btn-add-wallet" onClick={() => setShowConnectors((v) => !v)}>
              {isConnected ? <><Plus size={13} /> Add wallet</> : <><Wallet size={13} /> Connect</>}
            </button>
            {showConnectors && <div className="wallet-dropdown"><ConnectorList /></div>}
          </div>

          {isConnected && (
            <button className="btn-theme" onClick={() => setShowQR(true)} title="Receive / QR">
              <QrCode size={15} />
            </button>
          )}
          <button className="btn-theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </nav>


      <main className="page-container">

        {/* ─── OVERVIEW ─── */}
        {/* ─── OVERVIEW ─── */}
        {activePage === 'overview' && (
          <div className="page overview-page">

            {/* Hero */}
            <section className="ov-hero">
              <div className="ov-ambient ov-ambient-one" />
              <div className="ov-ambient ov-ambient-two" />
              <div className="ov-hero-text">
                <div className="ov-eyebrow">Circle + Arc payment infrastructure</div>
                <h1 className="ov-h1">USDC Portal for agentic settlement</h1>
                <p className="ov-lead">
                  A finance-grade workspace for moving testnet USDC, funding Arc contracts,
                  verifying agent work, and releasing payouts through a clean operational flow.
                </p>
                <div className="ov-metrics">
                  <div className="ov-metric">
                    <span className="ov-metric-value">9 chains</span>
                    <span className="ov-metric-label">Wallet, balance, and route coverage</span>
                  </div>
                  <div className="ov-metric">
                    <span className="ov-metric-value">USDC</span>
                    <span className="ov-metric-label">Stablecoin payments and settlement</span>
                  </div>
                  <div className="ov-metric">
                    <span className="ov-metric-value">Arc</span>
                    <span className="ov-metric-label">Contract payments and agent escrow</span>
                  </div>
                </div>
                <div className="ov-status-row">
                  <span className="status-dot green" /><span>ArcEscrow live</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>CCTP V2 active</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>Claude Haiku ready</span>
                  {isConnected && (
                    <><span className="ov-sep" /><span className="status-dot green" />
                    <span className="ov-mono">{allAddresses[0]?.slice(0, 6)}...{allAddresses[0]?.slice(-4)} connected</span></>
                  )}
                </div>
                <div className="ov-ctas">
                  <button className="btn-primary ov-cta" onClick={() => setActivePage('marketplace')}>
                    <BookUser size={14} /> Browse Requests
                  </button>
                  <button className="btn-outline ov-cta" onClick={() => setActivePage('funds')}>
                    <ArrowRightLeft size={14} /> Move Funds to Arc
                  </button>
                  {!isConnected && (
                    <button className="btn-ghost ov-cta" onClick={() => setShowConnectors(true)}>
                      <Wallet size={14} /> Connect Wallet
                    </button>
                  )}
                </div>
              </div>
              <div className="ov-hero-visual">
                <div className="ov-showcase-wall" aria-hidden="true">
                  <div className="showcase-column slow">
                    {[
                      ['Discover', 'Wallet state', 'Balances and networks'],
                      ['Prepare', 'USDC source', 'Faucet, bridge, swap'],
                      ['Monitor', 'Live signals', 'Gas, price, history'],
                    ].map((item, i) => (
                      <div className="showcase-card" key={`a-${i}`}>
                        <span>{item[0]}</span>
                        <strong>{item[1]}</strong>
                        <small>{item[2]}</small>
                      </div>
                    ))}
                  </div>
                  <div className="showcase-column reverse">
                    {[
                      ['Move', 'Circle rails', 'CCTP and App Kit'],
                      ['Fund', 'Arc contract', 'Pay Hub and escrow'],
                      ['Review', 'AI verdict', 'Claude evaluation'],
                    ].map((item, i) => (
                      <div className="showcase-card accent" key={`b-${i}`}>
                        <span>{item[0]}</span>
                        <strong>{item[1]}</strong>
                        <small>{item[2]}</small>
                      </div>
                    ))}
                  </div>
                  <div className="showcase-column slow">
                    {[
                      ['Settle', 'USDC payout', 'Contract release'],
                      ['Verify', 'Explorer proof', 'ArcScan links'],
                      ['Operate', 'Workspace', 'Dashboard modules'],
                    ].map((item, i) => (
                      <div className="showcase-card" key={`c-${i}`}>
                        <span>{item[0]}</span>
                        <strong>{item[1]}</strong>
                        <small>{item[2]}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ov-status-panel framer-style-panel">
                  <div className="ov-status-panel-head">
                    <div>
                      <span className="ov-panel-kicker">Active session</span>
                      <strong>Stablecoin command center</strong>
                    </div>
                    <span className={`mode-pill ${networkMode}`}>{networkMode === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
                  </div>
                  <div className="ov-session-list">
                    <div className="ov-session-row">
                      <span>Connected wallet</span>
                      <strong>{activeWalletShort}</strong>
                    </div>
                    <div className="ov-session-row">
                      <span>Active network</span>
                      <strong>{activeChainMeta?.label ?? 'Select network'}</strong>
                    </div>
                    <div className="ov-session-row">
                      <span>{networkMode === 'testnet' ? 'Testnet value' : 'Portfolio value'}</span>
                      <strong>${parseFloat(totalUsdc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                  {networkMode === 'testnet' && (
                    <div className="testnet-notice">
                      <AlertTriangle size={14} />
                      <span>Testnet balances are for development and are not real USD value.</span>
                    </div>
                  )}
                  <div className="ov-action-grid">
                    <button className="ov-action-tile primary" onClick={() => setActivePage('marketplace')}>
                      <BookUser size={16} />
                      <span>Requests</span>
                    </button>
                    <button className="ov-action-tile" onClick={() => setActivePage('portfolio')}>
                      <Wallet size={16} />
                      <span>Portfolio</span>
                    </button>
                    <button className="ov-action-tile" onClick={() => setActivePage('funds')}>
                      <ArrowRightLeft size={16} />
                      <span>Move</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="ov-grant-strip reveal-section">
              {([
                { label: 'Use case', title: 'Stablecoin operations', copy: 'One clean surface for balances, routes, contract payment, faucet links, and activity.' },
                { label: 'Settlement', title: 'Arc-native contract flow', copy: 'Move USDC into Arc, pay a contract, hold escrow, and release funds with clear transaction states.' },
                { label: 'Verification', title: 'AI-assisted review', copy: 'Claude evaluation turns submitted work into a structured verdict before payout.' },
              ] as const).map((item, i) => (
                <div className="ov-grant-card" key={item.title} style={{ '--step-i': i } as React.CSSProperties}>
                  <span>{item.label}</span>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </div>
              ))}
            </section>

            {/* Product Explanation */}
            <section className="ov-explain reveal-section">
              <div className="ov-section-heading">
                <div className="ov-label">What It Does</div>
                <h2>One portal for stablecoin operations</h2>
                <p>
                  USDC Portal groups the daily stablecoin workflow into a single financial surface:
                  see balances, move funds, pay contracts, and verify agent work without jumping
                  between explorers, bridges, faucets, and wallet tabs.
                </p>
              </div>
              <div className="ov-explain-grid">
                {([
                  { icon: <Wallet size={18} />, title: 'Monitor', desc: 'Track wallet balances, USD estimates, chain exposure, gas, and recent activity across supported networks.' },
                  { icon: <ArrowRightLeft size={18} />, title: 'Move', desc: 'Bridge, swap, and send USDC through Circle App Kit, CCTP, and LI.FI-powered routes.' },
                  { icon: <CircleDollarSign size={18} />, title: 'Pay', desc: 'Send USDC into an Arc Testnet payment contract with memo, status, contract balance, and explorer access.' },
                  { icon: <Bot size={18} />, title: 'Verify', desc: 'Lock funds in escrow, submit deliverables, run Claude evaluation, and release agent payouts.' },
                ] as const).map((item, i) => (
                  <div className="ov-explain-card" key={item.title} style={{ '--step-i': i } as React.CSSProperties}>
                    <div className="ov-explain-icon">{item.icon}</div>
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Money Flow Diagram */}
            <section className="ov-flow-section reveal-section">
              <div className="ov-flow-copy">
                <div className="ov-label">How Funds Move</div>
                <h2>From wallet to verified settlement</h2>
                <p>
                  The app separates money movement from work verification. USDC can be moved into Arc,
                  held by a contract, checked by AI-assisted review, and released only when the workflow
                  reaches the right state.
                </p>
              </div>
              <div className="ov-flow-diagram">
                {([
                  { title: 'Wallet', sub: activeWalletShort, tone: 'blue' },
                  { title: 'USDC Route', sub: 'Send / Bridge / Swap', tone: 'cyan' },
                  { title: 'Arc Contract', sub: 'Pay Hub / Escrow', tone: 'blue' },
                  { title: 'Verification', sub: 'Claude verdict', tone: 'gold' },
                  { title: 'Payout', sub: 'Agent receives USDC', tone: 'green' },
                ] as const).map((node, i) => (
                  <div className="ov-flow-node-wrap" key={node.title} style={{ '--step-i': i } as React.CSSProperties}>
                    <div className={`ov-flow-box ${node.tone}`}>
                      <strong>{node.title}</strong>
                      <span>{node.sub}</span>
                    </div>
                    {i < 4 && <div className="ov-flow-arrow"><ArrowRight size={16} /></div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Service Modules */}
            <section className="ov-services reveal-section">
              <div className="ov-section-heading compact">
                <div className="ov-label">Service Modules</div>
                <h2>Built like a financial workspace, not a demo page</h2>
              </div>
              <div className="ov-service-grid">
                {([
                  { name: 'Portfolio Dashboard', detail: 'Balances, USD value, 24h movement, CSV export, and live prices.' },
                  { name: 'Action Center', detail: 'Pay, send, bridge, swap, and cross-chain flows grouped by intent.' },
                  { name: 'Network Safety', detail: 'Mainnet/testnet mode, Arc Testnet badges, and clear value disclaimers.' },
                  { name: 'Transaction Feedback', detail: 'Loading, submitted, confirmed, already-claimed, and explorer states.' },
                  { name: 'Developer Rails', detail: 'Vercel APIs, Circle attestation recovery, viem clients, and contract reads.' },
                  { name: 'Agent Marketplace', detail: 'Post requests, match with agents, convert agreements into escrow jobs.' },
                ] as const).map((service, i) => (
                  <div className="ov-service-card" key={service.name} style={{ '--step-i': i } as React.CSSProperties}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <h3>{service.name}</h3>
                    <p>{service.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Settlement Workflow */}
            <section className="ov-workflow reveal-section">
              <div className="ov-label">Settlement Workflow</div>
              <div className="ov-pipeline">
                {([
                  { n: '01', title: 'Lock USDC',      sub: 'ArcEscrow.createJob()',   desc: 'Client deposits USDC into the ArcEscrow contract with agent address, deadline, and deliverable spec.' },
                  { n: '02', title: 'Submit Work',     sub: 'ArcEscrow.submitWork()',  desc: 'Agent completes the task and submits a result URI on-chain through Vercel Blob, IPFS, or Arweave.' },
                  { n: '03', title: 'Claude Review',   sub: 'POST /api/evaluate',      desc: 'Claude Haiku reads the deliverable and returns a structured verdict: approved or rejected with reasoning.' },
                  { n: '04', title: 'Release Payout',  sub: 'ArcEscrow.approveWork()', desc: 'Client confirms verdict. USDC transfers trustlessly from escrow to agent wallet on Arc Testnet.' },
                ] as const).map((s, i) => (
                  <div key={i} className="ov-pipeline-step" style={{ '--step-i': i } as React.CSSProperties}>
                    <div className="ov-step-n">{s.n}</div>
                    <div className="ov-step-title">{s.title}</div>
                    <div className="ov-step-sub">{s.sub}</div>
                    <div className="ov-step-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Who Uses It */}
            <section className="ov-audiences reveal-section">
              <div className="ov-label">Who Uses It</div>
              <div className="ov-audience-grid">
                {([
                  {
                    role: 'Clients', tag: 'Fund + Verify',
                    desc: 'Lock funds, define deliverables, and release payment only after Claude-verified work is confirmed on-chain.',
                    items: ['Define escrow terms', 'Review Claude verdict', 'One-click payout release'],
                  },
                  {
                    role: 'Agents', tag: 'Work + Earn',
                    desc: 'Submit proof of work and receive Arc USDC after approval — no trust required from either party.',
                    items: ['Submit result URI on-chain', 'Get AI-verified payment', 'Zero counterparty risk'],
                  },
                  {
                    role: 'Protocols', tag: 'Build + Scale',
                    desc: 'Build task markets, agent marketplaces, and service automation on top of escrow rails.',
                    items: ['Composable escrow API', 'Cross-chain USDC inflow', 'Programmable verification'],
                  },
                ] as const).map((a, i) => (
                  <div key={i} className="ov-audience-card" style={{ '--step-i': i } as React.CSSProperties}>
                    <div className="ov-audience-header">
                      <div className="ov-audience-role">{a.role}</div>
                      <div className="ov-audience-tag">{a.tag}</div>
                    </div>
                    <p className="ov-audience-desc">{a.desc}</p>
                    <ul className="ov-audience-items">
                      {a.items.map((item, j) => <li key={j}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Architecture */}
            <section className="ov-arch reveal-section">
              <div className="ov-label">Architecture</div>
              <div className="ov-arch-rail">
                {([
                  { name: 'Wallet',       tech: 'wagmi / viem',     color: '#627eea' },
                  { name: 'ArcEscrow',    tech: 'Solidity 0.8.20',  color: '#2775ca' },
                  { name: 'Storage',      tech: 'Vercel Blob',       color: '#888'    },
                  { name: 'Review API',   tech: 'Claude Haiku',      color: '#d4a574' },
                  { name: 'Arc USDC',     tech: 'Arc Testnet',       color: '#00c2ff' },
                ] as const).map((node, i) => (
                  <div key={i} className="ov-arch-item">
                    <div className="ov-arch-node">
                      <div className="ov-arch-name">{node.name}</div>
                      <div className="ov-arch-tech" style={{ color: node.color }}>{node.tech}</div>
                    </div>
                    {i < 4 && <div className="ov-arch-conn">→</div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Final CTA */}
            <section className="ov-final-cta reveal-section">
              <div className="ov-final-inner">
                <h2 className="ov-final-title">Test agentic settlement on Arc</h2>
                <p className="ov-final-sub">
                  Create an escrow job, submit work, and run Claude-based verification on Arc Testnet.
                </p>
                <div className="ov-final-btns">
                  <button className="btn-primary ov-cta" onClick={() => setActivePage('marketplace')}>
                    <BookUser size={14} /> Open Requests
                  </button>
                  <button className="btn-outline ov-cta" onClick={() => setActivePage('funds')}>
                    <ArrowRightLeft size={14} /> Move Funds to Arc
                  </button>
                  <button className="btn-ghost ov-cta" onClick={() => setActivePage('docs')}>
                    <BookOpen size={14} /> View Docs
                  </button>
                </div>
              </div>
            </section>

          </div>
        )}

        {/* ─── AGENT ESCROW ─── */}
        {activePage === 'marketplace' && (
          <div className="page marketplace-page">
            <div className="page-header marketplace-header">
              <BookUser size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Requests Marketplace</h2>
                <p className="page-sub">A shared request board where anyone can post work, accept jobs, and settle through USDC escrow.</p>
              </div>
              <div className="marketplace-tabs">
                <button className={marketTab === 'browse' ? 'active' : ''} onClick={() => setMarketTab('browse')}>Browse</button>
                <button className={marketTab === 'create' ? 'active' : ''} onClick={() => setMarketTab('create')}>Create Request</button>
                <button onClick={loadMarketRequestsFromApi} disabled={marketLoading}>{marketLoading ? 'Syncing' : 'Refresh'}</button>
              </div>
            </div>

            <div className="marketplace-hero">
              <div>
                <span className="market-kicker">USDC-powered service board</span>
                <h3>From request to escrow in one flow</h3>
                <p>Clients post requests with a budget and deadline. Builders browse the public board and accept work. The app turns the match into an Arc escrow job with USDC locked until delivery is approved.</p>
              </div>
              <div className="market-flow-mini">
                {['Post', 'Match', 'Escrow', 'Deliver', 'Release'].map((step, i) => (
                  <div className="market-flow-step" key={step}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <strong>{step}</strong>
                  </div>
                ))}
              </div>
            </div>

            {marketTab === 'create' ? (
              <section className="market-create-card">
                <div className="market-form-grid">
                  <label className="pay-field">
                    <span>Request title</span>
                    <input className="pay-text-input" value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} placeholder="Design a settlement workflow diagram" />
                  </label>
                  <label className="pay-field">
                    <span>Category</span>
                    <select className="action-input" value={requestCategory} onChange={(e) => setRequestCategory(e.target.value)}>
                      <option>AI Work</option><option>Design Review</option><option>Frontend Build</option><option>Research</option><option>Smart Contract</option>
                    </select>
                  </label>
                  <label className="pay-field">
                    <span>Budget</span>
                    <div className="pay-amount-input">
                      <input value={requestBudget} onChange={(e) => setRequestBudget(e.target.value)} inputMode="decimal" placeholder="0.00" />
                      <strong>USDC</strong>
                    </div>
                  </label>
                  <label className="pay-field">
                    <span>Deadline</span>
                    <div className="pay-amount-input">
                      <input value={requestDays} onChange={(e) => setRequestDays(e.target.value)} inputMode="numeric" placeholder="3" />
                      <strong>days</strong>
                    </div>
                  </label>
                </div>
                <label className="pay-field">
                  <span>Description</span>
                  <textarea className="market-textarea" value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="Explain the task, context, quality bar, and any references." />
                </label>
                <label className="pay-field">
                  <span>Expected deliverable</span>
                  <textarea className="market-textarea small" value={requestDeliverable} onChange={(e) => setRequestDeliverable(e.target.value)} placeholder="Define exactly what the agent should submit before payment is released." />
                </label>
                <button className="btn-primary market-submit" onClick={createMarketRequest} disabled={!isConnected || marketLoading}>
                  <Plus size={14} /> {marketLoading ? 'Posting...' : 'Post to Shared Board'}
                </button>
                {!isConnected && <div className="pay-inline-warning"><Wallet size={14} /> Connect a wallet to post as the request owner.</div>}
              </section>
            ) : (
              <section className="market-request-grid">
                {marketLoading && <div className="market-loading">Syncing shared request board...</div>}
                {marketRequests.map((request) => {
                  const isOwner = activeWallet?.toLowerCase() === request.client.toLowerCase()
                  const isAgent = activeWallet && request.agent?.toLowerCase() === activeWallet.toLowerCase()
                  return (
                    <article className="market-request-card" key={request.id}>
                      <div className="market-card-top">
                        <span className={`market-status ${request.status}`}>{request.status.replace('-', ' ')}</span>
                        <span className="market-budget">{request.budget} USDC</span>
                      </div>
                      <div className="market-category">{request.category}</div>
                      <h3>{request.title}</h3>
                      <p>{request.description}</p>
                      <div className="market-deliverable">
                        <span>Deliverable</span>
                        <strong>{request.deliverable}</strong>
                      </div>
                      <div className="market-meta-row">
                        <span>Client {request.client.startsWith('0x') ? `${request.client.slice(0, 6)}...${request.client.slice(-4)}` : request.client}</span>
                        <span>{request.deadlineDays} days</span>
                      </div>
                      {request.agent && (
                        <div className="market-meta-row agent">
                          <span>Matched agent</span>
                          <strong>{request.agent.slice(0, 6)}...{request.agent.slice(-4)}</strong>
                        </div>
                      )}
                      <div className="market-card-actions">
                        <button className="btn-outline" onClick={() => acceptMarketRequest(request.id)} disabled={!isConnected || marketLoading || request.status !== 'open' || isOwner}>
                          {request.status === 'open' ? 'Accept Request' : 'Matched'}
                        </button>
                        <button className="btn-primary" onClick={() => useRequestForEscrow(request)} disabled={!isConnected || (!request.agent && !isAgent && !isOwner)}>
                          Start Escrow
                        </button>
                      </div>
                    </article>
                  )
                })}
              </section>
            )}
          </div>
        )}

        {activePage === 'pay' && (
          <div className="page pay-page">
            <div className="page-header pay-header">
              <CircleDollarSign size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Pay with USDC</h2>
                <p className="page-sub">Arc Testnet payment hub for contract-based USDC payments</p>
              </div>
              <span className="testnet-page-badge"><AlertTriangle size={12} /> Arc Testnet</span>
            </div>

            <div className="pay-layout">
              <section className="pay-product-card">
                <div className="pay-product-top">
                  <div>
                    <span className="pay-kicker">Recipient Contract</span>
                    <h3>USDCPaymentHub</h3>
                  </div>
                  <span className="mode-pill testnet">Testnet</span>
                </div>

                <div className="pay-contract-box">
                  <div>
                    <span className="pay-muted-label">Contract address</span>
                    <strong>{PAYMENT_HUB_ADDRESS.slice(0, 10)}...{PAYMENT_HUB_ADDRESS.slice(-8)}</strong>
                  </div>
                  <div className="pay-contract-actions">
                    <button className="btn-icon" title="Copy contract" onClick={() => navigator.clipboard?.writeText(PAYMENT_HUB_ADDRESS)}>
                      <Copy size={13} />
                    </button>
                    <a className="btn-icon" title="Open ArcScan" href={`https://testnet.arcscan.app/address/${PAYMENT_HUB_ADDRESS}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                <div className="pay-balance-strip">
                  <div>
                    <span className="pay-muted-label">Contract balance</span>
                    <strong>{contractBalance ? Number(contractBalance).toFixed(4) : '0.0000'} USDC</strong>
                  </div>
                  <button className="btn-ghost sidebar-refresh" onClick={loadContractInfo}>
                    <RefreshCw size={11} /> Refresh
                  </button>
                </div>

                <div className="pay-form-grid">
                  <label className="pay-field">
                    <span>Amount</span>
                    <div className="pay-amount-input">
                      <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
                      <strong>USDC</strong>
                    </div>
                  </label>
                  <label className="pay-field">
                    <span>Memo</span>
                    <input className="pay-text-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Invoice, order ID, or note" />
                  </label>
                </div>

                <button className="btn-primary pay-submit" onClick={payToContract} disabled={txLoading || !isConnected}>
                  {txLoading ? 'Processing payment...' : 'Pay with USDC'}
                </button>

                {!isConnected && (
                  <div className="pay-inline-warning">
                    <Wallet size={14} />
                    <span>Connect a wallet before creating a payment.</span>
                  </div>
                )}
              </section>

              <aside className="pay-side-panel">
                <div className="pay-side-card">
                  <span className="pay-muted-label">Active wallet</span>
                  <strong>{activeWalletShort}</strong>
                  <small>{activeChainMeta?.label ?? 'No active network'}</small>
                </div>
                <div className="pay-side-card">
                  <span className="pay-muted-label">Network safety</span>
                  <strong>Arc Testnet only</strong>
                  <small>Payments use testnet USDC and are not real-dollar transfers.</small>
                </div>
                <div className="pay-side-card">
                  <span className="pay-muted-label">Owner</span>
                  <strong>{contractOwner ? `${contractOwner.slice(0, 8)}...${contractOwner.slice(-6)}` : 'Loading'}</strong>
                  <small>Withdrawals are restricted to the contract owner.</small>
                </div>
              </aside>
            </div>
          </div>
        )}

        {activePage === 'escrow' && (
          <div className="page escrow-page">
            <div className="page-header">
              <Bot size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Agent Escrow</h2>
                <p className="page-sub">Trustless USDC payment channel for AI agents — deployed on Arc Testnet</p>
              </div>
            </div>
            <div className="section-layout">
              <div className="section-main">
                <div className="panel">
                  {/* Protocol selector */}
                  <div className="escrow-protocol-tabs">
                    <button
                      className={`escrow-proto-btn ${escrowProtocol === 'arc-escrow' ? 'active' : ''}`}
                      onClick={() => setEscrowProtocol('arc-escrow')}>
                      ArcEscrow
                    </button>
                    <button
                      className={`escrow-proto-btn ${escrowProtocol === 'erc8183' ? 'active' : ''}`}
                      onClick={() => setEscrowProtocol('erc8183')}>
                      ERC-8183 <span className="proto-badge">official</span>
                    </button>
                  </div>

                  {escrowProtocol === 'erc8183' && (
                    <div className="e8183-panel">
                      <div className="e8183-tabs">
                        <button className={e8183Tab === 'create' ? 'active' : ''} onClick={() => setE8183Tab('create')}>+ Create Job</button>
                        <button className={e8183Tab === 'lookup' ? 'active' : ''} onClick={() => setE8183Tab('lookup')}>Lookup / Manage</button>
                      </div>

                      {e8183Tab === 'create' ? (
                        <div className="e8183-form">
                          <div className="escrow-form-group">
                            <label>Provider Address (agent wallet)</label>
                            <input className="action-input" placeholder="0x..." value={e8183Provider}
                              onChange={(e) => setE8183Provider(e.target.value)} />
                          </div>
                          <div className="escrow-form-row">
                            <div className="escrow-form-group">
                              <label>Budget</label>
                              <div className="escrow-input-suffix">
                                <input className="action-input" inputMode="decimal" placeholder="0.00" value={e8183Amount}
                                  onChange={(e) => setE8183Amount(e.target.value)} />
                                <span>USDC</span>
                              </div>
                            </div>
                            <div className="escrow-form-group">
                              <label>Deadline</label>
                              <div className="escrow-input-suffix">
                                <input className="action-input" inputMode="numeric" placeholder="3" value={e8183Days}
                                  onChange={(e) => setE8183Days(e.target.value)} />
                                <span>days</span>
                              </div>
                            </div>
                          </div>
                          <div className="escrow-form-group">
                            <label>Job Description</label>
                            <input className="action-input" placeholder="Describe the task..." value={e8183Desc}
                              onChange={(e) => setE8183Desc(e.target.value)} />
                          </div>
                          <button className="btn-primary escrow-submit-btn" onClick={e8183CreateAndFund} disabled={e8183Loading}>
                            <Lock size={13} /> {e8183Loading ? (e8183Step === 'creating' ? 'Creating...' : 'Funding...') : 'Create & Fund Job'}
                          </button>
                          <div className="escrow-hint">
                            Uses Arc's official ERC-8183 standard. You (client) are set as the evaluator — you approve or reject the deliverable.
                          </div>
                          {e8183JobId && (
                            <div className="e8183-job-id-pill">Job ID: <strong>#{e8183JobId}</strong></div>
                          )}
                        </div>
                      ) : (
                        <div className="e8183-lookup">
                          <div className="escrow-form-group">
                            <label>Job ID</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input className="action-input" placeholder="e.g. 0" value={e8183JobId}
                                onChange={(e) => setE8183JobId(e.target.value)} style={{ flex: 1 }} />
                              <button className="btn-ghost" onClick={() => e8183LookupJob()} disabled={e8183Loading}>
                                {e8183Loading ? '...' : 'Fetch'}
                              </button>
                            </div>
                          </div>
                          {e8183Job && (
                            <div className="e8183-job-card">
                              <div className="e8183-job-row"><span>Status</span><span className={`e8183-status s${e8183Job.status}`}>
                                {['Created','Funded','Submitted','Completed','Rejected','Expired'][e8183Job.status] ?? e8183Job.status}
                              </span></div>
                              <div className="e8183-job-row"><span>Client</span><span className="addr-mono">{e8183Job.client.slice(0,10)}…</span></div>
                              <div className="e8183-job-row"><span>Provider</span><span className="addr-mono">{e8183Job.provider.slice(0,10)}…</span></div>
                              <div className="e8183-job-row"><span>Budget</span><span>{(Number(e8183Job.budget) / 1e6).toFixed(2)} USDC</span></div>
                              <div className="e8183-job-row"><span>Description</span><span style={{ maxWidth: 220, textAlign: 'right', wordBreak: 'break-word' }}>{e8183Job.description}</span></div>
                              {/* Provider: submit deliverable */}
                              {e8183Job.status === 1 && (
                                <div className="e8183-action-block">
                                  <label className="input-label">Deliverable URI (hashed on-chain)</label>
                                  <input className="action-input" placeholder="https://... or ipfs://..." value={e8183DelivUri}
                                    onChange={(e) => setE8183DelivUri(e.target.value)} />
                                  <button className="btn-primary escrow-submit-btn" onClick={e8183Submit} disabled={e8183Loading}>
                                    {e8183Loading && e8183Step === 'submitting' ? 'Submitting...' : 'Submit Deliverable'}
                                  </button>
                                </div>
                              )}
                              {/* Evaluator (client): approve or reject */}
                              {e8183Job.status === 2 && (
                                <div className="e8183-action-block">
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn-primary" style={{ flex: 1 }} onClick={() => e8183Complete(true)} disabled={e8183Loading}>
                                      {e8183Loading && e8183Step === 'completing' ? '...' : '✓ Approve & Pay'}
                                    </button>
                                    <button className="btn-ghost" style={{ flex: 1, color: 'var(--error)' }} onClick={() => e8183Complete(false)} disabled={e8183Loading}>
                                      ✕ Reject
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {escrowProtocol === 'arc-escrow' && <div className="escrow-board">
                    <div className="escrow-board-tabs">
                      <button className={escrowMyTab === 'new' ? 'active' : ''} onClick={() => setEscrowMyTab('new')}>
                        + New Job
                      </button>
                      <button className={escrowMyTab === 'jobs' ? 'active' : ''} onClick={() => setEscrowMyTab('jobs')}>
                        My Jobs {recentJobIds.length > 0 && <span className="escrow-badge-count">{recentJobIds.length}</span>}
                      </button>
                    </div>

                    {escrowMyTab === 'new' ? (
                      <div className="escrow-form">
                        <div className="escrow-form-group">
                          <label>Agent Wallet Address</label>
                          <input className="action-input" placeholder="0x..." value={escrowAgent}
                            onChange={(e) => setEscrowAgent(e.target.value)} />
                        </div>
                        <div className="escrow-form-row">
                          <div className="escrow-form-group">
                            <label>Amount</label>
                            <div className="escrow-input-suffix">
                              <input className="action-input" inputMode="decimal" placeholder="0.00" value={escrowAmount}
                                onChange={(e) => setEscrowAmount(e.target.value)} />
                              <span>USDC</span>
                            </div>
                          </div>
                          <div className="escrow-form-group">
                            <label>Deadline</label>
                            <div className="escrow-input-suffix">
                              <input className="action-input" inputMode="numeric" placeholder="7" value={escrowDays}
                                onChange={(e) => setEscrowDays(e.target.value)} />
                              <span>days</span>
                            </div>
                          </div>
                        </div>
                        <div className="escrow-form-group">
                          <label>Job Description</label>
                          <input className="action-input" placeholder="Describe the task clearly..." value={escrowDesc}
                            onChange={(e) => setEscrowDesc(e.target.value)} />
                        </div>
                        <button className="btn-primary escrow-submit-btn" onClick={escrowCreateJob} disabled={escrowLoading}>
                          <Lock size={13} /> {escrowLoading ? 'Processing...' : 'Lock USDC & Post Job'}
                        </button>
                        <div className="escrow-hint">USDC is held in the ArcEscrow contract until you approve the result.</div>
                      </div>
                    ) : (
                      <div className="escrow-jobs-panel">
                        {recentJobIds.length > 0 && (
                          <div className="escrow-job-list">
                            {recentJobIds.map(id => (
                              <button key={id}
                                className={`escrow-job-row ${escrowJobId === String(id) ? 'selected' : ''}`}
                                onClick={() => escrowLookupJob(id)}>
                                <span className="escrow-job-row-id">#{id}</span>
                                <span className="escrow-job-row-label">Job #{id}</span>
                                <span className="escrow-job-row-arrow">→</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="escrow-search-block">
                          <label className="escrow-search-label">Search by Job ID</label>
                          <input
                            className="escrow-search-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="Enter Job ID (e.g. 0)"
                            value={escrowJobId}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '')
                              setEscrowJobId(val)
                              setEscrowJob(null)
                              setAiVerdict(null)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && escrowLookupJob()}
                          />
                          <button className="btn-primary" onClick={() => escrowLookupJob()} disabled={escrowLoading || escrowJobId === ''}>
                            {escrowLoading ? 'Loading...' : 'Look up Job'}
                          </button>
                        </div>

                        {escrowJob && (() => {
                          const STATUS_LABEL = ['Open', 'Submitted', 'Approved', 'Refunded']
                          const STATUS_COLOR = ['#f5a623', '#2775ca', '#27ae60', '#e74c3c']
                          const STATUS_BG    = ['rgba(245,166,35,0.1)', 'rgba(39,117,202,0.1)', 'rgba(39,174,96,0.1)', 'rgba(231,76,60,0.1)']
                          const statusLabel  = STATUS_LABEL[escrowJob.status] ?? '?'
                          const statusColor  = STATUS_COLOR[escrowJob.status] ?? '#888'
                          const statusBg     = STATUS_BG[escrowJob.status]    ?? 'transparent'
                          const expired      = Date.now() / 1000 > Number(escrowJob.deadline)
                          const myAddr       = (allAddresses[0] ?? '').toLowerCase()
                          const isClient     = escrowJob.client.toLowerCase() === myAddr
                          const isAgent      = escrowJob.agent.toLowerCase()  === myAddr
                          const usdcAmt      = (Number(escrowJob.amount) / 1e6).toFixed(2)
                          const deadlineDate = new Date(Number(escrowJob.deadline) * 1000)
                          return (
                            <div className="escrow-detail-card">
                              <div className="escrow-detail-header">
                                <div>
                                  <div className="escrow-detail-id">Job #{escrowJobId}</div>
                                  <div className="escrow-detail-desc">{escrowJob.description}</div>
                                </div>
                                <span className="escrow-status-badge" style={{ color: statusColor, background: statusBg }}>
                                  {statusLabel}
                                </span>
                              </div>

                              <div className="escrow-detail-meta">
                                <div className="escrow-meta-item">
                                  <span className="escrow-meta-label">Amount</span>
                                  <span className="escrow-meta-value" style={{ color: 'var(--arc)', fontFamily: 'var(--font-mono)' }}>
                                    {usdcAmt} USDC
                                  </span>
                                </div>
                                <div className="escrow-meta-item">
                                  <span className="escrow-meta-label">Deadline</span>
                                  <span className="escrow-meta-value" style={{ color: expired ? 'var(--error)' : undefined }}>
                                    {deadlineDate.toLocaleDateString()} {expired && '(Expired)'}
                                  </span>
                                </div>
                                <div className="escrow-meta-item">
                                  <span className="escrow-meta-label">Role</span>
                                  <span className="escrow-meta-value">
                                    {isClient ? 'Client' : isAgent ? 'Agent' : 'Observer'}
                                  </span>
                                </div>
                              </div>

                              <div className="escrow-detail-addrs">
                                <div><span>Client</span><code>{escrowJob.client.slice(0,8)}…{escrowJob.client.slice(-6)}</code></div>
                                <div><span>Agent</span><code>{escrowJob.agent.slice(0,8)}…{escrowJob.agent.slice(-6)}</code></div>
                              </div>

                              {escrowJob.resultUri && (
                                <a className="escrow-result-link" href={escrowJob.resultUri} target="_blank" rel="noreferrer">
                                  View Result ↗
                                </a>
                              )}

                              <div className="escrow-actions">
                                {isAgent && escrowJob.status === 0 && !expired && (
                                  <div className="escrow-action-group">
                                    <div className="escrow-submit-label">Submit Work Result</div>
                                    <textarea
                                      className="escrow-work-textarea"
                                      placeholder="Describe the completed work in detail. Claude will read and evaluate it."
                                      value={escrowWorkText}
                                      onChange={(e) => setEscrowWorkText(e.target.value)}
                                      rows={4}
                                    />
                                    <div className="escrow-file-upload">
                                      <label className="escrow-file-label" htmlFor="escrow-file-input">
                                        {escrowWorkFile ? `${escrowWorkFile.name}` : '+ Attach file (image · PDF · TXT)'}
                                      </label>
                                      <input
                                        id="escrow-file-input"
                                        type="file"
                                        accept="image/*,application/pdf,text/plain"
                                        style={{ display: 'none' }}
                                        onChange={(e) => setEscrowWorkFile(e.target.files?.[0] ?? null)}
                                      />
                                      {escrowWorkFile && (
                                        <button className="escrow-file-remove" onClick={() => setEscrowWorkFile(null)}>✕</button>
                                      )}
                                    </div>
                                    <div className="escrow-submit-hint">
                                      Claude reads the actual content after upload and evaluates it.
                                    </div>
                                    <button className="btn-primary" onClick={escrowSubmitWork}
                                      disabled={escrowLoading || escrowWorkUploading || (!escrowWorkText.trim() && !escrowWorkFile)}>
                                      <Upload size={13} /> {escrowWorkUploading ? 'Uploading...' : escrowLoading ? 'Submitting...' : 'Submit Work Result'}
                                    </button>
                                  </div>
                                )}

                                {isClient && escrowJob.status === 1 && (
                                  <div className="escrow-action-group">
                                    <button className="escrow-ai-btn" onClick={evaluateWithAI} disabled={aiLoading || escrowLoading}>
                                      <Bot size={13} /> {aiLoading ? 'Evaluating...' : 'Run Claude Review'}
                                    </button>

                                    {aiVerdict && (
                                      <div className={`escrow-verdict ${aiVerdict.verdict}`}>
                                        <div className="escrow-verdict-title">
                                          {aiVerdict.verdict === 'approve' ? '✓ Claude recommends Approve' : '✗ Claude recommends Reject'}
                                        </div>
                                        <div className="escrow-verdict-reason">{aiVerdict.reasoning}</div>
                                      </div>
                                    )}

                                    <button className="btn-primary" onClick={escrowApproveWork} disabled={escrowLoading}>
                                      <CircleDollarSign size={13} /> {escrowLoading ? 'Releasing...' : 'Release Payment'}
                                    </button>
                                  </div>
                                )}

                                {isClient && (escrowJob.status === 0 || escrowJob.status === 1) && expired && (
                                  <button className="btn-outline" onClick={escrowClaimRefund} disabled={escrowLoading}>
                                    {escrowLoading ? 'Refunding...' : 'Claim Refund'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                  }
                </div>
              </div>

              {/* ─── SIDEBAR ─── */}
              <div className="section-sidebar">
                <div className="sidebar-card">
                  <div className="sidebar-card-title"><Wallet size={13} /> Wallet Summary</div>
                  {isConnected ? (
                    <>
                      <div className="sidebar-balance">
                        ${parseFloat(totalUsdc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="sidebar-balance-label">Total Balance (USD)</div>
                      {parseFloat(totalUsdc) > 0 && (
                        <div className="sidebar-breakdown">
                          <div className="sidebar-breakdown-item">
                            <span style={{ color: '#627eea' }}>●</span> ETH
                            <span>${ethValue.toFixed(2)}</span>
                          </div>
                          <div className="sidebar-breakdown-item">
                            <span style={{ color: '#2775ca' }}>●</span> USDC
                            <span>${usdcTotalVal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      <button className="btn-ghost sidebar-refresh" onClick={loadAssets} disabled={loadingAssets}>
                        <RefreshCw size={11} /> {loadingAssets ? 'Loading...' : 'Refresh'}
                      </button>
                    </>
                  ) : (
                    <div className="sidebar-no-wallet">
                      <p>Connect a wallet to see balances</p>
                      <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }} onClick={() => setShowConnectors(true)}>
                        Connect
                      </button>
                    </div>
                  )}
                </div>

                <div className="sidebar-card">
                  <div className="sidebar-card-title"><Check size={13} /> Demo Checklist</div>
                  <div className="demo-checklist">
                    {[
                      { label: 'Connect wallet on Arc Testnet', done: isConnected && activeChainId === arcTestnet.id },
                      { label: 'Lock USDC in escrow', done: recentJobIds.length > 0 },
                      { label: 'Submit work as agent', done: escrowJob?.status === 1 || escrowJob?.status === 2 },
                      { label: 'Run Claude Review', done: aiVerdict !== null },
                      { label: 'Release payment', done: escrowJob?.status === 2 },
                    ].map((item, i) => (
                      <div key={i} className={`checklist-item ${item.done ? 'done' : ''}`}>
                        <span className="checklist-icon">{item.done ? '✓' : '○'}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sidebar-card">
                  <div className="sidebar-card-title"><ShieldCheck size={13} /> Deployed Contracts</div>
                  <div className="contract-list">
                    <div className="contract-item">
                      <div className="contract-name">ArcEscrow</div>
                      <div className="contract-chain">Arc Testnet</div>
                      <a className="contract-addr" href={`https://testnet.arcscan.app/address/${ARC_ESCROW}`} target="_blank" rel="noreferrer">
                        {ARC_ESCROW.slice(0,8)}…{ARC_ESCROW.slice(-6)} <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="contract-item">
                      <div className="contract-name">ArcOnboarder</div>
                      <div className="contract-chain">Ethereum Sepolia</div>
                      <a className="contract-addr" href={`https://sepolia.etherscan.io/address/${ARC_ONBOARDER}`} target="_blank" rel="noreferrer">
                        {ARC_ONBOARDER.slice(0,8)}…{ARC_ONBOARDER.slice(-6)} <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="contract-item">
                      <div className="contract-name">USDCPaymentHub</div>
                      <div className="contract-chain">Arc Testnet</div>
                      <a className="contract-addr" href={`https://testnet.arcscan.app/address/${PAYMENT_HUB_ADDRESS}`} target="_blank" rel="noreferrer">
                        {PAYMENT_HUB_ADDRESS.slice(0,8)}…{PAYMENT_HUB_ADDRESS.slice(-6)} <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── MOVE FUNDS ─── */}
        {activePage === 'funds' && (
          <div className="page funds-page">
            <div className="page-header">
              <ArrowRightLeft size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Move Funds to Arc</h2>
                <p className="page-sub">Bridge via CCTP V2 · Cross-chain route via LI.FI · Send USDC directly</p>
              </div>
            </div>

            <div className="move-funds-tabs">
              <button className={`move-tab ${moveFundsTab === 'bridge' ? 'active' : ''}`} onClick={() => setMoveFundsTab('bridge')}>
                <Layers size={13} /> CCTP Bridge
              </button>
              <button className={`move-tab ${moveFundsTab === 'cross' ? 'active' : ''}`} onClick={() => setMoveFundsTab('cross')}>
                <Zap size={13} /> LI.FI Swap
              </button>
              <button className={`move-tab ${moveFundsTab === 'send' ? 'active' : ''}`} onClick={() => setMoveFundsTab('send')}>
                <ArrowUpRight size={13} /> Send USDC
              </button>
            </div>

            <div className="move-funds-content">
              {moveFundsTab === 'bridge' && (
                <div className="action-card move-funds-card">
                  <div className="action-card-label">Sepolia USDC → Arc Testnet USDC · Circle CCTP V2 · 0 slippage</div>
                  <div className="action-card-body">
                    {cctpStep !== 'idle' && (
                      <div className="cctp-steps">
                        {(['approving','burning','attesting','minting'] as const).map((s, i) => {
                          const labels = ['Approve','Burn','Attest','Mint']
                          const idx    = ['approving','burning','attesting','minting'].indexOf(cctpStep)
                          const status = i < idx ? 'done' : i === idx ? 'active' : 'pending'
                          return (
                            <div key={s} className={`cctp-step ${status}`}>
                              <div className="cctp-dot">{status === 'done' ? '✓' : i + 1}</div>
                              <span>{labels[i]}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Pending bridge claim card */}
                    {pendingBridge && cctpStep === 'idle' && (
                      <div className="cctp-pending-card">
                        <div className="cctp-pending-header">
                          <span className="cctp-pending-dot" />
                          Pending Bridge
                        </div>
                        <div className="cctp-pending-info">
                          <span>{pendingBridge.amount} USDC → {pendingBridge.direction === 'to-arc' ? 'Arc Testnet' : 'Sepolia'}</span>
                          <span className="cctp-pending-age">{Math.round((Date.now() - pendingBridge.savedAt) / 60000)} min ago</span>
                        </div>
                        <div className="cctp-pending-actions">
                          <button className="btn-primary" style={{ flex: 1 }} onClick={claimPendingBridge} disabled={claimLoading}>
                            {claimLoading ? 'Checking...' : 'Check & Claim'}
                          </button>
                          <button className="btn-ghost" onClick={() => { localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null) }}>
                            Dismiss
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Circle attestation takes ~15 min on testnet. Click "Check & Claim" when ready.
                        </div>
                      </div>
                    )}
                    {/* Recover a stuck Arc->Sepolia bridge by burn tx hash */}
                    {cctpStep === 'idle' && (
                      <details className="cctp-recover">
                        <summary>Recover a stuck Arc → Sepolia bridge</summary>
                        <div className="cctp-recover-body">
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Paste the Arc burn tx hash. We re-fetch the Circle attestation and complete the mint on Sepolia.
                          </div>
                          <input className="action-input" placeholder="Arc burn tx hash (0x…)"
                            value={recoverHash} onChange={(e) => setRecoverHash(e.target.value)} />
                          <button className="btn-primary" onClick={recoverStuckBridge} disabled={claimLoading}>
                            {claimLoading ? 'Working…' : 'Recover USDC'}
                          </button>
                        </div>
                      </details>
                    )}
                    {/* Direction toggle */}
                    <div className="cctp-direction-toggle">
                      <button
                        className={`cctp-dir-btn ${cctpDirection === 'to-arc' ? 'active' : ''}`}
                        onClick={() => { setCctpDirection('to-arc'); setCctpStep('idle'); setCctpBurnHash('') }}
                        disabled={cctpStep !== 'idle' && cctpStep !== 'error' && cctpStep !== 'done'}>
                        Sepolia → Arc
                      </button>
                      <button
                        className={`cctp-dir-btn ${cctpDirection === 'to-sepolia' ? 'active' : ''}`}
                        onClick={() => { setCctpDirection('to-sepolia'); setCctpStep('idle'); setCctpBurnHash('') }}
                        disabled={cctpStep !== 'idle' && cctpStep !== 'error' && cctpStep !== 'done'}>
                        Arc → Sepolia
                      </button>
                    </div>
                    {cctpStep === 'done' ? (
                      <div className="cctp-done">
                        <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {cctpDirection === 'to-arc' ? 'Bridged to Arc!' : 'Bridged to Sepolia!'}
                        </div>
                        <div style={{ opacity: 0.5, fontSize: 'var(--text-xs)' }}>
                          {cctpAmount} USDC → {cctpDirection === 'to-arc' ? 'Arc Testnet' : 'Sepolia'}
                        </div>
                        <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => { setCctpStep('idle'); setCctpBurnHash('') }}>
                          Bridge again
                        </button>
                      </div>
                    ) : <>
                      <div className="cctp-balance-row">
                        <div className="cctp-bal-item">
                          <span className="cctp-bal-chain">
                            <span className="arc-dot" style={{ background: cctpDirection === 'to-arc' ? '#627eea' : '#00c2ff' }} />
                            {cctpDirection === 'to-arc' ? 'Sepolia' : 'Arc Testnet'}
                          </span>
                          <span className="cctp-bal-val">
                            {cctpDirection === 'to-arc'
                              ? (cctpBalances.sepolia !== '—' ? `${cctpBalances.sepolia} USDC` : '—')
                              : (cctpBalances.arc !== '—' ? `${cctpBalances.arc} USDC` : '—')}
                          </span>
                        </div>
                        <div className="cctp-bal-arrow">→</div>
                        <div className="cctp-bal-item">
                          <span className="cctp-bal-chain">
                            <span className="arc-dot" style={{ background: cctpDirection === 'to-arc' ? '#00c2ff' : '#627eea' }} />
                            {cctpDirection === 'to-arc' ? 'Arc Testnet' : 'Sepolia'}
                          </span>
                          <span className="cctp-bal-val">
                            {cctpDirection === 'to-arc'
                              ? (cctpBalances.arc !== '—' ? `${cctpBalances.arc} USDC` : '—')
                              : (cctpBalances.sepolia !== '—' ? `${cctpBalances.sepolia} USDC` : '—')}
                          </span>
                        </div>
                        {cctpBalances.loading
                          ? <span className="cctp-bal-loading"><RefreshCw size={10} /></span>
                          : <button className="btn-ghost cctp-bal-refresh" onClick={loadCctpBalances} title="Refresh balances"><RefreshCw size={10} /></button>
                        }
                      </div>
                      <label className="input-label">Amount (USDC)</label>
                      <input className="action-input" type="number" placeholder="0.0"
                        value={cctpAmount} onChange={(e) => setCctpAmount(e.target.value)}
                        disabled={cctpStep !== 'idle'} />
                      <label className="input-label">Recipient (optional — default: your wallet)</label>
                      <input className="action-input" placeholder="0x…"
                        value={cctpRecipient} onChange={(e) => setCctpRecipient(e.target.value)}
                        disabled={cctpStep !== 'idle'} />
                      <button className="btn-primary" style={{ marginTop: 4 }}
                        onClick={cctpDirection === 'to-arc' ? executeCCTPBridge : executeCCTPBridgeArcToSepolia}
                        disabled={cctpStep !== 'idle' && cctpStep !== 'error'}>
                        {cctpStep === 'idle'      ? (cctpDirection === 'to-arc' ? 'Bridge to Arc' : 'Bridge to Sepolia') :
                         cctpStep === 'approving' ? 'Approving USDC...'      :
                         cctpStep === 'burning'   ? (cctpDirection === 'to-arc' ? 'Burning on Sepolia...' : 'Burning on Arc...') :
                         cctpStep === 'attesting' ? 'Waiting Circle attestation...' :
                         cctpStep === 'minting'   ? (cctpDirection === 'to-arc' ? 'Minting on Arc...' : 'Minting on Sepolia...') :
                         cctpStep === 'error'     ? 'Retry Bridge'           : '...'}
                      </button>
                      {cctpStep === 'attesting' && (
                        <div className="cctp-attest-note">
                          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                          Circle attestation takes 15–20 min on testnet. Keep this tab open — it polls automatically.
                        </div>
                      )}
                      <div className="coming-soon" style={{ marginTop: 6 }}>
                        <span className="coming-soon-label">CCTP V2</span>
                        Official Circle bridge · 0 slippage · 1:1 mint · bidirectional
                      </div>
                      {cctpBurnHash && (
                        <a className="cctp-tx-link"
                          href={cctpDirection === 'to-arc'
                            ? `https://sepolia.etherscan.io/tx/${cctpBurnHash}`
                            : `https://explorer.testnet.arc.network/tx/${cctpBurnHash}`}
                          target="_blank" rel="noreferrer">
                          Burn tx ↗
                        </a>
                      )}
                    </>}
                  </div>
                </div>
              )}

              {moveFundsTab === 'cross' && (
                <div className="action-card move-funds-card">
                  <div className="action-card-label">LI.FI swap across ETH · Base · Polygon · Arbitrum · Optimism · Avalanche</div>
                  <div className="action-card-body">
                    <div className="lifi-row">
                      <div className="lifi-col">
                        <label className="input-label">From</label>
                        <select className="action-input" value={lifiFromChainId}
                          onChange={(e) => { setLifiFromChainId(Number(e.target.value)); setLifiFromToken('ETH'); setLifiQuote(null) }}>
                          {LIFI_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="lifi-col">
                        <label className="input-label">Token</label>
                        <select className="action-input" value={lifiFromToken}
                          onChange={(e) => { setLifiFromToken(e.target.value); setLifiQuote(null) }}>
                          {getLifiFromTokens(lifiFromChainId).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="lifi-row">
                      <div className="lifi-col">
                        <label className="input-label">To</label>
                        <select className="action-input" value={lifiToChainId}
                          onChange={(e) => { setLifiToChainId(Number(e.target.value)); setLifiToToken('USDC'); setLifiQuote(null) }}>
                          {LIFI_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="lifi-col">
                        <label className="input-label">Receive</label>
                        <select className="action-input" value={lifiToToken}
                          onChange={(e) => { setLifiToToken(e.target.value); setLifiQuote(null) }}>
                          {getLifiFromTokens(lifiToChainId).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <label className="input-label">Amount ({lifiFromToken})</label>
                    <input className="action-input" type="number" placeholder="0.0" value={lifiAmount}
                      onChange={(e) => { setLifiAmount(e.target.value); setLifiQuote(null) }} />
                    {lifiError && <div style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', padding: '2px 0' }}>{lifiError}</div>}
                    {!lifiQuote
                      ? <button className="btn-primary" onClick={fetchLiFiQuote} disabled={lifiLoading || !lifiAmount}>
                          {lifiLoading ? 'Getting quote...' : 'Get Quote'}
                        </button>
                      : <>
                        <LiFiQuoteCard />
                        <button className="btn-primary" onClick={executeLiFiSwap} disabled={lifiExecuting}>
                          {lifiExecuting ? 'Executing...' : 'Swap via LI.FI'}
                        </button>
                        <button className="btn-outline" onClick={() => setLifiQuote(null)}>
                          <RefreshCw size={12} /> New quote
                        </button>
                      </>
                    }
                  </div>
                </div>
              )}

              {moveFundsTab === 'send' && (
                <div className="action-card move-funds-card">
                  <div className="action-card-label">Send USDC via Circle App Kit · Arc Testnet</div>
                  <div className="action-card-body">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="input-label">Recipient</label>
                      <button className="btn-book" onClick={() => setShowContacts(true)}>
                        <BookUser size={12} /> Address book
                      </button>
                    </div>
                    <input className="action-input" type="text" placeholder="0x..." value={recipient}
                      onChange={(e) => setRecipient(e.target.value)} />
                    <label className="input-label">Amount (USDC)</label>
                    <input className="action-input" type="number" placeholder="0.0" value={amount}
                      onChange={(e) => setAmount(e.target.value)} />
                    <button className="btn-primary" onClick={openSendConfirm} disabled={txLoading}>
                      {txLoading ? 'Processing...' : 'Send USDC'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── PORTFOLIO ─── */}
        {activePage === 'portfolio' && (
          <div className="page portfolio-page">
            <div className="page-header">
              <Wallet size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Portfolio</h2>
                <p className="page-sub">Assets across {networkMode === 'mainnet' ? '6 mainnet chains' : '3 testnet chains'}</p>
              </div>
            </div>

            {chainBreakdown.length > 0 && parseFloat(totalUsdc) > 0 && (
              <div className="portfolio-bar-wrap">
                <div className="portfolio-bar">
                  {chainBreakdown.map((c) => (
                    <div key={c.id} className="bar-seg" title={`${CHAIN_META[c.id].label}: $${c.val.toFixed(2)}`}
                      style={{ width: `${(c.val / parseFloat(totalUsdc)) * 100}%`, background: CHAIN_META[c.id].color }} />
                  ))}
                </div>
                <div className="bar-legend">
                  {chainBreakdown.map((c) => (
                    <span key={c.id} className="legend-item">
                      <span className="legend-dot" style={{ background: CHAIN_META[c.id].color }} />
                      {CHAIN_META[c.id].label} {((c.val / parseFloat(totalUsdc)) * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="portfolio-layout">
              <div className="portfolio-main">
                <div className="panel">
                  <div className="panel-header">
                    <div className="main-tabs">
                      <button className={`main-tab ${mainTab === 'assets' ? 'active' : ''}`} onClick={() => setMainTab('assets')}>Assets</button>
                      {networkMode === 'testnet' && (
                        <button className={`main-tab ${mainTab === 'faucet' ? 'active' : ''}`} onClick={() => setMainTab('faucet')}>Faucet</button>
                      )}
                    </div>
                    {mainTab === 'assets' && (
                      <div className="table-controls">
                        <div className="network-label">
                          <span className={`net-indicator ${networkMode}`} />
                          {networkMode === 'mainnet' ? 'Mainnet' : 'Testnet'}
                          {loadingAssets && <span className="loading-dot" />}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                            <option value="value">By value</option>
                            <option value="symbol">By token</option>
                            <option value="chain">By chain</option>
                          </select>
                          <button className="btn-icon" onClick={loadAssets} disabled={loadingAssets}><RefreshCw size={13} /></button>
                          {displayed.length > 0 && (
                            <button className="btn-icon" onClick={exportCSV} title="Export CSV"><Download size={13} /></button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {mainTab === 'assets' ? (
                    !isConnected ? (
                      <div className="connect-prompt">
                        <div className="connect-prompt-icon"><Wallet size={40} strokeWidth={1.2} /></div>
                        <p className="connect-prompt-title">Connect your wallet</p>
                        <p className="connect-prompt-sub">Your assets will appear here once connected</p>
                        <button className="btn-primary" style={{ maxWidth: 200 }} onClick={() => setShowConnectors(true)}>Connect wallet</button>
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table className="asset-table">
                          <thead>
                            <tr>
                              <th>Token</th><th>Wallet</th>
                              <th className="text-right">Balance</th>
                              <th className="text-right">Value</th>
                              <th className="text-right">24h</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loadingAssets && assets.length === 0 ? <SkeletonRows /> : displayed.length === 0 ? (
                              <tr><td colSpan={5} className="empty-cell">No assets found on {networkMode}</td></tr>
                            ) : displayed.map((a, i) => {
                              const explorer = CHAIN_META[a.chain]?.explorer
                              return (
                                <tr key={i} className="asset-tr">
                                  <td>
                                    <div className="token-cell">
                                      <TokenIconWithChain symbol={a.symbol} chainId={a.chain} />
                                      <div>
                                        <span className="token-name">{a.symbol}</span>
                                        <span className="token-subname">
                                          {explorer
                                            ? <a className="chain-link" href={explorer} target="_blank" rel="noopener noreferrer">{CHAIN_META[a.chain]?.label}</a>
                                            : CHAIN_META[a.chain]?.label}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="wallet-cell">{a.wallet}</td>
                                  <td className="text-right mono">{parseFloat(a.balance).toFixed(4)}</td>
                                  <td className="text-right usdc-val">${a.usdcValue}</td>
                                  <td className="text-right"><Change24h value={a.change24h} /></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="faucet-list">
                      <div className="in-app-faucet-card">
                        <div className="in-app-faucet-head">
                          <div>
                            <span className="faucet-card-chain">Circle faucet link</span>
                            <p className="faucet-step-title">Open the official faucet with your active wallet ready</p>
                            <p className="faucet-step-sub">{IN_APP_FAUCETS[inAppFaucetChain].desc}</p>
                          </div>
                          <span className="arc-badge"><span className="arc-dot" /> Official link</span>
                        </div>
                        <div className="in-app-faucet-controls">
                          <select className="action-input" value={inAppFaucetChain}
                            onChange={(e) => { setInAppFaucetChain(e.target.value as InAppFaucetChain); setInAppFaucetMessage('') }}>
                            {Object.entries(IN_APP_FAUCETS).map(([id, f]) => (
                              <option key={id} value={id}>{f.label} · {f.token}</option>
                            ))}
                          </select>
                          <button className="btn-primary" onClick={requestInAppFaucet} disabled={!isConnected || inAppFaucetLoading}>
                            {inAppFaucetLoading ? 'Opening...' : 'Open Circle Faucet'}
                          </button>
                        </div>
                        {inAppFaucetMessage && (
                          <div className={`in-app-faucet-message ${inAppFaucetMessage.toLowerCase().includes('error') || inAppFaucetMessage.toLowerCase().includes('key') ? 'error' : ''}`}>
                            {inAppFaucetMessage}
                          </div>
                        )}
                        {!isConnected && (
                          <div className="in-app-faucet-message">Connect a wallet to copy the active address and watch for incoming faucet funds.</div>
                        )}
                      </div>
                      <div className="faucet-step-card">
                        <div className="faucet-step-num">1</div>
                        <div className="faucet-step-body">
                          <p className="faucet-step-title">Copy your wallet address</p>
                          {isConnected ? (
                            <div className="faucet-addr-row">
                              <span className="faucet-addr-text">{allAddresses[0]}</span>
                              <button className={`btn-copy ${copiedAddr ? 'copied' : ''}`} onClick={copyAddress}>
                                {copiedAddr ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                              </button>
                            </div>
                          ) : (
                            <div className="faucet-no-wallet">
                              <span>Connect a wallet first</span>
                              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px', width: 'auto' }} onClick={() => setShowConnectors(true)}>Connect</button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="faucet-step-card">
                        <div className="faucet-step-num">2</div>
                        <div className="faucet-step-body">
                          <p className="faucet-step-title">Request tokens from a faucet</p>
                          <p className="faucet-step-sub">Click a faucet — it opens in a new tab. Paste your address and submit.</p>
                          <div className="faucet-cards">
                            {FAUCETS.map((f, i) => {
                              const state = faucetPoll[i] ?? 'idle'
                              return (
                                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                                  className={`faucet-card ${state}`}
                                  onClick={() => { if (isConnected && state === 'idle') startFaucetPoll(i) }}>
                                  <div className="faucet-card-top">
                                    <span className="chain-dot" style={{ background: CHAIN_META[f.chainId]?.color }} />
                                    <span className="faucet-card-name">{f.name}</span>
                                    {state === 'idle'     && <ExternalLink size={12} className="faucet-card-arrow" />}
                                    {state === 'polling'  && <span className="faucet-spinner" />}
                                    {state === 'received' && <Check size={13} className="faucet-check" />}
                                  </div>
                                  <span className="faucet-card-chain">{f.chain}</span>
                                  <div className="faucet-card-tokens">
                                    {f.tokens.map((t) => <span key={t} className="faucet-token">{t}</span>)}
                                  </div>
                                  {state === 'polling'  && <span className="faucet-status-text">Waiting for deposit...</span>}
                                  {state === 'received' && <span className="faucet-status-text received">Tokens received!</span>}
                                  {state === 'idle'     && <span className="faucet-card-desc">{f.desc}</span>}
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="faucet-step-card faucet-step-last">
                        <div className="faucet-step-num">3</div>
                        <div className="faucet-step-body">
                          <p className="faucet-step-title">Check your balance</p>
                          <p className="faucet-step-sub">Balance updates automatically when tokens arrive.</p>
                          <button className="btn-outline" style={{ width: 'auto' }} onClick={() => { setMainTab('assets'); loadAssets() }}>
                            <RefreshCw size={13} /> Refresh assets
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="portfolio-sidebar">
                {Object.keys(gasPrices).length > 0 && (
                  <div className="gas-card">
                    <div className="gas-card-label"><Fuel size={11} /> Gas</div>
                    {CHAINS
                      .filter((c) => gasPrices[c.id] && (networkMode === 'mainnet' ? MAINNET_IDS.has(c.id) : TESTNET_IDS.has(c.id)))
                      .slice(0, 4)
                      .map((c) => (
                        <div key={c.id} className="gas-item" title={CHAIN_META[c.id].label}>
                          <span className="gas-dot" style={{ background: CHAIN_META[c.id].color }} />
                          {gasPrices[c.id]}
                        </div>
                      ))}
                    <span className="gas-unit">Gwei</span>
                  </div>
                )}

                {Object.keys(prices).length > 0 && (
                  <div className="action-card prices-card">
                    <div className="action-card-label">Live Prices</div>
                    <div className="action-card-body">
                      {[
                        { id: 'ethereum',      label: 'ETH'  },
                        { id: 'usd-coin',      label: 'USDC' },
                        { id: 'polygon-ecosystem-token', label: 'POL'  },
                        { id: 'avalanche-2',   label: 'AVAX' },
                      ].filter((p) => prices[p.id]).map((p) => (
                        <div key={p.id} className="price-item">
                          <span className="price-symbol">{p.label}</span>
                          <span className="price-value">
                            ${prices[p.id].usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <Change24h value={prices[p.id].change24h} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="security-note">
                  <ShieldCheck size={12} style={{ opacity: 0.4, flexShrink: 0, marginTop: 1 }} />
                  Never stores your private keys. Always verify transactions before signing.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── ACTIVITY ─── */}
        {activePage === 'activity' && (
          <div className="page activity-page">
            <div className="page-header">
              <Network size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Activity</h2>
                <p className="page-sub">Recent transactions across all chains</p>
              </div>
            </div>
            <div className="panel">
              <div className="history-list">
                {history.length === 0 ? (
                  <div className="activity-empty">
                    <Network size={36} strokeWidth={1.2} style={{ opacity: 0.3 }} />
                    <p>No transactions yet</p>
                    <p style={{ opacity: 0.5, fontSize: 'var(--text-xs)' }}>Transactions will appear here after you bridge, swap, or send.</p>
                  </div>
                ) : history.map((h, i) => {
                  const iconMap = { swap: <Repeat2 size={14} />, bridge: <Layers size={14} />, send: <ArrowUpRight size={14} />, cross: <Zap size={14} /> }
                  return (
                    <div key={i} className={`history-row ${h.status}`}>
                      <div className="history-left">
                        <span className={`history-icon ${h.type}`}>{iconMap[h.type]}</span>
                        <div className="history-info">
                          <span className="history-summary">{h.summary}</span>
                          <span className="history-time">{new Date(h.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="history-right">
                        {h.txHash && (
                          <a className="history-link" href={`https://testnet.arcscan.app/tx/${h.txHash}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <span className={`history-dot ${h.status}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── DOCS ─── */}
        {activePage === 'docs' && (
          <div className="page docs-page">
            <div className="page-header">
              <BookOpen size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Docs & Contracts</h2>
                <p className="page-sub">Deployed contracts, architecture overview, and external resources</p>
              </div>
            </div>

            <div className="docs-grid">
              <div className="docs-section">
                <div className="docs-section-title">Arc Testnet Contracts</div>
                <div className="contract-list docs-contracts">
                  <div className="contract-item">
                    <div className="contract-name">ArcEscrow</div>
                    <div className="contract-chain">Arc Testnet · chainId 5042002</div>
                    <a className="contract-addr" href={`https://testnet.arcscan.app/address/${ARC_ESCROW}`} target="_blank" rel="noreferrer">
                      {ARC_ESCROW} <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="contract-item">
                    <div className="contract-name">Arc USDC</div>
                    <div className="contract-chain">Arc Testnet</div>
                    <a className="contract-addr" href="https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000" target="_blank" rel="noreferrer">
                      0x3600000000000000000000000000000000000000 <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="contract-item">
                    <div className="contract-name">USDCPaymentHub</div>
                    <div className="contract-chain">Arc Testnet</div>
                    <a className="contract-addr" href={`https://testnet.arcscan.app/address/${PAYMENT_HUB_ADDRESS}`} target="_blank" rel="noreferrer">
                      {PAYMENT_HUB_ADDRESS} <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>

              <div className="docs-section">
                <div className="docs-section-title">Ethereum Sepolia Contracts</div>
                <div className="contract-list docs-contracts">
                  <div className="contract-item">
                    <div className="contract-name">ArcOnboarder</div>
                    <div className="contract-chain">Ethereum Sepolia · CCTP V2 entry</div>
                    <a className="contract-addr" href={`https://sepolia.etherscan.io/address/${ARC_ONBOARDER}`} target="_blank" rel="noreferrer">
                      {ARC_ONBOARDER} <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="contract-item">
                    <div className="contract-name">Sepolia USDC</div>
                    <div className="contract-chain">Ethereum Sepolia</div>
                    <a className="contract-addr" href="https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" target="_blank" rel="noreferrer">
                      0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>

              <div className="docs-section docs-arch">
                <div className="docs-section-title">Architecture Flow</div>
                <div className="arch-diagram">
                  <div className="arch-row">
                    <div className="arch-node arch-client">Client</div>
                    <div className="arch-conn">→</div>
                    <div className="arch-node arch-contract">ArcEscrow<span>Arc Testnet</span></div>
                    <div className="arch-conn">→</div>
                    <div className="arch-node arch-agent">Agent</div>
                  </div>
                  <div className="arch-row arch-row-mid">
                    <div className="arch-node arch-ai">Claude Haiku<span>AI Judge</span></div>
                    <div className="arch-conn">↑</div>
                    <div className="arch-node arch-blob">Vercel Blob<span>Work result</span></div>
                    <div className="arch-conn">←</div>
                    <div className="arch-node arch-agent">Agent</div>
                  </div>
                  <div className="arch-row">
                    <div className="arch-node arch-cctp">CCTP V2<span>Sepolia → Arc</span></div>
                    <div className="arch-conn">→</div>
                    <div className="arch-node arch-contract">Arc USDC<span>0x3600…</span></div>
                    <div className="arch-conn">→</div>
                    <div className="arch-node arch-contract">ArcEscrow</div>
                  </div>
                </div>
              </div>

              <div className="docs-section">
                <div className="docs-section-title">External Resources</div>
                <div className="docs-links">
                  <a className="docs-link" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> ArcScan Explorer
                  </a>
                  <a className="docs-link" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Circle USDC Faucet
                  </a>
                  <a className="docs-link" href="https://developers.circle.com/stablecoins/cctp-getting-started" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Circle CCTP V2 Docs
                  </a>
                  <a className="docs-link" href="https://li.fi/sdk" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> LI.FI SDK Docs
                  </a>
                  <a className="docs-link" href="https://github.com/ds4316/usdc-portal" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> GitHub Repository
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ─── FOOTER ─── */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <span className="footer-logo">
              <CircleDollarSign size={14} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--accent)' }} />
              USDC Portal
            </span>
            <span className="footer-tag">Circle + Arc Stablecoin Commerce Hackathon · Agentic Economy Track</span>
          </div>
          <div className="footer-links">
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">ArcScan</a>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle Faucet</a>
            <a href="https://developers.circle.com" target="_blank" rel="noreferrer">Circle Docs</a>
          </div>
          <div className="footer-disclaimer">Testnet demo only · Not financial advice</div>
        </div>
      </footer>
    </div>
  )
}
