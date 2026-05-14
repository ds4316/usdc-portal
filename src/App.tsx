import { useState, useEffect, useCallback, useRef } from 'react'
import { useConnect, useDisconnect, useConnections, useSwitchChain, useSendTransaction } from 'wagmi'
import { createPublicClient, fallback, http, formatUnits, isAddress } from 'viem'
import { mainnet, base, polygon, arbitrum, optimism, avalanche, sepolia, baseSepolia } from 'wagmi/chains'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import {
  Sun, Moon, Plus, X, RefreshCw, ArrowRight, Copy, Check,
  Wallet, ExternalLink, AlertTriangle, QrCode, ChevronDown,
  ArrowUpRight, ArrowDownLeft, Repeat2, Layers, BookUser,
  Fuel, Trash2, Download, Zap
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { arcTestnet } from './wagmi.config'
import './App.css'

const kit = new AppKit()

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// ─── USDCPaymentHub 컨트랙트 ──────────────────────────────────────────────
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

// ─── 체인 메타 ────────────────────────────────────────────────────────────
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

// LI.FI에서 사용할 EVM 체인 목록 (테스트넷 제외)
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

// ─── 가격 API ─────────────────────────────────────────────────────────────
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

// ─── 타입 ─────────────────────────────────────────────────────────────────
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

type FaucetPollState = 'idle' | 'polling' | 'received'

// 주소록
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

type NetworkMode = 'mainnet' | 'testnet'
type ActionTab = 'swap' | 'bridge' | 'send' | 'cross' | 'pay'
type MainTab = 'assets' | 'history' | 'faucet'
type Theme = 'dark' | 'light'

const MAINNET_IDS = new Set<number>([mainnet.id, base.id, polygon.id, arbitrum.id, optimism.id, avalanche.id])
const TESTNET_IDS = new Set<number>([arcTestnet.id, sepolia.id, baseSepolia.id])

interface FaucetInfo {
  chain: string; chainId: number; name: string; url: string
  tokens: string[]; desc: string; cooldownHours: number
  pollToken?: { address: `0x${string}`; decimals: number } | 'native'
}

const FAUCETS: FaucetInfo[] = [
  { chain: 'Arc Testnet', chainId: arcTestnet.id, name: 'Circle Faucet', url: 'https://faucet.circle.com',
    tokens: ['USDC'], desc: 'Official Circle faucet — Arc Testnet USDC', cooldownHours: 24,
    pollToken: { address: '0x3600000000000000000000000000000000000000', decimals: 6 } },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Alchemy Faucet', url: 'https://sepoliafaucet.com',
    tokens: ['ETH'], desc: 'Sepolia test ETH — 0.5 ETH/day', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Chainlink Faucet', url: 'https://faucets.chain.link/sepolia',
    tokens: ['ETH', 'LINK'], desc: 'ETH + LINK in one request', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Base Faucet', url: 'https://faucet.quicknode.com/base/sepolia',
    tokens: ['ETH'], desc: 'Base Sepolia test ETH', cooldownHours: 24, pollToken: 'native' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Coinbase Faucet', url: 'https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
    tokens: ['ETH'], desc: 'Coinbase official Base faucet', cooldownHours: 24, pollToken: 'native' },
]

// ─── Public clients ────────────────────────────────────────────────────────
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

// ─── TX 히스토리 ────────────────────────────────────────────────────────────
const TX_KEY = 'usdc_portal_history'
function loadHistory(): TxRecord[] {
  try { return JSON.parse(localStorage.getItem(TX_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(records: TxRecord[]) { localStorage.setItem(TX_KEY, JSON.stringify(records.slice(0, 50))) }
function addHistory(records: TxRecord[], entry: TxRecord): TxRecord[] {
  const next = [entry, ...records].slice(0, 50); saveHistory(next); return next
}

// ─── 작은 컴포넌트들 ──────────────────────────────────────────────────────
function TokenIcon({ symbol }: { symbol: string }) {
  const color = TOKEN_COLORS[symbol] ?? '#555'
  return <span className="token-icon" style={{ background: color + '18', color }}>{symbol.replace(' (gas)', '').charAt(0)}</span>
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

// ─── 메인 앱 ──────────────────────────────────────────────────────────────
export default function App() {
  const connections = useConnections()
  const { connectors, connect, isPending: isConnecting, error: connectError, variables: connectVariables } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) ?? 'dark')
  const [networkMode, setNetworkMode] = useState<NetworkMode>(() => (localStorage.getItem('networkMode') as NetworkMode) ?? 'mainnet')
  const [mainTab, setMainTab] = useState<MainTab>('assets')
  const [actionTab, setActionTab] = useState<ActionTab>('swap')
  const [sortBy, setSortBy] = useState<'value' | 'symbol' | 'chain'>('value')

  const [assets, setAssets] = useState<AssetRow[]>([])
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [totalUsdc, setTotalUsdc] = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [history, setHistory] = useState<TxRecord[]>(loadHistory)

  const [showConnectors, setShowConnectors] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [showQR, setShowQR] = useState(false)

  // 주소록
  const [contacts, setContacts] = useState<Contact[]>(loadContacts)
  const [showContacts, setShowContacts] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactAddr, setNewContactAddr] = useState('')

  // 가스비
  const [gasPrices, setGasPrices] = useState<Record<number, string>>({})

  // 파우셋 폴링
  const [faucetPoll, setFaucetPoll] = useState<Record<number, FaucetPollState>>({})
  const pollTimers = useRef<Record<number, ReturnType<typeof setInterval>>>({})

  // 거래 폼 (Arc App Kit)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fromChain, setFromChain] = useState<'Ethereum_Sepolia' | 'Base_Sepolia'>('Base_Sepolia')
  const [txLoading, setTxLoading] = useState(false)
  const [txStatus, setTxStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState('')

  // LI.FI 크로스체인 스왑
  const [lifiFromChainId, setLifiFromChainId] = useState<number>(mainnet.id)
  const [lifiToChainId, setLifiToChainId] = useState<number>(base.id)
  const [lifiFromToken, setLifiFromToken] = useState('ETH')
  const [lifiToToken, setLifiToToken] = useState('USDC')
  const [lifiAmount, setLifiAmount] = useState('')
  const [lifiQuote, setLifiQuote] = useState<LiFiQuote | null>(null)
  const [lifiLoading, setLifiLoading] = useState(false)
  const [lifiError, setLifiError] = useState('')
  const [lifiExecuting, setLifiExecuting] = useState(false)

  // ── Payment Hub 상태 ──
  const [payNote, setPayNote] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [contractBalance, setContractBalance] = useState<string>('')
  const [contractOwner, setContractOwner] = useState<string>('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const allAddresses = [...new Set(connections.flatMap((c) => c.accounts))]
  const isConnected = connections.length > 0
  const activeChainId = connections[0]?.chainId

  useEffect(() => { localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('networkMode', networkMode) }, [networkMode])
  useEffect(() => { if (allAddresses.length) loadAssets() }, [connections.length, allAddresses.join(',')])

  // 60초마다 자동 새로고침
  useEffect(() => {
    if (!isConnected) return
    const t = setInterval(() => loadAssets(), 60000)
    return () => clearInterval(t)
  }, [isConnected])

  // 폴링 클린업
  useEffect(() => () => { Object.values(pollTimers.current).forEach(clearInterval) }, [])

  // ─── 가스비 조회 ────────────────────────────────────────────────────────
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

  // ─── 자산 조회 ──────────────────────────────────────────────────────────
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

  // ─── 주소록 ─────────────────────────────────────────────────────────────
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

  // ─── 파우셋 폴링 ────────────────────────────────────────────────────────
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

  // ─── CSV 내보내기 ────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = ['Token,Chain,Wallet,Balance,Value (USD),24h Change']
    displayed.forEach((a) => {
      rows.push(`${a.symbol},${CHAIN_META[a.chain]?.label ?? a.chain},${a.wallet},${a.balance},${a.usdcValue},${a.change24h.toFixed(2)}%`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = `portfolio_${new Date().toISOString().slice(0,10)}.csv`; el.click()
    URL.revokeObjectURL(url)
  }

  // ─── LI.FI 크로스체인 스왑 ──────────────────────────────────────────────
  function getLifiTokenAddress(chainId: number, symbol: string): string {
    if (symbol === 'ETH' || symbol === 'POL' || symbol === 'AVAX') return '0x0000000000000000000000000000000000000000'
    return TOKENS[chainId]?.find((t) => t.symbol === symbol)?.address ?? '0x0000000000000000000000000000000000000000'
  }

  function getLifiTokenDecimals(chainId: number, symbol: string): number {
    if (symbol === 'ETH' || symbol === 'POL' || symbol === 'AVAX') return 18
    return TOKENS[chainId]?.find((t) => t.symbol === symbol)?.decimals ?? 18
  }

  // ── Payment Hub 함수 ──────────────────────────────────────────────────────
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
    if (!payAmount || parseFloat(payAmount) <= 0) return setTxError('금액을 입력해주세요')
    const allAddresses = connections.flatMap((c) => [...c.accounts] as string[])
    if (!allAddresses.length) return setTxError('지갑을 연결하세요')
    setTxError(''); setTxStatus('Processing...')
    try {
      const amountWei = BigInt(Math.round(parseFloat(payAmount) * 1e6))
      // Arc Testnet: USDC is native, use sendTransaction with encoded pay() calldata
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({ abi: PAYMENT_HUB_ABI, functionName: 'pay', args: [payNote || ''] })
      const hash = await sendTransactionAsync({
        to: PAYMENT_HUB_ADDRESS,
        data,
        value: amountWei,
      })
      setTxHash(hash)
      setTxStatus('success')
      setPayAmount(''); setPayNote('')
      setTimeout(loadContractInfo, 3000)
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : 'Transaction failed')
      setTxStatus('')
    }
  }

  async function withdrawFromContract() {
    setWithdrawLoading(true); setTxError('')
    try {
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({ abi: PAYMENT_HUB_ABI, functionName: 'withdraw', args: [] })
      const hash = await sendTransactionAsync({ to: PAYMENT_HUB_ADDRESS, data })
      setTxHash(hash); setTxStatus('success')
      setTimeout(loadContractInfo, 3000)
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : 'Withdraw failed')
    } finally { setWithdrawLoading(false) }
  }

  async function fetchLiFiQuote() {
    if (!lifiAmount || parseFloat(lifiAmount) <= 0) return setLifiError('Enter an amount')
    if (!allAddresses[0]) return setLifiError('Connect a wallet first')
    setLifiLoading(true); setLifiError(''); setLifiQuote(null)
    try {
      const decimals = getLifiTokenDecimals(lifiFromChainId, lifiFromToken)
      const fromAmountRaw = BigInt(Math.floor(parseFloat(lifiAmount) * 10 ** decimals)).toString()
      const params = new URLSearchParams({
        fromChain: lifiFromChainId.toString(),
        toChain: lifiToChainId.toString(),
        fromToken: getLifiTokenAddress(lifiFromChainId, lifiFromToken),
        toToken: getLifiTokenAddress(lifiToChainId, lifiToToken),
        fromAmount: fromAmountRaw,
        fromAddress: allAddresses[0],
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
    setLifiExecuting(true); setTxError(''); setTxHash('')
    try {
      const req = lifiQuote.transactionRequest
      // 체인 전환 필요 시
      if (activeChainId !== req.chainId) await switchChain({ chainId: req.chainId })
      const hash = await sendTransactionAsync({
        to: req.to as `0x${string}`,
        data: req.data as `0x${string}`,
        value: BigInt(req.value || '0'),
        gas: req.gasLimit ? BigInt(req.gasLimit) : undefined,
      })
      setTxHash(hash)
      const fromSym = lifiQuote.action.fromToken.symbol
      const toSym = lifiQuote.action.toToken.symbol
      const toAmt = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmount), lifiQuote.action.toToken.decimals)).toFixed(4)
      setHistory((prev) => addHistory(prev, {
        type: 'cross', summary: `${lifiAmount} ${fromSym} → ${toAmt} ${toSym}`,
        txHash: hash, timestamp: Date.now(), status: 'success',
      }))
      setLifiQuote(null); setLifiAmount('')
      loadAssets()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTxError(msg)
      setHistory((prev) => addHistory(prev, {
        type: 'cross', summary: `${lifiAmount} ${lifiFromToken} → ${lifiToToken}`,
        txHash: '', timestamp: Date.now(), status: 'fail',
      }))
    } finally { setLifiExecuting(false) }
  }

  // ─── 요약 수치 ──────────────────────────────────────────────────────────
  const ethValue   = assets.filter((a) => a.symbol === 'ETH').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const usdcTotalVal = assets.filter((a) => a.symbol.includes('USDC')).reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const otherValue = parseFloat(totalUsdc) - ethValue - usdcTotalVal

  const chainBreakdown = CHAINS
    .map((c) => ({ id: c.id, val: assets.filter((a) => a.chain === c.id).reduce((s, a) => s + parseFloat(a.usdcValue), 0) }))
    .filter((c) => c.val > 0)

  // ─── 보안 검증 ──────────────────────────────────────────────────────────
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
    setTxLoading(true); setTxError(''); setTxHash('')
    setTxStatus(`${type === 'swap' ? 'Swapping' : type === 'bridge' ? 'Bridging' : 'Sending'}...`)
    try {
      const hash = await fn()
      setTxHash(hash); setTxStatus('Done!')
      setHistory((prev) => addHistory(prev, { type, summary, txHash: hash, timestamp: Date.now(), status: 'success' }))
      setAmount(''); setRecipient(''); loadAssets()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTxError(msg); setTxStatus('')
      setHistory((prev) => addHistory(prev, { type, summary, txHash: '', timestamp: Date.now(), status: 'fail' }))
    } finally { setTxLoading(false) }
  }

  function openSwapConfirm() {
    if (!amount) return setTxError('Enter an amount')
    setConfirmState({
      title: 'Confirm Swap',
      lines: [`${amount} ETH → USDC`, 'Network: Arc Testnet', 'Fee: calculated by Arc App Kit'],
      warnings: parseFloat(amount) > 1 ? ['Large swap amount — please double-check'] : [],
      onConfirm: () => execTx('swap', `${amount} ETH → USDC`, async () => {
        const adapter = await getAdapter()
        const r = await (kit as unknown as { swap: { execute: (p: { fromToken: string; toToken: string; amount: string; adapter: unknown; networkType: string }) => Promise<{ txHash?: string }> } })
          .swap.execute({ fromToken: 'ETH', toToken: 'USDC', amount, adapter, networkType: 'testnet' })
        return r.txHash ?? ''
      }),
    })
  }

  function openBridgeConfirm() {
    if (!amount) return setTxError('Enter an amount')
    setConfirmState({
      title: 'Confirm Bridge',
      lines: [`${amount} USDC`, `From: ${fromChain === 'Ethereum_Sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}`, 'To: Arc Unified Balance'],
      warnings: [],
      onConfirm: () => execTx('bridge', `${amount} USDC → Arc`, async () => {
        const adapter = await getAdapter()
        const r = await kit.unifiedBalance.deposit({ from: { adapter, chain: fromChain }, amount, token: 'USDC' })
        return (r as { txHash?: string }).txHash ?? ''
      }),
    })
  }

  function openSendConfirm() {
    if (!recipient || !amount) return setTxError('Enter address and amount')
    if (!isAddress(recipient)) return setTxError('Invalid Ethereum address')
    if (parseFloat(amount) <= 0) return setTxError('Amount must be greater than 0')
    const warnings = validateSend(recipient, amount)
    setConfirmState({
      title: 'Confirm Send',
      lines: [`${amount} USDC`, `To: ${recipient.slice(0, 10)}...${recipient.slice(-6)}`, 'Network: Arc Testnet'],
      warnings,
      onConfirm: () => execTx('send', `${amount} USDC → ${recipient.slice(0, 8)}...`, async () => {
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

  // ─── 필터 & 정렬 ────────────────────────────────────────────────────────
  const displayed = assets
    .filter((a) => networkMode === 'mainnet' ? MAINNET_IDS.has(a.chain) : TESTNET_IDS.has(a.chain))
    .sort((a, b) => sortBy === 'value' ? parseFloat(b.usdcValue) - parseFloat(a.usdcValue)
      : sortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : a.chain - b.chain)

  // ─── LI.FI 토큰 옵션 ─────────────────────────────────────────────────────
  function getLifiFromTokens(chainId: number) {
    const chain = LIFI_CHAINS.find((c) => c.id === chainId)
    const native = chain?.nativeSymbol ?? 'ETH'
    return [native, ...( TOKENS[chainId]?.map((t) => t.symbol) ?? [])]
  }

  // ─── 커넥터 목록 ────────────────────────────────────────────────────────
  function ConnectorList() {
    return (
      <div className="connector-list">
        {connectors.map((connector) => {
          const isThis = isConnecting && connectingId === connector.uid
          const hasErr = connectError && connectVariables?.connector === connector
          const errMsg = hasErr ? friendlyConnectError(connectError, connector.name) : null
          const info = INSTALL_LINKS[connector.name]
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

  // ─── LI.FI 견적 카드 ─────────────────────────────────────────────────────
  function LiFiQuoteCard() {
    if (!lifiQuote) return null
    const toAmt = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmount), lifiQuote.action.toToken.decimals))
    const toAmtMin = parseFloat(formatUnits(BigInt(lifiQuote.estimate.toAmountMin), lifiQuote.action.toToken.decimals))
    const duration = lifiQuote.estimate.executionDuration
    const fromLabel = CHAIN_META[lifiQuote.action.fromChainId]?.label ?? lifiQuote.action.fromChainId
    const toLabel = CHAIN_META[lifiQuote.action.toChainId]?.label ?? lifiQuote.action.toChainId
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
          <span className="lifi-quote-value">{fromLabel} → {toLabel}</span>
        </div>
        <div className="lifi-quote-row">
          <span className="lifi-quote-label">Est. time</span>
          <span className="lifi-quote-value">{duration < 60 ? `${duration}s` : `${Math.round(duration / 60)}m`}</span>
        </div>
        {lifiQuote.estimate.feeCosts.length > 0 && (
          <div className="lifi-quote-row">
            <span className="lifi-quote-label">Fees</span>
            <span className="lifi-quote-value muted">{lifiQuote.estimate.feeCosts.map((f) => f.name).join(', ')}</span>
          </div>
        )}
      </div>
    )
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="root" data-theme={theme}>
      {confirmState && <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} />}

      {/* QR 모달 */}
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

      {/* 주소록 모달 */}
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
                      <button className="btn-icon" title="Use address" onClick={() => { setRecipient(c.address); setActionTab('send'); setShowContacts(false) }}>
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

      {/* ─── 내비바 ─────────────────────────────────────────────────────── */}
      <nav className="navbar">
        <span className="nav-logo">USDC Portal</span>
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

          {/* 가스비 */}
          {Object.keys(gasPrices).length > 0 && (
            <div className="gas-bar">
              <Fuel size={12} />
              {CHAINS
                .filter((c) => gasPrices[c.id] && (networkMode === 'mainnet' ? MAINNET_IDS.has(c.id) : TESTNET_IDS.has(c.id)))
                .slice(0, 3)
                .map((c) => (
                  <span key={c.id} className="gas-item" title={CHAIN_META[c.id].label}>
                    <span className="gas-dot" style={{ background: CHAIN_META[c.id].color }} />
                    {gasPrices[c.id]}
                  </span>
                ))}
              <span className="gas-unit">Gwei</span>
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

      <main className="dashboard">
        {/* ─── 요약 카드 ─────────────────────────────────────────────────── */}
        <div className="summary-grid">
          <div className="summary-card summary-main">
            <span className="summary-label">Total Balance</span>
            <span className="summary-value">${totalUsdc}</span>
            <span className="summary-unit">USD</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">ETH Value</span>
            <span className="summary-value" style={{ color: '#627eea' }}>${ethValue.toFixed(2)}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">USDC Balance</span>
            <span className="summary-value" style={{ color: '#2775ca' }}>${usdcTotalVal.toFixed(2)}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Other Assets</span>
            <span className="summary-value">${otherValue.toFixed(2)}</span>
          </div>
        </div>

        {/* ─── 포트폴리오 바 ─────────────────────────────────────────────── */}
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

        <div className="content-grid">
          {/* ─── 왼쪽 패널 ──────────────────────────────────────────────── */}
          <div className="panel">
            <div className="panel-header">
              <div className="main-tabs">
                <button className={`main-tab ${mainTab === 'assets' ? 'active' : ''}`} onClick={() => setMainTab('assets')}>Assets</button>
                <button className={`main-tab ${mainTab === 'history' ? 'active' : ''}`} onClick={() => setMainTab('history')}>
                  History {history.length > 0 && <span className="history-badge">{history.length}</span>}
                </button>
                {networkMode === 'testnet' && (
                  <button className={`main-tab ${mainTab === 'faucet' ? 'active' : ''}`} onClick={() => setMainTab('faucet')}>Faucet</button>
                )}
              </div>
              {mainTab === 'assets' && (
                <div className="table-controls">
                  <div className="network-label">
                    <span className={`net-indicator ${networkMode}`} />
                    {networkMode === 'mainnet' ? 'Mainnet assets' : 'Testnet assets'}
                    {loadingAssets && <span className="loading-dot" />}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                      <option value="value">By value</option>
                      <option value="symbol">By token</option>
                      <option value="chain">By chain</option>
                    </select>
                    {displayed.length > 0 && (
                      <button className="btn-icon" onClick={exportCSV} title="Export CSV"><Download size={13} /></button>
                    )}
                    <button className="btn-icon" onClick={loadAssets} disabled={loadingAssets}><RefreshCw size={14} /></button>
                  </div>
                </div>
              )}
            </div>

            {mainTab === 'assets' ? (
              !isConnected ? (
                <div className="connect-prompt">
                  <div className="connect-prompt-icon"><Wallet size={36} strokeWidth={1.5} /></div>
                  <p className="connect-prompt-title">Connect your wallet</p>
                  <p className="connect-prompt-sub">Your assets will appear here once connected</p>
                  <button className="btn-primary" style={{ maxWidth: 200 }} onClick={() => setShowConnectors(true)}>Connect wallet</button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Token</th><th>Chain</th><th>Wallet</th>
                        <th className="text-right">Balance</th><th className="text-right">Value</th><th className="text-right">24h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAssets && assets.length === 0 ? <SkeletonRows /> : displayed.length === 0 ? (
                        <tr><td colSpan={6} className="empty-cell">No assets found</td></tr>
                      ) : displayed.map((a, i) => {
                        const explorer = CHAIN_META[a.chain]?.explorer
                        return (
                          <tr key={i} className="asset-tr">
                            <td><div className="token-cell"><TokenIcon symbol={a.symbol} /><span className="token-name">{a.symbol}</span></div></td>
                            <td>
                              <span className="chain-dot" style={{ background: CHAIN_META[a.chain]?.color }} />
                              {explorer
                                ? <a className="chain-link" href={explorer} target="_blank" rel="noopener noreferrer">{CHAIN_META[a.chain]?.label}</a>
                                : <span className="chain-label">{CHAIN_META[a.chain]?.label}</span>}
                            </td>
                            <td className="wallet-cell">{a.wallet}</td>
                            <td className="text-right mono">{a.balance}</td>
                            <td className="text-right usdc-val">${a.usdcValue}</td>
                            <td className="text-right"><Change24h value={a.change24h} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : mainTab === 'history' ? (
              <div className="history-list">
                {history.length === 0 ? (
                  <div className="empty-cell">No transactions yet</div>
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
            ) : (
              /* 파우셋 탭 */
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
                        <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => setShowConnectors(true)}>Connect</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="faucet-step-card">
                  <div className="faucet-step-num">2</div>
                  <div className="faucet-step-body">
                    <p className="faucet-step-title">Request tokens from a faucet</p>
                    <p className="faucet-step-sub">Click a faucet — it opens in a new tab. Paste your address and submit. We'll detect when tokens arrive.</p>
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
                              {state === 'idle' && <ExternalLink size={12} className="faucet-card-arrow" />}
                              {state === 'polling' && <span className="faucet-spinner" />}
                              {state === 'received' && <Check size={13} className="faucet-check" />}
                            </div>
                            <span className="faucet-card-chain">{f.chain}</span>
                            <div className="faucet-card-tokens">
                              {f.tokens.map((t) => <span key={t} className="faucet-token">{t}</span>)}
                            </div>
                            {state === 'polling' && <span className="faucet-status-text">Waiting for deposit...</span>}
                            {state === 'received' && <span className="faucet-status-text received">Tokens received!</span>}
                            {state === 'idle' && <span className="faucet-card-desc">{f.desc}</span>}
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
                    <p className="faucet-step-sub">Balance updates automatically when tokens arrive. Or refresh manually.</p>
                    <button className="btn-outline" onClick={() => { setMainTab('assets'); loadAssets() }}>
                      <RefreshCw size={13} /> Refresh assets
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── 오른쪽: 액션 패널 ──────────────────────────────────────── */}
          <div className="panel action-panel">
            <div className="action-tabs">
              {([
                { key: 'swap',   label: 'Swap',   icon: <Repeat2 size={13} /> },
                { key: 'bridge', label: 'Bridge', icon: <Layers size={13} /> },
                { key: 'send',   label: 'Send',   icon: <ArrowUpRight size={13} /> },
                { key: 'cross',  label: 'Cross',  icon: <Zap size={13} /> },
                { key: 'pay',    label: 'Pay',    icon: <Wallet size={13} /> },
              ] as { key: ActionTab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
                <button key={key} className={`action-tab ${actionTab === key ? 'active' : ''}`}
                  onClick={() => { setActionTab(key); setTxStatus(''); setTxError(''); setTxHash(''); setLifiError(''); setLifiQuote(null); if (key === 'pay') loadContractInfo() }}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="action-body">
              {/* ── SWAP (Arc App Kit) ── */}
              {actionTab === 'swap' && <>
                <p className="action-desc">Swap ETH → USDC on Arc Testnet</p>
                <div className="swap-row">
                  <div className="swap-badge">ETH</div>
                  <ArrowRight size={16} className="swap-arrow-icon" />
                  <div className="swap-badge usdc">USDC</div>
                </div>
                <label className="input-label">Amount (ETH)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openSwapConfirm} disabled={txLoading}>{txLoading ? 'Processing...' : 'Swap to USDC'}</button>
              </>}

              {/* ── BRIDGE (Arc App Kit) ── */}
              {actionTab === 'bridge' && <>
                <p className="action-desc">Bridge USDC to Arc Unified Balance</p>
                <label className="input-label">From chain</label>
                <select className="action-input" value={fromChain} onChange={(e) => setFromChain(e.target.value as typeof fromChain)}>
                  <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
                  <option value="Base_Sepolia">Base Sepolia</option>
                </select>
                <label className="input-label">Amount (USDC)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openBridgeConfirm} disabled={txLoading}>{txLoading ? 'Processing...' : 'Bridge to Arc'}</button>
              </>}

              {/* ── SEND ── */}
              {actionTab === 'send' && <>
                <p className="action-desc">Send USDC on Arc Testnet</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
                  <label className="input-label">Recipient address</label>
                  <button className="btn-book" onClick={() => setShowContacts(true)}>
                    <BookUser size={12} /> Address book
                  </button>
                </div>
                <input className="action-input" type="text" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                <label className="input-label">Amount (USDC)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openSendConfirm} disabled={txLoading}>{txLoading ? 'Processing...' : 'Send USDC'}</button>
              </>}

              {/* ── CROSS-CHAIN (LI.FI) ── */}
              {actionTab === 'cross' && <>
                <p className="action-desc">Cross-chain swap via LI.FI — any token, any chain</p>
                <div className="lifi-row">
                  <div className="lifi-col">
                    <label className="input-label">From chain</label>
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
                    <label className="input-label">To chain</label>
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
                {lifiError && <div className="tx-status error"><span>{lifiError}</span></div>}
                {!lifiQuote
                  ? <button className="btn-primary" onClick={fetchLiFiQuote} disabled={lifiLoading || !lifiAmount}>
                      {lifiLoading ? 'Getting quote...' : 'Get Quote'}
                    </button>
                  : <>
                    <LiFiQuoteCard />
                    <button className="btn-primary" onClick={executeLiFiSwap} disabled={lifiExecuting}>
                      {lifiExecuting ? 'Executing...' : `Swap via LI.FI`}
                    </button>
                    <button className="btn-outline" style={{ alignSelf: 'center' }} onClick={() => setLifiQuote(null)}>
                      <RefreshCw size={12} /> New quote
                    </button>
                  </>
                }
              </>}

              {/* TX 상태 (swap/bridge/send/cross 공통) */}
              {(txStatus || txError) && (
                <div className={`tx-status ${txError ? 'error' : 'success'}`}>
                  <span>{txError || txStatus}</span>
                  {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer">View on ArcScan <ExternalLink size={11} /></a>}
                </div>
              )}
              {txHash && actionTab === 'cross' && (
                <div className="tx-status success">
                  <span>Transaction submitted!</span>
                  <a href={`${CHAIN_META[lifiQuote?.action?.fromChainId ?? mainnet.id]?.explorer ?? 'https://etherscan.io'}/tx/${txHash}`}
                    target="_blank" rel="noopener noreferrer">View on explorer <ExternalLink size={11} /></a>
                </div>
              )}

              {/* ── PAY (USDCPaymentHub) ── */}
              {actionTab === 'pay' && (() => {
                const allAddresses = connections.flatMap((c) => [...c.accounts] as string[])
                const isOwner = allAddresses.some((a) => a.toLowerCase() === contractOwner)
                return <>
                  <p className="action-desc">Arc Testnet 결제 컨트랙트로 USDC 전송</p>

                  {/* 컨트랙트 잔액 카드 */}
                  <div className="lifi-quote" style={{ marginBottom: 8 }}>
                    <div className="lifi-quote-row">
                      <span className="lifi-quote-label">컨트랙트 주소</span>
                      <a href={`https://testnet.arcscan.app/address/${PAYMENT_HUB_ADDRESS}`}
                        target="_blank" rel="noopener noreferrer" className="chain-link">
                        {PAYMENT_HUB_ADDRESS.slice(0, 8)}...{PAYMENT_HUB_ADDRESS.slice(-6)} <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="lifi-quote-row">
                      <span className="lifi-quote-label">컨트랙트 잔액</span>
                      <span className="lifi-quote-value">
                        {contractBalance ? `${parseFloat(contractBalance).toFixed(4)} USDC` : '—'}
                      </span>
                    </div>
                    {isOwner && (
                      <div className="lifi-quote-row">
                        <span className="lifi-quote-label" style={{ color: 'var(--success)' }}>✓ Owner 지갑 연결됨</span>
                        <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                          onClick={withdrawFromContract} disabled={withdrawLoading || !contractBalance || parseFloat(contractBalance) === 0}>
                          {withdrawLoading ? 'Processing...' : 'Withdraw'}
                        </button>
                      </div>
                    )}
                  </div>

                  <label className="input-label">금액 (USDC)</label>
                  <input className="action-input" type="number" placeholder="0.0"
                    value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />

                  <label className="input-label">메모 (선택)</label>
                  <input className="action-input" type="text" placeholder="주문번호, 용도 등"
                    value={payNote} onChange={(e) => setPayNote(e.target.value)} />

                  <button className="btn-primary" onClick={payToContract} disabled={txLoading}>
                    {txLoading ? 'Processing...' : 'Pay to Contract'}
                  </button>

                  {txHash && (
                    <div className="tx-status success">
                      <span>결제 완료!</span>
                      <a href={`https://testnet.arcscan.app/tx/${txHash}`}
                        target="_blank" rel="noopener noreferrer">ArcScan에서 보기 <ExternalLink size={11} /></a>
                    </div>
                  )}
                </>
              })()}

              <div className="security-note">
                <ArrowDownLeft size={12} style={{ opacity: 0.5 }} />
                USDC Portal never stores your private keys. Always verify before signing.
              </div>

              {/* 가격 조회 */}
              {Object.keys(prices).length > 0 && (
                <div className="price-ticker">
                  {[
                    { id: 'ethereum', label: 'ETH' },
                    { id: 'usd-coin', label: 'USDC' },
                    { id: 'matic-network', label: 'POL' },
                    { id: 'avalanche-2', label: 'AVAX' },
                  ].filter((p) => prices[p.id]).map((p) => (
                    <div key={p.id} className="price-item">
                      <span className="price-symbol">{p.label}</span>
                      <span className="price-value">${prices[p.id].usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <Change24h value={prices[p.id].change24h} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
