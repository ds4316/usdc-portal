import { put } from '@vercel/blob'

const MAX_BYTES = 8 * 1024 * 1024 // 8MB
const ALLOWED_BASE_TYPES = new Set(['text/plain', 'application/pdf'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { filename, contentType, data } = req.body ?? {}
  if (!data) return res.status(400).json({ error: 'No data provided' })

  // Compare only the base MIME type — the app itself sends params like
  // "text/plain; charset=utf-8", which a strict full-string match rejects.
  const baseType = String(contentType ?? 'text/plain').split(';')[0].trim().toLowerCase()
  if (!baseType.startsWith('image/') && !ALLOWED_BASE_TYPES.has(baseType)) {
    return res.status(400).json({ error: 'Unsupported content type' })
  }

  // base64 -> byte length without decoding first
  const approxBytes = Math.floor((data.length * 3) / 4)
  if (approxBytes > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 8MB)' })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return res.status(500).json({ error: 'Blob storage not configured' })

  try {
    const buffer = Buffer.from(data, 'base64')
    if (buffer.byteLength > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 8MB)' })

    const safeContentType = contentType
      ? (String(contentType).startsWith('text/') && !String(contentType).toLowerCase().includes('charset=')
        ? `${contentType}; charset=utf-8`
        : contentType)
      : 'text/plain; charset=utf-8'
    const safeName = (filename ?? 'result.txt').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
    const blob = await put(`escrow/${Date.now()}-${safeName}`, buffer, {
      access: 'public',
      contentType: safeContentType,
      token,
    })
    return res.json({ url: blob.url })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
