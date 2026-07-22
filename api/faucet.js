const ALLOWED_BLOCKCHAINS = new Set([
  'ARC-TESTNET',
  'ETH-SEPOLIA',
  'BASE-SEPOLIA',
  'ARB-SEPOLIA',
  'OP-SEPOLIA',
  'AVAX-FUJI',
  'MATIC-AMOY',
])

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'Circle faucet API key is not configured. Add CIRCLE_API_KEY in Vercel environment variables.',
    })
  }

  const { address, blockchain = 'ARC-TESTNET', native = false, usdc = true, eurc = false } = req.body ?? {}
  if (!isAddress(address)) return res.status(400).json({ error: 'Valid EVM address required' })
  if (!ALLOWED_BLOCKCHAINS.has(blockchain)) return res.status(400).json({ error: 'Unsupported faucet blockchain' })
  if (!native && !usdc && !eurc) return res.status(400).json({ error: 'Select at least one token type' })

  try {
    const r = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({ address, blockchain, native, usdc, eurc }),
    })
    const text = await r.text()
    let data = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

    if (!r.ok) {
      return res.status(r.status).json({
        error: data.message || data.error || 'Circle faucet request failed',
        details: data,
      })
    }

    return res.status(200).json({ ok: true, data })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Faucet request failed' })
  }
}
