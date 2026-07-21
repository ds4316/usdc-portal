# USDC Portal — Arc Agent Escrow

A cross-chain USDC management portal built on [Arc Network](https://arc.network) using Circle's [App Kit](https://docs.arc.network/app-kit), featuring a trust-minimized escrow system for AI agent work.

🔗 **Live Demo:** [usdc-portal.vercel.app](https://usdc-portal.vercel.app)

## Features

- **Multi-chain Balance** — View USDC balances across Ethereum Sepolia, Base Sepolia, and Arc Testnet in one place
- **Bridge** — Move USDC from Ethereum/Base to Arc via Circle CCTP
- **Send** — Transfer USDC to any address on Arc Testnet
- **Agent Escrow** — Lock USDC for an AI agent's work, with two settlement paths:
  - **AI-Judged** — the agent submits a result (text/image/PDF); Claude reads the actual content and recommends approve/reject; the client approves and releases funds
  - **Onchain Condition** — the client locks funds against an objective onchain condition (e.g. "recipient's balance ≥ X tokens"); once the agent satisfies it, *anyone* can call `checkAndSettle` and the contract verifies the condition via `staticcall` and pays out atomically — no AI, no human approval, no oracle

## Why two settlement paths

Most AI-escrow demos (including Circle's own [`arc-escrow`](https://github.com/circlefin/arc-escrow) reference app) rely entirely on a single AI judgment call to release funds. That's fine for genuinely subjective work, but it's a weak trust model for anything objectively verifiable on-chain. ArcEscrowV2 splits the two: AI judgment for unstructured/creative deliverables, and trustless on-chain verification for anything expressible as a comparable on-chain value.

## Built With

- [Arc App Kit](https://docs.arc.network/app-kit) — Unified Balance Kit for cross-chain USDC flows
- React + TypeScript + Vite, viem/wagmi
- Circle CCTP v2
- Foundry (contract tests, see `contracts/`)
- Claude (AI evaluation of AIJudged submissions)

## Getting Started

```bash
git clone https://github.com/ds4316/usdc-portal.git
cd usdc-portal
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and enter your testnet wallet private key to get started.

> **Note:** This is a testnet-only app. Never use a wallet with real funds.

### Environment variables

Copy `.env.example` and fill in what you need — see that file for details on each var (`ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN` for the deployed app; `PRIVATE_KEY`, `AGENT_PRIVATE_KEY` for local contract/agent work only, never committed).

## Smart Contracts

`contracts/` contains the Solidity source. `ArcEscrowV2.sol` is the active escrow contract; `ArcEscrow.sol` (V1, AI-judged only) and `ArcOnboarder.sol` (CCTP bridge helper) remain deployed and referenced by earlier flows.

```bash
cd contracts
forge test -vv          # run the test suite (no keys or network needed)
PRIVATE_KEY=0x... forge script script/DeployV2.s.sol:DeployV2 \
  --rpc-url https://rpc.testnet.arc.network --broadcast   # deploy to Arc Testnet
```

After deploying, update the `ARC_ESCROW` constant in `src/App.tsx` and `api/evaluate.js`.

## Autonomous Agent

`agent/runner.mjs` is a standalone script that polls ArcEscrowV2 for jobs assigned to its own wallet and fulfills them without a human in the loop — submitting AI-judged results, or performing the required on-chain action and calling `checkAndSettle` for condition-based jobs.

```bash
AGENT_PRIVATE_KEY=0x... ARC_ESCROW_ADDRESS=0x... node agent/runner.mjs
```

The agent wallet must be different from the client wallet that creates jobs, and needs its own testnet USDC/gas from [faucet.circle.com](https://faucet.circle.com).
