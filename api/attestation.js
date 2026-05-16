export default async function handler(req, res) {
  const { messageHash } = req.query
  if (!messageHash) return res.status(400).json({ error: 'messageHash required' })

  try {
    const r = await fetch(`https://iris-api-sandbox.circle.com/v1/attestations/${messageHash}`)
    const json = await r.json()
    res.status(r.status).json(json)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
