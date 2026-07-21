import { createPublicClient, http } from 'viem'

const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.network'
// NOTE: keep in sync with ARC_ESCROW in src/App.tsx
const ARC_ESCROW = '0x7420C7A3459B532Dee36Fc1e22badBe262BaD571'

const GET_JOB_ABI = [{
  type: 'function', name: 'getJob', stateMutability: 'view',
  inputs: [{ name: 'jobId', type: 'uint256' }],
  outputs: [
    { name: 'client', type: 'address' }, { name: 'agent', type: 'address' },
    { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
    { name: 'description', type: 'string' }, { name: 'resultUri', type: 'string' },
    { name: 'status', type: 'uint8' }, { name: 'jobType', type: 'uint8' },
  ],
}]

const RESULT_HOST_SUFFIX = '.public.blob.vercel-storage.com'
const MAX_CONTENT_BYTES = 5 * 1024 * 1024 // 5MB

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { jobId } = req.body ?? {}
  if (jobId === undefined || jobId === null || jobId === '') {
    return res.status(400).json({ error: 'jobId is required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  // Independently read the job from chain instead of trusting client-supplied
  // description/resultUri — prevents SSRF-via-arbitrary-URL and API-quota abuse
  // by callers who don't have a real submitted job.
  let description, resultUri, status
  try {
    const client = createPublicClient({ transport: http(ARC_TESTNET_RPC) })
    ;[, , , , description, resultUri, status] = await client.readContract({
      address: ARC_ESCROW, abi: GET_JOB_ABI, functionName: 'getJob', args: [BigInt(jobId)],
    })
  } catch {
    return res.status(400).json({ error: 'Could not read job from chain' })
  }

  if (Number(status) !== 1) return res.status(400).json({ error: 'Job is not in Submitted state' })
  if (!resultUri) return res.status(400).json({ error: 'Job has no result submitted' })

  let resultHost = ''
  try { resultHost = new URL(resultUri).hostname } catch { /* invalid URL */ }
  if (!resultHost.endsWith(RESULT_HOST_SUFFIX)) {
    return res.status(400).json({ error: 'Result URI host not allowed' })
  }

  // Fetch the actual content at resultUri
  let messageContent = []

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const contentRes = await fetch(resultUri, { signal: controller.signal })
    clearTimeout(timeout)

    const contentLength = Number(contentRes.headers.get('content-length') ?? '0')
    if (contentLength > MAX_CONTENT_BYTES) {
      throw new Error('Result too large')
    }

    const contentType = contentRes.headers.get('content-type') ?? ''

    if (contentType.startsWith('image/')) {
      // Claude Vision: read image and evaluate
      const buffer = await contentRes.arrayBuffer()
      if (buffer.byteLength > MAX_CONTENT_BYTES) throw new Error('Result too large')
      const base64 = Buffer.from(buffer).toString('base64')
      const mediaType = contentType.split(';')[0].trim()
      messageContent = [
        {
          type: 'text',
          text: `You are an impartial AI judge for a USDC escrow payment system.\n\nJob Description: "${description}"\n\nThe agent has submitted an image as their result. Examine the image and evaluate whether it fulfills the job description.\n\nRespond with JSON only: {"verdict":"approve","reasoning":"one specific sentence citing what you see in the image"} or {"verdict":"reject","reasoning":"one specific sentence explaining what is missing"}`,
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
      ]
    } else if (contentType.startsWith('application/pdf')) {
      const buffer = await contentRes.arrayBuffer()
      if (buffer.byteLength > MAX_CONTENT_BYTES) throw new Error('Result too large')
      const { default: pdfParse } = await import('pdf-parse')
      const parsed = await pdfParse(Buffer.from(buffer))
      const text = parsed.text.replace(/\s+/g, ' ').trim().slice(0, 3000)
      messageContent = [
        {
          type: 'text',
          text: `You are an impartial AI judge for a USDC escrow payment system.\n\nJob Description: "${description}"\n\nThe agent submitted a PDF. Extracted text content:\n\n---\n${text || '(no extractable text found in PDF)'}\n---\n\nEvaluate whether this result fulfills the job description. Quote a specific part of the result in your reasoning.\n\nRespond with JSON only: {"verdict":"approve","reasoning":"one specific sentence quoting or citing the content"} or {"verdict":"reject","reasoning":"one specific sentence explaining what is missing"}`,
        },
      ]
    } else {
      // Text/HTML: read content and evaluate
      const raw = await contentRes.text()
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
      messageContent = [
        {
          type: 'text',
          text: `You are an impartial AI judge for a USDC escrow payment system.\n\nJob Description: "${description}"\n\nThe agent submitted the following result:\n\n---\n${text}\n---\n\nEvaluate whether this result fulfills the job description. Quote a specific part of the result in your reasoning.\n\nRespond with JSON only: {"verdict":"approve","reasoning":"one specific sentence quoting or citing the content"} or {"verdict":"reject","reasoning":"one specific sentence explaining what is missing"}`,
        },
      ]
    }
  } catch {
    // Can't fetch — evaluate from URI alone
    messageContent = [
      {
        type: 'text',
        text: `You are an impartial AI judge for a USDC escrow payment system.\n\nJob Description: "${description}"\nResult URI: "${resultUri}"\n\nThe result URL could not be fetched or was rejected. Based on the URL alone, give a conservative evaluation.\n\nRespond with JSON only: {"verdict":"approve","reasoning":"..."} or {"verdict":"reject","reasoning":"Could not verify the result — the URL was not accessible."}`,
      },
    ]
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: messageContent }],
    }),
  })

  if (!response.ok) {
    return res.status(502).json({ error: 'Claude API error', status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? text)
    if (parsed.verdict !== 'approve' && parsed.verdict !== 'reject') throw new Error()
    return res.json({ verdict: parsed.verdict, reasoning: parsed.reasoning ?? '' })
  } catch {
    return res.json({ verdict: 'reject', reasoning: 'Could not parse evaluation result.' })
  }
}
