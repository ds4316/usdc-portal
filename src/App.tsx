import { useState, useEffect } from 'react'
import { useConnect, useDisconnect, useConnections, useSwitchChain } from 'wagmi'
import { createPublicClient, fallback, http, formatUnits } from 'viem'
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

// ─── 토큰 ─────────────────────────────────────────────────────────────────
const TOKEN_COLORS: Record<string, string> = {
  ETH: '#627eea', WETH: '#627eea', USDC: '#2775ca', 'USDC (gas)': '#2775ca',
  USDT: '#26a17b', DAI: '#f5ac37', MATIC: '#8247e5', POL: '#8247e5', ARB: '#12aaff',
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

// ─── 지갑 설치 링크 ────────────────────────────────────────────────────────
const INSTALL_LINKS: Record<string, { url: string; label: string }> = {
  MetaMask:          { url: 'https://metamask.io/download/',             label: 'MetaMask 설치하기'       },
  'Coinbase Wallet': { url: 'https://www.coinbase.com/wallet/downloads', label: 'Coinbase Wallet 설치하기' },
  WalletConnect:     { url: 'https://walletconnect.com/',                label: 'WalletConnect 열기'      },
}

function friendlyConnectError(error: Error | null, name: string): string | null {
  if (!error) return null
  const msg = error.message.toLowerCase()
  if (msg.includes('provider') || msg.includes('not found') || msg.includes('install')) return `${name}이(가) 설치되지 않았어요.`
  if (msg.includes('user rejected') || msg.includes('denied')) return '연결을 취소했어요.'
  return '연결에 실패했어요. 다시 시도해주세요.'
}

// ─── 가격 조회 ────────────────────────────────────────────────────────────
async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {}
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`)
    const data = await res.json()
    return Object.fromEntries(ids.map((id) => [id, data[id]?.usd ?? 0]))
  } catch { return {} }
}

// ─── 타입 ─────────────────────────────────────────────────────────────────
interface AssetRow { wallet: string; chain: number; symbol: string; balance: string; usdcValue: string; coingeckoId: string }
type ChainFilter = 'all' | 'mainnet' | 'testnet'
type ActionTab = 'swap' | 'bridge' | 'send'
type Theme = 'dark' | 'light'

// ─── Public clients (fallback transport) ──────────────────────────────────
const publicClients = Object.fromEntries(
  CHAINS.map((chain) => {
    const rpcs: Record<number, string[]> = {
      [mainnet.id]:     ['https://eth.llamarpc.com', 'https://1rpc.io/eth'],
      [base.id]:        ['https://mainnet.base.org', 'https://1rpc.io/base'],
      [polygon.id]:     ['https://polygon.llamarpc.com', 'https://1rpc.io/matic'],
      [arbitrum.id]:    ['https://arb1.arbitrum.io/rpc', 'https://1rpc.io/arb'],
      [arcTestnet.id]:  ['https://rpc.testnet.arc.network'],
    }
    const urls = rpcs[chain.id]
    const transport = urls ? fallback(urls.map((u) => http(u))) : http()
    return [chain.id, createPublicClient({ chain, transport })]
  })
)

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <tr key={i} className="skeleton-row">
          <td><div className="skel skel-med" /></td>
          <td><div className="skel skel-sm" /></td>
          <td><div className="skel skel-sm" /></td>
          <td><div className="skel skel-med" /></td>
          <td><div className="skel skel-sm" /></td>
        </tr>
      ))}
    </>
  )
}

// ─── 토큰 아이콘 ──────────────────────────────────────────────────────────
function TokenIcon({ symbol }: { symbol: string }) {
  const color = TOKEN_COLORS[symbol] ?? '#555'
  return <span className="token-icon" style={{ background: color + '22', color }}>{symbol.replace(' (gas)', '').charAt(0)}</span>
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────
export default function App() {
  const connections = useConnections()
  const { connectors, connect, isPending: isConnecting, error: connectError, variables: connectVariables } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  const [theme, setTheme] = useState<Theme>('dark')
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [totalUsdc, setTotalUsdc] = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all')
  const [sortBy, setSortBy] = useState<'value' | 'symbol' | 'chain'>('value')
  const [showConnectors, setShowConnectors] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [actionTab, setActionTab] = useState<ActionTab>('swap')

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

  useEffect(() => { if (allAddresses.length > 0) loadAssets() }, [connections.length, allAddresses.join(',')])

  // ─── 자산 조회 ──────────────────────────────────────────────────────────
  async function loadAssets() {
    if (!allAddresses.length) return
    setLoadingAssets(true)
    try {
      const rows: AssetRow[] = []
      for (const address of allAddresses) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`
        for (const chain of CHAINS) {
          const client = publicClients[chain.id]
          // 네이티브 잔액
          try {
            const bal = await client.getBalance({ address })
            if (bal > 0n) {
              const isArc = chain.id === arcTestnet.id
              const isPoly = chain.id === polygon.id
              rows.push({ wallet: shortAddr, chain: chain.id, balance: parseFloat(formatUnits(bal, 18)).toFixed(6),
                symbol: isArc ? 'USDC (gas)' : isPoly ? 'POL' : 'ETH',
                usdcValue: '0', coingeckoId: isArc ? 'usd-coin' : isPoly ? 'matic-network' : 'ethereum' })
            }
          } catch { /* RPC 실패 무시 */ }
          // ERC20 잔액
          for (const token of TOKENS[chain.id] ?? []) {
            try {
              const bal = await client.readContract({ address: token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
              if ((bal as bigint) > 0n)
                rows.push({ wallet: shortAddr, chain: chain.id, symbol: token.symbol,
                  balance: parseFloat(formatUnits(bal as bigint, token.decimals)).toFixed(6), usdcValue: '0', coingeckoId: token.coingeckoId })
            } catch { /* RPC 실패 무시 */ }
          }
        }
      }
      const ids = [...new Set(rows.map((r) => r.coingeckoId))]
      const prices = await fetchPrices(ids)
      let total = 0
      const enriched = rows.map((r) => {
        const val = parseFloat(r.balance) * (prices[r.coingeckoId] ?? 1)
        total += val
        return { ...r, usdcValue: val.toFixed(2) }
      })
      setAssets(enriched)
      setTotalUsdc(total.toFixed(2))
    } finally { setLoadingAssets(false) }
  }

  // ─── 요약 카드 값 ────────────────────────────────────────────────────────
  const ethValue  = assets.filter((a) => a.symbol === 'ETH').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const usdcValue = assets.filter((a) => a.symbol === 'USDC' || a.symbol === 'USDC (gas)').reduce((s, a) => s + parseFloat(a.usdcValue), 0)
  const otherValue = parseFloat(totalUsdc) - ethValue - usdcValue

  // ─── 필터 & 정렬 ────────────────────────────────────────────────────────
  const displayed = assets
    .filter((a) => chainFilter === 'all' ? true : chainFilter === 'mainnet' ? !CHAIN_META[a.chain]?.isTestnet : CHAIN_META[a.chain]?.isTestnet)
    .sort((a, b) => sortBy === 'value' ? parseFloat(b.usdcValue) - parseFloat(a.usdcValue) : sortBy === 'symbol' ? a.symbol.localeCompare(b.symbol) : a.chain - b.chain)

  // ─── App Kit adapter ────────────────────────────────────────────────────
  async function getAdapter() {
    const provider = (window as { ethereum?: Parameters<typeof createViemAdapterFromProvider>[0]['provider'] }).ethereum
    if (!provider) throw new Error('지갑을 먼저 연결해주세요')
    return createViemAdapterFromProvider({ provider })
  }

  async function handleBridge() {
    if (!amount) return setTxError('금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('브릿지 처리 중...')
    try {
      const adapter = await getAdapter()
      const result = await kit.unifiedBalance.deposit({ from: { adapter, chain: fromChain }, amount, token: 'USDC' })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setTxStatus(`✅ ${amount} USDC → Arc Unified Balance`)
      setAmount('')
    } catch (e) { setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('') }
    finally { setTxLoading(false) }
  }

  async function handleSend() {
    if (!recipient || !amount) return setTxError('주소와 금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('전송 중...')
    try {
      const adapter = await getAdapter()
      const result = await kit.unifiedBalance.spend({ amount, token: 'USDC', from: [{ adapter }],
        to: { adapter, chain: 'Arc_Testnet', recipientAddress: recipient as `0x${string}` } })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setTxStatus(`✅ ${amount} USDC → ${recipient.slice(0, 6)}...${recipient.slice(-4)}`)
      setAmount(''); setRecipient(''); loadAssets()
    } catch (e) { setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('') }
    finally { setTxLoading(false) }
  }

  async function handleSwap() {
    if (!amount) return setTxError('금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('스왑 처리 중...')
    try {
      const adapter = await getAdapter()
      const result = await (kit as unknown as { swap: { execute: (p: { fromToken: string; toToken: string; amount: string; adapter: unknown; networkType: string }) => Promise<{ txHash?: string }> } })
        .swap.execute({ fromToken: 'ETH', toToken: 'USDC', amount, adapter, networkType: 'testnet' })
      setTxHash(result.txHash ?? '')
      setTxStatus(`✅ ${amount} ETH → USDC`)
      setAmount(''); loadAssets()
    } catch (e) { setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('') }
    finally { setTxLoading(false) }
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
                {isThis ? '연결 중...' : connector.name}
              </button>
              {errMsg && (
                <div className="connector-error">
                  <span>{errMsg}</span>
                  {info && <a href={info.url} target="_blank" rel="noopener noreferrer">{info.label} →</a>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── 미연결 화면 ────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="root" data-theme={theme}>
        <div className="landing">
          <div className="landing-inner">
            <h1 className="landing-title">USDC Portal</h1>
            <p className="landing-sub">모든 체인의 자산을 한 곳에서 — 실시간 USDC 환산</p>
            <button className="btn-primary btn-lg" onClick={() => setShowConnectors((v) => !v)}>지갑 연결하기</button>
            {showConnectors && <ConnectorList />}
          </div>
        </div>
      </div>
    )
  }

  // ─── 메인 대시보드 ──────────────────────────────────────────────────────
  return (
    <div className="root" data-theme={theme}>

      {/* 상단 내비바 */}
      <nav className="navbar">
        <span className="nav-logo">USDC Portal</span>
        <div className="nav-right">
          {/* 체인 전환 */}
          <select className="chain-select" value={activeChainId ?? ''} onChange={(e) => switchChain({ chainId: Number(e.target.value) })}>
            {CHAINS.map((c) => <option key={c.id} value={c.id}>{CHAIN_META[c.id].label}</option>)}
          </select>
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
            <button className="btn-add-wallet" onClick={() => setShowConnectors((v) => !v)}>+ 지갑 추가</button>
            {showConnectors && (
              <div className="wallet-dropdown">
                <ConnectorList />
              </div>
            )}
          </div>
          {/* 테마 토글 */}
          <button className="btn-theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} title="테마 전환">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      <main className="dashboard">

        {/* 요약 카드 */}
        <div className="summary-grid">
          <div className="summary-card">
            <span className="summary-label">총 자산 가치</span>
            <span className="summary-value">${totalUsdc}</span>
            <span className="summary-unit">USDC</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">ETH 가치</span>
            <span className="summary-value" style={{ color: '#627eea' }}>${ethValue.toFixed(2)}</span>
            <span className="summary-unit">USD</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">USDC 잔액</span>
            <span className="summary-value" style={{ color: '#2775ca' }}>${usdcValue.toFixed(2)}</span>
            <span className="summary-unit">USDC</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">기타 자산</span>
            <span className="summary-value">${otherValue.toFixed(2)}</span>
            <span className="summary-unit">USD</span>
          </div>
        </div>

        {/* 자산 테이블 + 액션 패널 */}
        <div className="content-grid">

          {/* 자산 테이블 */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title-row">
                <h2 className="panel-title">자산 목록</h2>
                <button className="btn-icon" onClick={loadAssets} disabled={loadingAssets} title="새로고침">
                  {loadingAssets ? '⟳' : '↻'}
                </button>
              </div>
              <div className="table-controls">
                <div className="filter-tabs">
                  {(['all', 'mainnet', 'testnet'] as ChainFilter[]).map((f) => (
                    <button key={f} className={`filter-tab ${chainFilter === f ? 'active' : ''}`} onClick={() => setChainFilter(f)}>
                      {{ all: '전체', mainnet: '메인넷', testnet: '테스트넷' }[f]}
                    </button>
                  ))}
                </div>
                <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                  <option value="value">가치 순</option>
                  <option value="symbol">토큰 순</option>
                  <option value="chain">체인 순</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="asset-table">
                <thead>
                  <tr>
                    <th>토큰</th>
                    <th>체인</th>
                    <th>지갑</th>
                    <th className="text-right">잔액</th>
                    <th className="text-right">USDC 가치</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAssets ? <SkeletonRows /> : displayed.length === 0 ? (
                    <tr><td colSpan={5} className="empty-cell">보유 자산이 없어요</td></tr>
                  ) : displayed.map((a, i) => (
                    <tr key={i} className="asset-tr">
                      <td>
                        <div className="token-cell">
                          <TokenIcon symbol={a.symbol} />
                          <span className="token-name">{a.symbol}</span>
                        </div>
                      </td>
                      <td>
                        <span className="chain-dot" style={{ background: CHAIN_META[a.chain]?.color }} />
                        <span className="chain-label">{CHAIN_META[a.chain]?.label}</span>
                      </td>
                      <td className="wallet-cell">{a.wallet}</td>
                      <td className="text-right mono">{a.balance}</td>
                      <td className="text-right usdc-val">${a.usdcValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 액션 패널 */}
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
              {actionTab === 'swap' && (
                <>
                  <p className="action-desc">ETH → USDC 스왑 (Arc Testnet)</p>
                  <div className="swap-row">
                    <div className="swap-badge">ETH</div>
                    <span className="swap-arrow">→</span>
                    <div className="swap-badge">USDC</div>
                  </div>
                  <label className="input-label">금액 (ETH)</label>
                  <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn-primary" onClick={handleSwap} disabled={txLoading}>{txLoading ? '처리 중...' : 'USDC로 스왑'}</button>
                </>
              )}

              {actionTab === 'bridge' && (
                <>
                  <p className="action-desc">다른 체인 USDC → Arc Unified Balance</p>
                  <label className="input-label">출발 체인</label>
                  <select className="action-input" value={fromChain} onChange={(e) => setFromChain(e.target.value as typeof fromChain)}>
                    <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
                    <option value="Base_Sepolia">Base Sepolia</option>
                  </select>
                  <label className="input-label">금액 (USDC)</label>
                  <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn-primary" onClick={handleBridge} disabled={txLoading}>{txLoading ? '처리 중...' : 'Arc로 브릿지'}</button>
                </>
              )}

              {actionTab === 'send' && (
                <>
                  <p className="action-desc">USDC 전송 (Arc Testnet)</p>
                  <label className="input-label">받는 주소</label>
                  <input className="action-input" type="text" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  <label className="input-label">금액 (USDC)</label>
                  <input className="action-input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn-primary" onClick={handleSend} disabled={txLoading}>{txLoading ? '전송 중...' : 'USDC 전송'}</button>
                </>
              )}

              {(txStatus || txError) && (
                <div className={`tx-status ${txError ? 'error' : 'success'}`}>
                  <span>{txError || txStatus}</span>
                  {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer">ArcScan →</a>}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
