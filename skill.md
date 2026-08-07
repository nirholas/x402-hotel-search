# x402-hotel-search — agent skill

Pay-per-query hotel search. Ask for rooms in a city over a date range, then pull
the full detail and price breakdown for any offer that looks good — each as a
single paid HTTP call with the answer in the response body. No account, no API
key, no booking session: you pay fractions of a cent in USDC per query over the
x402 protocol.

Data comes from the **Amadeus Self-Service API** when the operator has keys set,
and from deterministic fixtures otherwise. **Every response carries a `source`
field (`"amadeus"` or `"fixture"`)** — always read it before quoting a price.

**Base URL**: `{BASE_URL}` (e.g. `http://localhost:4023` when self-hosted)

Machine-readable price sheet: `{BASE_URL}/.well-known/x402`

## Endpoints

### GET /search — $0.005
Hotel offers for one city and date range, cheapest first.

| Param | Required | Notes |
| --- | --- | --- |
| `cityCode` | yes | 3-letter IATA city code, e.g. `NYC`, `LON`, `TYO` |
| `checkInDate` | yes | `YYYY-MM-DD` |
| `checkOutDate` | yes | `YYYY-MM-DD`, after `checkInDate`, max 30 nights |
| `adults` | no | 1–9, default 1 |
| `rooms` | no | 1–5, default 1 |
| `max` | no | 1–20 offers, default 5 |

```
GET /search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18&adults=2&max=3
```

```json
{
  "source": "fixture",
  "query": { "cityCode": "NYC", "checkInDate": "2026-09-15", "checkOutDate": "2026-09-18",
             "adults": 2, "rooms": 1, "max": 3 },
  "nights": 3,
  "currency": "USD",
  "offers": [
    {
      "offerId": "fx-NYC-2026-09-15-2026-09-18-2-1-0",
      "source": "fixture",
      "hotel": {
        "hotelId": "FXNYC2299",
        "name": "Lantern Inn New York",
        "rating": 2,
        "address": { "cityCode": "NYC", "cityName": "New York", "countryCode": "US", "line": "57 Market St" },
        "geo": { "latitude": 40.74049, "longitude": -73.98414 },
        "amenities": ["AIRPORT_SHUTTLE", "SPA", "RESTAURANT"]
      },
      "checkInDate": "2026-09-15",
      "checkOutDate": "2026-09-18",
      "nights": 3,
      "adults": 2,
      "room": { "type": "SUPERIOR_KING", "beds": 1, "bedType": "KING",
                "description": "Superior king room with desk and lounge chair" },
      "boardType": "ROOM_ONLY",
      "price": { "total": "643.39", "perNight": "214.46", "currency": "USD" },
      "cancellation": { "refundable": false, "deadline": null,
                        "policy": "Non-refundable rate — no cancellation or date change." },
      "available": true
    }
  ],
  "retrievedAt": "2026-08-07T02:50:00.000Z"
}
```

`price.total` covers the whole stay for the requested occupancy; `price.perNight`
is that divided by `nights`. Keep `offerId` for the detail call.

### GET /offer/:offerId — $0.003
Full detail and a per-night price breakdown for one offer.

```
GET /offer/fx-NYC-2026-09-15-2026-09-18-2-1-0
```

```json
{
  "source": "fixture",
  "offerId": "fx-NYC-2026-09-15-2026-09-18-2-1-0",
  "confirmed": true,
  "offer": { "hotel": {}, "room": {}, "price": {}, "cancellation": {} },
  "priceBreakdown": {
    "nights": 3, "perNight": "214.46", "total": "643.39", "currency": "USD",
    "note": "214.46 USD per night x 3 night(s), 2 adult(s)."
  },
  "priceGuarantee": "Fixture mode — deterministic price, stable for identical queries.",
  "pricedAt": "2026-08-07T02:50:00.100Z"
}
```

**Live (`am-…`) offer ids are time-limited.** Amadeus expires hotel offers, so an
`am-` id may 404 after a while; re-run `/search` for fresh ids. If the upstream
offer is gone but this server still has it cached from your `/search`, you get
that cached copy with a `priceGuarantee` saying so. Fixture (`fx-…`) ids encode
their own query and are stateless forever.

### GET /health, GET /cities — free
`/health` reports whether the server is on live Amadeus data or fixtures.
`/cities` lists the city codes the fixture data models by name and location (any
valid 3-letter code works regardless).

## Payment

**Pay in USDC on Base or Solana — your client picks the rail.**

- Protocol: **x402** (HTTP 402 → signed USDC authorization → retry with `X-PAYMENT`)
- Asset: **USDC** on both rails
- Facilitators are rail-specific: `https://x402.org/facilitator` settles the EVM
  rail (override: `FACILITATOR_URL`), `https://facilitator.payai.network` settles
  the Solana rail (override: `SOLANA_FACILITATOR_URL`)

| Rail | Network | payTo |
| --- | --- | --- |
| EVM | `base-sepolia` (default) or `base` via `NETWORK=base` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (default) or `solana-devnet` via `SOLANA_NETWORK=devnet` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

The first unpaid request returns `402` with an `accepts[]` array holding **one
entry per rail**. Pick either, sign for that network, and retry with
`X-PAYMENT: <base64 payload>`:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search", "mimeType": "application/json" },
    { "scheme": "exact", "network": "solana", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search", "mimeType": "application/json" }
  ]
}
```

`maxAmountRequired` is atomic USDC (6 decimals): `5000` = $0.005. The settlement
receipt — including which rail settled it — arrives in the `X-PAYMENT-RESPONSE`
response header.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Bad params — `cityCode` not 3 letters, dates not `YYYY-MM-DD`, checkout not after checkin, or stay over 30 nights |
| 402 | Payment required or payment invalid — body carries `accepts[]` for both rails |
| 404 | Unknown or expired `offerId` |
| 502 | Amadeus upstream error (only possible in live mode) |

## Budgeting notes for agents

- Shopping a city and drilling into one candidate costs $0.008: one `/search` +
  one `/offer/:offerId`.
- `/search` already returns full offers — room, board type, cancellation policy,
  total price. Only pay for `/offer` when you need the breakdown or a re-price.
- Read `maxAmountRequired` from the 402 rather than hardcoding, so an operator's
  repricing never surprises you.

Discovery: this file (`skill.md`, also served at `{BASE_URL}/skill.md`) +
[`/.well-known/x402`]({BASE_URL}/.well-known/x402) + `openapi.json`.

Contact: nichxbt@gmail.com
