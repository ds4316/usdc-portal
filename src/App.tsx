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
  Lock, Upload, BookOpen, LayoutDashboard, ArrowRightLeft, Network, UserCircle, BriefcaseBusiness,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { arcTestnet } from './wagmi.config'
import './App.css'

const kit = new AppKit()

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// USDCPaymentHub removed (replaced by ArcEscrow + NFTOTCEscrow)

// ── CCTP V2 (Testnet) ─
const SEPOLIA_USDC        = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`
const ARC_MSG_TRANSMITTER = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as `0x${string}`

// ── ArcOnboarder ─ helper contract for onboarding Arc Testnet wallets
const ARC_ONBOARDER = '0x495825fF81B048B2A6e1FE10571625496f8fF1FD' as `0x${string}`

// ── ArcEscrow ─
const ARC_ESCROW = '0x2D961a34d7558AA5A3BaB17f4d928fd0deC7a5Dc' as `0x${string}`
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as `0x${string}`

// NFTOTCEscrow — deployed Arc Testnet · atomic NFT ↔ USDC swap
const NFT_OTC_ESCROW = '0xdC47D9AE448BcE3E524C768446fE65f30d03f20e' as `0x${string}`


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
  { name: 'claimJob', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] },
  { name: 'cancelJob', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] },
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

// NFT OTC Escrow ABI
const NFT_OTC_ESCROW_ABI = [
  { name: 'fundDeal', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'seller',     type: 'address' },
      { name: 'nft',        type: 'address' },
      { name: 'tokenId',    type: 'uint256' },
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'deadline',   type: 'uint256' },
    ], outputs: [{ name: 'dealId', type: 'uint256' }] },
  { name: 'claimDeal', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'dealId', type: 'uint256' }], outputs: [] },
  { name: 'cancelDeal', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'dealId', type: 'uint256' }], outputs: [] },
  { name: 'settle', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'dealId', type: 'uint256' }], outputs: [] },
  { name: 'refundAfterDeadline', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'dealId', type: 'uint256' }], outputs: [] },
  { name: 'isReadyToSettle', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'dealId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'nextDealId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getDeal', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'dealId', type: 'uint256' }],
    outputs: [
      { name: 'buyer',      type: 'address' },
      { name: 'seller',     type: 'address' },
      { name: 'nft',        type: 'address' },
      { name: 'tokenId',    type: 'uint256' },
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'deadline',   type: 'uint256' },
      { name: 'status',     type: 'uint8'   },
    ] },
] as const

// ERC-721 ABI for NFT approve and transferFrom
const ERC721_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'transferFrom', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
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

// Wallet connection state
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

// LI.FI EVM chain support list
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

// Public client API setup
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

// ── LI.FI chain config ─
interface AssetRow {
  wallet: string; chain: number; symbol: string
  balance: string; usdcValue: string; coingeckoId: string; change24h: number
}

interface TxRecord {
  type: 'swap' | 'bridge' | 'send' | 'cross' | 'escrow'
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
type Page        = 'overview' | 'marketplace' | 'portfolio' | 'pay' | 'funds' | 'escrow' | 'activity' | 'docs'
type InAppFaucetChain = 'ARC-TESTNET' | 'ETH-SEPOLIA' | 'BASE-SEPOLIA'
type MarketRequestStatus = 'open' | 'matched' | 'cancelled' | 'completed'
type DealType = 'work' | 'milestone' | 'nft-otc'

const PAGE_IDS: Page[] = ['overview', 'marketplace', 'portfolio', 'pay', 'funds', 'escrow', 'activity', 'docs']

function getPageFromLocation(): Page {
  if (typeof window === 'undefined') return 'overview'
  const hashPage = window.location.hash.replace('#', '') as Page
  return PAGE_IDS.includes(hashPage) ? hashPage : 'overview'
}

interface Contact { id: string; name: string; address: string }
interface MarketRequest {
  id: string
  dealType?: DealType
  title: string
  category: string
  budget: string
  deadlineDays: string
  listingDays?: string
  listingFee?: string
  expiresAt?: string
  description: string
  deliverable: string
  upfrontAmount?: string
  completionAmount?: string
  nftChain?: string
  nftContract?: string
  nftTokenId?: string
  nftSeller?: string
  nftCollection?: string
  client: string
  agent?: string
  escrowJobId?: string
  status: MarketRequestStatus
  createdAt: string
  acceptedAt?: string
  cancelledAt?: string
  completedAt?: string
}

const CONTACTS_KEY = 'usdc_portal_contacts'
const REQUESTS_KEY = 'usdc_portal_requests'
function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]') } catch { return [] }
}
function saveContacts(c: Contact[]) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)) }
function loadMarketRequests(): MarketRequest[] {
  try {
    const stored = JSON.parse(localStorage.getItem(REQUESTS_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch { return [] }
}
function saveMarketRequests(requests: MarketRequest[]) {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
}
function getListingFee(days: string | number) {
  const d = Math.max(1, Math.min(7, Number(days) || 3))
  return d <= 3 ? '0.00' : ((d - 3) * 0.05).toFixed(2)
}
function formatTimeLeft(expiresAt?: string) {
  if (!expiresAt) return 'No expiry'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / 86400_000)
  const hours = Math.ceil((ms % 86400_000) / 3600_000)
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`
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
    tokens: ['ETH'], desc: 'Sepolia test ETH, up to 0.5 ETH/day', cooldownHours: 24, pollToken: 'native' },
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

// ── Public clients ─
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

// ── TX helpers ─
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

// Market request + bridge state
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

// ── Wallet balance refresh ─
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

// ── Portfolio ─
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
  const [activePage, setActivePage] = useState<Page>(() => getPageFromLocation())
  const pagePopRef = useRef(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

// ── ArcEscrow ?ê³¹ê¹­ ─
  const [escrowAgent,  setEscrowAgent]  = useState('')
  const [escrowAmount, setEscrowAmount] = useState('')
  const [escrowDays,   setEscrowDays]   = useState('3')
  const [escrowDesc,   setEscrowDesc]   = useState('')
  const [escrowPayoutMode, setEscrowPayoutMode] = useState<'connected' | 'custom'>('connected')
  const [escrowJobId,  setEscrowJobId]  = useState('')
  const [escrowJob,    setEscrowJob]    = useState<{
    client: string; agent: string; amount: bigint; deadline: bigint;
    description: string; resultUri: string; status: number
  } | null>(null)
  const [escrowWorkText,     setEscrowWorkText]     = useState('')
  const [escrowWorkFile,     setEscrowWorkFile]     = useState<File | null>(null)
  const [escrowWorkUploading,setEscrowWorkUploading]= useState(false)
  const [escrowLoading,      setEscrowLoading]      = useState(false)
  const [resultPreview,      setResultPreview]      = useState<{ url: string; text: string; contentType: string; loading: boolean; error: string } | null>(null)
  const [aiVerdict,          setAiVerdict]          = useState<{ verdict: 'approve' | 'reject'; reasoning: string } | null>(null)
  const [aiLoading,          setAiLoading]          = useState(false)
  const [escrowMyTab,    setEscrowMyTab]    = useState<'new' | 'jobs'>('jobs')
  const [escrowProtocol, setEscrowProtocol] = useState<'arc-escrow' | 'erc8183'>('arc-escrow')
  const [recentJobIds,   setRecentJobIds]   = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('arc_escrow_jobs') ?? '[]') } catch { return [] }
  })
  const [marketRequests, setMarketRequests] = useState<MarketRequest[]>(loadMarketRequests)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketTab, setMarketTab] = useState<'browse' | 'create'>('browse')
  const [marketDealFilter, setMarketDealFilter] = useState<'all' | DealType>('all')
  const [marketScopeFilter, setMarketScopeFilter] = useState<'open' | 'mine' | 'all'>('all')
  const [activeEscrowRequestId, setActiveEscrowRequestId] = useState<string | null>(null)
  const [requestDealType, setRequestDealType] = useState<DealType>('work')
  const [requestTitle, setRequestTitle] = useState('')
  const [requestCategory, setRequestCategory] = useState('AI Work')
  const [requestBudget, setRequestBudget] = useState('')
  const [requestUpfront, setRequestUpfront] = useState('10')
  const [requestCompletion, setRequestCompletion] = useState('10')
  const [requestNftChain, setRequestNftChain] = useState('Arc Testnet')
  const [requestNftContract, setRequestNftContract] = useState('')
  const [requestNftTokenId, setRequestNftTokenId] = useState('')
  const [requestNftSeller, setRequestNftSeller] = useState('')
  const [requestNftCollection, setRequestNftCollection] = useState('')
  const [requestDays, setRequestDays] = useState('3')
  const [requestListingDays, setRequestListingDays] = useState('3')
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
  const [showProfileMenu, setShowProfileMenu] = useState(false)
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

// Wallet + chain helpers
  const [gasPrices, setGasPrices] = useState<Record<number, string>>({})

  // loading states
  const [faucetPoll, setFaucetPoll] = useState<Record<number, FaucetPollState>>({})
  const [inAppFaucetChain, setInAppFaucetChain] = useState<InAppFaucetChain>('ARC-TESTNET')
  const [inAppFaucetLoading, setInAppFaucetLoading] = useState(false)
  const [inAppFaucetMessage, setInAppFaucetMessage] = useState('')
  const pollTimers = useRef<Record<number, ReturnType<typeof setInterval>>>({})

  // escrow state
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
  const [e8183PayoutMode, setE8183PayoutMode] = useState<'connected' | 'custom'>('connected')
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


  const allAddresses = [...new Set(connections.flatMap((c) => c.accounts))]
  const isConnected  = connections.length > 0
  const activeChainId = connections[0]?.chainId
  const activeWallet = allAddresses[0]
  const activeWalletShort = activeWallet ? `${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}` : 'Not connected'
  const activeChainMeta = activeChainId ? CHAIN_META[activeChainId] : undefined
  const escrowWorkerAddress = escrowPayoutMode === 'connected' ? (activeWallet ?? '') : escrowAgent
  const e8183WorkerAddress = e8183PayoutMode === 'connected' ? (activeWallet ?? '') : e8183Provider
  const settlementHistory = history.filter((h) => h.type === 'escrow')
  const completedSettlementCount = settlementHistory.filter((h) => h.status === 'success' && /released|approved|refund/i.test(h.summary)).length
  const requestStats = {
    open: marketRequests.filter((r) => r.status === 'open').length,
    matched: marketRequests.filter((r) => r.agent && !r.escrowJobId).length,
    funded: marketRequests.filter((r) => r.escrowJobId).length,
    mine: marketRequests.filter((r) => activeWallet && (r.client.toLowerCase() === activeWallet.toLowerCase() || r.agent?.toLowerCase() === activeWallet.toLowerCase())).length,
  }
  const escrowRelatedRequests = marketRequests.filter((request) =>
    activeWallet
    && (request.client.toLowerCase() === activeWallet.toLowerCase() || request.agent?.toLowerCase() === activeWallet.toLowerCase())
    && Boolean(request.agent || request.escrowJobId)
  )
  const filteredMarketRequests = marketRequests.filter((request) => {
    const matchesDeal = marketDealFilter === 'all' || (request.dealType ?? 'work') === marketDealFilter
    const matchesScope = marketScopeFilter === 'all'
      || (marketScopeFilter === 'open' && request.status === 'open')
      || (marketScopeFilter === 'mine' && Boolean(activeWallet && (request.client.toLowerCase() === activeWallet.toLowerCase() || request.agent?.toLowerCase() === activeWallet.toLowerCase())))
    return matchesDeal && matchesScope
  })

// ── Toast manager ─
  function addToast(t: Omit<Toast, 'id'>): string {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    if (t.type === 'success') setTimeout(() => removeToast(id), 6000)
    if (t.type === 'error') setTimeout(() => removeToast(id), 10000)
    return id
  }
  function removeToast(id: string) { setToasts((prev) => prev.filter((x) => x.id !== id)) }
  // updateToast available for future use
  // function updateToast(id: string, t: Partial<Toast>) { ... }

  function navigatePage(page: Page) {
    setActivePage(page)
    setShowProfileMenu(false)
    setShowConnectors(false)
    const targetHash = page
    if (window.location.hash.replace('#', '') !== targetHash) {
      window.location.hash = targetHash
    }
  }

  useEffect(() => { localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('networkMode', networkMode) }, [networkMode])
  useEffect(() => { saveMarketRequests(marketRequests) }, [marketRequests])
  useEffect(() => { loadMarketRequestsFromApi() }, [])
  useEffect(() => { if (allAddresses.length) loadAssets() }, [connections.length, allAddresses.join(',')])
  useEffect(() => {
    const applyPageFromUrl = () => {
      pagePopRef.current = true
      setActivePage(getPageFromLocation())
      setShowProfileMenu(false)
      setShowConnectors(false)
    }
    window.addEventListener('hashchange', applyPageFromUrl)
    return () => {
      window.removeEventListener('hashchange', applyPageFromUrl)
    }
  }, [])
  useEffect(() => {
    if (pagePopRef.current) {
      pagePopRef.current = false
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activePage])
  useEffect(() => {
    if (!showProfileMenu && !showConnectors) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false)
        setShowConnectors(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfileMenu(false)
        setShowConnectors(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showProfileMenu, showConnectors])

  // auto-refresh every 60 seconds
  useEffect(() => {
    if (!isConnected) return
    const t = setInterval(() => loadAssets(), 60000)
    return () => clearInterval(t)
  }, [isConnected])

  // cleanup poll timers on unmount
  useEffect(() => () => { Object.values(pollTimers.current).forEach(clearInterval) }, [])

// Asset loading + polling
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

// ── Confirm modal ─
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

// ── Bidirectional CCTP bridge ─
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
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) return
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load requests')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
    } catch {
      // Local Vite dev does not serve Vercel API routes; keep the local fallback quiet.
    } finally {
      setMarketLoading(false)
    }
  }

  async function createMarketRequest() {
    if (!isConnected || !activeWallet) return addToast({ type: 'error', message: 'Connect a wallet first' })
    if (!requestTitle.trim()) return addToast({ type: 'error', message: 'Enter a request title' })
    if (!requestDescription.trim()) return addToast({ type: 'error', message: 'Describe the work request' })
    if (!requestDeliverable.trim()) return addToast({ type: 'error', message: 'Define the expected deliverable' })
    const upfront = parseFloat(requestUpfront)
    const completion = parseFloat(requestCompletion)
    const budget = requestDealType === 'milestone' ? upfront + completion : parseFloat(requestBudget)
    if (!Number.isFinite(budget) || budget <= 0) return addToast({ type: 'error', message: 'Enter a USDC budget' })
    if (requestDealType === 'milestone' && (!Number.isFinite(upfront) || upfront < 0 || !Number.isFinite(completion) || completion <= 0)) {
      return addToast({ type: 'error', message: 'Enter valid upfront and completion amounts' })
    }
    if (requestDealType === 'nft-otc') {
      if (!isAddress(requestNftContract)) return addToast({ type: 'error', message: 'Enter a valid NFT contract address' })
      if (!requestNftTokenId.trim()) return addToast({ type: 'error', message: 'Enter the NFT token ID' })
      if (requestNftSeller && !isAddress(requestNftSeller)) return addToast({ type: 'error', message: 'Seller wallet must be a valid address' })
      if (NFT_OTC_ESCROW === '0x0000000000000000000000000000000000000000') {
        return addToast({ type: 'error', message: 'NFT OTC Escrow not deployed yet — update NFT_OTC_ESCROW address' })
      }
    }
    const { encodeFunctionData } = await import('viem')
    setMarketLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      const usdcAmt  = BigInt(Math.round(budget * 1e6))
      const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(requestDays) * 86400)
      const arcClient = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.network') })
      let escrowJobId: number
      let txHash: string | undefined
      if (requestDealType === 'nft-otc') {
        await sendTransactionAsync({ to: ARC_TESTNET_USDC,
          data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve', args: [NFT_OTC_ESCROW, usdcAmt] }) })
        const sellerAddr = (requestNftSeller && isAddress(requestNftSeller) ? requestNftSeller : '0x0000000000000000000000000000000000000000') as `0x${string}`
        txHash = await sendTransactionAsync({ to: NFT_OTC_ESCROW,
          data: encodeFunctionData({ abi: NFT_OTC_ESCROW_ABI, functionName: 'fundDeal',
            args: [sellerAddr, requestNftContract as `0x${string}`, BigInt(requestNftTokenId), usdcAmt, deadline] }) })
        const nextId = await arcClient.readContract({ address: NFT_OTC_ESCROW, abi: NFT_OTC_ESCROW_ABI, functionName: 'nextDealId' })
        escrowJobId = Number(nextId) - 1
      } else {
        await sendTransactionAsync({ to: ARC_TESTNET_USDC,
          data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve', args: [ARC_ESCROW, usdcAmt] }) })
        txHash = await sendTransactionAsync({ to: ARC_ESCROW,
          data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'createJob',
            args: ['0x0000000000000000000000000000000000000000' as `0x${string}`, usdcAmt, deadline, `${requestTitle}: ${requestDeliverable}`] }) })
        const nextId = await arcClient.readContract({ address: ARC_ESCROW, abi: NEXT_JOB_ID_ABI, functionName: 'nextJobId' })
        escrowJobId = Number(nextId) - 1
      }
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealType: requestDealType, title: requestTitle, category: requestCategory, budget,
          upfrontAmount: requestDealType === 'milestone' ? upfront : undefined,
          completionAmount: requestDealType === 'milestone' ? completion : undefined,
          nftChain: requestDealType === 'nft-otc' ? requestNftChain : undefined,
          nftContract: requestDealType === 'nft-otc' ? requestNftContract : undefined,
          nftTokenId: requestDealType === 'nft-otc' ? requestNftTokenId : undefined,
          nftSeller: requestDealType === 'nft-otc' ? requestNftSeller : undefined,
          nftCollection: requestDealType === 'nft-otc' ? requestNftCollection : undefined,
          deadlineDays: requestDays, listingDays: requestListingDays,
          description: requestDescription, deliverable: requestDeliverable,
          client: activeWallet, escrowJobId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not post request')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
      setRequestTitle(''); setRequestBudget(''); setRequestDays('3')
      setRequestListingDays('3'); setRequestDescription(''); setRequestDeliverable(''); setRequestCategory('AI Work')
      setRequestDealType('work'); setRequestUpfront('10'); setRequestCompletion('10')
      setRequestNftChain('Arc Testnet'); setRequestNftContract(''); setRequestNftTokenId(''); setRequestNftSeller(''); setRequestNftCollection('')
      setMarketTab('browse')
      addToast({ type: 'success', message: `Posted — ${budget} USDC locked in escrow (job #${escrowJobId})`, txHash, explorerBase: 'https://testnet.arcscan.app' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not post request' })
    } finally {
      setMarketLoading(false)
    }
  }

  async function acceptMarketRequest(id: string, dealType: DealType, escrowJobId: string | undefined) {
    if (!isConnected || !activeWallet) return addToast({ type: 'error', message: 'Connect a wallet first' })
    if (!escrowJobId) return addToast({ type: 'error', message: 'No on-chain job ID found for this request' })
    const { encodeFunctionData } = await import('viem')
    setMarketLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      let claimHash: string
      if (dealType === 'nft-otc') {
        claimHash = await sendTransactionAsync({ to: NFT_OTC_ESCROW,
          data: encodeFunctionData({ abi: NFT_OTC_ESCROW_ABI, functionName: 'claimDeal', args: [BigInt(escrowJobId)] }) })
      } else {
        claimHash = await sendTransactionAsync({ to: ARC_ESCROW,
          data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'claimJob', args: [BigInt(escrowJobId)] }) })
      }
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'accept', agent: activeWallet }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not accept request')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
      addToast({ type: 'success', message: 'Accepted — you are now the matched worker', txHash: claimHash, explorerBase: 'https://testnet.arcscan.app' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Could not accept request' })
    } finally {
      setMarketLoading(false)
    }
  }

  async function cancelMarketRequest(id: string, dealType: DealType, escrowJobId: string | undefined) {
    if (!isConnected || !activeWallet) return addToast({ type: 'error', message: 'Connect a wallet first' })
    if (!escrowJobId) return addToast({ type: 'error', message: 'No on-chain job ID found' })
    const { encodeFunctionData } = await import('viem')
    setMarketLoading(true)
    try {
      await switchChain({ chainId: arcTestnet.id })
      let cancelHash: string
      if (dealType === 'nft-otc') {
        cancelHash = await sendTransactionAsync({ to: NFT_OTC_ESCROW,
          data: encodeFunctionData({ abi: NFT_OTC_ESCROW_ABI, functionName: 'cancelDeal', args: [BigInt(escrowJobId)] }) })
      } else {
        cancelHash = await sendTransactionAsync({ to: ARC_ESCROW,
          data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'cancelJob', args: [BigInt(escrowJobId)] }) })
      }
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'cancel', client: activeWallet }),
      })
      const json = await res.json()
      if (res.ok && Array.isArray(json.requests)) setMarketRequests(json.requests)
      addToast({ type: 'success', message: 'Cancelled — USDC refunded (5% fee to worker if already matched)', txHash: cancelHash, explorerBase: 'https://testnet.arcscan.app' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Cancel failed' })
    } finally {
      setMarketLoading(false)
    }
  }

  async function approveNftForEscrow(nftContract: string, tokenId: string) {
    if (!isConnected) return addToast({ type: 'error', message: 'Connect a wallet first' })
    const { encodeFunctionData } = await import('viem')
    try {
      await switchChain({ chainId: arcTestnet.id })
      const approveHash = await sendTransactionAsync({ to: nftContract as `0x${string}`,
        data: encodeFunctionData({ abi: ERC721_ABI, functionName: 'approve', args: [NFT_OTC_ESCROW, BigInt(tokenId)] }) })
      addToast({ type: 'success', message: 'NFT approved for escrow — either side can now settle', txHash: approveHash, explorerBase: 'https://testnet.arcscan.app' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Approve failed' })
    }
  }

  async function settleNftOtcDeal(requestId: string, escrowJobId: string) {
    if (!isConnected) return addToast({ type: 'error', message: 'Connect a wallet first' })
    const { encodeFunctionData } = await import('viem')
    try {
      await switchChain({ chainId: arcTestnet.id })
      const settleHash = await sendTransactionAsync({ to: NFT_OTC_ESCROW,
        data: encodeFunctionData({ abi: NFT_OTC_ESCROW_ABI, functionName: 'settle', args: [BigInt(escrowJobId)] }) })
      // Mark request as completed in the shared board
      await fetch('/api/requests', { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, action: 'complete' }) })
      await loadMarketRequestsFromApi()
      addToast({ type: 'success', message: 'Deal settled — NFT sent to buyer, USDC released to seller', txHash: settleHash, explorerBase: 'https://testnet.arcscan.app' })
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Settle failed' })
    }
  }


  async function deleteExpiredMarketRequest(id: string) {
    const target = marketRequests.find((request) => request.id === id)
    if (!target?.expiresAt || new Date(target.expiresAt).getTime() > Date.now()) {
      return addToast({ type: 'error', message: 'Only expired requests can be removed' })
    }
    setMarketLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'deleteExpired' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not remove request')
      if (Array.isArray(json.requests)) setMarketRequests(json.requests)
      addToast({ type: 'success', message: 'Expired request removed' })
    } catch {
      setMarketRequests((prev) => prev.filter((request) => request.id !== id))
      addToast({ type: 'success', message: 'Expired request removed locally' })
    } finally {
      setMarketLoading(false)
    }
  }

  function viewRequestEscrow(request: MarketRequest) {
    if (!request.escrowJobId) {
      addToast({ type: 'error', message: 'No escrow job linked to this request' })
      return
    }
    setEscrowJobId(request.escrowJobId)
    setEscrowMyTab('jobs')
    navigatePage('escrow')
  }

  function openEscrowSubmission(request: MarketRequest) {
    if (!request.escrowJobId) {
      addToast({ type: 'error', message: 'No on-chain escrow job found for this request' })
      return
    }
    setEscrowProtocol('arc-escrow')
    setEscrowMyTab('jobs')
    setEscrowJobId(request.escrowJobId)
    navigatePage('escrow')
    void escrowLookupJob(Number(request.escrowJobId))
  }

// Confirm modal + contact helpers
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

// CSV export
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


// ── LI.FI ─
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

// ── LI.FI routing ─
  const ethValue      = assets.filter((a) => a.symbol === 'ETH').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const usdcTotalVal  = assets.filter((a) => a.symbol.includes('USDC')).reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const otherValue    = parseFloat(totalUsdc) - ethValue - usdcTotalVal

  const chainBreakdown = CHAINS
    .map((c) => ({ id: c.id, val: assets.filter((a) => a.chain === c.id).reduce((s, a) => s + parseFloat(a.usdcValue), 0) }))
    .filter((c) => c.val > 0)

// Bridge & attestation helpers
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

// ── CCTP Bridge: Sepolia USDC ??Arc Testnet USDC ─
  async function executeCCTPBridge() {
    const amt = parseFloat(cctpAmount)
    if (!amt || amt <= 0) return addToast({ type: 'error', message: 'Enter an amount' })
    const recipientAddr = (cctpRecipient || allAddresses[0]) as `0x${string}`
    if (!recipientAddr) return addToast({ type: 'error', message: 'Connect wallet or enter Arc address' })

    const { encodeFunctionData, decodeEventLog, keccak256 } = await import('viem')
    const usdcAmount = BigInt(Math.round(amt * 1e6)) // USDC 6 decimals
    // Arc recipient: EVM address ??bytes32 (right-aligned, left-zero-padded)
    const mintRecipient = `0x${'0'.repeat(24)}${recipientAddr.replace('0x', '')}` as `0x${string}`
    let loadId = ''
    const showBridgeStep = (message: string) => {
      if (loadId) removeToast(loadId)
      loadId = addToast({ type: 'loading', message })
    }

    try {
// ── Step 1: Sepolia USDC approve + depositForBurn ─
      await switchChain({ chainId: sepolia.id })

// ── Step 2: USDC approve ??ArcOnboarder ─
      setCctpStep('approving')
      showBridgeStep('1/4 Approving USDC on Sepolia...')
      await sendTransactionAsync({
        to: SEPOLIA_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ARC_ONBOARDER, usdcAmount] }),
      })

// ── Step 3: ArcOnboarder.bridgeUSDCToArc ─
      setCctpStep('burning')
      showBridgeStep('2/4 Bridging USDC to Arc via ArcOnboarder...')
      const burnHash = await sendTransactionAsync({
        to: ARC_ONBOARDER,
        data: encodeFunctionData({ abi: ARC_ONBOARDER_ABI, functionName: 'bridgeUSDCToArc',
          args: [usdcAmount, mintRecipient] }),
      })
      setCctpBurnHash(burnHash)

// Step 4: extract MessageSent event + message bytes
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

// Step 5: poll Circle Attestation API
      setCctpStep('attesting')
      showBridgeStep('3/4 Waiting Circle attestation...')
      let attestation = ''
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const res  = await fetch(`/api/attestation?messageHash=${messageHash}`)
        const json = await res.json()
        if (json.status === 'complete') { attestation = json.attestation; break }
      }
      if (!attestation) throw new Error('Attestation timeout ??retry later')

// ── Step 6: Arc Testnet receiveMessage ─
      setCctpStep('minting')
      showBridgeStep('4/4 Minting USDC on Arc Testnet...')
      await switchChain({ chainId: arcTestnet.id })
      await sendTransactionAsync({
        to: ARC_MSG_TRANSMITTER,
        data: encodeFunctionData({ abi: RECEIVE_MSG_ABI, functionName: 'receiveMessage',
          args: [messageBytes, attestation as `0x${string}`] }),
      })

      setCctpStep('done')
      if (loadId) removeToast(loadId)
      localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
      addToast({ type: 'success', message: `${cctpAmount} USDC arrived on Arc!`, txHash: burnHash })
      setCctpAmount('')
      setTimeout(() => setCctpStep('idle'), 2500)

    } catch (e: unknown) {
      if (loadId) removeToast(loadId)
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
    let loadId = ''
    const showBridgeStep = (message: string) => {
      if (loadId) removeToast(loadId)
      loadId = addToast({ type: 'loading', message })
    }

    try {
      // Step 1: Switch to Arc Testnet
      await switchChain({ chainId: arcTestnet.id })

      // Step 2: Approve ARC_TESTNET_USDC to ARC_TOKEN_MESSENGER
      setCctpStep('approving')
      showBridgeStep('1/4 Approving USDC on Arc Testnet...')
      await sendTransactionAsync({
        to: ARC_TESTNET_USDC,
        data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve',
          args: [ARC_TOKEN_MESSENGER, usdcAmount] }),
      })

      // Step 3: depositForBurn -> Sepolia (domain 0)
      setCctpStep('burning')
      showBridgeStep('2/4 Burning USDC on Arc to Sepolia...')
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
      showBridgeStep('3/4 Waiting Circle attestation...')
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
        if (loadId) removeToast(loadId)
        addToast({ type: 'success', message: 'Burn complete! Close this tab and use Check & Claim when ready (15-20 min).' })
        setCctpStep('idle')
        return
      }

      // Step 6: Switch to Sepolia and receiveMessage — use API message (CCTP V2), not event-log message
      setCctpStep('minting')
      showBridgeStep('4/4 Minting USDC on Sepolia...')
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
          if (loadId) removeToast(loadId)
          localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
          addToast({ type: 'success', message: `${cctpAmount} USDC was already bridged to Sepolia. Refresh balances in a minute.` })
          setCctpAmount('')
          setTimeout(() => setCctpStep('idle'), 2500)
          return
        }
        throw sendError
      }
      if (!mintHash) throw new Error('receiveMessage transaction was not submitted')
      try {
        const mintRcpt = await publicClients[11155111].waitForTransactionReceipt({ hash: mintHash, timeout: 90_000 })
        if (mintRcpt.status === 'reverted') {
          setCctpStep('done')
          if (loadId) removeToast(loadId)
          localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
          addToast({ type: 'success', message: `${cctpAmount} USDC appears already claimed or relayed on Sepolia. Refresh balances to confirm.`, txHash: mintHash })
          setCctpAmount('')
          setTimeout(() => setCctpStep('idle'), 2500)
          return
        }
      } catch (re: unknown) {
        if (!isReceiptTimeout(re)) throw re
        // receipt polling timed out — tx is submitted, just couldn't confirm in time
      }

      setCctpStep('done')
      if (loadId) removeToast(loadId)
      localStorage.removeItem('cctp_pending_bridge'); setPendingBridge(null)
      addToast({ type: 'success', message: `${cctpAmount} USDC bridged to Sepolia! Refresh balances in a minute.`, txHash: mintHash })
      setCctpAmount('')
      setTimeout(() => setCctpStep('idle'), 2500)

    } catch (e: unknown) {
      if (loadId) removeToast(loadId)
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
    const workerAddress = e8183WorkerAddress
    if (!workerAddress) return addToast({ type: 'error', message: 'Connect wallet or enter worker wallet address' })
    if (!isAddress(workerAddress)) return addToast({ type: 'error', message: 'Invalid worker wallet address' })
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
          args: [workerAddress as `0x${string}`, clientAddr, expiredAt, e8183Desc, '0x0000000000000000000000000000000000000000' as `0x${string}`] }),
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

// ── ArcEscrow functions ─

  async function escrowCreateJob() {
    const { encodeFunctionData } = await import('viem')
    const amt = parseFloat(escrowAmount)
    const workerAddress = escrowWorkerAddress
    if (!workerAddress) return addToast({ type: 'error', message: 'Connect wallet or enter worker wallet address' })
    if (!isAddress(workerAddress)) return addToast({ type: 'error', message: 'Invalid worker wallet address' })
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
          args: [workerAddress as `0x${string}`, usdcAmt, deadline, escrowDesc] }),
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
      if (activeEscrowRequestId && activeWallet) {
        try {
          const res = await fetch('/api/requests', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: activeEscrowRequestId, action: 'fund', client: activeWallet, escrowJobId: newJobId }),
          })
          const json = await res.json()
          if (res.ok && Array.isArray(json.requests)) setMarketRequests(json.requests)
          setActiveEscrowRequestId(null)
        } catch {
          addToast({ type: 'error', message: 'Escrow created, but request board was not updated' })
        }
      }
      addToast({ type: 'success', message: `Job #${newJobId} created! ${amt} USDC locked in escrow.` })
      setHistory((prev) => addHistory(prev, { type: 'escrow', summary: `Escrow funded: Job #${newJobId} · ${amt.toFixed(2)} USDC`, txHash: '', timestamp: Date.now(), status: 'success' }))
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
      addToast({ type: 'error', message: 'AI evaluation failed — check ANTHROPIC_API_KEY config' })
    } finally {
      setAiLoading(false)
    }
  }

  async function openResultPreview(url: string) {
    setResultPreview({ url, text: '', contentType: '', loading: true, error: '' })
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const contentType = res.headers.get('content-type') ?? ''
      const isText = contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')
      const text = isText ? await res.text() : ''
      setResultPreview({ url, text, contentType, loading: false, error: '' })
    } catch (e) {
      setResultPreview({
        url,
        text: '',
        contentType: '',
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load result preview',
      })
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
      body: JSON.stringify({ filename: 'result.txt', contentType: 'text/plain; charset=utf-8', data: base64 }),
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
      setHistory((prev) => addHistory(prev, { type: 'escrow', summary: `Result submitted: Job #${escrowJobId}`, txHash: '', timestamp: Date.now(), status: 'success' }))
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
      const hash = await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'approveWork',
          args: [BigInt(parseInt(escrowJobId))] }),
      })
      addToast({ type: 'success', message: 'Work approved — USDC released to worker!', txHash: hash, explorerBase: 'https://testnet.arcscan.app' })
      setHistory((prev) => addHistory(prev, { type: 'escrow', summary: `Payment released: Job #${escrowJobId}`, txHash: hash, timestamp: Date.now(), status: 'success' }))
      // Also mark the linked marketplace request as completed
      const linked = marketRequests.find((r) => r.escrowJobId === escrowJobId)
      if (linked) {
        const res = await fetch('/api/requests', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: linked.id, action: 'complete' }),
        })
        const json = await res.json()
        if (res.ok && Array.isArray(json.requests)) setMarketRequests(json.requests)
      }
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
      const hash = await sendTransactionAsync({
        to: ARC_ESCROW,
        data: encodeFunctionData({ abi: ARC_ESCROW_ABI, functionName: 'claimRefund',
          args: [BigInt(parseInt(escrowJobId))] }),
      })
      addToast({ type: 'success', message: 'Refund claimed!', txHash: hash, explorerBase: 'https://testnet.arcscan.app' })
      setHistory((prev) => addHistory(prev, { type: 'escrow', summary: `Refund claimed: Job #${escrowJobId}`, txHash: hash, timestamp: Date.now(), status: 'success' }))
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

// ── Market requests & filtering ─
  const displayed = assets
    .filter((a) => networkMode === 'mainnet' ? MAINNET_IDS.has(a.chain) : TESTNET_IDS.has(a.chain))
    .sort((a, b) => sortBy === 'value' ? parseFloat(b.usdcValue) - parseFloat(a.usdcValue)
      : sortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : a.chain - b.chain)

// Settlement history helpers
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

// LI.FI swap routes
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

// ── Navbar items ─
  const NAV_ITEMS = [
    { id: 'overview'  as const, label: 'Product',      icon: <LayoutDashboard size={13} /> },
    { id: 'marketplace' as const, label: 'Requests',    icon: <BookUser size={13} /> },
    { id: 'escrow'    as const, label: 'Escrow',       icon: <Lock size={13} /> },
    { id: 'funds'     as const, label: 'Move Funds',   icon: <ArrowRightLeft size={13} /> },
    { id: 'activity'  as const, label: 'Settlements',  icon: <Network size={13} /> },
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

      {resultPreview && (
        <div className="modal-overlay" onClick={() => setResultPreview(null)}>
          <div className="modal result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Submitted Result</h3>
                <p className="result-modal-url">{resultPreview.url}</p>
              </div>
              <button className="modal-close" onClick={() => setResultPreview(null)}><X size={16} /></button>
            </div>
            {resultPreview.loading ? (
              <div className="result-preview-state">Loading result...</div>
            ) : resultPreview.error ? (
              <div className="result-preview-state error">
                <AlertTriangle size={16} />
                <span>Preview failed: {resultPreview.error}</span>
                <a href={resultPreview.url} target="_blank" rel="noreferrer">Open raw file</a>
              </div>
            ) : resultPreview.contentType.startsWith('image/') ? (
              <div className="result-preview-media">
                <img src={resultPreview.url} alt="Submitted result preview" />
              </div>
            ) : resultPreview.contentType.includes('application/pdf') ? (
              <iframe className="result-preview-pdf" src={resultPreview.url} title="Submitted PDF result" />
            ) : resultPreview.text ? (
              <pre className="result-preview-text">{resultPreview.text}</pre>
            ) : (
              <div className="result-preview-state">
                <span>This file type cannot be previewed inline yet.</span>
                <a href={resultPreview.url} target="_blank" rel="noreferrer">Open raw file</a>
              </div>
            )}
            <div className="result-modal-actions">
              <button className="btn-outline" onClick={() => navigator.clipboard?.writeText(resultPreview.url)}>
                <Copy size={13} /> Copy URL
              </button>
              <a className="btn-outline" href={resultPreview.url} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Open raw
              </a>
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
                        onClick={() => { setRecipient(c.address); setMoveFundsTab('send'); navigatePage('funds'); setShowContacts(false) }}>
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

      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-left">
          <span className="nav-logo">
            <CircleDollarSign size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />
            ArcEscrow Market
          </span>
          <div className="nav-links">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={`nav-link ${activePage === item.id ? 'active' : ''}`}
                onClick={() => navigatePage(item.id)}>
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

          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button className={`profile-trigger ${showProfileMenu ? 'active' : ''}`} onClick={() => { setShowProfileMenu((v) => !v); setShowConnectors(false) }}>
              <UserCircle size={17} />
              <span>{isConnected ? activeWalletShort : 'Profile'}</span>
              <ChevronDown size={12} />
            </button>
            {showProfileMenu && (
              <div className="profile-dropdown">
                <div className="profile-head">
                  <div className="profile-avatar"><UserCircle size={24} /></div>
                  <div>
                    <span>{isConnected ? 'Connected wallet' : 'Wallet not connected'}</span>
                    <strong>{isConnected ? activeWalletShort : 'Connect to post or manage escrow'}</strong>
                  </div>
                </div>
                {isConnected && (
                  <div className="profile-wallet-list">
                    {connections.map((conn) =>
                      conn.accounts.map((addr) => (
                        <div key={addr} className="profile-wallet-row">
                          <span className="wallet-dot" />
                          <code>{addr.slice(0, 8)}...{addr.slice(-6)}</code>
                          <button className="chip-disconnect" onClick={() => disconnect({ connector: conn.connector })}><X size={12} /></button>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div className="profile-menu-section">
                  <button onClick={() => { navigatePage('portfolio'); setMainTab('assets') }}>
                    <Wallet size={14} /> Portfolio
                  </button>
                  <button onClick={() => { navigatePage('portfolio'); setMainTab('faucet') }}>
                    <Fuel size={14} /> Faucet links
                  </button>
                  <button onClick={() => { setShowQR(true); setShowProfileMenu(false) }} disabled={!isConnected}>
                    <QrCode size={14} /> Receive / QR
                  </button>
                  <button onClick={() => { setShowContacts(true); setShowProfileMenu(false) }}>
                    <BookUser size={14} /> Address book
                  </button>
                  <button onClick={() => { exportCSV(); setShowProfileMenu(false) }} disabled={!assets.length}>
                    <Download size={14} /> Export CSV
                  </button>
                </div>
                <div className="profile-menu-section">
                  <button onClick={() => setShowConnectors((v) => !v)}>
                    {isConnected ? <><Plus size={14} /> Add wallet</> : <><Wallet size={14} /> Connect wallet</>}
                  </button>
                  <button onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>
                </div>
                {showConnectors && <div className="profile-connectors"><ConnectorList /></div>}
              </div>
            )}
          </div>

          <button className="btn-theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </nav>


      <main className="page-container">

        {/* ─── OVERVIEW ─── */}
        {activePage === 'overview' && (
          <div className="page overview-page">

            {/* Hero */}
            <section className="ov-hero">
              <div className="ov-ambient ov-ambient-one" />
              <div className="ov-ambient ov-ambient-two" />
              <div className="ov-hero-text">
                <div className="ov-eyebrow">Circle + Arc agentic escrow marketplace</div>
                <h1 className="ov-h1">Trustless escrow &amp; settlement on Arc</h1>
                <p className="ov-lead">
                  Post a request, lock USDC instantly in ArcEscrow, and match with workers on-chain.
                  AI review before every payout. NFT OTC atomic swaps. ERC-8183 agentic jobs.
                  Bridge from any chain via Circle CCTP V2 with zero slippage.
                </p>
                <div className="ov-metrics">
                  <div className="ov-metric">
                    <span className="ov-metric-value">{marketRequests.length > 0 ? marketRequests.length : '—'}</span>
                    <span className="ov-metric-label">Requests on shared board</span>
                  </div>
                  <div className="ov-metric">
                    <span className="ov-metric-value">{requestStats.open > 0 ? requestStats.open : '—'}</span>
                    <span className="ov-metric-label">Open · USDC locked at post</span>
                  </div>
                  <div className="ov-metric">
                    <span className="ov-metric-value">4</span>
                    <span className="ov-metric-label">Contracts live on Arc Testnet</span>
                  </div>
                </div>
                <div className="ov-status-row">
                  <span className="status-dot green" /><span>ArcEscrow live</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>NFTOTCEscrow live</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>CCTP V2 active</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>ERC-8183 active</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>AI Review ready</span>
                  <span className="ov-sep" />
                  <span className="status-dot green" /><span>Gateway nanopayments</span>
                  {isConnected && (
                    <><span className="ov-sep" /><span className="status-dot green" />
                    <span className="ov-mono">{allAddresses[0]?.slice(0, 6)}...{allAddresses[0]?.slice(-4)} connected</span></>
                  )}
                </div>
                <div className="ov-ctas">
                  <button className="btn-primary ov-cta" onClick={() => navigatePage('marketplace')}>
                    <BookUser size={14} /> Post a Request
                  </button>
                  <button className="btn-outline ov-cta" onClick={() => navigatePage('funds')}>
                    <ArrowRightLeft size={14} /> Fund with USDC
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
                      ['Post', 'USDC locked now', 'Immediate escrow lock'],
                      ['Claim', 'Worker on-chain', 'claimJob on Arc'],
                      ['Submit', 'Deliverable', 'Vercel Blob + URI proof'],
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
                      ['CCTP V2', 'Circle bridge', 'Sepolia → Arc, 0 slippage'],
                      ['NFT OTC', 'Atomic swap', 'USDC ↔ NFT settlement'],
                      ['ERC-8183', 'Agentic jobs', 'Agent-to-agent payments'],
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
                      ['AI Review', 'Claude Haiku', 'Approve / reject verdict'],
                      ['Release', 'USDC payout', 'ArcEscrow → worker'],
                      ['Bridge', 'Circle CCTP V2', 'Sepolia → Arc, 0 slippage'],
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
                      <strong>Agentic settlement workspace</strong>
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
                  <div className="ov-product-path">
                    {['Post', 'Claim', 'Submit', 'AI', 'Release'].map((item, i) => (
                      <div key={item}>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <strong>{item}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="ov-action-grid">
                    <button className="ov-action-tile primary" onClick={() => navigatePage('marketplace')}>
                      <BookUser size={16} />
                      <span>Requests</span>
                    </button>
                    <button className="ov-action-tile" onClick={() => navigatePage('escrow')}>
                      <Lock size={16} />
                      <span>Escrow</span>
                    </button>
                    <button className="ov-action-tile" onClick={() => navigatePage('funds')}>
                      <ArrowRightLeft size={16} />
                      <span>Move</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Start */}
            <section className="ov-quickstart reveal-section">
              <div className="ov-section-heading compact" style={{ marginBottom: 20 }}>
                <div className="ov-label">Quick Start</div>
                <h2>Try it in 3 steps</h2>
              </div>
              <div className="ov-qs-steps">
                <div className="ov-qs-step">
                  <div className="ov-qs-num">01</div>
                  <div className="ov-qs-body">
                    <strong>Get testnet USDC on Arc</strong>
                    <p>Use the <button className="ov-qs-link" onClick={() => { navigatePage('funds'); }}>CCTP Bridge</button> to move Sepolia USDC to Arc Testnet, or use the faucet in your profile.</p>
                  </div>
                </div>
                <div className="ov-qs-step">
                  <div className="ov-qs-num">02</div>
                  <div className="ov-qs-body">
                    <strong>Post a request with USDC locked</strong>
                    <p>Go to <button className="ov-qs-link" onClick={() => { navigatePage('marketplace'); }}>Requests</button>, click Create Request, fill in your task, and post. USDC is locked instantly in ArcEscrow on-chain.</p>
                  </div>
                </div>
                <div className="ov-qs-step">
                  <div className="ov-qs-num">03</div>
                  <div className="ov-qs-body">
                    <strong>Accept, submit, and release</strong>
                    <p>A second wallet can click "Accept &amp; Claim". After claiming, submit work. The client runs AI review and releases USDC with one click.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="ov-grant-strip reveal-section">
              {([
                { label: 'Circle CCTP V2', title: 'Bridge USDC to Arc, 0 slippage', copy: 'Move USDC from Sepolia to Arc Testnet using Circle CCTP V2. Fast finality, no slippage, native Circle attestation.' },
                { label: 'Arc Escrow', title: 'USDC locked at post, released on proof', copy: 'ArcEscrow locks USDC when the request is created. No separate funding step. Cancel with refund or 5% fee if matched.' },
                { label: 'ERC-8183', title: 'Agentic commerce standard on Arc', copy: 'Full ERC-8183 implementation alongside ArcEscrow. Agents can autonomously create jobs, submit work, and trigger USDC payouts.' },
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
                <h2>A request marketplace with USDC escrow</h2>
                <p>
                  ArcEscrow Market combines Arc escrow, Circle CCTP, and AI review into one workflow.
                  USDC locks when you post — not after matching. Workers claim on-chain, submit proof,
                  and AI-assisted review helps approve every payout. NFT OTC swaps and ERC-8183 agentic jobs run in the same marketplace.
                </p>
              </div>
              <div className="ov-explain-grid">
                {([
                  { icon: <BookUser size={18} />, title: 'Post & Lock', desc: 'Clients post requests with USDC locked immediately in ArcEscrow. Work, Milestone, and NFT OTC deal types supported.' },
                  { icon: <Lock size={18} />, title: 'On-chain Match', desc: 'Workers call claimJob on Arc Testnet to accept open requests. The escrow contract records the match immutably.' },
                  { icon: <Upload size={18} />, title: 'Submit Work', desc: 'Workers upload deliverables to Vercel Blob. The URI is stored on-chain via submitWork() to ensure proof integrity.' },
                  { icon: <Bot size={18} />, title: 'AI + Release', desc: 'Claude Haiku evaluates the submission and returns approve/reject with reasoning. Client releases USDC after review.' },
                  { icon: <Zap size={18} />, title: 'Nanopayments', desc: 'Circle Gateway / x402 enables sub-cent per-request fees for listings, AI evaluations, API calls, and agent micropayments.' },
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
                <h2>From request to verified payout</h2>
                <p>
                  USDC is locked at post time — no separate funding step. Workers claim on-chain,
                  submit proof, and AI review helps the client decide whether to release or refund.
                  Circle CCTP V2 routes USDC from any chain to Arc with zero slippage.
                </p>
              </div>
              <div className="ov-flow-diagram">
                {([
                  { title: 'Post', sub: 'USDC locked instantly', tone: 'blue' },
                  { title: 'Claim', sub: 'Worker on-chain', tone: 'cyan' },
                  { title: 'Submit', sub: 'Deliverable uploaded', tone: 'blue' },
                  { title: 'AI Review', sub: 'Claude verdict', tone: 'gold' },
                  { title: 'Payout', sub: 'USDC → worker', tone: 'green' },
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
                  { name: 'Requests Marketplace', detail: 'Shared request board with deal types: Work, Milestone, NFT OTC. USDC locked at post, role-aware card actions.' },
                  { name: 'ArcEscrow', detail: 'Work and Milestone escrow: claimJob, submitWork, approveWork, cancelJob (5% fee if matched), claimRefund.' },
                  { name: 'NFTOTCEscrow', detail: 'Atomic NFT ↔ USDC swap. Buyer locks USDC, seller proves ownership via ownerOf, either side settles atomically.' },
                  { name: 'ERC-8183 Agentic Commerce', detail: 'Arc official standard: createJob, setBudget, fund, submit, complete. Enables fully autonomous agent-to-agent workflows.' },
                  { name: 'Circle CCTP V2', detail: 'Bridge USDC Sepolia → Arc (and reverse) via Circle CCTP V2. Zero slippage. Also App Kit, LI.FI swap, and direct send.' },
                  { name: 'AI Review (Claude)', detail: 'Claude Haiku evaluates submitted work: approve/reject verdict with one-sentence reasoning before every payout.' },
                  { name: 'Gateway Nanopayments', detail: 'x402-compatible Circle Gateway layer for sub-cent listing, review, API, and agent micropayment flows.' },
                  { name: 'Circle Programmable Wallets', detail: 'Server-controlled wallets for custodial agent workflows. Enables agents to transact without holding private keys directly.' },
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
                  { n: '01', title: 'Post & Lock',     sub: 'Marketplace → escrow',    desc: 'Client posts request — USDC is locked in ArcEscrow immediately via USDC approve + createJob. No separate funding step.' },
                  { n: '02', title: 'Claim On-chain',  sub: 'claimJob() on Arc',      desc: 'Worker finds the open request and calls claimJob on-chain. Escrow records the worker address and marks the job matched.' },
                  { n: '03', title: 'Submit + AI',     sub: 'submitWork + Claude',    desc: 'Worker uploads the deliverable to Vercel Blob. Claude Haiku evaluates quality and returns a structured verdict.' },
                  { n: '04', title: 'Release',         sub: 'approveWork() → USDC',   desc: 'Client sees the AI verdict and approves. USDC transfers directly from ArcEscrow to the worker wallet on Arc Testnet.' },
                  { n: '05', title: 'NFT & Agents',    sub: 'NFTOTCEscrow / ERC-8183', desc: 'NFT OTC atomic swaps and ERC-8183 agentic jobs run in parallel. Circle CCTP V2 bridges USDC from any chain.' },
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
                    role: 'Workers', tag: 'Work + Earn',
                    desc: 'Submit proof of work and receive Arc USDC after approval with escrow protection for both parties.',
                    items: ['Submit result on-chain', 'Get AI-assisted review', 'Receive USDC payout'],
                  },
                  {
                    role: 'Protocols & Agents', tag: 'Build + Scale',
                    desc: 'Build task markets, agent economies, and service automation on Arc. ERC-8183 enables fully autonomous job creation and payment.',
                    items: ['Composable escrow API', 'Circle CCTP cross-chain inflow', 'ERC-8183 agentic standard'],
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
              <div className="ov-label">Circle + Arc Stack</div>
              <div className="ov-arch-rail">
                {([
                  { name: 'USDC',         tech: 'Settlement asset',  color: '#2775ca' },
                  { name: 'Arc Testnet',  tech: 'Stablecoin L1',     color: '#00c2ff' },
                  { name: 'CCTP V2',      tech: 'Circle cross-chain', color: '#16a34a' },
                  { name: 'ArcEscrow',    tech: 'Work / Milestone', color: '#8b5cf6' },
                  { name: 'NFTOTCEscrow', tech: 'NFT atomic swap',  color: '#ec4899' },
                  { name: 'AI Review',    tech: 'Claude verdict',   color: '#d4a574' },
                  { name: 'ERC-8183',     tech: 'Agentic standard', color: '#f59e0b' },
                ] as const).map((node, i) => (
                  <div key={i} className="ov-arch-item">
                    <div className="ov-arch-node">
                      <div className="ov-arch-name">{node.name}</div>
                      <div className="ov-arch-tech" style={{ color: node.color }}>{node.tech}</div>
                    </div>
                    {i < 5 && <div className="ov-arch-conn"><ArrowRight size={14} /></div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Live Board Teaser */}
            {marketRequests.length > 0 && (
              <section className="ov-live-board reveal-section">
                <div className="ov-section-heading compact">
                  <div className="ov-label">
                    <span className="ov-live-dot" />
                    Live Board
                  </div>
                  <h2>Recent requests on Arc</h2>
                </div>
                <div className="ov-live-cards">
                  {marketRequests.slice(0, 3).map((req) => (
                    <div key={req.id} className="ov-live-card" onClick={() => navigatePage('marketplace')}>
                      <div className="ov-live-card-top">
                        <span className={`market-status ${req.status}`}>{req.status}</span>
                        <span className="ov-live-budget">{req.budget} USDC</span>
                      </div>
                      <div className="ov-live-title">{req.title}</div>
                      <div className="ov-live-meta">
                        <span>{req.category}</span>
                        <span>{req.deadlineDays}d deadline</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn-outline" style={{ marginTop: 16, alignSelf: 'center' }} onClick={() => navigatePage('marketplace')}>
                  <BookUser size={13} /> View all {marketRequests.length} requests
                </button>
              </section>
            )}

            {/* Final CTA */}
            <section className="ov-final-cta reveal-section">
              <div className="ov-final-inner">
                <h2 className="ov-final-title">Start settling on Arc with USDC</h2>
                <p className="ov-final-sub">
                  Bridge USDC from Sepolia, post a request, match with a worker,
                  submit proof, and release via AI-verified escrow on Arc Testnet.
                </p>
                <div className="ov-final-btns">
                  <button className="btn-primary ov-cta" onClick={() => navigatePage('marketplace')}>
                    <BookUser size={14} /> Open Requests
                  </button>
                  <button className="btn-outline ov-cta" onClick={() => navigatePage('funds')}>
                    <ArrowRightLeft size={14} /> Move Funds to Arc
                  </button>
                  <button className="btn-ghost ov-cta" onClick={() => navigatePage('docs')}>
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
                <p className="page-sub">Post a request with USDC locked immediately. Workers claim on-chain. AI-assisted review. Settlement on Arc.</p>
              </div>
              <div className="marketplace-tabs">
                <button className={marketTab === 'browse' ? 'active' : ''} onClick={() => setMarketTab('browse')}>Browse</button>
                <button className={marketTab === 'create' ? 'active' : ''} onClick={() => setMarketTab('create')}>Create Request</button>
                <button onClick={loadMarketRequestsFromApi} disabled={marketLoading}>{marketLoading ? 'Syncing' : 'Refresh'}</button>
              </div>
            </div>

            <div className="marketplace-hero">
              <div>
                <span className="market-kicker">Agentic escrow marketplace</span>
                <h3>Post work. Lock USDC. Release on approval.</h3>
                <p>Clients publish a request with scope, reward, and deadline. USDC is locked at posting time. Workers accept and claim the job on-chain. AI-assisted review then helps the client approve or reject the final payout.</p>
                <div className="market-hero-actions">
                  <button className="btn-primary" onClick={() => setMarketTab('create')}>
                    <Plus size={14} /> Post Request
                  </button>
                  <button className="btn-outline" onClick={() => navigatePage('escrow')}>
                    <Lock size={14} /> Manage Escrow
                  </button>
                </div>
              </div>
              <div className="market-command-panel">
                <div className="market-command-head">
                  <span>Live board</span>
                  <strong>{marketRequests.length} requests</strong>
                </div>
                <div className="market-stat-grid">
                  <div><span>Open</span><strong>{requestStats.open}</strong></div>
                  <div><span>Matched</span><strong>{requestStats.matched}</strong></div>
                  <div><span>Complete</span><strong>{marketRequests.filter((r) => r.status === 'completed').length}</strong></div>
                  <div><span>Mine</span><strong>{requestStats.mine}</strong></div>
                </div>
                <div className="market-flow-mini">
                  {['Post+Fund', 'Match', 'Submit', 'Review', 'Release'].map((step, i) => (
                    <div className="market-flow-step" key={step}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <strong>{step}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {!isConnected && (
              <div className="market-connect-banner">
                <div className="market-connect-icon"><Wallet size={22} /></div>
                <div className="market-connect-body">
                  <strong>Connect a wallet to post requests and claim work</strong>
                  <p>You can browse open requests without a wallet. To post, accept, or submit work, connect a wallet on Arc Testnet.</p>
                </div>
                <button className="btn-primary" onClick={() => setShowConnectors(true)}>
                  Connect Wallet
                </button>
              </div>
            )}
            <div className="market-role-strip">
              <div>
                <span>Client path</span>
                <strong>Post the request with USDC locked immediately. Worker matches and claims. Review with AI, release payment.</strong>
              </div>
              <div>
                <span>Worker path</span>
                <strong>Call claimJob on-chain to accept. Submit your result. Receive USDC after AI-assisted approval.</strong>
              </div>
              <div>
                <span>Nanopayment path</span>
                <strong>Use Gateway/x402 for tiny non-escrow charges: listing extensions, AI review, premium unlocks, paid APIs, and agent actions.</strong>
              </div>
            </div>

            {marketTab === 'create' ? (
              <section className="market-create-card">
                <div className="market-form-head">
                  <div>
                    <span>Create request</span>
                    <strong>Say what you need done and how much you will pay.</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <small>Clear deliverables make AI review and client approval easier.</small>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8 }}
                      onClick={() => {
                        setRequestTitle('Write a 300-word summary of the Arc escrow architecture')
                        setRequestDescription('I need a concise technical summary (300 words) explaining how ArcEscrow works: the create→claim→submit→approve flow, how USDC is locked, and why AI review is useful.')
                        setRequestDeliverable('A plain text document of exactly 300 words submitted as a text block.')
                        setRequestBudget('1')
                        setRequestDays('3')
                        setRequestCategory('AI Work')
                        setRequestDealType('work')
                      }}>
                      ✨ Try demo request
                    </button>
                  </div>
                </div>
                <div className="deal-type-grid">
                  {([
                    { id: 'work' as const, title: 'Work request', desc: 'Pay for a service, task, review, build, or research deliverable.' },
                    { id: 'milestone' as const, title: 'Milestone deal', desc: 'Fund an upfront amount plus a completion payment in one proposal.' },
                    { id: 'nft-otc' as const, title: 'NFT OTC', desc: 'Propose a USDC-for-NFT trade using contract address and token ID checks.' },
                  ]).map((type) => (
                    <button key={type.id} className={`deal-type-card ${requestDealType === type.id ? 'active' : ''}`} onClick={() => { setRequestDealType(type.id); if (type.id === 'nft-otc') setRequestNftChain('Arc Testnet') }}>
                      <span>{type.title}</span>
                      <strong>{type.desc}</strong>
                    </button>
                  ))}
                </div>
                <div className="request-type-helper">Choose the broad deal type first. The detail category below is only used to describe the work more clearly.</div>
                <div className="market-form-section">
                  <div className="market-form-section-head">
                    <div>
                      <span>Request terms</span>
                      <strong>Title, detailed category, and USDC reward</strong>
                    </div>
                  </div>
                  <div className="market-form-grid terms-grid">
                    <label className="pay-field">
                      <span>Request title</span>
                      <input className="pay-text-input" value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} placeholder="Design a settlement workflow diagram" />
                    </label>
                    <label className="pay-field">
                      <span>Detail category</span>
                      <select className="action-input" value={requestCategory} onChange={(e) => setRequestCategory(e.target.value)}>
                        <option>AI Work</option><option>Design Review</option><option>Frontend Build</option><option>Research</option><option>Smart Contract</option><option>NFT OTC</option><option>Milestone</option>
                      </select>
                    </label>
                    {requestDealType === 'milestone' ? (
                      <>
                        <label className="pay-field">
                          <span>Pay upfront</span>
                          <div className="pay-amount-input">
                            <input value={requestUpfront} onChange={(e) => setRequestUpfront(e.target.value)} inputMode="decimal" placeholder="10.00" />
                            <strong>USDC</strong>
                          </div>
                        </label>
                        <label className="pay-field">
                          <span>Pay on completion</span>
                          <div className="pay-amount-input">
                            <input value={requestCompletion} onChange={(e) => setRequestCompletion(e.target.value)} inputMode="decimal" placeholder="10.00" />
                            <strong>USDC</strong>
                          </div>
                        </label>
                      </>
                    ) : (
                      <label className="pay-field">
                        <span>{requestDealType === 'nft-otc' ? 'Offer price' : 'Reward amount'}</span>
                        <div className="pay-amount-input">
                          <input value={requestBudget} onChange={(e) => setRequestBudget(e.target.value)} inputMode="decimal" placeholder="0.00" />
                          <strong>USDC</strong>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
                <div className="market-form-section">
                  <div className="market-form-section-head">
                    <div>
                      <span>Timing</span>
                      <strong>Work deadline and board visibility</strong>
                    </div>
                  </div>
                  <div className="market-form-grid timing-grid">
                    <label className="pay-field">
                      <span>Work deadline</span>
                      <div className="pay-amount-input">
                        <input value={requestDays} onChange={(e) => setRequestDays(e.target.value)} inputMode="numeric" placeholder="3" />
                        <strong>days</strong>
                      </div>
                    </label>
                    <label className="pay-field">
                      <span>Visible for</span>
                      <div className="pay-amount-input">
                        <input value={requestListingDays} onChange={(e) => setRequestListingDays(e.target.value)} inputMode="numeric" placeholder="3" min="1" max="7" />
                        <strong>days</strong>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="market-fee-note">
                  <span>Listing fee</span>
                  <strong>{getListingFee(requestListingDays)} USDC</strong>
                  <small>1-3 days free. 4-7 days add 0.05 USDC per extra day. This is the first natural Gateway nanopayment candidate; the larger reward still belongs in escrow.</small>
                </div>
                <div className="nanopay-use-card">
                  <div>
                    <span>Suggested nanopayment hooks</span>
                    <strong>Keep escrow for outcomes. Meter tiny usage around the workflow.</strong>
                  </div>
                  <ul>
                    <li>Listing extension: 0.05 USDC/day after the free window</li>
                    <li>AI review run: small fee per Claude evaluation</li>
                    <li>Agent/tool call: pay per API request, dataset access, or workflow step</li>
                  </ul>
                </div>
                {requestDealType === 'nft-otc' && (
                  <div className="nft-otc-panel">
                    <div className="nft-otc-head">
                      <span>On-chain authenticity inputs</span>
                      <strong>Verify by contract address and token ID, not by image or name.</strong>
                    </div>
                    <div className="market-form-grid nft-grid">
                      <label className="pay-field">
                        <span>NFT chain</span>
                        <select className="action-input" value={requestNftChain} onChange={(e) => setRequestNftChain(e.target.value)}>
                          <option>Arc Testnet</option><option>Ethereum</option><option>Base</option><option>Polygon</option><option>Arbitrum</option><option>Sepolia</option>
                        </select>
                      </label>
                      <label className="pay-field">
                        <span>NFT contract</span>
                        <input className="pay-text-input" value={requestNftContract} onChange={(e) => setRequestNftContract(e.target.value)} placeholder="0x collection contract" />
                      </label>
                      <label className="pay-field">
                        <span>Token ID</span>
                        <input className="pay-text-input" value={requestNftTokenId} onChange={(e) => setRequestNftTokenId(e.target.value)} placeholder="1234" />
                      </label>
                      <label className="pay-field">
                        <span>Seller wallet</span>
                        <input className="pay-text-input" value={requestNftSeller} onChange={(e) => setRequestNftSeller(e.target.value)} placeholder="0x optional expected owner" />
                      </label>
                      <label className="pay-field">
                        <span>Collection label</span>
                        <input className="pay-text-input" value={requestNftCollection} onChange={(e) => setRequestNftCollection(e.target.value)} placeholder="Optional display name" />
                      </label>
                    </div>
                    <div className="nft-verify-list">
                      <span>Future on-chain checks</span>
                      <strong>ownerOf(tokenId)</strong>
                      <strong>contract matches official collection</strong>
                      <strong>escrow approval before settlement</strong>
                    </div>
                  </div>
                )}
                <label className="pay-field">
                  <span>Request details</span>
                  <textarea className="market-textarea" value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="Explain the task, context, quality bar, and any references." />
                </label>
                <label className="pay-field">
                  <span>What should the worker submit?</span>
                  <textarea className="market-textarea small" value={requestDeliverable} onChange={(e) => setRequestDeliverable(e.target.value)} placeholder="Define exactly what the agent should submit before payment is released." />
                </label>
                <button className="btn-primary market-submit" onClick={createMarketRequest} disabled={!isConnected || marketLoading}>
                  <Plus size={14} /> {marketLoading ? 'Posting...' : 'Post to Shared Board'}
                </button>
                {!isConnected && <div className="pay-inline-warning"><Wallet size={14} /> Connect a wallet to post as the request owner.</div>}
              </section>
            ) : (
              <>
              <section className="market-filter-bar">
                <div>
                  <span>Deal type</span>
                  {([
                    ['all', 'All'],
                    ['work', 'Work'],
                    ['milestone', 'Milestone'],
                    ['nft-otc', 'NFT OTC'],
                  ] as const).map(([id, label]) => (
                    <button key={id} className={marketDealFilter === id ? 'active' : ''} onClick={() => setMarketDealFilter(id)}>{label}</button>
                  ))}
                </div>
                <div>
                  <span>Scope</span>
                  {([
                    ['all', 'All status'],
                    ['open', 'Open only'],
                    ['mine', 'My jobs'],
                  ] as const).map(([id, label]) => (
                    <button key={id} className={marketScopeFilter === id ? 'active' : ''} onClick={() => setMarketScopeFilter(id)}>{label}</button>
                  ))}
                </div>
              </section>
              <section className="market-request-grid">
                {marketLoading && (
                  <div className="market-loading">
                    <div className="market-skeleton-card" />
                    <div className="market-skeleton-card" />
                    <div className="market-skeleton-card" />
                  </div>
                )}
                {!marketLoading && marketRequests.length === 0 && (
                  <div className="market-empty">
                    <BookUser size={24} />
                    <h3>No requests yet</h3>
                    <p>Post the first request to test the shared board. Anyone visiting the same deployed site will be able to see it.</p>
                    <button className="btn-primary" onClick={() => setMarketTab('create')}>Create the first request</button>
                  </div>
                )}
                {!marketLoading && marketRequests.length > 0 && filteredMarketRequests.length === 0 && (
                  <div className="market-empty">
                    <BriefcaseBusiness size={24} />
                    <h3>No matching requests</h3>
                    <p>Try another deal type or scope filter, or post a new request with the terms you want.</p>
                    <button className="btn-primary" onClick={() => setMarketTab('create')}>Post a request</button>
                  </div>
                )}
                {filteredMarketRequests.map((request) => {
                  const isOwner = activeWallet?.toLowerCase() === request.client.toLowerCase()
                  const isAgent = activeWallet && request.agent?.toLowerCase() === activeWallet.toLowerCase()
                  const isEscrowFunded = Boolean(request.escrowJobId)
                  const cardRole = isOwner ? 'Client' : isAgent ? 'Worker' : 'Observer'
                  const roleClass = isOwner ? 'client' : isAgent ? 'worker' : 'observer'
                  const dealType = request.dealType ?? 'work'
                  const dealLabel = dealType === 'nft-otc' ? 'NFT OTC' : dealType === 'milestone' ? 'Milestone' : 'Work'
                  const isExpiredRequest = Boolean(request.expiresAt && new Date(request.expiresAt).getTime() <= Date.now())
                  const isCancelled = request.status === 'cancelled'
                  const isCompleted = request.status === 'completed'
                  const nextStep = isCancelled
                    ? 'Cancelled'
                    : isCompleted
                      ? 'Deal complete'
                      : request.status === 'open'
                        ? (isOwner ? 'Waiting for a worker' : 'Accept & claim on-chain')
                        : (isAgent
                            ? (dealType === 'nft-otc' ? 'Approve NFT then settle' : 'Submit result')
                            : isOwner ? (dealType === 'nft-otc' ? 'Wait for seller to approve NFT' : 'Wait for worker result') : 'Matched')
                  const flowSteps = [
                    { label: 'Post + Fund', done: true },
                    { label: 'Match', done: Boolean(request.agent) },
                    { label: 'Submit', done: isCompleted },
                    { label: 'Release', done: isCompleted },
                  ]
                  return (
                    <article className={`market-request-card ${roleClass}`} key={request.id}>
                      <div className="market-card-top">
                        <span className={`market-status ${request.status}`}>{request.status.replace('-', ' ')}</span>
                        <span className="market-budget">{request.budget} USDC</span>
                      </div>
                      <div className="market-card-tags">
                        <span className={`deal-badge ${dealType}`}>{dealLabel}</span>
                        <span className="market-category">{request.category}</span>
                      </div>
                      <h3>{request.title}</h3>
                      <p>{request.description}</p>
                      {dealType === 'milestone' && (
                        <div className="deal-detail-strip">
                          <div><span>Upfront</span><strong>{request.upfrontAmount ?? '0.00'} USDC</strong></div>
                          <div><span>Completion</span><strong>{request.completionAmount ?? request.budget} USDC</strong></div>
                        </div>
                      )}
                      {dealType === 'nft-otc' && (
                        <div className="nft-card-box">
                          <div className="nft-card-head">
                            <span>{request.nftCollection || 'NFT asset'}</span>
                            <strong>{request.nftChain ?? 'Arc Testnet'} / Token #{request.nftTokenId}</strong>
                          </div>
                          <div className="nft-card-meta">
                            <span>Contract</span>
                            <code>{request.nftContract ? `${request.nftContract.slice(0, 8)}...${request.nftContract.slice(-6)}` : 'Not set'}</code>
                          </div>
                          {request.nftSeller && (
                            <div className="nft-card-meta">
                              <span>Expected seller</span>
                              <code>{request.nftSeller.slice(0, 8)}...{request.nftSeller.slice(-6)}</code>
                            </div>
                          )}
                          <div className="nft-auth-note">Authenticity should be verified with ownerOf(tokenId), official contract address, and escrow approval.</div>
                        </div>
                      )}
                      <div className="market-deliverable">
                        <span>{dealType === 'nft-otc' ? 'Seller must provide' : 'Deliverable'}</span>
                        <strong>{request.deliverable}</strong>
                      </div>
                      <div className="market-role-next">
                        <div>
                          <span>Your role</span>
                          <strong>{cardRole}</strong>
                        </div>
                        <div>
                          <span>Next action</span>
                          <strong>{nextStep}</strong>
                        </div>
                      </div>
                      <div className="market-card-progress" aria-label="Request workflow progress">
                        {flowSteps.map((step, i) => (
                          <div className={`market-progress-step ${step.done ? 'done' : ''}`} key={step.label}>
                            <span>{i + 1}</span>
                            <strong>{step.label}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="market-meta-row">
                        <span>Client {request.client.startsWith('0x') ? `${request.client.slice(0, 6)}...${request.client.slice(-4)}` : request.client}</span>
                        <span>{request.deadlineDays} days</span>
                      </div>
                      <div className="market-meta-row">
                        <span>Visible {request.listingDays ?? '3'} days</span>
                        <span>{formatTimeLeft(request.expiresAt)}</span>
                      </div>
                      <div className="market-meta-row">
                        <span>Listing fee</span>
                        <strong>{request.listingFee ?? getListingFee(request.listingDays ?? '3')} USDC</strong>
                      </div>
                      {request.agent && (
                        <div className="market-meta-row agent">
                          <span>Matched agent</span>
                          <strong>{request.agent.slice(0, 6)}...{request.agent.slice(-4)}</strong>
                        </div>
                      )}
                      {request.escrowJobId && (
                        <div className="market-meta-row agent">
                          <span>Escrow job</span>
                          <strong>#{request.escrowJobId}</strong>
                        </div>
                      )}
                      <div className="market-card-actions">
                        {isCompleted ? (
                          <span className="deal-complete-badge">
                            {dealType === 'nft-otc'
                              ? (isOwner ? 'NFT received' : isAgent ? 'USDC received' : 'Deal settled')
                              : 'Deal complete'}
                          </span>
                        ) : isCancelled ? (
                          <span className="deal-cancelled-badge">Cancelled — refund processed</span>
                        ) : (
                          <>
                            {/* Accept / Claim on-chain — only for open requests, not owner */}
                            {!isCancelled && (
                              <button className="btn-outline"
                                onClick={() => acceptMarketRequest(request.id, dealType, request.escrowJobId)}
                                disabled={!isConnected || marketLoading || request.status !== 'open' || isOwner || !request.escrowJobId}>
                                {request.status === 'open' ? 'Accept & Claim' : 'Matched'}
                              </button>
                            )}
                            {/* Cancel — only owner, only while open or matched */}
                            {isOwner && !isCancelled && (request.status === 'open' || request.status === 'matched') && (
                              <button className="btn-ghost"
                                onClick={() => cancelMarketRequest(request.id, dealType, request.escrowJobId)}
                                disabled={marketLoading}
                                title={request.status === 'matched' ? '5% cancellation fee goes to matched worker' : 'Full refund'}>
                                {request.status === 'matched' ? 'Cancel (5% fee)' : 'Cancel'}
                              </button>
                            )}
                            {/* NFT OTC seller actions — shown in the card to the matched seller */}
                            {dealType === 'nft-otc' && isAgent && request.status === 'matched' && request.escrowJobId && (
                              <>
                                <button className="btn-outline"
                                  onClick={() => approveNftForEscrow(request.nftContract ?? '', request.nftTokenId ?? '')}>
                                  Approve NFT
                                </button>
                                <button className="btn-primary"
                                  onClick={() => settleNftOtcDeal(request.id, request.escrowJobId!)}>
                                  Settle Deal
                                </button>
                              </>
                            )}
                            {/* Work/Milestone: agent submits result */}
                            {dealType !== 'nft-otc' && isAgent && request.escrowJobId && request.status === 'matched' && (
                              <button className="btn-primary" onClick={() => openEscrowSubmission(request)}>
                                Submit Result
                              </button>
                            )}
                            {isExpiredRequest && (
                              <button className="btn-ghost" onClick={() => deleteExpiredMarketRequest(request.id)} disabled={marketLoading}>
                                Remove expired
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </section>
              </>
            )}


          </div>
        )}

        {activePage === 'escrow' && (
          <div className="page escrow-page">
            <div className="page-header">
              <Bot size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Escrow & Settlement</h2>
                <p className="page-sub">Manage ArcEscrow jobs, ERC-8183 agentic contracts, and NFT OTC deals on Arc Testnet.</p>
              </div>
            </div>
            <div className="section-layout">
              <div className="section-main">
                <div className="panel">
                  <div className="escrow-workspace-head">
                    <div>
                      <span>Escrow Workspace</span>
                      <strong>Look up and manage on-chain escrow jobs. New requests are posted from the Marketplace.</strong>
                    </div>
                    <button className="btn-outline" onClick={() => navigatePage('marketplace')}>
                      <BookUser size={13} /> Open Requests
                    </button>
                  </div>
                  <div className="escrow-protocol-tabs">
                    <button
                      className={`escrow-protocol-tab ${escrowProtocol === 'arc-escrow' ? 'active' : ''}`}
                      onClick={() => setEscrowProtocol('arc-escrow')}>
                      <Lock size={12} /> ArcEscrow
                    </button>
                    <button
                      className={`escrow-protocol-tab ${escrowProtocol === 'erc8183' ? 'active' : ''}`}
                      onClick={() => setEscrowProtocol('erc8183')}>
                      <Bot size={12} /> ERC-8183
                    </button>
                  </div>
                  {escrowProtocol === 'arc-escrow' ? (
                    <div className="escrow-flow-note">
                      <div><span>01</span><strong>USDC locked at post</strong></div>
                      <div><span>02</span><strong>Worker claims on-chain</strong></div>
                      <div><span>03</span><strong>Worker submits result</strong></div>
                      <div><span>04</span><strong>AI review + release</strong></div>
                    </div>
                  ) : (
                    <div className="escrow-flow-note">
                      <div><span>01</span><strong>createJob</strong></div>
                      <div><span>02</span><strong>setBudget + fund</strong></div>
                      <div><span>03</span><strong>submit</strong></div>
                      <div><span>04</span><strong>complete</strong></div>
                    </div>
                  )}

                  {escrowProtocol === 'erc8183' && (
                    <div className="e8183-panel">
                      <div className="e8183-tabs">
                        <button className={e8183Tab === 'create' ? 'active' : ''} onClick={() => setE8183Tab('create')}>+ Create Job</button>
                        <button className={e8183Tab === 'lookup' ? 'active' : ''} onClick={() => setE8183Tab('lookup')}>Lookup / Manage</button>
                      </div>

                      {e8183Tab === 'create' ? (
                        <div className="e8183-form">
                          <div className="escrow-form-group">
                            <label>Worker payout wallet</label>
                            <small className="field-helper">Choose where the worker payout should go after the client approves the result.</small>
                            <div className="wallet-receive-toggle">
                              <button className={e8183PayoutMode === 'connected' ? 'active' : ''} onClick={() => setE8183PayoutMode('connected')}>
                                Connected wallet
                              </button>
                              <button className={e8183PayoutMode === 'custom' ? 'active' : ''} onClick={() => setE8183PayoutMode('custom')}>
                                Different wallet
                              </button>
                            </div>
                            {e8183PayoutMode === 'connected' ? (
                              <div className={`connected-wallet-card ${activeWallet ? '' : 'empty'}`}>
                                <Wallet size={15} />
                                <div>
                                  <strong>{activeWallet ? activeWalletShort : 'No wallet connected'}</strong>
                                  <span>{activeWallet ? 'This connected wallet will receive USDC.' : 'Connect a wallet first, or choose a different wallet.'}</span>
                                </div>
                              </div>
                            ) : (
                              <input className="action-input" placeholder="0x..." value={e8183Provider}
                                onChange={(e) => setE8183Provider(e.target.value)} />
                            )}
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
                            ERC-8183 is Arc's official agentic commerce standard for autonomous job-based payments.
                            Requests from the marketplace automatically route through ArcEscrow.
                            Use this tab to directly test the ERC-8183 interface or integrate agent-based automation.
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
                      <button className={escrowMyTab === 'jobs' ? 'active' : ''} onClick={() => setEscrowMyTab('jobs')}>
                        My Jobs {recentJobIds.length > 0 && <span className="escrow-badge-count">{recentJobIds.length}</span>}
                      </button>
                      <button className={escrowMyTab === 'new' ? 'active' : ''} onClick={() => setEscrowMyTab('new')}>
                        Advanced Manual Escrow
                      </button>
                    </div>

                    {escrowMyTab === 'new' ? (
                      <div className="escrow-form">
                        <div className="manual-escrow-note">
                          <strong>Manual mode</strong>
                          <span>This is mainly for testing a raw ArcEscrow job. Normal users should start from Requests so the worker match, escrow job, submission, and activity stay connected.</span>
                        </div>
                        <div className="escrow-form-group">
                          <label>Worker payout wallet</label>
                          <small className="field-helper">Enter the wallet address of the person who should receive USDC after approval. In normal Requests flow, this is filled from the accepted worker.</small>
                          <div className="wallet-receive-toggle">
                            <button className={escrowPayoutMode === 'connected' ? 'active' : ''} onClick={() => setEscrowPayoutMode('connected')}>
                              Connected wallet
                            </button>
                            <button className={escrowPayoutMode === 'custom' ? 'active' : ''} onClick={() => setEscrowPayoutMode('custom')}>
                              Different wallet
                            </button>
                          </div>
                          {escrowPayoutMode === 'connected' ? (
                            <div className={`connected-wallet-card ${activeWallet ? '' : 'empty'}`}>
                              <Wallet size={15} />
                              <div>
                                <strong>{activeWallet ? activeWalletShort : 'No wallet connected'}</strong>
                                <span>{activeWallet ? 'This connected wallet will receive USDC.' : 'Connect a wallet first, or choose a different wallet.'}</span>
                              </div>
                            </div>
                          ) : (
                            <input className="action-input" placeholder="0x..." value={escrowAgent}
                              onChange={(e) => setEscrowAgent(e.target.value)} />
                          )}
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
                        <div className="escrow-hint">USDC stays in the ArcEscrow contract. The worker cannot receive it until you approve the submitted result.</div>
                      </div>
                    ) : (
                      <div className="escrow-jobs-panel">
                        {escrowRelatedRequests.length > 0 && (
                          <div className="matched-request-jobs">
                            <span>Request-linked jobs</span>
                            {escrowRelatedRequests.map((request) => {
                              const isOwner = activeWallet?.toLowerCase() === request.client.toLowerCase()
                              const isWorker = activeWallet && request.agent?.toLowerCase() === activeWallet.toLowerCase()
                              return (
                                <div className="matched-request-job" key={request.id}>
                                  <div>
                                    <strong>{request.escrowJobId ? `Job #${request.escrowJobId}` : 'Matched request'}</strong>
                                    <small>{request.title}</small>
                                  </div>
                                  {request.escrowJobId ? (
                                    <button onClick={() => escrowLookupJob(Number(request.escrowJobId))}>View</button>
                                  ) : (
                                    <button onClick={() => viewRequestEscrow(request)} disabled={!request.escrowJobId}>View escrow</button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {recentJobIds.length > 0 && (
                          <div className="escrow-job-list">
                            {recentJobIds.map(id => (
                              <button key={id}
                                className={`escrow-job-row ${escrowJobId === String(id) ? 'selected' : ''}`}
                                onClick={() => {
                                  if (escrowJobId === String(id) && escrowJob) {
                                    setEscrowJob(null)
                                    setEscrowJobId('')
                                    setAiVerdict(null)
                                  } else {
                                    void escrowLookupJob(id)
                                  }
                                }}>
                                <span className="escrow-job-row-id">#{id}</span>
                                <span className="escrow-job-row-label">Job #{id}</span>
                                <span className="escrow-job-row-arrow">{escrowJobId === String(id) && escrowJob ? 'Hide' : 'View'}</span>
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
                                    {isClient ? 'Client' : isAgent ? 'Worker' : 'Observer'}
                                  </span>
                                </div>
                              </div>

                              <div className="escrow-detail-addrs">
                                <div><span>Client</span><code>{escrowJob.client.slice(0,8)}…{escrowJob.client.slice(-6)}</code></div>
                                <div><span>Worker</span><code>{escrowJob.agent.slice(0,8)}…{escrowJob.agent.slice(-6)}</code></div>
                              </div>

                              <div className={`escrow-role-banner ${isClient ? 'client' : isAgent ? 'worker' : 'observer'}`}>
                                <span>{isClient ? 'Client action' : isAgent ? 'Worker action' : 'Observer view'}</span>
                                <strong>
                                  {isClient
                                    ? escrowJob.status === 1 ? 'Review the submitted result, run AI review, then release or wait.'
                                      : escrowJob.status === 0 ? 'Escrow is funded. Wait for the worker to submit a result.'
                                      : 'This escrow is no longer waiting for client action.'
                                    : isAgent
                                      ? escrowJob.status === 0 ? 'Submit your completed work to request payment.'
                                        : escrowJob.status === 1 ? 'Result submitted. Wait for client review.'
                                        : 'This escrow is no longer waiting for worker action.'
                                      : 'Connect the client or worker wallet to take action on this escrow.'}
                                </strong>
                              </div>

                              {escrowJob.resultUri && (
                                <div className="escrow-result-actions">
                                  <button className="escrow-result-link" onClick={() => openResultPreview(escrowJob.resultUri)}>
                                    View Result
                                  </button>
                                  <a className="escrow-result-raw" href={escrowJob.resultUri} target="_blank" rel="noreferrer" title="Open raw result">
                                    <ExternalLink size={13} />
                                  </a>
                                </div>
                              )}

                              <div className="escrow-actions">
                                {escrowJob.status === 0 && !expired && !isAgent && (
                                  <div className="escrow-action-group escrow-waiting-panel">
                                    <div className="escrow-submit-label">Waiting for worker result</div>
                                    <p>
                                      The submit form is only shown to the worker wallet:
                                      <code>{escrowJob.agent.slice(0, 8)}...{escrowJob.agent.slice(-6)}</code>
                                    </p>
                                    {isClient ? (
                                      <small>You are connected as the client. The client funds escrow and releases payment after review, but cannot submit the worker result.</small>
                                    ) : (
                                      <small>Connect the matched worker wallet to submit the deliverable for this job.</small>
                                    )}
                                  </div>
                                )}

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
                                        <div className="escrow-verdict-note">
                                          Claude is advisory only. The client can still inspect the submitted result and release payment manually.
                                        </div>
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
                  <div className="sidebar-card-title"><Check size={13} /> Escrow Steps</div>
                  <div className="demo-checklist">
                    {[
                      { label: 'Connect wallet on Arc Testnet', done: isConnected && activeChainId === arcTestnet.id },
                      { label: 'Post request — USDC locked at creation', done: recentJobIds.length > 0 },
                      { label: 'Worker calls claimJob on-chain', done: Boolean(escrowJob?.agent && escrowJob.agent !== '0x0000000000000000000000000000000000000000') },
                      { label: 'Worker submits result (Vercel Blob URI)', done: Boolean(escrowJob?.resultUri) },
                      { label: 'AI review → client releases USDC', done: Boolean(escrowJob?.status && escrowJob.status >= 2) },
                    ].map((item, i) => (
                      <div key={i} className={`checklist-item ${item.done ? 'done' : ''}`}>
                        <span className="checklist-icon">{item.done ? '✓' : ''}</span>
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
                      <div className="contract-name">NFTOTCEscrow</div>
                      <div className="contract-chain">Arc Testnet · NFT OTC</div>
                      <a className="contract-addr" href={`https://testnet.arcscan.app/address/${NFT_OTC_ESCROW}`} target="_blank" rel="noreferrer">
                        {NFT_OTC_ESCROW.slice(0,8)}…{NFT_OTC_ESCROW.slice(-6)} <ExternalLink size={10} />
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
                <p className="page-sub">Circle CCTP V2 bridge (0 slippage) · LI.FI cross-chain swap · Direct USDC send to Arc</p>
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
                <h2 className="page-title">Settlement Activity</h2>
                <p className="page-sub">On-chain settlement history — USDC releases, refunds, NFT OTC settlements, and bridge activity.</p>
              </div>
            </div>
            <div className="activity-summary-grid">
              <div className="activity-summary-card primary">
                <span>Completed settlements</span>
                <strong>{completedSettlementCount}</strong>
                <small>Released payments or refunds recorded locally</small>
              </div>
              <div className="activity-summary-card">
                <span>Escrow events</span>
                <strong>{settlementHistory.length}</strong>
                <small>Funding, submission, release, and refund actions</small>
              </div>
              <div className="activity-summary-card">
                <span>All movement</span>
                <strong>{history.length}</strong>
                <small>Bridge, send, swap, cross-chain, and escrow actions</small>
              </div>
            </div>
            <div className="activity-ledger">
              <div className="activity-ledger-head">
                <div>
                  <span>Primary ledger</span>
                  <strong>Escrow settlement history</strong>
                </div>
                <button className="btn-outline" onClick={() => navigatePage('marketplace')}>
                  <BookUser size={13} /> Open Requests
                </button>
              </div>
              <div className="history-list">
                {settlementHistory.length === 0 ? (
                  <div className="activity-empty">
                    <ShieldCheck size={36} strokeWidth={1.2} style={{ opacity: 0.35 }} />
                    <p>No escrow settlements yet</p>
                    <p style={{ opacity: 0.6, fontSize: 'var(--text-xs)' }}>Fund an escrow, submit work, release payment, or claim a refund to build the settlement ledger.</p>
                  </div>
                ) : settlementHistory.map((h, i) => {
                  return (
                    <div key={i} className={`history-row ${h.status}`}>
                      <div className="history-left">
                        <span className={`history-icon ${h.type}`}><Lock size={14} /></span>
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
            {history.some((h) => h.type !== 'escrow') && (
              <div className="activity-supporting">
                <div className="activity-ledger-head compact">
                  <div>
                    <span>Supporting movement</span>
                    <strong>Bridge, swap, send, and route history</strong>
                  </div>
                </div>
                <div className="history-list">
                  {history.filter((h) => h.type !== 'escrow').map((h, i) => {
                    const iconMap = { swap: <Repeat2 size={14} />, bridge: <Layers size={14} />, send: <ArrowUpRight size={14} />, cross: <Zap size={14} />, escrow: <Lock size={14} /> }
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
            )}
          </div>
        )}

        {/* ─── DOCS ─── */}
        {activePage === 'docs' && (
          <div className="page docs-page">
            <div className="page-header">
              <BookOpen size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="page-title">Docs & Contracts</h2>
                <p className="page-sub">Live Arc Testnet contracts, Circle CCTP infrastructure, ERC-8183 agentic commerce standard, and resources</p>
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
                    <div className="contract-name">NFTOTCEscrow</div>
                    <div className="contract-chain">Arc Testnet · NFT OTC settlement</div>
                    <a className="contract-addr" href={`https://testnet.arcscan.app/address/${NFT_OTC_ESCROW}`} target="_blank" rel="noreferrer">
                      {NFT_OTC_ESCROW} <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="contract-item">
                    <div className="contract-name">ERC-8183 AgenticCommerce</div>
                    <div className="contract-chain">Arc Testnet · official agentic standard</div>
                    <a className="contract-addr" href={`https://testnet.arcscan.app/address/${ERC8183_CONTRACT}`} target="_blank" rel="noreferrer">
                      {ERC8183_CONTRACT} <ExternalLink size={10} />
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
                <div className="docs-section-title">Gateway Nanopayments Direction</div>
                <div className="docs-note-list">
                  <p>Use two payment lanes instead of forcing every action into escrow:</p>
                  <span>1. ArcEscrow holds the main request reward until the client approves the submitted result.</span>
                  <span>2. Gateway/x402 can meter small usage around the job: listing extensions, AI review, paid APIs, premium unlocks, and agent tool calls.</span>
                  <span>3. Buyers keep a Gateway balance, sign offchain payment authorizations, and settlement can be batched instead of paying gas per tiny action.</span>
                  <span>4. The product pitch becomes outcome escrow plus usage-priced agent commerce on Arc.</span>
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
                  <a className="docs-link" href="https://developers.circle.com/w3s/programmable-wallets" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Circle Programmable Wallets
                  </a>
                  <a className="docs-link" href="https://eips.ethereum.org/EIPS/eip-8183" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> ERC-8183 Agentic Commerce
                  </a>
                  <a className="docs-link" href="https://docs.arc.network" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Arc Network Docs
                  </a>
                  <a className="docs-link" href="https://github.com/ds4316/usdc-portal" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> GitHub Repository
                  </a>
                </div>
              </div>

              <div className="docs-section">
                <div className="docs-section-title">ERC-8183 Standard</div>
                <div className="docs-note-list">
                  <p>Arc adopts ERC-8183 as the agentic commerce standard. This app implements it alongside custom ArcEscrow contracts:</p>
                  <span>1. <strong>createJob</strong> — client defines task, evaluator, expiry, and optional hook</span>
                  <span>2. <strong>setBudget + fund</strong> — USDC locked in escrow via ERC-20 approval</span>
                  <span>3. <strong>submit</strong> — worker posts deliverable as bytes32 hash on-chain</span>
                  <span>4. <strong>complete</strong> — evaluator (or AI) approves and releases USDC to worker</span>
                  <a className="docs-link" href="https://eips.ethereum.org/EIPS/eip-8183" target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> ERC-8183 Specification
                  </a>
                </div>
              </div>

              <div className="docs-section">
                <div className="docs-section-title">NFT OTC Settlement</div>
                <div className="docs-note-list">
                  <p>Atomic NFT ↔ USDC swap via NFTOTCEscrow:</p>
                  <span>1. Buyer posts deal with USDC locked immediately (seller=0x0 for open market)</span>
                  <span>2. NFT holder calls <strong>claimDeal</strong> — ownerOf check proves ownership on-chain</span>
                  <span>3. Seller calls <strong>approve</strong> on NFT contract (NFTOTCEscrow as spender)</span>
                  <span>4. Either party calls <strong>settle</strong> — NFT transfers to buyer, USDC releases to seller atomically</span>
                </div>
              </div>

              <div className="docs-section docs-hackathon">
                <div className="docs-section-title">Circle + Arc · Feature Map</div>
                <div className="docs-feature-map">
                  {([
                    { tool: 'Circle CCTP V2', usage: 'Sepolia → Arc bridge, 0 slippage', page: 'funds', badge: 'Live' },
                    { tool: 'Circle USDC', usage: 'Settlement asset for all escrow flows', page: 'marketplace', badge: 'Live' },
                    { tool: 'Circle App Kit', usage: 'Wallet connect, chain switching, UI', page: 'overview', badge: 'Live' },
                    { tool: 'Circle Programmable Wallets', usage: 'Server-controlled agent wallets (custodial)', page: 'docs', badge: 'UI' },
                    { tool: 'Circle Gateway / x402', usage: 'Nanopayment layer for micropayments', page: 'marketplace', badge: 'Arch' },
                    { tool: 'ArcEscrow', usage: 'Work + Milestone escrow, AI release', page: 'escrow', badge: 'Live' },
                    { tool: 'NFTOTCEscrow', usage: 'Atomic NFT ↔ USDC atomic swap', page: 'marketplace', badge: 'Live' },
                    { tool: 'ERC-8183', usage: 'Arc agentic commerce standard', page: 'escrow', badge: 'Live' },
                    { tool: 'Claude Haiku AI', usage: 'Deliverable evaluation before payout', page: 'escrow', badge: 'Live' },
                    { tool: 'Vercel Blob', usage: 'Work result storage (URI proof on-chain)', page: 'escrow', badge: 'Live' },
                  ] as const).map((item, i) => (
                    <div key={i} className="docs-feature-row">
                      <span className={`docs-feature-badge ${item.badge.toLowerCase()}`}>{item.badge}</span>
                      <div className="docs-feature-name">{item.tool}</div>
                      <div className="docs-feature-usage">{item.usage}</div>
                      <button className="docs-feature-goto" onClick={() => navigatePage(item.page as Parameters<typeof navigatePage>[0])}>
                        Try → <ExternalLink size={10} />
                      </button>
                    </div>
                  ))}
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
              ArcEscrow Market
            </span>
            <span className="footer-tag">Arc × Circle Stablecoin Hackathon · Agentic Commerce Track</span>
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
