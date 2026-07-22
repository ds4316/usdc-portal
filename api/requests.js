import { put, head, BlobPreconditionFailedError } from '@vercel/blob'

const PATH = 'marketplace/requests.json'
const MAX_WRITE_ATTEMPTS = 5
const RETRY_DELAYS_MS = [150, 300, 600, 1000]

class RequestBoardError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

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

// This store is provisioned as a public blob store (a Vercel project-level
// setting the API can't override — attempting access: 'private' here fails
// outright with "Cannot use private access on a public store"). Public reads
// via the SDK's get() go through a CDN edge, and Vercel's useCache: false
// option is documented as ignored on that path — a get() right after a
// put() could return cached pre-write content for an unpredictable stretch,
// which broke both write-conflict detection and plain read-your-writes (a
// request PATCHed immediately after being POSTed could 404 as "not found").
//
// head() hits Vercel's blob metadata API rather than the CDN, so it reliably
// returns the current etag. Combined with a cache-busted, no-store fetch of
// the actual content, this reads fresh instead of a stale edge copy.
async function readRequestsWithEtag(token) {
  try {
    const meta = await head(PATH, { token })
    if (!meta?.url) return { requests: [], etag: undefined }
    const res = await fetch(`${meta.url}?_cb=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return { requests: [], etag: meta.etag }
    const data = await res.json()
    const requests = Array.isArray(data.requests) ? data.requests.filter((request) => !isExpired(request)) : []
    return { requests, etag: meta.etag }
  } catch {
    return { requests: [], etag: undefined }
  }
}

async function readRequests(token) {
  return (await readRequestsWithEtag(token)).requests
}

// Vercel Blob overwrites otherwise have no compare-and-swap: two requests
// hitting this API close together can each read the same snapshot, and
// whichever writes last silently discards the other's change (observed in
// practice — a request posted seconds before being accepted came back "not
// found" because the accept's write had clobbered the post's write).
//
// `mutate(freshRequests)` must be a pure function that either returns the
// new full array, or throws a RequestBoardError for a business-rule failure
// (not found / already resolved / etc) — those are NOT retried. The write
// uses `ifMatch` against the etag we just read; if another writer landed a
// change in between, Vercel Blob rejects it with BlobPreconditionFailedError
// and we retry the whole read-mutate-write cycle from a fresh read. Once
// `put()` resolves without that error, the write is authoritative — no need
// to re-read (and re-reading a public blob right after writing it isn't a
// reliable check anyway, see above).
async function mutateRequests(token, mutate) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const { requests: current, etag } = await readRequestsWithEtag(token)
    const next = mutate(current)
    try {
      await put(PATH, JSON.stringify({ requests: next, updatedAt: new Date().toISOString() }), {
        access: 'public',
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
        token,
        ...(etag ? { ifMatch: etag } : {}),
      })
      return next
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError && attempt < MAX_WRITE_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 1000))
        continue
      }
      throw e
    }
  }
  throw new RequestBoardError(503, 'Could not save changes to the request board — please retry')
}

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return res.status(500).json({ error: 'Blob storage is not configured' })

  try {
    if (req.method === 'GET') {
      const requests = await readRequests(token)
      return res.status(200).json({ requests })
    }

    if (req.method === 'POST') {
      const {
        dealType, title, category, budget, deadlineDays, listingDays, description, deliverable, client,
        upfrontAmount, completionAmount, nftChain, nftContract, nftTokenId, nftSeller, nftCollection,
        escrowJobId, // on-chain job/deal ID — set at creation since USDC is locked immediately
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
        nftChain: safeDealType === 'nft-otc' ? cleanText(nftChain, 40) || 'Arc Testnet' : undefined,
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
        // USDC is locked on-chain at posting time — escrowJobId is set from the start
        escrowJobId: escrowJobId != null ? String(escrowJobId) : undefined,
        status: 'open',
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + visibleDays * 86400_000).toISOString(),
      }

      const requests = await mutateRequests(token, (current) => [next, ...current])
      return res.status(201).json({ request: next, requests })
    }

    if (req.method === 'PATCH') {
      const { id, action, agent, client, escrowJobId } = req.body ?? {}

      const requests = await mutateRequests(
        token,
        (current) => {
          const target = current.find((request) => request.id === id)
          if (!target) throw new RequestBoardError(404, 'Request not found')

          if (action === 'deleteExpired') {
            if (!isExpired(target)) throw new RequestBoardError(409, 'Request is not expired')
            return current.filter((request) => request.id !== id)
          }

          if (action === 'cancel') {
            if (!isAddress(client) || target.client.toLowerCase() !== client.toLowerCase()) {
              throw new RequestBoardError(403, 'Only the request owner can cancel')
            }
            if (target.status === 'cancelled' || target.status === 'completed') {
              throw new RequestBoardError(409, 'Request is already resolved')
            }
            return current.map((request) => request.id === id
              ? { ...request, status: 'cancelled', cancelledAt: new Date().toISOString() }
              : request)
          }

          if (action === 'complete') {
            if (target.status === 'cancelled' || target.status === 'completed') {
              throw new RequestBoardError(409, 'Request is already resolved')
            }
            return current.map((request) => request.id === id
              ? { ...request, status: 'completed', completedAt: new Date().toISOString() }
              : request)
          }

          if (isExpired(target)) throw new RequestBoardError(410, 'Request has expired')

          if (action === 'accept') {
            if (!isAddress(agent)) throw new RequestBoardError(400, 'Valid agent wallet required')
            if (target.status !== 'open') throw new RequestBoardError(409, 'Request is already matched')
            if (target.client.toLowerCase?.() === agent.toLowerCase()) throw new RequestBoardError(400, 'Client cannot accept their own request')
            return current.map((request) => request.id === id
              ? { ...request, agent, status: 'matched', acceptedAt: new Date().toISOString() }
              : request)
          }

          if (action === 'fund') {
            // Legacy: attach escrow job id after the fact (kept for backward compatibility)
            if (!isAddress(client) || target.client.toLowerCase() !== client.toLowerCase()) {
              throw new RequestBoardError(403, 'Only the request owner can attach escrow')
            }
            if (!target.agent) throw new RequestBoardError(409, 'Request has no matched worker')
            if (!Number.isInteger(Number(escrowJobId)) || Number(escrowJobId) < 0) {
              throw new RequestBoardError(400, 'Valid escrow job id required')
            }
            return current.map((request) => request.id === id
              ? { ...request, status: 'matched', escrowJobId: String(escrowJobId), escrowFundedAt: new Date().toISOString() }
              : request)
          }

          throw new RequestBoardError(400, 'Unsupported action')
        },
      )
      return res.status(200).json({ request: requests.find((request) => request.id === id), requests })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    if (e instanceof RequestBoardError) return res.status(e.status).json({ error: e.message })
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Request board failed' })
  }
}
