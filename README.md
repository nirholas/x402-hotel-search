# x402-hotel-search

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-2775ca.svg)](https://x402.org)

Pay-per-query hotel search and offer pricing over the **Amadeus Self-Service
API** — agents shop rooms without accounts.

**Pay in USDC on Base or Solana — your client picks the rail.**

## Why x402 for this

Hotel inventory sits behind affiliate agreements, API keys, and monthly minimums
— all of which assume a company signing a contract, not an agent answering one
question. x402 makes the price part of the HTTP conversation: the server quotes
half a cent in the 402, the client signs a USDC transfer and retries, and the 200
body **is** the room list. No account, no key, no subscription that outlives the
trip you were planning.

The pricing shape matters too. `/search` returns *complete* offers — room, board
type, cancellation policy, total and per-night price — so the common case is one
paid call, not a search call followed by N detail calls. You pay for `/offer`
only when you actually need a breakdown.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-hotel-search
cd x402-hotel-search && npm install
cp .env.example .env            # ships with working payTo addresses — edit to get paid yourself
npm run dev                     # service at http://localhost:4023
```

No API keys needed to run it — see [Real backend](#real-backend--api-keys) below.

First 402, no wallet needed:

```bash
curl -s "http://localhost:4023/search?cityCode=NYC&checkInDate=2026-09-15&checkOutDate=2026-09-18" \
  | jq '.accepts[] | {network, payTo, maxAmountRequired}'
```

```json
{ "network": "base-sepolia", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "5000" }
{ "network": "solana",       "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "5000" }
```

Two rails in one challenge — pay whichever you hold.

Full paid flow (funded Base Sepolia wallet — free USDC at [faucet.circle.com](https://faucet.circle.com)):

```bash
export PRIVATE_KEY=0x…
npm run client
```

## API

| Route | Price | What you get back |
| --- | --- | --- |
| `GET /search` | $0.005 | Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price |
| `GET /offer/:offerId` | $0.003 | Priced offer detail with a per-night price breakdown |
| `GET /health` | free | Service status and which data source is live |
| `GET /cities` | free | City codes the fixture data models by name and location |
| `GET /.well-known/x402` | free | Machine-readable price sheet, both rails |
| `GET /skill.md` | free | Agent-facing instructions |

Shopping a city and drilling into one candidate is **$0.008**.

Full details: [docs/api.md](docs/api.md).

## How x402 works

1. `GET /search` with no payment → **402** + an `accepts[]` array with **one entry per rail** (price, network, payTo, USDC mint/contract).
2. The client picks a rail and signs for it — an EIP-3009 USDC transfer authorization on Base, or an SPL USDC transfer on Solana.
3. Retry with `X-PAYMENT: <base64 signed payload>`.
4. The server verifies + settles through the facilitator and answers **200** with the hotel offers. The settlement receipt — tx hash plus which rail settled it — rides in the `X-PAYMENT-RESPONSE` header.

```
GET /search?…                    402  accepts: [ base-sepolia USDC , solana USDC ]
GET /search?…  X-PAYMENT: …      200  { source, nights, offers: [...] }   +  X-PAYMENT-RESPONSE
```

### Dual-rail configuration

| Rail | Default network | Mainnet switch | payTo env |
| --- | --- | --- | --- |
| EVM (Base) | `base-sepolia` | `NETWORK=base` | `PAY_TO_ADDRESS` |
| Solana | `solana` | already mainnet; `SOLANA_NETWORK=devnet` for testing | `SOLANA_PAY_TO_ADDRESS` |

Both default to the x402 Suite's public receive addresses so the demo runs with
zero setup — set your own to receive funds. A rail with a missing or malformed
address is dropped from `accepts` with a warning; the other keeps working.

## Real backend / API keys

Amadeus is a keyed API, so this service is **env-gated**:

| Env | Effect |
| --- | --- |
| `AMADEUS_CLIENT_ID` + `AMADEUS_CLIENT_SECRET` | Live Amadeus Hotel Search API. Responses carry `source: "amadeus"`. |
| *(unset — the default)* | Deterministic fixtures. Responses carry `source: "fixture"`. |
| `AMADEUS_HOST` | `https://test.api.amadeus.com` (free sandbox, default) or `https://api.amadeus.com` |

Free sandbox keys, no card required, at
[developers.amadeus.com](https://developers.amadeus.com).

**Being honest about fixtures:** without keys, the hotels are generated — stable
and realistic-looking, deterministic for a given query, and *not real rates*.
Every response and `GET /health` carry the `source` field so a caller is never
guessing. Never quote a fixture rate to a user as a real one. The point of the
fallback is that the demo, the tests, and an agent's integration work all run
without anyone needing a paid account.

Two real constraints in live mode worth knowing: `/search` resolves a city to
hotel ids before fetching offers, so it costs two upstream Amadeus calls; and
Amadeus expires hotel offers, so live `am-…` offer ids are time-limited (the
server serves its own cached copy where it can, and says so in
`priceGuarantee`). Fixture `fx-…` ids encode their own query and never expire.

## For AI agents

- **[skill.md](skill.md)** — agent-readable instructions for every endpoint, plus budgeting notes.
- **[/.well-known/x402](public/.well-known/x402)** — machine-readable price sheet with both rails and full input/output schemas, indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so agents can find it.
- **[examples/mcp-tool.md](examples/mcp-tool.md)** — expose the service as MCP tools for Claude.
- **[examples/agent-client.ts](examples/agent-client.ts)** — full search → offer-detail flow with `x402-fetch`.
- **[docs/agents.md](docs/agents.md)** — discovery, both payment rails, and what each artifact contains.

## Docs

Site: **https://nirholas.github.io/x402-hotel-search/** —
[tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

Questions, bugs, or listing requests: **nichxbt@gmail.com**

## License

[Apache-2.0](LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/x402-hotel-search&type=Date)](https://www.star-history.com/#nirholas/x402-hotel-search&Date)

<!-- three.ws:growth -->
## Support the project

If x402-hotel-search saves you time, **[star it on GitHub](https://github.com/nirholas/x402-hotel-search)**. Stars are how other developers and AI agents find the repositories worth trusting, and they cost you one click.

Know someone who would use it? [Post on X](https://twitter.com/intent/tweet?text=x402-hotel-search%3A%20Pay-per-query%20hotel%20search%20and%20offer%20pricing%20over%20Amadeus%3A%20agents%20shop%20rooms%20without%20accounts&url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-hotel-search) · [Share on Bluesky](https://bsky.app/intent/compose?text=x402-hotel-search%3A%20Pay-per-query%20hotel%20search%20and%20offer%20pricing%20over%20Amadeus%3A%20agents%20shop%20rooms%20without%20accounts%20https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-hotel-search) · [Share on LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-hotel-search) · [Submit to Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-hotel-search&t=x402-hotel-search%3A%20Pay-per-query%20hotel%20search%20and%20offer%20pricing%20over%20Amadeus%3A%20agents%20shop%20rooms%20without%20accounts) · [Share on Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fx402-hotel-search&title=x402-hotel-search%3A%20Pay-per-query%20hotel%20search%20and%20offer%20pricing%20over%20Amadeus%3A%20agents%20shop%20rooms%20without%20accounts)

## Built for AI agents too

Coding agents and LLM tooling can read this repo directly: [AGENTS.md](./AGENTS.md), [llms.txt](./llms.txt), [llms-full.txt](./llms-full.txt). Point an agent at `https://github.com/nirholas/x402-hotel-search` and it has the context it needs.

## More from the same author

- [All repositories by nirholas](https://github.com/nirholas/nirholas#readme): the full catalog, grouped by topic
- [three.ws](https://three.ws): the platform for 3D AI agents with Solana wallets, a skill marketplace and x402 payments
- Questions or ideas: [open an issue](https://github.com/nirholas/x402-hotel-search/issues) or [start a discussion](https://github.com/nirholas/x402-hotel-search/discussions)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=nirholas/x402-hotel-search)](https://github.com/nirholas/x402-hotel-search/graphs/contributors)

<!-- /three.ws:growth -->
