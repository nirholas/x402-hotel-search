# API reference

Base URL: your deployment (default `http://localhost:4023`).
Machine-readable versions: [`openapi.json`](https://github.com/nirholas/x402-hotel-search/blob/main/openapi.json) ·
[`/.well-known/x402`](https://github.com/nirholas/x402-hotel-search/blob/main/public/.well-known/x402)

Paid routes speak x402: an unpaid request returns **402** with an `accepts[]`
array holding **one entry per payment rail**; retry with a signed `X-PAYMENT`
header to get **200**.

**Pay in USDC on Base or Solana — your client picks the rail.**

| Rail | Network | Asset | payTo |
| --- | --- | --- | --- |
| EVM | `base-sepolia` (default) / `base` | USDC `0x036CbD…F7e` (sepolia) | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (default) / `solana-devnet` | USDC `EPjFWdd5…Dt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Every 402 body looks like this (amounts are atomic USDC, 6 decimals):

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search",
      "description": "Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "mimeType": "application/json", "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "5000",
      "resource": "http://localhost:4023/search",
      "description": "Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "mimeType": "application/json", "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "decimals": 6 } }
  ]
}
```

On success, `X-PAYMENT-RESPONSE` is base64 JSON:
`{ "success": true, "rail": "evm" | "solana", "network", "transaction", "payer" }`.

## Data source

Every paid response carries a **`source`** field:

| Value | Meaning |
| --- | --- |
| `"amadeus"` | Live Amadeus Hotel Search API — the operator has `AMADEUS_CLIENT_ID` + `AMADEUS_CLIENT_SECRET` set |
| `"fixture"` | Deterministic generated data — no keys configured. Identical queries always return identical results. |

Check it before acting on a rate. `GET /health` reports the same thing for free.

---

## GET /search — paid, $0.005

Hotel offers for one city and date range, cheapest first.

| Param | In | Required | Notes |
| --- | --- | --- | --- |
| `cityCode` | query | yes | 3-letter IATA city code, e.g. `NYC`. Alias: `city`. |
| `checkInDate` | query | yes | `YYYY-MM-DD`. Alias: `checkIn`. |
| `checkOutDate` | query | yes | `YYYY-MM-DD`, after check-in, max 30 nights. Alias: `checkOut`. |
| `adults` | query | no | 1–9, default 1 |
| `rooms` | query | no | 1–5, default 1 |
| `max` | query | no | 1–20 offers, default 5 |

```
GET /search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18&adults=2&max=3
```

**200**

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

Field notes:

- `price.total` is the whole stay at the requested occupancy; `price.perNight` is
  that divided by `nights`.
- `hotel.rating` is a star rating, `0` when the upstream doesn't provide one.
- `hotel.amenities` uses Amadeus amenity codes (`WIFI`, `PARKING`,
  `SWIMMING_POOL`, …).
- `boardType` is `ROOM_ONLY` | `BREAKFAST` | `HALF_BOARD`.
- `cancellation.deadline` is `null` on non-refundable rates.

In live mode this route makes two upstream calls: it resolves the city to hotel
ids, then fetches offers for them.

**Errors**

| Status | Case |
| --- | --- |
| 400 | `cityCode` not 3 letters, dates not `YYYY-MM-DD`, checkout not after checkin, or stay over 30 nights |
| 402 | No/invalid payment — body carries `accepts[]` for both rails |
| 502 | Amadeus upstream error (live mode only) |

---

## GET /offer/:offerId — paid, $0.003

Full detail and a per-night price breakdown for one offer.

| Param | In | Required | Notes |
| --- | --- | --- | --- |
| `offerId` | path | yes | An `offerId` from `/search` |

**200**

```json
{
  "source": "fixture",
  "offerId": "fx-NYC-2026-09-15-2026-09-18-2-1-0",
  "confirmed": true,
  "offer": { "hotel": {}, "room": {}, "price": {}, "cancellation": {} },
  "priceBreakdown": {
    "nights": 3,
    "perNight": "214.46",
    "total": "643.39",
    "currency": "USD",
    "note": "214.46 USD per night x 3 night(s), 2 adult(s)."
  },
  "priceGuarantee": "Fixture mode — deterministic price, stable for identical queries.",
  "pricedAt": "2026-08-07T02:50:00.100Z"
}
```

`priceGuarantee` states in plain language how firm the number is. In live mode it
reads: *"Confirmed by the Amadeus Hotel Offer Search at pricedAt; rates can still
change until booking."*

> **Live offer ids are time-limited.** Amadeus expires hotel offers, so an `am-…`
> id may 404 once the upstream offer is gone — re-run `/search` for fresh ids. If
> this server still has the offer cached from your own `/search` in the same
> session, you get that copy with a `priceGuarantee` saying so. Fixture `fx-…` ids
> encode their own query and are stateless forever.

**Worth knowing:** `/search` already returns complete offers. Pay for `/offer`
when you want the breakdown spelled out or a fresh re-price on a candidate you
are actually choosing between — not reflexively on every search result.

**Errors**

| Status | Case |
| --- | --- |
| 402 | No/invalid payment |
| 404 | Unknown `offerId`, or a live offer that expired upstream and was not cached |
| 502 | Amadeus upstream error (live mode only) |

---

## GET /health — free

```json
{ "ok": true, "service": "x402-hotel-search", "source": "fixture", "rails": ["base-sepolia", "solana"] }
```

## GET /cities — free

City codes the fixture data models by name and location, so you can try the API
without knowing one. Any valid 3-letter IATA city code works regardless —
unknown codes get stable derived coordinates in fixture mode.

## GET /.well-known/x402 — free

The x402 discovery manifest: every paid resource with its price, both networks,
an `accepts[]` preview of the live challenge, and input/output schemas.
Index-ready for x402scan.com, the x402 Bazaar, and agentic.market.

## GET /skill.md — free

The agent-facing instruction file, served from the running host.
