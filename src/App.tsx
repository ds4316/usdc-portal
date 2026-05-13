import { useState, useEffect } from 'react'
import {
  useConnect,
  useDisconnect,
  useConnections,
  useSwitchChain,
} from 'wagmi'
import { createPublicClient, http, formatUnits } from 'viem'
import { mainnet, base, polygon, arbitrum, sepolia, baseSepolia } from 'wagmi/chains'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { arcTestnet } from './wagmi.config'
import './App.css'

const kit = new AppKit()

// ─── ERC20 ABI ────────────────────────────────────────────────────────────
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── 체인 설정 ─────────────────────────────────────────────────────────────
export const CHAINS = [mainnet, base, polygon, arbitrum, arcTestnet, sepolia, baseSepolia] as const

export const CHAIN_META: Record<number, { label: string; color: string; isTestnet: boolean }> = {
  [mainnet.id]:     { label: 'Ethereum',       color: '#627eea', isTestnet: false },
  [base.id]:        { label: 'Base',            color: '#0052ff', isTestnet: false },
  [polygon.id]:     { label: 'Polygon',         color: '#8247e5', isTestnet: false },
  [arbitrum.id]:    { label: 'Arbitrum',        color: '#12aaff', isTestnet: false },
  [arcTestnet.id]:  { label: 'Arc Testnet',     color: '#00c2ff', isTestnet: true  },
  [sepolia.id]:     { label: 'Eth Sepolia',     color: '#627eea', isTestnet: true  },
  [baseSepolia.id]: { label: 'Base Sepolia',    color: '#0052ff', isTestnet: true  },
}

// ─── 토큰별 색상 ───────────────────────────────────────────────────────────
const TOKEN_COLORS: Record<string, string> = {
  ETH:    '#627eea',
  WETH:   '#627eea',
  USDC:   '#2775ca',
  'USDC (gas)': '#2775ca',
  USDT:   '#26a17b',
  DAI:    '#f5ac37',
  MATIC:  '#8247e5',
  POL:    '#8247e5',
  ARB:    '#12aaff',
}

// ─── 체인별 ERC20 토큰 목록 ────────────────────────────────────────────────
type TokenInfo = { symbol: string; address: `0x${string}`; decimals: number; coingeckoId: string }

const TOKENS: Record<number, TokenInfo[]> = {
  // ── 메인넷 ──
  [mainnet.id]: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  coingeckoId: 'usd-coin'  },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  coingeckoId: 'tether'    },
    { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth'      },
    { symbol: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai'       },
  ],
  [base.id]: [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  coingeckoId: 'usd-coin'  },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth'      },
    { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, coingeckoId: 'dai'       },
  ],
  [polygon.id]: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  coingeckoId: 'usd-coin'    },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  coingeckoId: 'tether'      },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth'        },
  ],
  [arbitrum.id]: [
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6,  coingeckoId: 'usd-coin'  },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  coingeckoId: 'tether'    },
    { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, coingeckoId: 'weth'      },
    { symbol: 'ARB',  address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, coingeckoId: 'arbitrum'  },
  ],
  // ── 테스트넷 ──
  [arcTestnet.id]: [
    { symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6, coingeckoId: 'usd-coin' },
  ],
  [sepolia.id]: [
    { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, coingeckoId: 'tether'   },
  ],
  [baseSepolia.id]: [
    { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, coingeckoId: 'usd-coin' },
  ],
}

// ─── 지갑 설치 링크 ────────────────────────────────────────────────────────
const INSTALL_LINKS: Record<string, { url: string; label: string }> = {
  MetaMask:          { url: 'https://metamask.io/download/',                 label: 'MetaMask 설치하기'       },
  'Coinbase Wallet': { url: 'https://www.coinbase.com/wallet/downloads',     label: 'Coinbase Wallet 설치하기' },
  WalletConnect:     { url: 'https://walletconnect.com/',                    label: 'WalletConnect 열기'      },
}

function friendlyConnectError(error: Error | null, connectorName: string): string | null {
  if (!error) return null
  const msg = error.message.toLowerCase()
  if (msg.includes('provider') || msg.includes('not found') || msg.includes('install') || msg.includes('injected')) {
    return `${connectorName}이(가) 설치되지 않았어요.`
  }
  if (msg.includes('user rejected') || msg.includes('denied')) return '연결을 취소했어요.'
  return '연결에 실패했어요. 다시 시도해주세요.'
}

// ─── CoinGecko 가격 조회 ───────────────────────────────────────────────────
async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {}
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    const res = await fetch(url)
    const data = await res.json()
    const result: Record<string, number> = {}
    for (const id of ids) result[id] = data[id]?.usd ?? 0
    return result
  } catch {
    return {}
  }
}

// ─── 타입 ─────────────────────────────────────────────────────────────────
interface AssetRow {
  wallet: string
  chain: number
  symbol: string
  balance: string
  usdcValue: string
  coingeckoId: string
}

type TabType = 'assets' | 'bridge' | 'send' | 'swap'
type ChainFilter = 'all' | 'mainnet' | 'testnet'

// ─── viem public clients ──────────────────────────────────────────────────
const RPC_URLS: Record<number, string> = {
  [mainnet.id]:     'https://cloudflare-eth.com',
  [base.id]:        'https://mainnet.base.org',
  [polygon.id]:     'https://polygon-rpc.com',
  [arbitrum.id]:    'https://arb1.arbitrum.io/rpc',
  [arcTestnet.id]:  'https://rpc.testnet.arc.network',
}

const publicClients = Object.fromEntries(
  CHAINS.map((chain) => [
    chain.id,
    createPublicClient({
      chain,
      transport: http(RPC_URLS[chain.id]),
    }),
  ])
)

// ─── 스켈레톤 로딩 컴포넌트 ──────────────────────────────────────────────
function SkeletonRows() {
  return (
    <div className="asset-list">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="asset-row skeleton-row">
          <div className="asset-left">
            <div className="skeleton skeleton-symbol" />
            <div className="skeleton skeleton-chain" />
          </div>
          <div className="asset-right">
            <div className="skeleton skeleton-balance" />
            <div className="skeleton skeleton-usdc" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 토큰 아이콘 컴포넌트 ─────────────────────────────────────────────────
function TokenIcon({ symbol }: { symbol: string }) {
  const color = TOKEN_COLORS[symbol] ?? '#555'
  const letter = symbol.replace(' (gas)', '').charAt(0)
  return (
    <div className="token-icon" style={{ background: color + '22', color }}>
      {letter}
    </div>
  )
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────
export default function App() {
  const connections = useConnections()
  const { connectors, connect, isPending: isConnecting, error: connectError, variables: connectVariables } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()

  const [tab, setTab] = useState<TabType>('assets')
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all')
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [totalUsdc, setTotalUsdc] = useState('0.00')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)

  // 거래 폼 상태
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

  useEffect(() => {
    if (allAddresses.length > 0) loadAssets()
  }, [connections.length, allAddresses.join(',')])

  // ─── 자산 조회 ────────────────────────────────────────────────────────
  async function loadAssets() {
    if (allAddresses.length === 0) return
    setLoadingAssets(true)
    try {
      const rows: AssetRow[] = []

      for (const address of allAddresses) {
        const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`

        for (const chain of CHAINS) {
          const client = publicClients[chain.id]

          // 네이티브 토큰
          try {
            const nativeBal = await client.getBalance({ address })
            if (nativeBal > 0n) {
              const isArc = chain.id === arcTestnet.id
              rows.push({
                wallet: shortAddr,
                chain: chain.id,
                symbol: isArc ? 'USDC (gas)' : chain.id === polygon.id ? 'POL' : 'ETH',
                balance: parseFloat(formatUnits(nativeBal, 18)).toFixed(6),
                usdcValue: '0',
                coingeckoId: isArc ? 'usd-coin' : chain.id === polygon.id ? 'matic-network' : 'ethereum',
              })
            }
          } catch { /* RPC 오류 무시 */ }

          // ERC20 토큰
          for (const token of TOKENS[chain.id] ?? []) {
            try {
              const bal = await client.readContract({
                address: token.address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address],
              })
              if ((bal as bigint) > 0n) {
                rows.push({
                  wallet: shortAddr,
                  chain: chain.id,
                  symbol: token.symbol,
                  balance: parseFloat(formatUnits(bal as bigint, token.decimals)).toFixed(6),
                  usdcValue: '0',
                  coingeckoId: token.coingeckoId,
                })
              }
            } catch { /* RPC 오류 무시 */ }
          }
        }
      }

      // 가격 조회 후 USDC 환산
      const ids = [...new Set(rows.map((r) => r.coingeckoId))]
      const prices = await fetchPrices(ids)

      let total = 0
      const enriched = rows.map((r) => {
        const price = prices[r.coingeckoId] ?? 1
        const val = parseFloat(r.balance) * price
        total += val
        return { ...r, usdcValue: val.toFixed(2) }
      })

      // USDC 가치 높은 순 정렬
      enriched.sort((a, b) => parseFloat(b.usdcValue) - parseFloat(a.usdcValue))

      setAssets(enriched)
      setTotalUsdc(total.toFixed(2))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAssets(false)
    }
  }

  // ─── App Kit adapter ──────────────────────────────────────────────────
  async function getAdapter() {
    const provider = (window as { ethereum?: Parameters<typeof createViemAdapterFromProvider>[0]['provider'] }).ethereum
    if (!provider) throw new Error('지갑을 먼저 연결해주세요')
    return createViemAdapterFromProvider({ provider })
  }

  // ─── 브릿지 ──────────────────────────────────────────────────────────
  async function handleBridge() {
    if (!amount) return setTxError('금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('브릿지 처리 중...')
    try {
      const adapter = await getAdapter()
      const result = await kit.unifiedBalance.deposit({ from: { adapter, chain: fromChain }, amount, token: 'USDC' })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setTxStatus(`✅ 브릿지 완료! ${amount} USDC → Arc Unified Balance`)
      setAmount('')
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('')
    } finally { setTxLoading(false) }
  }

  // ─── 전송 ────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!recipient || !amount) return setTxError('주소와 금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('전송 중...')
    try {
      const adapter = await getAdapter()
      const result = await kit.unifiedBalance.spend({
        amount, token: 'USDC', from: [{ adapter }],
        to: { adapter, chain: 'Arc_Testnet', recipientAddress: recipient as `0x${string}` },
      })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setTxStatus(`✅ 전송 완료! ${amount} USDC → ${recipient.slice(0, 6)}...${recipient.slice(-4)}`)
      setAmount(''); setRecipient('')
      loadAssets()
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('')
    } finally { setTxLoading(false) }
  }

  // ─── 스왑 ────────────────────────────────────────────────────────────
  async function handleSwap() {
    if (!amount) return setTxError('금액을 입력하세요')
    setTxLoading(true); setTxError(''); setTxHash(''); setTxStatus('스왑 처리 중...')
    try {
      const adapter = await getAdapter()
      const result = await (kit as unknown as {
        swap: { execute: (p: { fromToken: string; toToken: string; amount: string; adapter: unknown; networkType: string }) => Promise<{ txHash?: string }> }
      }).swap.execute({ fromToken: 'ETH', toToken: 'USDC', amount, adapter, networkType: 'testnet' })
      setTxHash(result.txHash ?? '')
      setTxStatus(`✅ 스왑 완료! ${amount} ETH → USDC`)
      setAmount('')
      loadAssets()
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e)); setTxStatus('')
    } finally { setTxLoading(false) }
  }

  function clearTx() { setTxStatus(''); setTxError(''); setTxHash('') }

  // ─── 필터링된 자산 ────────────────────────────────────────────────────
  const filteredAssets = assets.filter((a) => {
    if (chainFilter === 'mainnet') return !CHAIN_META[a.chain]?.isTestnet
    if (chainFilter === 'testnet') return CHAIN_META[a.chain]?.isTestnet
    return true
  })

  // ─── 커넥터 목록 렌더 ─────────────────────────────────────────────────
  function ConnectorList({ onConnect }: { onConnect?: () => void }) {
    return (
      <div className="connector-list">
        {connectors.map((connector) => {
          const isThisConnecting = isConnecting && connectingId === connector.uid
          const hasError = connectError && connectVariables?.connector === connector
          const errMsg = hasError ? friendlyConnectError(connectError, connector.name) : null
          const installInfo = INSTALL_LINKS[connector.name]
          return (
            <div key={connector.uid} className="connector-item">
              <button
                className={`btn-connector ${errMsg ? 'has-error' : ''}`}
                onClick={() => { setConnectingId(connector.uid); connect({ connector }); onConnect?.() }}
                disabled={isConnecting}
              >
                {isThisConnecting ? '연결 중...' : connector.name}
              </button>
              {errMsg && (
                <div className="connector-error">
                  <span>{errMsg}</span>
                  {installInfo && (
                    <a href={installInfo.url} target="_blank" rel="noopener noreferrer">{installInfo.label} →</a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── 미연결 화면 ──────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="app">
        <header>
          <h1>USDC Portal</h1>
          <p className="subtitle">모든 자산을 USDC로 — Arc Network</p>
        </header>
        <div className="card connect-card">
          <p className="connect-desc">지갑을 연결하면 보유한 모든 자산을 실시간 USDC 가치로 확인하고, 한 번에 스왑·브릿지·전송할 수 있어요.</p>
          <button className="btn-primary" onClick={() => setShowConnectors((v) => !v)}>
            지갑 연결하기
          </button>
          {showConnectors && <ConnectorList />}
        </div>
      </div>
    )
  }

  // ─── 메인 화면 ────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header>
        <h1>USDC Portal</h1>
        <p className="subtitle">Arc Network 기반 크로스체인 USDC 포탈</p>
      </header>

      {/* 연결된 지갑 목록 */}
      <div className="card">
        <div className="wallets-header">
          <h2>연결된 지갑 ({connections.length})</h2>
          <button className="btn-refresh" onClick={() => setShowConnectors((v) => !v)}>+ 지갑 추가</button>
        </div>
        {showConnectors && <ConnectorList onConnect={() => setShowConnectors(false)} />}
        <div className="wallet-list">
          {connections.map((conn) =>
            conn.accounts.map((addr) => (
              <div key={addr} className="wallet-row">
                <div className="wallet-info">
                  <div className="wallet-dot" />
                  <span className="wallet-address">{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                  <span className="chain-badge" style={{ borderColor: CHAIN_META[conn.chainId]?.color ?? '#666' }}>
                    {CHAIN_META[conn.chainId]?.label ?? conn.connector.name}
                  </span>
                </div>
                <button className="btn-disconnect" onClick={() => disconnect({ connector: conn.connector })}>해제</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 체인 전환 */}
      <div className="card">
        <h2>체인 전환</h2>
        <div className="chain-switch-row">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              className={`btn-chain ${activeChainId === c.id ? 'active' : ''}`}
              style={activeChainId === c.id ? { borderColor: CHAIN_META[c.id].color, color: CHAIN_META[c.id].color } : {}}
              onClick={() => switchChain({ chainId: c.id })}
            >
              {CHAIN_META[c.id].label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 */}
      <div className="tabs">
        {(['assets', 'bridge', 'send', 'swap'] as TabType[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); clearTx() }}>
            {{ assets: '자산', bridge: '브릿지', send: '전송', swap: '스왑' }[t]}
          </button>
        ))}
      </div>

      {/* ── 자산 탭 ── */}
      {tab === 'assets' && (
        <div className="card">
          <div className="assets-header">
            <h2>전체 자산 ({connections.length}개 지갑)</h2>
            <button className="btn-refresh" onClick={loadAssets} disabled={loadingAssets}>
              {loadingAssets ? '조회 중...' : '새로고침'}
            </button>
          </div>

          {/* 총 자산 */}
          <div className="total-usdc">
            <span className="total-label">총 자산 가치</span>
            <span className="total-value">${totalUsdc}</span>
            <span className="total-unit">USDC</span>
          </div>

          {/* 메인넷 / 테스트넷 필터 */}
          <div className="filter-row">
            {(['all', 'mainnet', 'testnet'] as ChainFilter[]).map((f) => (
              <button key={f} className={`btn-filter ${chainFilter === f ? 'active' : ''}`} onClick={() => setChainFilter(f)}>
                {{ all: '전체', mainnet: '메인넷', testnet: '테스트넷' }[f]}
              </button>
            ))}
          </div>

          {/* 자산 목록 */}
          {loadingAssets ? (
            <SkeletonRows />
          ) : filteredAssets.length === 0 ? (
            <p className="empty-msg">보유 자산이 없어요</p>
          ) : (
            <div className="asset-list">
              {filteredAssets.map((a, i) => (
                <div key={i} className="asset-row" style={{ borderLeftColor: CHAIN_META[a.chain]?.color ?? '#444' }}>
                  <div className="asset-left">
                    <TokenIcon symbol={a.symbol} />
                    <div className="asset-text">
                      <span className="asset-symbol">{a.symbol}</span>
                      <span className="asset-chain">{CHAIN_META[a.chain]?.label} · {a.wallet}</span>
                    </div>
                  </div>
                  <div className="asset-right">
                    <span className="asset-balance">{a.balance}</span>
                    <span className="asset-usdc">${a.usdcValue}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 브릿지 탭 ── */}
      {tab === 'bridge' && (
        <div className="card">
          <h2>브릿지</h2>
          <p className="tab-desc">다른 체인의 USDC를 Arc Unified Balance로 이동 (Testnet)</p>
          <select value={fromChain} onChange={(e) => setFromChain(e.target.value as typeof fromChain)}>
            <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
            <option value="Base_Sepolia">Base Sepolia</option>
          </select>
          <input type="number" placeholder="USDC 금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-primary" onClick={handleBridge} disabled={txLoading}>
            {txLoading ? '처리 중...' : 'Arc로 브릿지'}
          </button>
        </div>
      )}

      {/* ── 전송 탭 ── */}
      {tab === 'send' && (
        <div className="card">
          <h2>전송</h2>
          <p className="tab-desc">USDC를 다른 지갑으로 전송 (Arc Testnet)</p>
          <input type="text" placeholder="받는 주소 (0x...)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <input type="number" placeholder="USDC 금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-primary" onClick={handleSend} disabled={txLoading}>
            {txLoading ? '전송 중...' : 'USDC 전송'}
          </button>
        </div>
      )}

      {/* ── 스왑 탭 ── */}
      {tab === 'swap' && (
        <div className="card">
          <h2>스왑</h2>
          <p className="tab-desc">ETH → USDC 스왑 (Arc Testnet)</p>
          <div className="swap-direction">
            <div className="swap-token">ETH</div>
            <span className="swap-arrow">→</span>
            <div className="swap-token">USDC</div>
          </div>
          <input type="number" placeholder="ETH 금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-primary" onClick={handleSwap} disabled={txLoading}>
            {txLoading ? '스왑 중...' : 'USDC로 스왑'}
          </button>
        </div>
      )}

      {/* 트랜잭션 상태 */}
      {(txStatus || txError) && (
        <div className={`status ${txError ? 'error' : 'success'}`}>
          <span>{txError || txStatus}</span>
          {txHash && (
            <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              ArcScan에서 확인 →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
