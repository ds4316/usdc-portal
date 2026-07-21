// Autonomous agent runner for Arc Agent Escrow.
//
// Polls ArcEscrowV2 for jobs assigned to this agent's own wallet and fulfills
// them without a human clicking anything:
//   - AIJudged jobs: uploads a generated result via the app's /api/upload
//     endpoint, then calls submitWork.
//   - OnchainCondition jobs: decodes the balanceOf(recipient) condition,
//     transfers enough of the condition token to satisfy it, then calls
//     checkAndSettle.
//
// Run: AGENT_PRIVATE_KEY=0x... node agent/runner.mjs
//
// Required env:
//   AGENT_PRIVATE_KEY   testnet-only private key for the agent's wallet
// Optional env:
//   ARC_ESCROW_ADDRESS  defaults to the address baked into src/App.tsx
//   APP_BASE_URL         defaults to https://usdc-portal.vercel.app
//   POLL_INTERVAL_MS     defaults to 15000

import { createPublicClient, createWalletClient, http, decodeFunctionData, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC_URL = 'https://rpc.testnet.arc.network'
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
}

const ARC_ESCROW = process.env.ARC_ESCROW_ADDRESS ?? '0x7420C7A3459B532Dee36Fc1e22badBe262BaD571'
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://usdc-portal.vercel.app'
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15000)

if (!process.env.AGENT_PRIVATE_KEY) {
  console.error('Missing AGENT_PRIVATE_KEY env var (testnet-only key).')
  process.exit(1)
}

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY)

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(RPC_URL) })

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
]

const ARC_ESCROW_ABI = [
  { name: 'nextJobId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getJob', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'client', type: 'address' }, { name: 'agent', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
      { name: 'description', type: 'string' }, { name: 'resultUri', type: 'string' },
      { name: 'status', type: 'uint8' }, { name: 'jobType', type: 'uint8' },
    ] },
  { name: 'getCondition', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'conditionTarget', type: 'address' }, { name: 'conditionCalldata', type: 'bytes' },
      { name: 'conditionThreshold', type: 'uint256' }, { name: 'comparator', type: 'uint8' },
    ] },
  { name: 'submitWork', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'resultUri', type: 'string' }], outputs: [] },
  { name: 'checkAndSettle', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }], outputs: [] },
]

const seenOpen = new Set()

async function handleAIJudgedJob(jobId, job) {
  console.log(`[job ${jobId}] AIJudged — generating result for: "${job.description}"`)
  const resultText = `Completed by autonomous agent ${account.address}.\n\nTask: ${job.description}\n\nThis result was generated and submitted without human intervention.`
  const base64 = Buffer.from(resultText, 'utf-8').toString('base64')

  const uploadRes = await fetch(`${APP_BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'result.txt', contentType: 'text/plain', data: base64 }),
  })
  if (!uploadRes.ok) throw new Error(`upload failed: ${uploadRes.status}`)
  const { url } = await uploadRes.json()

  const hash = await walletClient.writeContract({
    address: ARC_ESCROW, abi: ARC_ESCROW_ABI, functionName: 'submitWork', args: [jobId, url],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`[job ${jobId}] submitWork confirmed (${hash}) — result: ${url}`)
}

async function handleOnchainConditionJob(jobId, job) {
  const condition = await publicClient.readContract({
    address: ARC_ESCROW, abi: ARC_ESCROW_ABI, functionName: 'getCondition', args: [jobId],
  })
  const [conditionTarget, conditionCalldata, conditionThreshold] = condition

  let recipient
  try {
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: conditionCalldata })
    recipient = decoded.args[0]
  } catch {
    console.log(`[job ${jobId}] OnchainCondition — unrecognized condition shape, skipping (needs task-specific logic)`)
    return
  }

  console.log(`[job ${jobId}] OnchainCondition — delivering ${conditionThreshold} of ${conditionTarget} to ${recipient}`)
  const transferHash = await walletClient.writeContract({
    address: conditionTarget, abi: ERC20_ABI, functionName: 'transfer', args: [recipient, conditionThreshold],
  })
  await publicClient.waitForTransactionReceipt({ hash: transferHash })

  const settleHash = await walletClient.writeContract({
    address: ARC_ESCROW, abi: ARC_ESCROW_ABI, functionName: 'checkAndSettle', args: [jobId],
  })
  await publicClient.waitForTransactionReceipt({ hash: settleHash })
  console.log(`[job ${jobId}] checkAndSettle confirmed (${settleHash}) — condition satisfied, payout released`)
}

async function pollOnce() {
  const nextId = await publicClient.readContract({ address: ARC_ESCROW, abi: ARC_ESCROW_ABI, functionName: 'nextJobId' })

  for (let jobId = 0n; jobId < nextId; jobId++) {
    const job = await publicClient.readContract({ address: ARC_ESCROW, abi: ARC_ESCROW_ABI, functionName: 'getJob', args: [jobId] })
    const [, agent, , , description, , status, jobType] = job

    if (agent.toLowerCase() !== account.address.toLowerCase()) continue
    if (status !== 0) continue // not Open
    if (seenOpen.has(jobId.toString())) continue

    seenOpen.add(jobId.toString())
    try {
      if (jobType === 0) {
        await handleAIJudgedJob(jobId, { description })
      } else {
        await handleOnchainConditionJob(jobId, { description })
      }
    } catch (e) {
      console.error(`[job ${jobId}] failed:`, e.message ?? e)
      seenOpen.delete(jobId.toString()) // allow retry next poll
    }
  }
}

console.log(`Agent runner started. wallet=${account.address} escrow=${ARC_ESCROW} interval=${POLL_INTERVAL_MS}ms`)
async function loop() {
  try {
    await pollOnce()
  } catch (e) {
    console.error('poll failed:', e.message ?? e)
  }
  setTimeout(loop, POLL_INTERVAL_MS)
}
loop()
