# ArcEscrow Market

Agentic escrow marketplace on Arc. Clients post requests, workers accept, USDC is locked in ArcEscrow, submitted work is reviewed with AI assistance, and the client releases payment after approval.

Live demo: [usdc-portal.vercel.app](https://usdc-portal.vercel.app)

## Environment

Set these in Vercel project settings when using server-side features:

- `BLOB_READ_WRITE_TOKEN`: stores marketplace requests and submitted result files.
- `ANTHROPIC_API_KEY`: powers Claude review for submitted work.
- `CIRCLE_API_KEY`: optional only for the server-side Circle faucet API route. The default UI uses Circle's public faucet flow, copies the connected wallet address, and watches the balance for incoming testnet USDC.

## Features

- Requests board for work, milestone, and NFT OTC proposals.
- Client-funded USDC escrow on Arc Testnet.
- Worker result submission with text, image, PDF, or TXT files.
- Claude-assisted review before payout.
- Manual client release, even when AI recommends reject.
- Circle funding rails through CCTP, App Kit, send, swap, and bridge flows.
- Wallet profile with portfolio, faucet links, QR receive, address book, and CSV export.

## Built With

- React + TypeScript + Vite
- wagmi + viem
- Circle App Kit
- Circle CCTP V2
- Arc Testnet USDC
- Vercel Blob
- Claude review API

## Getting Started

```bash
git clone https://github.com/ds4316/usdc-portal.git
cd usdc-portal
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> Note: This is a testnet-only app. Never use a wallet with real funds.

## AI Review Policy

Claude review is advisory only. A reject verdict does not block the client from releasing payment. The client can inspect the submitted result and choose to release USDC manually.

## NFT OTC Test Contracts

The repo includes two Remix-friendly Solidity contracts:

- `contracts/MockArcNFT.sol`: minimal ERC-721 style NFT for test minting.
- `contracts/NFTOTCEscrow.sol`: buyer funds USDC, seller approves the NFT, and either participant can settle atomically when the NFT approval is valid.

Suggested test flow on Arc Testnet:

1. Deploy `MockArcNFT`.
2. Mint an NFT to the seller wallet.
3. Deploy `NFTOTCEscrow` with Arc USDC: `0x3600000000000000000000000000000000000000`.
4. Buyer approves `NFTOTCEscrow` to spend the USDC offer amount.
5. Buyer calls `fundDeal(seller, nft, tokenId, usdcAmount, deadline)`.
6. Seller calls `approve(nftOtcEscrowAddress, tokenId)` on `MockArcNFT`.
7. Buyer or seller calls `settle(dealId)`.
8. Verify that the NFT moved to buyer and USDC moved to seller.

If the seller never approves the NFT before the deadline, the buyer can call `refundAfterDeadline(dealId)`.
