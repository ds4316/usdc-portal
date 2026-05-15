import { put } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { filename, contentType, data } = req.body ?? {}
  if (!data) return res.status(400).json({ error: 'No data provided' })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return res.status(500).json({ error: 'Blob storage not configured' })

  try {
    const buffer = Buffer.from(data, 'base64')
    const blob = await put(`escrow/${Date.now()}-${filename ?? 'result.txt'}`, buffer, {
      access: 'public',
      contentType: contentType ?? 'text/plain',
      token,
    })
    return res.json({ url: blob.url })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
