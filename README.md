# USDC Portal

## Environment

Set these in Vercel project settings when using server-side features:

- `CIRCLE_API_KEY`: required for the in-app testnet faucet (`/api/faucet`). Circle's faucet API requires a Circle API key and a mainnet-upgraded Circle developer account.

A cross-chain USDC management portal built on [Arc Network](https://arc.network) using Circle's [App Kit](https://docs.arc.network/app-kit).

🔗 **Live Demo:** [usdc-portal.vercel.app](https://usdc-portal.vercel.app)

## Features

- **Multi-chain Balance** — View USDC balances across Ethereum Sepolia, Base Sepolia, and Arc Testnet in one place
- **Bridge** — Move USDC from Ethereum/Base to Arc via Circle CCTP
- **Send** — Transfer USDC to any address on Arc Testnet

## Built With

- [Arc App Kit](https://docs.arc.network/app-kit) — Unified Balance Kit for cross-chain USDC flows
- React + TypeScript + Vite
- Circle CCTP v2

## Getting Started

```bash
git clone https://github.com/ds4316/usdc-portal.git
cd usdc-portal
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and enter your testnet wallet private key to get started.

> **Note:** This is a testnet-only app. Never use a wallet with real funds.
