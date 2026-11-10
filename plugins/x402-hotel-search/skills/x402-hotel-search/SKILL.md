---
name: x402-hotel-search
description: Call the x402-hotel-search HTTP service to search hotel offers for a city and date range and to fetch one offer's price breakdown. Use when an agent shops rooms or compares stays.
---

# x402-hotel-search

x402-hotel-search is an Express service over the Amadeus API. Each paid route returns its artifact in the 200 body, so agents shop rooms without an account, API key or booking session.

## Run it

No package is published and there is no hosted instance, so run it from a clone: `git clone https://github.com/nirholas/x402-hotel-search && cd x402-hotel-search`, then `npm install`, `cp .env.example .env`, and `npm run dev` (tsx `src/server.ts`). It listens on `PORT`, default 4023. For production use `npm run build` then `npm start`.

Key env vars: `PORT`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` (without both, the service serves labeled fixture data), `AMADEUS_HOST`, `PAY_TO_ADDRESS`, `SOLANA_PAY_TO_ADDRESS`, `NETWORK`, `SOLANA_NETWORK`.

## Endpoints

- `GET /search` ($0.005). Query: `cityCode` (or `city`, a 3-letter IATA city code), `checkInDate` (or `checkIn`, `YYYY-MM-DD`), `checkOutDate` (or `checkOut`, must be after check-in, at most 30 nights), `adults` (1 to 9, default 1), `rooms` (1 to 5, default 1). Returns offers with hotel, room, board type, cancellation policy and total price.
- `GET /offer/:offerId` ($0.003). Full room, policy and per-night price breakdown for an offer id from `/search`.
- `GET /cities`, `GET /health`, `GET /.well-known/x402`, `GET /skill.md` (free). `/cities` reports whether data comes from `amadeus` or `fixture`.

Bad input returns 400 with a message such as `checkInDate must be YYYY-MM-DD`.

Example: `GET {BASE_URL}/search?cityCode=PAR&checkInDate=2026-12-10&checkOutDate=2026-12-12&adults=2`. This service searches and prices only; it does not book. When `/cities` says `fixture`, the results are sample data and must not be presented as live availability.

## Paying

Every paid route answers an unpaid request with HTTP 402 and a body whose `accepts` array lists two rails: USDC on Base (`base-sepolia` by default, `base` via `NETWORK`) and USDC on Solana (`solana` by default, `solana-devnet` via `SOLANA_NETWORK`). Pick the entry your wallet can sign, sign the USDC payment (EIP-3009 on Base, SPL `transferChecked` on Solana), and retry with the base64 `X-PAYMENT` header. The artifact is in the 200 body and the settlement receipt is in the `X-PAYMENT-RESPONSE` header. On the EVM rail `x402-fetch` with `viem` does this for you; `npm run client` runs `examples/agent-client.ts`, which reads `BASE_URL` and `PRIVATE_KEY`.

Discovery: `GET /.well-known/x402` lists routes, prices and rails, and `GET /skill.md` serves the repo's own reference. Paying moves real USDC on the configured network, so show the user the route, amount and rail first and wait for a yes before any paid call. Use a throwaway wallet on `base-sepolia` or `solana-devnet` for testing.
