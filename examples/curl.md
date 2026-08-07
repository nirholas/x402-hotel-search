# Raw x402 flow with curl

Exactly what happens on the wire: 402 → pay → 200.

## 1. Free routes first

```bash
curl -s http://localhost:4023/health | jq
curl -s http://localhost:4023/cities | jq '.cities[].cityCode'
```

`health.source` tells you whether this deployment is on live Amadeus data or
deterministic fixtures.

## 2. Hit a paid route without payment → HTTP 402

```bash
curl -si "http://localhost:4023/search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18" | head -40
```

You get `402 Payment Required` and a JSON body with **one payment-requirements
object per rail** — Base and Solana:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search",
      "description": "Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search",
      "description": "Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USDC", "decimals": 6 }
    }
  ]
}
```

`maxAmountRequired` is atomic USDC (6 decimals): `5000` = $0.005 — the same price
on either rail. Filter to the rail you can pay:

```bash
curl -s "http://localhost:4023/search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18" \
  | jq '.accepts[] | select(.network | startswith("solana"))'
```

## 3. Pay

The `X-PAYMENT` header is base64 JSON wrapping a signature for the rail you
picked — an EIP-3009 USDC transfer authorization on Base, or a signed SPL USDC
transfer on Solana. Neither is practical to produce with curl alone, so use the
bundled client, which does the 402 → sign → retry loop for you (EVM rail):

```bash
export PRIVATE_KEY=0x…   # funded Base Sepolia wallet (https://faucet.circle.com)
npm run client
```

Under the hood it re-sends the same request as:

```bash
curl -s "http://localhost:4023/search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18" \
  -H "X-PAYMENT: <base64 signed payment payload>"
```

The envelope it base64-encodes looks like this — swap `network` and the payload
shape to settle on Solana instead:

```json
{ "x402Version": 1, "scheme": "exact", "network": "base-sepolia",
  "payload": { "signature": "0x…", "authorization": { "from": "0x…", "to": "0x40252C…", "value": "5000", "…": "…" } } }
```

```json
{ "x402Version": 1, "scheme": "exact", "network": "solana",
  "payload": { "transaction": "<base64 signed SPL transfer>" } }
```

The server reads `network`, matches it to the rail you were quoted, then verifies
and settles through the facilitator.

## 4. HTTP 200 with the artifact and settlement receipt

The 200 body is the hotel offers themselves — the thing you paid for, delivered
in the response. The `X-PAYMENT-RESPONSE` header is the base64 settlement receipt:

```bash
curl -si … | grep -i x-payment-response | cut -d' ' -f2 | base64 -d | jq
```

```json
{ "success": true, "rail": "solana", "network": "solana",
  "transaction": "5v8…", "payer": "9xQ…" }
```

`rail` tells you which chain settled it.

## 5. Pull offer detail ($0.003)

Take an `offerId` from the search result:

```bash
curl -s "http://localhost:4023/offer/fx-NYC-2026-09-15-2026-09-18-2-1-0" \
  -H "X-PAYMENT: <base64 payload>" \
  | jq '{hotel: .offer.hotel.name, room: .offer.room.type, priceBreakdown, cancellation: .offer.cancellation.policy}'
```

```json
{
  "hotel": "Lantern Inn New York",
  "room": "SUPERIOR_KING",
  "priceBreakdown": {
    "nights": 3, "perNight": "214.46", "total": "643.39", "currency": "USD",
    "note": "214.46 USD per night x 3 night(s), 2 adult(s)."
  },
  "cancellation": "Non-refundable rate — no cancellation or date change."
}
```

Live `am-…` ids are time-limited by Amadeus and may 404 once the upstream offer
expires — re-run `/search` for fresh ids. Fixture `fx-…` ids encode their own
query and never expire.

## Reading the search result

```bash
curl -s "http://localhost:4023/search?cityCode=LON&checkInDate=2026-10-01&checkOutDate=2026-10-04&adults=2" \
  -H "X-PAYMENT: <base64 payload>" \
  | jq '.offers[] | {name: .hotel.name, stars: .hotel.rating, total: .price.total, refundable: .cancellation.refundable}'
```

Offers come back cheapest first. `price.total` is the whole stay for the
requested occupancy; `price.perNight` is that divided by `nights`.
