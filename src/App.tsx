import { useState, useEffect, useCallback } from 'react'
import { useConnect, useDisconnect, useConnections, useSwitchChain } from 'wagmi'
import { createPublicClient, fallback, http, formatUnits, isAddress } from 'viem'
import { mainnet, base, polygon, arbitrum, sepolia, baseSepolia } from 'wagmi/chains'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { arcTestnet } from './wagmi.config'
import './App.css'

const kit = new AppKit()

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// ─── 체인 메타 ────────────────────────────────────────────────────────────
export const CHAINS = [mainnet, base, polygon, arbitrum, arcTestnet, sepolia, baseSepolia] as const

export const CHAIN_META: Record<number, { label: string; color: string; isTestnet: boolean }> = {
  [mainnet.id]:     { label: 'Ethereum',    color: '#627eea', isTestnet: false },
  [base.id]:        { label: 'Base',         color: '#0052ff', isTestnet: false },
  [polygon.id]:     { label: 'Polygon',      color: '#8247e5', isTestnet: false },
  [arbitrum.id]:    { label: 'Arbitrum',     color: '#12aaff', isTestnet: false },
  [arcTestnet.id]:  { label: 'Arc Testnet',  color: '#00c2ff', isTestnet: true  },
  [sepolia.id]:     { label: 'Eth Sepolia',  color: '#627eea', isTestnet: true  },
  [baseSepolia.id]: { label: 'Base Sepolia', color: '#0052ff', isTestnet: true  },
}

const TOKEN_COLORS: Record<string, string> = {
  ETH: '#627eea', WETH: '#627eea', USDC: '#2775ca', 'USDC (gas)': '#2775ca',
  USDT: '#26a17b', DAI: '#f5ac37', POL: '#8247e5', MATIC: '#8247e5', ARB: '#12aaff',
}

type TokenInfo = { symbol: string; address: `0x${string}`; decimals: number; coingeckoId: string }

const TOKENS: Record<number, TokenInfo[]> = {
  [mainnet.id]: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  coingeckoId: 'tether'   },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth'     },
    { symbol: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai'      },
  ],
  [base.id]: [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth'     },
    { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, coingeckoId: 'dai'      },
  ],
  [polygon.id]: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  coingeckoId: 'tether'   },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth'     },
  ],
  [arbitrum.id]: [
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6,  coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  coingeckoId: 'tether'   },
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, coingeckoId: 'weth'     },
    { symbol: 'ARB',  address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, coingeckoId: 'arbitrum' },
  ],
  [arcTestnet.id]:  [{ symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6, coingeckoId: 'usd-coin' }],
  [sepolia.id]:     [
    { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, coingeckoId: 'tether'   },
  ],
  [baseSepolia.id]: [{ symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, coingeckoId: 'usd-coin' }],
}

const INSTALL_LINKS: Record<string, { url: string; label: string }> = {
  MetaMask:          { url: 'https://metamask.io/download/',             label: 'MetaMask 설치하기'        },
  'Coinbase Wallet': { url: 'https://www.coinbase.com/wallet/downloads', label: 'Coinbase Wallet 설치하기' },
  WalletConnect:     { url: 'https://walletconnect.com/',                label: 'WalletConnect 열기'       },
}

function friendlyConnectError(error: Error | null, name: string): string | null {
  if (!error) return null
  const msg = error.message.toLowerCase()
  if (msg.includes('provider') || msg.includes('not found') || msg.includes('install')) return `${name}이(가) 설치되지 않았어요.`
  if (msg.includes('user rejected') || msg.includes('denied')) return '연결을 취소했어요.'
  return '연결에 실패했어요. 다시 시도해주세요.'
}

// ─── CoinGecko (24h 변동 포함) ─────────────────────────────────────────────
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
  type: 'swap' | 'bridge' | 'send'
  summary: string
  txHash: string
  timestamp: number
  status: 'success' | 'fail'
}

interface ConfirmState {
  title: string
  lines: string[]
  warnings: string[]
  onConfirm: () => void
}

type NetworkMode = 'mainnet' | 'testnet'
type ActionTab = 'swap' | 'bridge' | 'send'
type MainTab = 'assets' | 'history' | 'faucet'
type Theme = 'dark' | 'light'

const MAINNET_IDS = new Set<number>([mainnet.id, base.id, polygon.id, arbitrum.id])
const TESTNET_IDS = new Set<number>([arcTestnet.id, sepolia.id, baseSepolia.id])

// ─── 파우셋 데이터 ─────────────────────────────────────────────────────────
interface FaucetInfo { chain: string; chainId: number; name: string; url: string; tokens: string[]; desc: string }

const FAUCETS: FaucetInfo[] = [
  { chain: 'Arc Testnet', chainId: arcTestnet.id, name: 'Circle Faucet', url: 'https://faucet.circle.com',
    tokens: ['USDC'], desc: '공식 Circle 파우셋 — Arc Testnet USDC 지급' },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Alchemy Faucet', url: 'https://sepoliafaucet.com',
    tokens: ['ETH'], desc: 'Sepolia 테스트 ETH — 하루 0.5 ETH' },
  { chain: 'Ethereum Sepolia', chainId: sepolia.id, name: 'Chainlink Faucet', url: 'https://faucets.chain.link/sepolia',
    tokens: ['ETH', 'LINK'], desc: 'ETH + LINK 동시 지급' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Base Faucet', url: 'https://faucet.quicknode.com/base/sepolia',
    tokens: ['ETH'], desc: 'Base Sepolia 테스트 ETH' },
  { chain: 'Base Sepolia', chainId: baseSepolia.id, name: 'Coinbase Faucet', url: 'https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
    tokens: ['ETH'], desc: 'Coinbase 공식 Base 파우셋' },
]

// ─── Public clients ────────────────────────────────────────────────────────
const publicClients = Object.fromEntries(
  CHAINS.map((chain) => {
    const rpcs: Record<number, string[]> = {
      [mainnet.id]:    ['https://eth.llamarpc.com', 'https://1rpc.io/eth'],
      [base.id]:       ['https://mainnet.base.org', 'https://1rpc.io/base'],
      [polygon.id]:    ['https://polygon.llamarpc.com', 'https://1rpc.io/matic'],
      [arbitrum.id]:   ['https://arb1.arbitrum.io/rpc', 'https://1rpc.io/arb'],
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
function saveHistory(records: TxRecord[]) {
  localStorage.setItem(TX_KEY, JSON.stringify(records.slice(0, 50)))
}
function addHistory(records: TxRecord[], entry: TxRecord): TxRecord[] {
  const next = [entry, ...records].slice(0, 50)
  saveHistory(next)
  return next
}

// ─── 작은 컴포넌트들 ──────────────────────────────────────────────────────
function TokenIcon({ symbol }: { symbol: string }) {
  const color = TOKEN_COLORS[symbol] ?? '#555'
  return <span className="token-icon" style={{ background: color + '22', color }}>{symbol.replace(' (gas)', '').charAt(0)}</span>
}

function Change24h({ value }: { value: number }) {
  if (value === 0) return null
  const pos = value > 0
  return <span className={`change24 ${pos ? 'pos' : 'neg'}`}>{pos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%</span>
}

function SkeletonRows() {
  return <>{[1,2,3,4,5].map((i) => (
    <tr key={i} className="skeleton-row">
      {[120, 80, 80, 90, 70].map((w, j) => <td key={j}><div className="skel" style={{ width: w }} /></td>)}
    </tr>
  ))}</>
}

// ─── 확인 모달 ────────────────────────────────────────────────────────────
function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{state.title}</h3>
        <div className="modal-lines">
          {state.lines.map((l, i) => <div key={i} className="modal-line">{l}</div>)}
        </div>
        {state.warnings.length > 0 && (
          <div className="modal-warnings">
            {state.warnings.map((w, i) => <div key={i} className="modal-warning">⚠️ {w}</div>)}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>취소</button>
          <button className="btn-primary btn-confirm" onClick={() => { state.onConfirm(); onCancel() }}>확인 및 서명</button>
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

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) ?? 'dark')
  const [networkMode, setNetworkMode] = useState<NetworkMode>(() => (localStorage.getItem('networkMode') as NetworkMode) ?? 'mainnet')
  const [mainTab, setMainTab] = useState<MainTab>('assets')
  const [actionTab, setActionTab] = useState<ActionTab>('swap')
  const [sortBy, setSortBy] = useState<'value' | 'symbol' | 'chain'>('value')

  const [assets, setAssets] = useState<AssetRow[]>([])
  const [totalUsdc, setTotalUsdc] = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [history, setHistory] = useState<TxRecord[]>(loadHistory)

  const [showConnectors, setShowConnectors] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  // 거래 폼
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fromChain, setFromChain] = useState<'Ethereum_Sepolia' | 'Base_Sepolia'>('Base_Sepolia')
  const [txLoading, setTxLoading] = useState(false)
  const [txStatus, setTxStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState('')

  const allAddresses = [...new Set(connections.flatMap((c) => c.accounts))]
  const isConnected = connections.length > 0
  const activeChainId = connections[0]?.chainId

  useEffect(() => { localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('networkMode', networkMode) }, [networkMode])
  useEffect(() => { if (allAddresses.length) loadAssets() }, [connections.length, allAddresses.join(',')])

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
              const isArc = chain.id === arcTestnet.id
              const isPoly = chain.id === polygon.id
              rows.push({ wallet: shortAddr, chain: chain.id,
                symbol: isArc ? 'USDC (gas)' : isPoly ? 'POL' : 'ETH',
                balance: parseFloat(formatUnits(bal, 18)).toFixed(6), usdcValue: '0', change24h: 0,
                coingeckoId: isArc ? 'usd-coin' : isPoly ? 'matic-network' : 'ethereum' })
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
      const prices = await fetchPrices(ids)
      let total = 0
      const enriched = rows.map((r) => {
        const p = prices[r.coingeckoId] ?? { usd: 1, change24h: 0 }
        const val = parseFloat(r.balance) * p.usd
        total += val
        return { ...r, usdcValue: val.toFixed(2), change24h: p.change24h }
      }).sort((a, b) => parseFloat(b.usdcValue) - parseFloat(a.usdcValue))
      setAssets(enriched)
      setTotalUsdc(total.toFixed(2))
    } finally { setLoadingAssets(false) }
  }, [allAddresses.join(',')])

  // ─── 요약 수치 ──────────────────────────────────────────────────────────
  const ethValue   = assets.filter((a) => a.symbol === 'ETH').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const usdcTotal  = assets.filter((a) => a.symbol.includes('USDC')).reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const otherValue = parseFloat(totalUsdc) - ethValue - usdcTotal

  // 체인별 분포 (포트폴리오 바)
  const chainBreakdown = CHAINS
    .map((c) => ({ id: c.id, val: assets.filter((a) => a.chain === c.id).reduce((s, a) => s + parseFloat(a.usdcValue), 0) }))
    .filter((c) => c.val > 0)

  // ─── 보안 검증 ──────────────────────────────────────────────────────────
  function validateSend(to: string, amt: string): string[] {
    const warnings: string[] = []
    if (!isAddress(to)) { warnings.push('올바른 이더리움 주소 형식이 아니에요') }
    if (allAddresses.some((a) => a.toLowerCase() === to.toLowerCase())) { warnings.push('본인 지갑 주소로 전송하려고 해요') }
    if (parseFloat(amt) <= 0) { warnings.push('금액이 0이에요') }
    return warnings
  }

  // ─── App Kit adapter ────────────────────────────────────────────────────
  async function getAdapter() {
    const provider = (window as { ethereum?: Parameters<typeof createViemAdapterFromProvider>[0]['provider'] }).ethereum
    if (!provider) throw new Error('지갑을 먼저 연결해주세요')
    return createViemAdapterFromProvider({ provider })
  }

  // ─── 거래 실행 (히스토리 저장) ──────────────────────────────────────────
  async function execTx(type: ActionTab, summary: string, fn: () => Promise<string>) {
    setTxLoading(true); setTxError(''); setTxHash('')
    setTxStatus(`${type === 'swap' ? '스왑' : type === 'bridge' ? '브릿지' : '전송'} 처리 중...`)
    let hash = ''
    try {
      hash = await fn()
      setTxHash(hash)
      setTxStatus(`✅ 완료!`)
      setHistory((prev) => addHistory(prev, { type, summary, txHash: hash, timestamp: Date.now(), status: 'success' }))
      setAmount(''); setRecipient('')
      loadAssets()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTxError(msg)
      setTxStatus('')
      setHistory((prev) => addHistory(prev, { type, summary, txHash: '', timestamp: Date.now(), status: 'fail' }))
    } finally { setTxLoading(false) }
  }

  // ─── 확인 모달 열기 ──────────────────────────────────────────────────────
  function openSwapConfirm() {
    if (!amount) return setTxError('금액을 입력하세요')
    setConfirmState({
      title: '스왑 확인',
      lines: [`${amount} ETH → USDC`, '네트워크: Arc Testnet', '수수료: Arc App Kit 자동 계산'],
      warnings: parseFloat(amount) > 1 ? ['큰 금액을 스왑하려고 해요. 확인해주세요.'] : [],
      onConfirm: () => execTx('swap', `${amount} ETH → USDC`, async () => {
        const adapter = await getAdapter()
        const r = await (kit as unknown as { swap: { execute: (p: { fromToken: string; toToken: string; amount: string; adapter: unknown; networkType: string }) => Promise<{ txHash?: string }> } })
          .swap.execute({ fromToken: 'ETH', toToken: 'USDC', amount, adapter, networkType: 'testnet' })
        return r.txHash ?? ''
      }),
    })
  }

  function openBridgeConfirm() {
    if (!amount) return setTxError('금액을 입력하세요')
    setConfirmState({
      title: '브릿지 확인',
      lines: [`${amount} USDC`, `출발: ${fromChain === 'Ethereum_Sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'}`, '도착: Arc Unified Balance'],
      warnings: [],
      onConfirm: () => execTx('bridge', `${amount} USDC → Arc`, async () => {
        const adapter = await getAdapter()
        const r = await kit.unifiedBalance.deposit({ from: { adapter, chain: fromChain }, amount, token: 'USDC' })
        return (r as { txHash?: string }).txHash ?? ''
      }),
    })
  }

  function openSendConfirm() {
    if (!recipient || !amount) return setTxError('주소와 금액을 입력하세요')
    const warnings = validateSend(recipient, amount)
    setConfirmState({
      title: '전송 확인',
      lines: [`${amount} USDC`, `받는 주소: ${recipient.slice(0, 10)}...${recipient.slice(-6)}`, '네트워크: Arc Testnet'],
      warnings,
      onConfirm: () => execTx('send', `${amount} USDC → ${recipient.slice(0, 8)}...`, async () => {
        const adapter = await getAdapter()
        const r = await kit.unifiedBalance.spend({ amount, token: 'USDC', from: [{ adapter }],
          to: { adapter, chain: 'Arc_Testnet', recipientAddress: recipient as `0x${string}` } })
        return (r as { txHash?: string }).txHash ?? ''
      }),
    })
  }

  // ─── 필터 & 정렬 ────────────────────────────────────────────────────────
  const displayed = assets
    .filter((a) => networkMode === 'mainnet' ? MAINNET_IDS.has(a.chain) : TESTNET_IDS.has(a.chain))
    .sort((a, b) => sortBy === 'value' ? parseFloat(b.usdcValue) - parseFloat(a.usdcValue) : sortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : a.chain - b.chain)

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
                {isThis ? '연결 중...' : connector.name}
              </button>
              {errMsg && <div className="connector-error"><span>{errMsg}</span>{info && <a href={info.url} target="_blank" rel="noopener noreferrer">{info.label} →</a>}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── 메인 대시보드 (항상 표시) ─────────────────────────────────────────
  return (
    <div className="root" data-theme={theme}>
      {confirmState && <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} />}

      {/* 내비바 */}
      <nav className="navbar">
        <span className="nav-logo">USDC Portal</span>
        <div className="nav-right">
          {/* 메인넷 / 테스트넷 토글 */}
          <div className="network-toggle">
            <button className={`net-btn ${networkMode === 'mainnet' ? 'active' : ''}`} onClick={() => setNetworkMode('mainnet')}>Mainnet</button>
            <button className={`net-btn ${networkMode === 'testnet' ? 'active' : ''}`} onClick={() => setNetworkMode('testnet')}>Testnet</button>
          </div>
          {/* 체인 전환 */}
          {isConnected && (
            <select className="chain-select" value={activeChainId ?? ''} onChange={(e) => switchChain({ chainId: Number(e.target.value) })}>
              {CHAINS.filter((c) => networkMode === 'mainnet' ? MAINNET_IDS.has(c.id) : TESTNET_IDS.has(c.id))
                .map((c) => <option key={c.id} value={c.id}>{CHAIN_META[c.id].label}</option>)}
            </select>
          )}
          {/* 지갑 */}
          <div className="nav-wallets">
            {connections.map((conn) =>
              conn.accounts.map((addr) => (
                <div key={addr} className="nav-wallet-chip">
                  <span className="wallet-dot" />
                  <span>{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                  <button className="chip-disconnect" onClick={() => disconnect({ connector: conn.connector })}>×</button>
                </div>
              ))
            )}
            <button className="btn-add-wallet" onClick={() => setShowConnectors((v) => !v)}>
              {isConnected ? '+ 지갑 추가' : '지갑 연결'}
            </button>
            {showConnectors && <div className="wallet-dropdown"><ConnectorList /></div>}
          </div>
          <button className="btn-theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      <main className="dashboard">
        {/* 요약 카드 */}
        <div className="summary-grid">
          <div className="summary-card summary-main">
            <span className="summary-label">총 자산 가치</span>
            <span className="summary-value">${totalUsdc}</span>
            <span className="summary-unit">USDC</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">ETH 가치</span>
            <span className="summary-value" style={{ color: '#627eea' }}>${ethValue.toFixed(2)}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">USDC 잔액</span>
            <span className="summary-value" style={{ color: '#2775ca' }}>${usdcTotal.toFixed(2)}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">기타 자산</span>
            <span className="summary-value">${otherValue.toFixed(2)}</span>
          </div>
        </div>

        {/* 포트폴리오 분포 바 */}
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

        {/* 메인 콘텐츠 그리드 */}
        <div className="content-grid">

          {/* 왼쪽: 자산 테이블 / 히스토리 */}
          <div className="panel">
            <div className="panel-header">
              <div className="main-tabs">
                <button className={`main-tab ${mainTab === 'assets' ? 'active' : ''}`} onClick={() => setMainTab('assets')}>자산 목록</button>
                <button className={`main-tab ${mainTab === 'history' ? 'active' : ''}`} onClick={() => setMainTab('history')}>
                  거래 기록 {history.length > 0 && <span className="history-badge">{history.length}</span>}
                </button>
                {networkMode === 'testnet' && (
                  <button className={`main-tab ${mainTab === 'faucet' ? 'active' : ''}`} onClick={() => setMainTab('faucet')}>
                    🚰 파우셋
                  </button>
                )}
              </div>
              {mainTab === 'assets' && (
                <div className="table-controls">
                  <div className="network-label">
                    <span className={`net-indicator ${networkMode}`} />
                    {networkMode === 'mainnet' ? '메인넷 자산' : '테스트넷 자산'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                      <option value="value">가치 순</option>
                      <option value="symbol">토큰 순</option>
                      <option value="chain">체인 순</option>
                    </select>
                    <button className="btn-icon" onClick={loadAssets} disabled={loadingAssets}>↻</button>
                  </div>
                </div>
              )}
            </div>

            {mainTab === 'assets' ? (
              !isConnected ? (
                <div className="connect-prompt">
                  <div className="connect-prompt-icon">🔌</div>
                  <p className="connect-prompt-title">지갑을 연결해주세요</p>
                  <p className="connect-prompt-sub">지갑을 연결하면 보유 자산이 실시간으로 표시돼요</p>
                  <button className="btn-primary" style={{ maxWidth: 200 }} onClick={() => setShowConnectors(true)}>지갑 연결하기</button>
                </div>
              ) : (
              <div className="table-wrap">
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th>토큰</th><th>체인</th><th>지갑</th>
                      <th className="text-right">잔액</th><th className="text-right">USDC 가치</th><th className="text-right">24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAssets ? <SkeletonRows /> : displayed.length === 0 ? (
                      <tr><td colSpan={6} className="empty-cell">보유 자산이 없어요</td></tr>
                    ) : displayed.map((a, i) => (
                      <tr key={i} className="asset-tr">
                        <td><div className="token-cell"><TokenIcon symbol={a.symbol} /><span className="token-name">{a.symbol}</span></div></td>
                        <td><span className="chain-dot" style={{ background: CHAIN_META[a.chain]?.color }} /><span className="chain-label">{CHAIN_META[a.chain]?.label}</span></td>
                        <td className="wallet-cell">{a.wallet}</td>
                        <td className="text-right mono">{a.balance}</td>
                        <td className="text-right usdc-val">${a.usdcValue}</td>
                        <td className="text-right"><Change24h value={a.change24h} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )
            ) : mainTab === 'history' ? (
              <div className="history-list">
                {history.length === 0 ? (
                  <div className="empty-cell">아직 거래 기록이 없어요</div>
                ) : history.map((h, i) => (
                  <div key={i} className={`history-row ${h.status}`}>
                    <div className="history-left">
                      <span className={`history-type ${h.type}`}>{{ swap: '스왑', bridge: '브릿지', send: '전송' }[h.type]}</span>
                      <span className="history-summary">{h.summary}</span>
                    </div>
                    <div className="history-right">
                      <span className="history-time">{new Date(h.timestamp).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {h.txHash && <a className="history-link" href={`https://testnet.arcscan.app/tx/${h.txHash}`} target="_blank" rel="noopener noreferrer">ArcScan →</a>}
                      <span className={`history-status ${h.status}`}>{h.status === 'success' ? '✅' : '❌'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 파우셋 탭 */
              <div className="faucet-list">
                <div className="faucet-header">
                  <p className="faucet-desc">테스트 토큰을 무료로 받을 수 있어요. 아래 파우셋을 클릭하면 외부 사이트로 이동해요.</p>
                </div>
                {FAUCETS.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="faucet-row">
                    <div className="faucet-left">
                      <span className="chain-dot" style={{ background: CHAIN_META[f.chainId]?.color }} />
                      <div className="faucet-text">
                        <span className="faucet-name">{f.name}</span>
                        <span className="faucet-chain">{f.chain} · {f.desc}</span>
                      </div>
                    </div>
                    <div className="faucet-tokens">
                      {f.tokens.map((t) => <span key={t} className="faucet-token">{t}</span>)}
                      <span className="faucet-arrow">→</span>
                    </div>
                  </a>
                ))}
                <div className="faucet-tip">
                  💡 Arc Testnet USDC는 Circle Faucet에서 받으세요. 지갑 주소를 입력하면 즉시 지급돼요.
                </div>
              </div>
            )}
          </div>

          {/* 오른쪽: 액션 패널 */}
          <div className="panel action-panel">
            <div className="action-tabs">
              {(['swap', 'bridge', 'send'] as ActionTab[]).map((t) => (
                <button key={t} className={`action-tab ${actionTab === t ? 'active' : ''}`}
                  onClick={() => { setActionTab(t); setTxStatus(''); setTxError(''); setTxHash('') }}>
                  {{ swap: '스왑', bridge: '브릿지', send: '전송' }[t]}
                </button>
              ))}
            </div>
            <div className="action-body">
              {actionTab === 'swap' && <>
                <p className="action-desc">ETH → USDC 스왑 (Arc Testnet)</p>
                <div className="swap-row"><div className="swap-badge">ETH</div><span className="swap-arrow">→</span><div className="swap-badge">USDC</div></div>
                <label className="input-label">금액 (ETH)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openSwapConfirm} disabled={txLoading}>{txLoading ? '처리 중...' : 'USDC로 스왑'}</button>
              </>}
              {actionTab === 'bridge' && <>
                <p className="action-desc">USDC → Arc Unified Balance</p>
                <label className="input-label">출발 체인</label>
                <select className="action-input" value={fromChain} onChange={(e) => setFromChain(e.target.value as typeof fromChain)}>
                  <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
                  <option value="Base_Sepolia">Base Sepolia</option>
                </select>
                <label className="input-label">금액 (USDC)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openBridgeConfirm} disabled={txLoading}>{txLoading ? '처리 중...' : 'Arc로 브릿지'}</button>
              </>}
              {actionTab === 'send' && <>
                <p className="action-desc">USDC 전송 (Arc Testnet)</p>
                <label className="input-label">받는 주소</label>
                <input className="action-input" type="text" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                <label className="input-label">금액 (USDC)</label>
                <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary" onClick={openSendConfirm} disabled={txLoading}>{txLoading ? '처리 중...' : 'USDC 전송'}</button>
              </>}

              {(txStatus || txError) && (
                <div className={`tx-status ${txError ? 'error' : 'success'}`}>
                  <span>{txError || txStatus}</span>
                  {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer">ArcScan →</a>}
                </div>
              )}

              {/* 보안 안내 */}
              <div className="security-note">
                🔒 거래 서명 전 내용을 반드시 확인하세요.<br />
                USDC Portal은 개인키를 저장하지 않습니다.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
