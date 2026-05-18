import { get, put } from '@vercel/blob'

const PATH = 'marketplace/requests.json'

function listingFee(days) {
  const d = Math.max(1, Math.min(7, Number(days) || 3))
  if (d <= 3) return '0.00'
  return ((d - 3) * 0.05).toFixed(2)
}

function isExpired(request) {
  return request.expiresAt && Date.now() > new Date(request.expiresAt).getTime()
}

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function cleanDealType(value) {
  return ['work', 'milestone', 'nft-otc'].includes(value) ? value : 'work'
}

function cleanText(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max)
}

async function streamToText(stream) {
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readRequests(token) {
  try {
    const result = await get(PATH, { access: 'public', token })
    if (!result || result.statusCode !== 200) return []
    const text = await streamToText(result.stream)
    const data = JSON.parse(text)
    return Array.isArray(data.requests) ? data.requests.filter((request) => !isExpired(request)) : []
  } catch {
    return []
  }
}

async function writeRequests(requests, token) {
  await put(PATH, JSON.stringify({ requests, updatedAt: new Date().toISOString() }), {
    access: 'public',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
    token,
  })
}

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return res.status(500).json({ error: 'Blob storage is not configured' })

  try {
    const requests = await readRequests(token)

    if (req.method === 'GET') {
      return res.status(200).json({ requests })
    }

    if (req.method === 'POST') {
      const {
        dealType, title, category, budget, deadlineDays, listingDays, description, deliverable, client,
        upfrontAmount, completionAmount, nftChain, nftContract, nftTokenId, nftSeller, nftCollection,
      } = req.body ?? {}
      if (!isAddress(client)) return res.status(400).json({ error: 'Valid client wallet required' })
      const safeDealType = cleanDealType(dealType)
      const parsedBudget = Number(budget)
      const parsedUpfront = Number(upfrontAmount)
      const parsedCompletion = Number(completionAmount)
      if (!cleanText(title, 140)) return res.status(400).json({ error: 'Title is required' })
      if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) return res.status(400).json({ error: 'Budget must be greater than 0' })
      if (!cleanText(description)) return res.status(400).json({ error: 'Description is required' })
      if (!cleanText(deliverable)) return res.status(400).json({ error: 'Deliverable is required' })
      if (safeDealType === 'milestone') {
        if (!Number.isFinite(parsedUpfront) || parsedUpfront < 0) return res.status(400).json({ error: 'Valid upfront amount required' })
        if (!Number.isFinite(parsedCompletion) || parsedCompletion <= 0) return res.status(400).json({ error: 'Valid completion amount required' })
        if (Math.abs(parsedBudget - (parsedUpfront + parsedCompletion)) > 0.000001) {
          return res.status(400).json({ error: 'Budget must equal upfront plus completion' })
        }
      }
      if (safeDealType === 'nft-otc') {
        if (!isAddress(nftContract)) return res.status(400).json({ error: 'Valid NFT contract required' })
        if (!cleanText(nftTokenId, 80)) return res.status(400).json({ error: 'NFT token ID required' })
        if (nftSeller && !isAddress(nftSeller)) return res.status(400).json({ error: 'Valid seller wallet required' })
      }

      const visibleDays = Math.max(1, Math.min(7, Number(listingDays) || 3))
      const createdAt = new Date()
      const next = {
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dealType: safeDealType,
        title: cleanText(title, 140),
        category: cleanText(category, 60) || 'AI Work',
        budget: parsedBudget.toFixed(2),
        upfrontAmount: safeDealType === 'milestone' ? parsedUpfront.toFixed(2) : undefined,
        completionAmount: safeDealType === 'milestone' ? parsedCompletion.toFixed(2) : undefined,
        nftChain: safeDealType === 'nft-otc' ? cleanText(nftChain, 40) || 'Ethereum' : undefined,
        nftContract: safeDealType === 'nft-otc' ? cleanText(nftContract, 80) : undefined,
        nftTokenId: safeDealType === 'nft-otc' ? cleanText(nftTokenId, 80) : undefined,
        nftSeller: safeDealType === 'nft-otc' ? cleanText(nftSeller, 80) : undefined,
        nftCollection: safeDealType === 'nft-otc' ? cleanText(nftCollection, 100) : undefined,
        deadlineDays: String(Math.max(1, Math.min(90, Number(deadlineDays) || 3))),
        listingDays: String(visibleDays),
        listingFee: listingFee(visibleDays),
        description: cleanText(description),
        deliverable: cleanText(deliverable),
        client,
        status: 'open',
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + visibleDays * 86400_000).toISOString(),
      }
      const updated = [next, ...requests]
      await writeRequests(updated, token)
      return res.status(201).json({ request: next, requests: updated })
    }

    if (req.method === 'PATCH') {
      const { id, action, agent, client, escrowJobId } = req.body ?? {}
      const target = requests.find((request) => request.id === id)
      if (!target) return res.status(404).json({ error: 'Request not found' })
      if (isExpired(target)) return res.status(410).json({ error: 'Request has expired' })

      let updated
      if (action === 'accept') {
        if (!isAddress(agent)) return res.status(400).json({ error: 'Valid agent wallet required' })
        if (target.status !== 'open') return res.status(409).json({ error: 'Request is already matched' })
        if (target.client.toLowerCase?.() === agent.toLowerCase()) return res.status(400).json({ error: 'Client cannot accept their own request' })
        updated = requests.map((request) => request.id === id
          ? { ...request, agent, status: 'matched', acceptedAt: new Date().toISOString() }
          : request)
      } else if (action === 'fund') {
        if (!isAddress(client) || target.client.toLowerCase() !== client.toLowerCase()) {
          return res.status(403).json({ error: 'Only the request owner can attach escrow' })
        }
        if (!target.agent) return res.status(409).json({ error: 'Request has no matched worker' })
        if (!Number.isInteger(Number(escrowJobId)) || Number(escrowJobId) < 0) {
          return res.status(400).json({ error: 'Valid escrow job id required' })
        }
        updated = requests.map((request) => request.id === id
          ? { ...request, status: 'escrow-funded', escrowJobId: String(escrowJobId), escrowFundedAt: new Date().toISOString() }
          : request)
      } else {
        return res.status(400).json({ error: 'Unsupported action' })
      }

      await writeRequests(updated, token)
      return res.status(200).json({ request: updated.find((request) => request.id === id), requests: updated })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Request board failed' })
  }
}
