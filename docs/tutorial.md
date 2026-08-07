# Tutorial: from clone to your first paid hotel query

Install → env → run → first 402 → paid call → reading the artifact → mainnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-hotel-search
cd x402-hotel-search
npm install
```

Requires Node 18+.

## 2. Configure

```bash
cp .env.example .env
```

`.env.example` ships with working defaults for **both payment rails**, so the
service runs immediately. Change these two to receive funds yourself:

```
# EVM (Base / Base Sepolia) USDC receive address
PAY_TO_ADDRESS=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
# Solana USDC receive address
SOLANA_PAY_TO_ADDRESS=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
```

Every paid route offers both rails and the caller picks. If you only want one,
delete the other address — that rail is dropped from the 402 challenge with a
warning, and the remaining rail keeps working.

### Live hotel data (optional)

Amadeus is a keyed API, so it is env-gated. Without keys the server returns
deterministic fixtures and the demo still works end to end:

```
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
```

Free sandbox keys, no card required: create an app at
[developers.amadeus.com](https://developers.amadeus.com) and copy the key and
secret. With both set, `/search` and `/offer` hit the real Hotel Search API.

**Every response carries a `source` field** (`"amadeus"` or `"fixture"`) so a
caller always knows which it got. Do not quote a fixture rate as a real price.

## 3. Run the server

```bash
npm run dev
```

The startup banner shows both rails, the active data source, and every paid
route with its price:

```
  Payment rails (USDC — the client picks):
    evm    base-sepolia   USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402  via https://x402.org/facilitator
    solana solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW  via https://x402.org/facilitator

  Data source: fixtures (deterministic) — set AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET for live data

  Paid routes (x402, USDC on Base or Solana):
    GET /search              $0.005  hotel offers by city/date
    GET /offer/:offerId      $0.003  priced offer detail
```

## 4. Your first 402

```bash
curl -s "http://localhost:4023/search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18" \
  | jq '.accepts[] | {network, asset, payTo, maxAmountRequired}'
```

```json
{
  "network": "base-sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
  "maxAmountRequired": "5000"
}
{
  "network": "solana",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
  "maxAmountRequired": "5000"
}
```

`HTTP/1.1 402 Payment Required` with an `accepts[]` array holding **one entry per
rail** — price in atomic USDC (6 decimals, so `5000` = $0.005), the network, the
`payTo` address, and the USDC contract or mint. The client chooses which rail to
settle on.

## 5. A paid call

### Base (EVM)

You need a wallet with Base Sepolia USDC (free from the
[Circle faucet](https://faucet.circle.com)). Base Sepolia ETH is **not** needed —
x402 uses gasless EIP-3009 transfers.

```bash
export PRIVATE_KEY=0xYourTestKey
npm run client
```

`examples/agent-client.ts` inspects the 402, searches NYC for three nights
($0.005), pulls detail on the cheapest room ($0.003), and prints the decoded
`X-PAYMENT-RESPONSE` settlement receipt.

### Solana

Pick the `solana` entry from `accepts[]` instead, sign an SPL USDC transfer to
its `payTo`, and send the same base64 `X-PAYMENT` envelope. Any Solana-capable
x402 client does this. Both rails end at the same 200 and the same artifact —
only `X-PAYMENT-RESPONSE` differs, naming the rail that settled.

## 6. Reading the artifacts

`/search` gives you complete offers, cheapest first:

```json
{
  "source": "fixture",
  "nights": 3,
  "currency": "USD",
  "offers": [
    {
      "offerId": "fx-NYC-2026-09-15-2026-09-18-2-1-0",
      "hotel": {
        "name": "Lantern Inn New York", "rating": 2,
        "address": { "cityName": "New York", "countryCode": "US", "line": "57 Market St" },
        "geo": { "latitude": 40.74049, "longitude": -73.98414 },
        "amenities": ["AIRPORT_SHUTTLE", "SPA", "RESTAURANT"]
      },
      "room": { "type": "SUPERIOR_KING", "beds": 1, "bedType": "KING" },
      "boardType": "ROOM_ONLY",
      "price": { "total": "643.39", "perNight": "214.46", "currency": "USD" },
      "cancellation": { "refundable": false, "policy": "Non-refundable rate — no cancellation or date change." }
    }
  ]
}
```

Note what is already here: hotel, star rating, location, amenities, room type,
board type, cancellation policy, and both total and per-night price. **You often
do not need the `/offer` call at all** — pay for it when you want the breakdown
spelled out or a fresh re-price on a candidate you are actually choosing.

`/offer/:offerId` returns the same offer plus a `priceBreakdown` and a
`priceGuarantee` string describing exactly how firm the number is:

```json
{
  "priceBreakdown": {
    "nights": 3, "perNight": "214.46", "total": "643.39", "currency": "USD",
    "note": "214.46 USD per night x 3 night(s), 2 adult(s)."
  },
  "priceGuarantee": "Fixture mode — deterministic price, stable for identical queries."
}
```

> **Live offer ids are time-limited.** Amadeus expires hotel offers, so an `am-…`
> id may 404 after a while — re-run `/search` for fresh ids. If the upstream offer
> is gone but this server still cached it from your `/search`, you get that copy
> with a `priceGuarantee` saying so. Fixture `fx-…` ids encode their own query and
> never expire.

## 7. Going to mainnet

```
NETWORK=base                     # EVM rail: base-sepolia -> base mainnet
SOLANA_NETWORK=mainnet-beta      # Solana rail (already the default)
FACILITATOR_URL=https://your-mainnet-facilitator.example   # EVM rail
SOLANA_FACILITATOR_URL=https://facilitator.payai.network    # Solana rail (default)
PUBLIC_BASE_URL=https://hotels.example.com
AMADEUS_HOST=https://api.amadeus.com
```

- Facilitators are rail-specific. `FACILITATOR_URL` must settle Base mainnet
  (e.g. Coinbase CDP's x402 facilitator); `SOLANA_FACILITATOR_URL` must settle
  Solana and defaults to PayAI (`https://facilitator.payai.network`), since
  x402.org does not settle Solana at all.
- `PAY_TO_ADDRESS` and `SOLANA_PAY_TO_ADDRESS` now receive real USDC.
- `PUBLIC_BASE_URL` makes the `resource` field in your 402 quotes match your
  public URL — agents and facilitators check it.
- Swap `AMADEUS_HOST` to the production host once you have production Amadeus
  credentials; the free sandbox host serves a limited, non-live hotel set.
- `/search` resolves a city to hotel ids and then fetches offers, so it costs two
  upstream Amadeus calls. Price the route above that combined cost.

## Where to next

- [API reference](api.md)
- [For AI agents](agents.md) — discovery, MCP, listings
- [examples/curl.md](https://github.com/nirholas/x402-hotel-search/blob/main/examples/curl.md) — the raw wire flow
