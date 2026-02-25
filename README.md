# RafflePunk
<img width="1306" height="805" alt="Screenshot 2026-02-26 at 12 29 25 AM" src="https://github.com/user-attachments/assets/534e5ddb-c7b2-4ca8-8fcc-5b50380614c7" />

On-chain raffle platform on Starknet, built with the [Starkzap SDK](https://github.com/keep-starknet-strange/starkzap).

**Live Demo:** [https://raffle-app-one.vercel.app](https://raffle-app-one.vercel.app)

## What is this?

RafflePunk lets anyone create and participate in fully on-chain raffles on Starknet Sepolia. All raffle data — creation, ticket purchases, winner selection, and prize payouts — lives on a deployed Cairo smart contract. Wallet interactions are powered by the Starkzap SDK with Cartridge Controller for social login (Google, email, etc.).

## Features

- **Create raffles** — set a title, ticket price (in STRK), max tickets, and end time
- **Buy tickets** — STRK is transferred on-chain via ERC20 approve + contract call
- **Draw winners** — raffle creator draws a winner after the end time (on-chain randomness)
- **Claim prizes** — winner claims the entire STRK prize pool
- **Share raffles** — copy a deep link to share with others
- **Social login** — connect via Cartridge Controller (Google, email, etc.)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Plain HTML + TypeScript + Vite |
| Wallet SDK | [Starkzap](https://github.com/keep-starknet-strange/starkzap) |
| Wallet | [Cartridge Controller](https://cartridge.gg/) |
| Smart Contract | Cairo (Starknet) |
| Token | STRK on Sepolia testnet |
| Contract Framework | [Starknet Foundry](https://github.com/foundry-rs/starknet-foundry) |

## Deployed Contract

- **Network:** Starknet Sepolia
- **Contract Address:** `0x00a598e4d0a74221b821fbf5501f8a07462b63c5de3fcd5cb30eefc90d04822c`
- **Class Hash:** `0x2066512f5df84c4c460d5536b9e36ff96474fec044b9efeca1f840156a0d6e7`

## Getting Started

### Prerequisites

- Node.js 18+
- The [Starkzap SDK](https://github.com/keep-starknet-strange/starkzap) cloned as a sibling directory (`../starkzap`)

### Install & Run

```bash
npm install
npm run dev
```

Open **https://localhost:5173** in your browser (HTTPS is required for Cartridge Controller).

> Chrome will show a certificate warning for the self-signed cert — type `thisisunsafe` on the warning page to proceed.

### Get Test STRK

Visit the [Starknet Faucet](https://starknet-faucet.vercel.app/) to get test STRK tokens on Sepolia.

## Project Structure

```
├── index.html              # Single-page UI (embedded CSS)
├── main.ts                 # App logic: wallet, views, transactions
├── raffle.ts               # Contract ABI, read/write helpers, types
├── vite.config.ts          # Vite config with HTTPS + SDK aliases
├── tsconfig.json           # TypeScript config
├── package.json            # Dependencies
└── contract/
    ├── src/lib.cairo        # Cairo smart contract
    ├── Scarb.toml           # Scarb package config
    └── snfoundry.toml       # Starknet Foundry deployment config
```

## How It Works

1. **Connect** — User logs in via Cartridge Controller (social login through Starkzap SDK)
2. **Browse** — Raffles are fetched from the on-chain contract via RPC
3. **Create** — `wallet.execute()` calls `create_raffle` on the contract
4. **Buy ticket** — `wallet.execute()` batches an ERC20 `approve` + `buy_ticket` in a single transaction
5. **Draw winner** — Creator calls `draw_winner` after end time (uses block timestamp + number for randomness)
6. **Claim prize** — Winner calls `claim_prize` to receive the full STRK pool

## License

MIT
