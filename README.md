# ArcEscrow Market

**Arc × Circle Stablecoin Hackathon — Agentic Commerce Track**

A production-grade escrow marketplace on Arc Testnet using Circle USDC, CCTP V2, AI review, NFT OTC settlement, and ERC-8183 agentic commerce.

Live: **[https://usdc-portal.vercel.app](https://usdc-portal.vercel.app)**

---

## What It Does

ArcEscrow Market is a full-stack decentralized escrow service where:
- **Clients** post work requests with USDC locked **at posting time** (not after matching)
- **Workers** claim jobs on-chain with `claimJob()`, submit proof, and get paid after AI-verified review
- **AI (Claude Haiku)** evaluates submitted work and returns an approve/reject verdict before every payout
- **NFT OTC** atomic swaps settle NFT ↔ USDC trades without trust
- **ERC-8183** agentic commerce enables fully autonomous agent-to-agent job creation and payment
- **Circle CCTP V2** bridges USDC from Sepolia to Arc with zero slippage

---

## Circle + Arc Features

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Circle CCTP V2** | Bidirectional Sepolia ↔ Arc bridge, 0 slippage, native attestation | Live |
| **Circle USDC** | Settlement asset for all escrow flows on Arc Testnet | Live |
| **Circle App Kit** | Wallet connection, chain switching, multi-wallet UI | Live |
| **Circle Programmable Wallets** | Custodial server-controlled agent wallets (UI showcase) | UI |
| **Circle Gateway / x402** | Nanopayment layer architecture for micropayments | Arch |
| **ArcEscrow** | Work + Milestone escrow: claimJob, submitWork, approveWork | Live |
| **NFTOTCEscrow** | Atomic NFT ↔ USDC swap via ownerOf proof | Live |
| **ERC-8183** | Arc's official agentic commerce standard | Live |

---

## Deployed Contracts (Arc Testnet · chainId 5042002)

| Contract | Address |
|----------|---------|
| ArcEscrow | `0x2D961a34d7558AA5A3BaB17f4d928fd0deC7a5Dc` |
| NFTOTCEscrow | `0xdC47D9AE448BcE3E524C768446fE65f30d03f20e` |
| ERC-8183 AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` |
| ArcOnboarder (Sepolia) | `0x495825fF81B048B2A6e1FE10571625496f8fF1FD` |

---

## Escrow Workflow

```
Client posts request → USDC locked via approve + createJob
         ↓
Worker calls claimJob on-chain → status: matched
         ↓
Worker uploads deliverable → Vercel Blob → URI stored via submitWork()
         ↓
Client runs Claude Haiku review → approve / reject verdict
         ↓
Client calls approveWork() → USDC released from ArcEscrow → worker wallet
```

---

## Technical Stack

- **Frontend**: React 19, TypeScript, Vite, wagmi v2, viem
- **Wallet**: Circle App Kit + MetaMask / WalletConnect
- **Chain**: Arc Testnet (EVM-compatible, chainId 5042002)
- **Bridge**: Circle CCTP V2 — Sepolia ↔ Arc, bidirectional, 0 slippage
- **Storage**: Vercel Blob (deliverables + shared request board JSON)
- **AI**: Claude Haiku (`claude-haiku-4-5-20251001`) via Anthropic API
- **APIs**: Vercel Serverless (`api/requests.js`, `api/evaluate.js`, `api/upload.js`)

---

## Getting Started (Local)

```bash
git clone https://github.com/ds4316/usdc-portal
cd usdc-portal
npm install
```

Create `.env.local`:
```
ANTHROPIC_API_KEY=your_key
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

```bash
npm run dev
```

---

## Demo Walkthrough for Judges

1. **Bridge USDC** — Go to *Move Funds* → CCTP Bridge → bridge Sepolia USDC to Arc Testnet
2. **Post a request** — Go to *Requests* → Create Request → fill in task + USDC reward → Post (locks USDC on-chain immediately)
3. **Accept as worker** — Switch to a second wallet → find the open request → *Accept & Claim* (calls `claimJob` on-chain)
4. **Submit work** — As worker, go to *Escrow & Settlement* → find your job → submit text or file deliverable
5. **AI review** — As client, click *Run Claude Review* → see approve/reject verdict with reasoning → *Release Payment*
6. **NFT OTC** — Create an NFT OTC deal in Marketplace with USDC offer, match with NFT holder, approve NFT, settle atomically
7. **ERC-8183** — Go to *Escrow & Settlement* → switch to *ERC-8183* tab → create + fund an agentic job directly

---

## Architecture Diagram

```
Sepolia USDC ──[Circle CCTP V2]──▶ Arc Testnet USDC
                                          │
Client ──[approve + createJob]──▶ ArcEscrow (USDC locked)
                                          │
Worker ──────[claimJob]───────────────────┤
                                          │
Worker ──[Vercel Blob upload]──▶ [submitWork(uri)] (URI on-chain)
                                          │
[/api/evaluate → Claude Haiku] ──▶ approve / reject verdict
                                          │
Client ──────[approveWork]──────▶ USDC released to worker
```
