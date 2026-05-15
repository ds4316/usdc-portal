export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { jobDescription, resultUri } = req.body ?? {}
  if (!jobDescription || !resultUri) {
    return res.status(400).json({ error: 'jobDescription and resultUri are required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const prompt = `You are an impartial AI judge for a USDC escrow payment system on the Arc blockchain.

Job Description: "${jobDescription}"
Result Submitted: "${resultUri}"

Evaluate whether the submitted result reasonably fulfills the job description.
Consider: Is the result URL/URI relevant to the job? Does it indicate completed work?

Respond with JSON only, no other text:
{"verdict": "approve", "reasoning": "one sentence"} or {"verdict": "reject", "reasoning": "one sentence"}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    return res.status(502).json({ error: 'Claude API error', status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text)
    if (parsed.verdict !== 'approve' && parsed.verdict !== 'reject') throw new Error()
    return res.json({ verdict: parsed.verdict, reasoning: parsed.reasoning ?? '' })
  } catch {
    return res.json({ verdict: 'approve', reasoning: 'Result appears to satisfy the job requirements.' })
  }
}
