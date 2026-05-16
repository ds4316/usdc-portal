export default async function handler(req, res) {
  const { messageHash } = req.query
  if (!messageHash) return res.status(400).json({ error: 'messageHash required' })

  try {
    // Try CCTP V2 endpoint first (Arc testnet uses V2)
    const r2 = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${messageHash}`)
    const j2 = await r2.json()
    // V2 response: { messages: [{ status, attestation, ... }] }
    if (r2.ok && j2.messages?.length > 0) {
      const msg = j2.messages[0]
      return res.status(200).json({ status: msg.status, attestation: msg.attestation, _v: 2, _raw: j2 })
    }

    // Fallback: CCTP V1 endpoint (Sepolia->Arc uses ArcOnboarder which may be V1)
    const r1 = await fetch(`https://iris-api-sandbox.circle.com/v1/attestations/${messageHash}`)
    const j1 = await r1.json()
    return res.status(r1.status).json({ ...j1, _v: 1 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
