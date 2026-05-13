import { useState } from 'react'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'
import './App.css'

const kit = new AppKit()


type Chain = 'Ethereum_Sepolia' | 'Base_Sepolia' | 'Arc_Testnet'

interface Balance {
  chain: string
  amount: string
}

const CHAIN_LABELS: Record<Chain, string> = {
  Ethereum_Sepolia: 'Ethereum Sepolia',
  Base_Sepolia: 'Base Sepolia',
  Arc_Testnet: 'Arc Testnet',
}

const CHAIN_COLORS: Record<Chain, string> = {
  Ethereum_Sepolia: '#627eea',
  Base_Sepolia: '#0052ff',
  Arc_Testnet: '#00c2ff',
}

export default function App() {
  const [privateKey, setPrivateKey] = useState('')
  const [recipient, setRecipient] = useState('')
  const [bridgeAmount, setBridgeAmount] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [fromChain, setFromChain] = useState<Chain>('Base_Sepolia')
  const [balances, setBalances] = useState<Balance[]>([])
  const [totalBalance, setTotalBalance] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error'>('success')
  const [txHash, setTxHash] = useState('')

  const setSuccess = (msg: string) => { setStatus(msg); setStatusType('success') }
  const setError = (msg: string) => { setStatus(msg); setStatusType('error') }

  const getAdapter = () => {
    if (!privateKey.startsWith('0x')) throw new Error('Private Key는 0x로 시작해야 합니다')
    return createViemAdapterFromPrivateKey({ privateKey })
  }

  const handleGetBalances = async () => {
    if (!privateKey) return setError('Private Key를 입력하세요')
    setLoading(true)
    setSuccess('잔액 조회 중...')
    try {
      const adapter = getAdapter()
      const result = await kit.unifiedBalance.getBalances({
        sources: [{ adapter }],
        networkType: 'testnet',
        includePending: true,
      })
      const breakdown = (result.breakdown ?? []) as unknown as { chain: string; confirmedBalance: string }[]
      setBalances(breakdown.map(b => ({ chain: b.chain, amount: b.confirmedBalance })))
      setTotalBalance(result.totalConfirmedBalance ?? '0')
      setSuccess(`총 잔액: ${result.totalConfirmedBalance} USDC`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async () => {
    if (!privateKey || !bridgeAmount) return setError('Private Key와 금액을 입력하세요')
    setLoading(true)
    setTxHash('')
    setSuccess(`${CHAIN_LABELS[fromChain]}에서 ${bridgeAmount} USDC 브릿지 중...`)
    try {
      const adapter = getAdapter()
      const result = await kit.unifiedBalance.deposit({
        from: { adapter, chain: fromChain },
        amount: bridgeAmount,
        token: 'USDC',
      })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setSuccess(`브릿지 완료! ${bridgeAmount} USDC → Arc Unified Balance`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!privateKey || !recipient || !sendAmount) return setError('모든 필드를 입력하세요')
    setLoading(true)
    setTxHash('')
    setSuccess(`${sendAmount} USDC 전송 중...`)
    try {
      const adapter = getAdapter()
      const result = await kit.unifiedBalance.spend({
        amount: sendAmount,
        token: 'USDC',
        from: [{ adapter }],
        to: {
          adapter,
          chain: 'Arc_Testnet',
          recipientAddress: recipient as `0x${string}`,
        },
      })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setSuccess(`전송 완료! ${sendAmount} USDC → ${recipient.slice(0, 6)}...${recipient.slice(-4)}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>USDC Portal</h1>
        <p className="subtitle">Arc Network 기반 크로스체인 USDC 포탈</p>
      </header>

      <div className="card">
        <h2>지갑 설정</h2>
        <input
          type="password"
          placeholder="Private Key (0x...)"
          value={privateKey}
          onChange={e => setPrivateKey(e.target.value)}
        />
      </div>

      <div className="card">
        <h2>멀티체인 잔액 조회</h2>
        <button onClick={handleGetBalances} disabled={loading}>
          {loading ? '조회 중...' : 'USDC 잔액 조회'}
        </button>
        {totalBalance && (
          <div className="total-balance">
            총 잔액 <span>{totalBalance} USDC</span>
          </div>
        )}
        {balances.length > 0 && (
          <div className="balances">
            {balances.map(b => (
              <div
                key={b.chain}
                className="balance-item"
                style={{ borderColor: CHAIN_COLORS[b.chain as Chain] ?? '#444' }}
              >
                <span className="chain-name">{CHAIN_LABELS[b.chain as Chain] ?? b.chain}</span>
                <span className="amount">{b.amount} USDC</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>브릿지 (다른 체인 → Arc)</h2>
        <select value={fromChain} onChange={e => setFromChain(e.target.value as Chain)}>
          <option value="Ethereum_Sepolia">Ethereum Sepolia</option>
          <option value="Base_Sepolia">Base Sepolia</option>
        </select>
        <input
          type="number"
          placeholder="금액 (USDC)"
          value={bridgeAmount}
          onChange={e => setBridgeAmount(e.target.value)}
        />
        <button onClick={handleDeposit} disabled={loading}>
          {loading ? '처리 중...' : 'Arc로 브릿지'}
        </button>
      </div>

      <div className="card">
        <h2>전송 (Arc → 지갑)</h2>
        <input
          type="text"
          placeholder="받는 주소 (0x...)"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
        />
        <input
          type="number"
          placeholder="금액 (USDC)"
          value={sendAmount}
          onChange={e => setSendAmount(e.target.value)}
        />
        <button onClick={handleSend} disabled={loading}>
          {loading ? '전송 중...' : 'USDC 전송'}
        </button>
      </div>

      {status && (
        <div className={`status ${statusType}`}>
          <span>{status}</span>
          {txHash && (
            <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              Arcscan에서 확인 →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
