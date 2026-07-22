# ArcEscrow Market

**Arc x Circle Stablecoin Hackathon - Agentic Commerce Track**

A testnet escrow marketplace on Arc using Circle USDC, CCTP V2, AI-assisted review, NFT OTC settlement, and ERC-8183 agentic commerce.

Live: **[https://usdc-portal.vercel.app](https://usdc-portal.vercel.app)**

## What It Does

ArcEscrow Market is a full-stack decentralized escrow service where:

- **Clients** post work requests with USDC locked at posting time.
- **Workers** claim jobs on-chain with `claimJob()`, submit proof, and get paid after client approval.
- **AI review** evaluates submitted work and returns an approve/reject recommendation before payout.
- **NFT OTC** test contracts support atomic NFT-for-USDC swaps.
- **ERC-8183** agentic commerce shows autonomous agent-to-agent job creation and payment.
- **Circle CCTP V2** bridges USDC between Sepolia and Arc with native attestation.
- **ArcEscrowV2** (bonus/experimental) adds a trustless, AI-free settlement path for objectively verifiable onchain conditions — see [Trustless Onchain-Condition Settlement](#trustless-onchain-condition-settlement-arcescrowv2) below.

## Circle + Arc Features

| Feature | Implementation | Status |
| --- | --- | --- |
| Circle CCTP V2 | Bidirectional Sepolia <-> Arc bridge, 0 slippage, native attestation | Live |
| Circle USDC | Settlement asset for all escrow flows on Arc Testnet | Live |
| Circle App Kit | Wallet connection, chain switching, multi-wallet UI | Live |
| Circle Programmable Wallets | Custodial server-controlled agent wallets showcase | UI |
| Circle Gateway / x402 | Nanopayment architecture for micropayments | Architecture |
| ArcEscrow | Work + milestone escrow: claimJob, submitWork, approveWork | Live |
| NFTOTCEscrow | Atomic NFT <-> USDC swap via ownerOf proof | Experimental |
| ERC-8183 | Arc's agentic commerce standard | Live |
| ArcEscrowV2 | Trustless onchain-condition settlement (no AI, no approval) | Deployed, standalone |

## Deployed Contracts

Arc Testnet chainId: `5042002`

| Contract | Address |
| --- | --- |
| ArcEscrow | `0x2D961a34d7558AA5A3BaB17f4d928fd0deC7a5Dc` |
| NFTOTCEscrow | `0xdC47D9AE448BcE3E524C768446fE65f30d03f20e` |
| ERC-8183 AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` |
| ArcOnboarder (Sepolia) | `0x495825fF81B048B2A6e1FE10571625496f8fF1FD` |
| ArcEscrowV2 (bonus, standalone) | `0x7420C7A3459B532Dee36Fc1e22badBe262BaD571` |

## Environment

Set these in Vercel project settings when using server-side features:

- `BLOB_READ_WRITE_TOKEN`: stores marketplace requests and submitted result files.
- `ANTHROPIC_API_KEY`: powers AI review for submitted work.
- `CIRCLE_API_KEY`: optional for the server-side Circle faucet API route. The default UI uses Circle's public faucet flow.

The app still runs locally without those variables. Demo mode and local request storage are available for judging and walkthroughs; shared board, file uploads, and AI review require the Vercel settings above.

For local contract/agent work only (never committed — see `.env.example`): `PRIVATE_KEY` (deploys contracts via Foundry), `AGENT_PRIVATE_KEY` (drives the standalone agent runner).

## Getting Started

```bash
git clone https://github.com/ds4316/usdc-portal
cd usdc-portal
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> This is a testnet-only app. Never use a wallet with real funds.

## Demo Path

Use this path for a fast hackathon walkthrough when wallet funding is unreliable:

1. Open the Marketplace and turn on Demo mode.
2. Stay on Client, create a request, and post it as a demo escrow.
3. Switch to Worker, accept the request, then submit the demo result.
4. Switch back to Client, release payment, and show the completed Activity ledger entry.

Demo mode stores requests in the browser only. It does not sign transactions or write to the shared Vercel request board.

## Real Testnet Path

Use this path when the connected wallet has Arc Testnet USDC:

1. Connect a wallet and switch to Arc Testnet.
2. Post a work or milestone request; the app approves USDC and funds `ArcEscrow`.
3. A worker wallet accepts the request and submits a deliverable URI.
4. The client can request AI review, inspect the result, and release USDC manually.

NFT OTC is experimental on testnet. Verify the deployed `NFTOTCEscrow` address, NFT ownership, and token approval before using the real contract flow.

## Escrow Workflow

```text
Client posts request -> USDC locked via approve + createJob
Worker calls claimJob on-chain -> status: matched
Worker uploads deliverable -> Vercel Blob -> URI stored via submitWork()
Client runs AI review -> approve / reject recommendation
Client calls approveWork() -> USDC released from ArcEscrow -> worker wallet
```

## 3 Minute Judging Script

1. Show the Overview and explain the product: client-funded USDC escrow for agentic work on Arc.
2. Open Marketplace, enable Demo mode, and post a small work request as Client.
3. Switch to Worker, accept it, and submit the result.
4. Switch back to Client, release payment, then open Activity to show the settlement record.
5. Open Docs & Contracts to show ArcEscrow, Arc USDC, CCTP resources, ERC-8183, and the experimental NFT OTC path.

## AI Review Policy

AI review is advisory only. A reject verdict does not block the client from releasing payment. The client can inspect the submitted result and choose to release USDC manually.

## Known Limitations

- Testnet-only; do not use real funds.
- Vercel Blob and AI review require production environment variables.
- Local Vite dev keeps API failures quiet and falls back to browser storage.
- NFT OTC is included as a test path and should be treated as experimental until the deployed address and ownership checks are verified.
- ArcEscrowV2 (below) is deployed and contract-tested but not yet wired into the marketplace UI — it's exercised via CLI/scripts only for now.

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

## Trustless Onchain-Condition Settlement (ArcEscrowV2)

`contracts/src/ArcEscrowV2.sol` is a standalone escrow contract exploring a second settlement primitive alongside AI review: instead of an AI judgment call, the client locks a condition at job creation — a target contract, calldata, threshold, and comparator (e.g. "recipient's USDC balance >= 5"). Once the condition is objectively true onchain, **anyone** can call `checkAndSettle(jobId)` and the contract verifies it via `staticcall` and pays out atomically in the same transaction. No AI, no human approval, no oracle.

This is deployed and verified end-to-end on Arc Testnet at `0x7420C7A3459B532Dee36Fc1e22badBe262BaD571`, but not yet wired into the marketplace UI (see Known Limitations). It's exercised via:

```bash
cd contracts
forge test -vv          # 15 tests, no keys or network needed
PRIVATE_KEY=0x... forge script script/DeployV2.s.sol:DeployV2 \
  --rpc-url https://rpc.testnet.arc.network --broadcast   # redeploy if needed
```

`agent/runner.mjs` is a standalone script that polls ArcEscrowV2 for jobs assigned to its own wallet and fulfills them without a human in the loop — submitting AI-judged results, or performing the required onchain action and calling `checkAndSettle` for condition-based jobs:

```bash
AGENT_PRIVATE_KEY=0x... ARC_ESCROW_ADDRESS=0x7420C7A3459B532Dee36Fc1e22badBe262BaD571 node agent/runner.mjs
```

The agent wallet must differ from the client wallet, and needs its own testnet USDC/gas from [faucet.circle.com](https://faucet.circle.com).
