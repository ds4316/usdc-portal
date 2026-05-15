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

interface Contact { id: string; name: string; address: string }
const CONTACTS_KEY = 'usdc_portal_contacts'
function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? '[]') } catch { return [] }
}
function saveContacts(c: Contact[]) { localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)) }

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
  { chain: 'Arc Testnet', chainId: arcTestnet.id, name: 'Circle Faucet', url: 'https://faucet.circle.com',
    tokens: ['USDC'], desc: 'Official Circle faucet ??Arc Testnet USDC', cooldownHours: 24,
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

// ??? ?濡쒓렇?섑뵿 鍮꾩＜??????????????????????????????????????????????????????
function HolographicArcVisual() {
  return (
    <div className="hologram-wrap">
      <div className="hologram-glow" />
      <div className="hologram-core">
        <div className="hologram-ring ring-1" />
        <div className="hologram-ring ring-2" />
        <div className="hologram-ring ring-3" />
        <div className="hologram-center">
          <div className="hologram-arc-label">ARC</div>
          <div className="hologram-usdc-label">USDC</div>
        </div>
        <div className="hologram-orbit orbit-cw">
          <div className="hologram-node node-top counter-cw"><span>USDC</span></div>
          <div className="hologram-node node-bottom counter-cw"><span>ETH</span></div>
        </div>
        <div className="hologram-orbit orbit-ccw">
          <div className="hologram-node node-top counter-ccw"><span>AI</span></div>
          <div className="hologram-node node-bottom counter-ccw"><span>CCTP</span></div>
        </div>
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
  const [activePage, setActivePage] = useState<'overview' | 'escrow' | 'funds' | 'portfolio' | 'activity' | 'docs'>('overview')

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
  const [recentJobIds,   setRecentJobIds]   = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('arc_escrow_jobs') ?? '[]') } catch { return [] }
  })
  const [sortBy, setSortBy]         = useState<'value' | 'symbol' | 'chain'>('value')

  const [assets, setAssets]         = useState<AssetRow[]>([])
  const [prices, setPrices]         = useState<Record<string, PriceData>>({})
  const [totalUsdc, setTotalUsdc]   = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
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

  // ??? Toast ?ы띁 ??????????????????????????????????????????????????????????
  function addToast(t: Omit<Toast, 'id'>): string {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    if (t.type !== 'loading') setTimeout(() => removeToast(id), 5000)
    return id
  }
  function removeToast(id: string) { setToasts((prev) => prev.filter((x) => x.id !== id)) }
  // updateToast available for future use
  // function updateToast(id: string, t: Partial<Toast>) { ... }

  useEffect(() => { localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('networkMode', networkMode) }, [networkMode])
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
      const rows: AssetRow[] = []
      for (const address of allAddresses) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`
        for (const chain of CHAINS) {
          const client = publicClients[chain.id]
          try {
            const bal = await client.getBalance({ address })
            if (bal > 0n) {
              const isArc  = chain.id === arcTestnet.id
              const isPoly = chain.id === polygon.id
              const isAvax = chain.id === avalanche.id
              rows.push({
                wallet: shortAddr, chain: chain.id,
                symbol: isArc ? 'USDC (gas)' : isPoly ? 'POL' : isAvax ? 'AVAX' : 'ETH',
                balance: parseFloat(formatUnits(bal, 18)).toFixed(6), usdcValue: '0', change24h: 0,
                coingeckoId: isArc ? 'usd-coin' : isPoly ? 'matic-network' : isAvax ? 'avalanche-2' : 'ethereum',
              })
            }
          } catch { /* ignore */ }
          for (const token of TOKENS[chain.id] ?? []) {
            try {
              const bal = await client.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
              if ((bal as bigint) > 0n)
                rows.push({ wallet: shortAddr, chain: chain.id, symbol: token.symbol, change24h: 0,
                  balance: parseFloat(formatUnits(bal as bigint, token.decimals)).toFixed(6),
                  usdcValue: '0', coingeckoId: token.coingeckoId })
            } catch { /* ignore */ }
          }
        }
      }
      const ids = [...new Set(rows.map((r) => r.coingeckoId))]
      const priceMap = await fetchPrices(ids)
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

      // ?? Step 5: Circle Attestation API ?대쭅 ?????????????????????????
      setCctpStep('attesting')
      addToast({ type: 'loading', message: '3/4 Waiting Circle attestation...' })
      let attestation = ''
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const res  = await fetch(`https://iris-api-sandbox.circle.com/v1/attestations/${messageHash}`)
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
      addToast({ type: 'success', message: `${cctpAmount} USDC arrived on Arc!`, txHash: burnHash })
      setCctpAmount('')

    } catch (e: unknown) {
      setCctpStep('error')
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Bridge failed' })
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
    { id: 'escrow'    as const, label: 'Agent Escrow', icon: <Lock size={13} /> },
    { id: 'funds'     as const, label: 'Move Funds',   icon: <ArrowRightLeft size={13} /> },
    { id: 'portfolio' as const, label: 'Portfolio',    icon: <Wallet size={13} /> },
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
        {activePage === 'overview' && (
          <div className="page overview-page">

            <div className="ov-hero">
              <div className="ov-hero-left">
                <div className="ov-badge">Circle + Arc Stablecoin Commerce · Agentic Economy Track</div>
                <h1 className="ov-title">Agentic USDC<br />payments on Arc</h1>
                <p className="ov-sub">
                  Trustless escrow for AI agent workflows. Lock USDC, submit work on-chain,
                  get AI-verified payouts — fully on-chain on Arc Testnet.
                </p>
                <div className="ov-status-row">
                  <span className="status-dot green" /><span>ArcEscrow live</span>
                  <span className="ov-status-sep" />
                  <span className="status-dot green" /><span>CCTP V2 active</span>
                  <span className="ov-status-sep" />
                  <span className="status-dot green" /><span>Claude Haiku ready</span>
                  {isConnected && <><span className="ov-status-sep" /><span className="status-dot green" /><span className="ov-wallet-addr">{allAddresses[0]?.slice(0,6)}…{allAddresses[0]?.slice(-4)} connected</span></>}
                </div>
                <div className="ov-ctas">
                  <button className="btn-primary ov-cta" onClick={() => setActivePage('escrow')}>
                    <Lock size={14} /> Try Agent Escrow
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
              <div className="ov-hero-right">
                <HolographicArcVisual />
              </div>
            </div>

            <div className="ov-section">
              <div className="ov-section-label">How It Works</div>
              <div className="workflow-steps">
                {[
                  { icon: <Lock size={20} />, step: 'Lock', desc: 'Client locks USDC in ArcEscrow contract on Arc Testnet' },
                  { icon: <Upload size={20} />, step: 'Submit', desc: 'AI agent completes work and submits result URI on-chain' },
                  { icon: <Bot size={20} />, step: 'Review', desc: 'Claude Haiku reads the deliverable and returns a verdict' },
                  { icon: <CircleDollarSign size={20} />, step: 'Payout', desc: 'Client releases — USDC transferred trustlessly to agent' },
                ].map((s, i) => (
                  <div key={i} className="workflow-step-wrap">
                    <div className="workflow-step">
                      <div className="workflow-step-icon icon-badge">{s.icon}</div>
                      <div className="workflow-step-label">{s.step}</div>
                      <div className="workflow-step-desc">{s.desc}</div>
                    </div>
                    {i < 3 && <div className="workflow-arrow"><ArrowRight size={18} /></div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="ov-section">
              <div className="ov-section-label">What Agents Can Do</div>
              <div className="agent-use-cases">
                {[
                  { icon: <Bot size={18} />, title: 'Code Generation', desc: 'Agent writes code, submits on-chain. Client reviews output via ArcScan link.' },
                  { icon: <Upload size={18} />, title: 'Research & Reports', desc: 'Agent delivers PDF/text reports via Vercel Blob. Claude Haiku verifies completeness.' },
                  { icon: <Lock size={18} />, title: 'Trustless Milestones', desc: 'Multi-step deliverables locked at project start, released on AI-verified completion.' },
                  { icon: <Network size={18} />, title: 'Cross-chain Payroll', desc: 'Move USDC from any mainnet chain to Arc for agent payouts via CCTP V2 or LI.FI.' },
                ].map((uc, i) => (
                  <div key={i} className="agent-use-case">
                    <div className="agent-uc-icon">{uc.icon}</div>
                    <div className="agent-uc-title">{uc.title}</div>
                    <div className="agent-uc-desc">{uc.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ov-section">
              <div className="ov-section-label">Built With</div>
              <div className="stack-cards">
                {[
                  { name: 'Arc Testnet',    desc: 'EVM-compatible chain for stablecoin commerce', color: '#00c2ff' },
                  { name: 'Circle CCTP V2', desc: 'Native USDC burn-and-mint bridge, 0 slippage',  color: '#2775ca' },
                  { name: 'Claude Haiku',   desc: 'AI judge that reads work results and verdicts',  color: '#d4a574' },
                  { name: 'wagmi + viem',   desc: 'Type-safe Ethereum wallet & contract layer',     color: '#627eea' },
                  { name: 'LI.FI',          desc: 'Cross-chain routing across 6 mainnet chains',    color: '#bf5af2' },
                  { name: 'Vercel Blob',    desc: 'Serverless storage for agent work results',      color: '#555'    },
                ].map((s, i) => (
                  <div key={i} className="stack-card">
                    <div className="stack-card-dot" style={{ background: s.color }} />
                    <div className="stack-card-name">{s.name}</div>
                    <div className="stack-card-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ─── AGENT ESCROW ─── */}
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
                  <div className="escrow-board">
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
                    {cctpStep === 'done' ? (
                      <div className="cctp-done">
                        <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Bridged to Arc!</div>
                        <div style={{ opacity: 0.5, fontSize: 'var(--text-xs)' }}>{cctpAmount} USDC → Arc Testnet</div>
                        <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => { setCctpStep('idle'); setCctpBurnHash('') }}>
                          Bridge again
                        </button>
                      </div>
                    ) : <>
                      <div className="cctp-balance-row">
                        <div className="cctp-bal-item">
                          <span className="cctp-bal-chain">
                            <span className="arc-dot" style={{ background: '#627eea' }} /> Sepolia
                          </span>
                          <span className="cctp-bal-val">
                            {(() => {
                              const a = assets.find(x => x.chain === 11155111 && x.symbol === 'USDC')
                              return a ? `${parseFloat(a.balance).toFixed(2)} USDC` : '—'
                            })()}
                          </span>
                        </div>
                        <div className="cctp-bal-arrow">→</div>
                        <div className="cctp-bal-item">
                          <span className="cctp-bal-chain">
                            <span className="arc-dot" style={{ background: '#00c2ff' }} /> Arc Testnet
                          </span>
                          <span className="cctp-bal-val">
                            {(() => {
                              const a = assets.find(x => x.chain === 5042002 && x.symbol === 'USDC')
                              return a ? `${parseFloat(a.balance).toFixed(2)} USDC` : '—'
                            })()}
                          </span>
                        </div>
                        {loadingAssets && <span className="cctp-bal-loading"><RefreshCw size={10} /></span>}
                      </div>
                      <label className="input-label">Amount (USDC)</label>
                      <input className="action-input" type="number" placeholder="0.0"
                        value={cctpAmount} onChange={(e) => setCctpAmount(e.target.value)}
                        disabled={cctpStep !== 'idle'} />
                      <label className="input-label">Arc recipient (optional)</label>
                      <input className="action-input" placeholder="0x… (default: your wallet)"
                        value={cctpRecipient} onChange={(e) => setCctpRecipient(e.target.value)}
                        disabled={cctpStep !== 'idle'} />
                      <button className="btn-primary" style={{ marginTop: 4 }}
                        onClick={executeCCTPBridge}
                        disabled={cctpStep !== 'idle' && cctpStep !== 'error'}>
                        {cctpStep === 'idle'      ? 'Bridge to Arc'          :
                         cctpStep === 'approving' ? 'Approving USDC...'      :
                         cctpStep === 'burning'   ? 'Burning on Sepolia...'  :
                         cctpStep === 'attesting' ? 'Waiting Circle attestation...' :
                         cctpStep === 'minting'   ? 'Minting on Arc...'      :
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
                        Official Circle bridge · 0 slippage · 1:1 mint
                      </div>
                      {cctpBurnHash && (
                        <a className="cctp-tx-link" href={`https://sepolia.etherscan.io/tx/${cctpBurnHash}`} target="_blank" rel="noreferrer">
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
                        { id: 'matic-network', label: 'POL'  },
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
