# Exposing x402-hotel-search as an MCP tool for Claude

Any MCP server can wrap this service so Claude (or another MCP client) can shop
hotel rooms with a funded wallet. The pattern: one tool per route, `x402-fetch`
for payment, the artifact returned as the tool result.

The service is dual-rail — every 402 quotes USDC on **Base** and on **Solana**.
`x402-fetch` settles the EVM rail, which is what this server uses; swap in a
Solana x402 client if your agent's wallet holds USDC there instead. Nothing else
changes: same routes, same prices, same artifacts.

## Minimal MCP server (TypeScript)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.HOTEL_SEARCH_URL ?? "http://localhost:4023";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
// Cap each call at $0.05 so a tool loop can never run away.
const payFetch = wrapFetchWithPayment(fetch, account, 50_000n);

const server = new McpServer({ name: "x402-hotel-search", version: "0.1.0" });

server.tool(
  "search_hotels",
  "Search hotel offers for a city and date range. Returns full offers including room, board type, cancellation policy and total price. Costs $0.005 in USDC.",
  {
    cityCode: z.string().length(3).describe("3-letter IATA city code, e.g. NYC"),
    checkInDate: z.string().describe("YYYY-MM-DD"),
    checkOutDate: z.string().describe("YYYY-MM-DD, after checkInDate, max 30 nights"),
    adults: z.number().int().min(1).max(9).optional(),
    rooms: z.number().int().min(1).max(5).optional(),
    max: z.number().int().min(1).max(20).optional(),
  },
  async ({ cityCode, checkInDate, checkOutDate, adults, rooms, max }) => {
    const qs = new URLSearchParams({ cityCode, checkInDate, checkOutDate });
    if (adults) qs.set("adults", String(adults));
    if (rooms) qs.set("rooms", String(rooms));
    if (max) qs.set("max", String(max));
    const r = await payFetch(`${BASE_URL}/search?${qs}`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);

server.tool(
  "get_hotel_offer",
  "Full detail and a per-night price breakdown for one offer. Costs $0.003 in USDC.",
  { offerId: z.string().describe("An offerId returned by search_hotels") },
  async ({ offerId }) => {
    const r = await payFetch(`${BASE_URL}/offer/${encodeURIComponent(offerId)}`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);

// Free — let the model see the data source and rails before it spends.
server.tool("service_info", "Data source and accepted payment rails (free)", {}, async () => {
  const r = await fetch(`${BASE_URL}/health`);
  return { content: [{ type: "text", text: await r.text() }] };
});

await server.connect(new StdioServerTransport());
```

## claude_desktop_config.json

```json
{
  "mcpServers": {
    "x402-hotel-search": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-server.ts"],
      "env": {
        "HOTEL_SEARCH_URL": "http://localhost:4023",
        "PRIVATE_KEY": "0x… funded Base Sepolia key"
      }
    }
  }
}
```

## Don't over-call `get_hotel_offer`

`search_hotels` already returns complete offers — hotel, room, board type,
cancellation policy, and total price. A model that reflexively calls
`get_hotel_offer` on every result doubles the cost for information it already
has. Say so in the tool description or system prompt: pull detail only for a
candidate the user is actually choosing between, or when you need the per-night
breakdown spelled out.

## Telling the model about fixtures

`service_info` returns `{"source": "fixture"}` when the operator has no Amadeus
keys set. Surface that in your system prompt — a model quoting fixture rates as
real prices is the one genuinely bad failure mode here. Every paid response also
carries its own `source` field, so the model can check per call.

## Spending safety

`wrapFetchWithPayment(fetch, account, 50_000n)` refuses any single call above
$0.05. For budgets, per-merchant caps, and approval thresholds see the
x402-agent-wallet pattern in the [x402 Suite](https://github.com/nirholas/x402-suite).
