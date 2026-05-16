export default async function handler(req, res) {
  const { messageHash, txHash, sourceDomain } = req.query

  try {
    // CCTP V2: query by transaction hash + source domain
    if (txHash && sourceDomain) {
      const r = await fetch(
        `https://iris-api-sandbox.circle.com/v2/messages/${sourceDomain}?transactionHash=${txHash}`
      )
      const j = await r.json()
      if (r.ok && j.messages?.length > 0) {
        const msg = j.messages[0]
        return res.status(200).json({ status: msg.status, attestation: msg.attestation, _v: 2 })
      }
      return res.status(200).json({ status: 'unknown', _v: 2, _raw: j })
    }

    // CCTP V1 fallback: query by message hash (Sepolia->Arc via ArcOnboarder)
    if (messageHash) {
      const r = await fetch(`https://iris-api-sandbox.circle.com/v1/attestations/${messageHash}`)
      const j = await r.json()
      return res.status(r.status).json({ ...j, _v: 1 })
    }

    return res.status(400).json({ error: 'txHash+sourceDomain or messageHash required' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
