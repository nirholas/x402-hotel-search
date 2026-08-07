/**
 * x402-hotel-search — pay-per-query hotel search over the Amadeus API.
 *
 * Free routes:  GET /health, GET /cities, GET /.well-known/x402, GET /skill.md
 * Paid routes:  GET /search      $0.005  hotel offers by city and date range
 *               GET /offer/:id   $0.003  priced offer detail
 *
 * Every paid route returns the purchased artifact in the 200 body — agents shop
 * rooms without an account, an API key, or a booking session.
 */
import "dotenv/config";
import express from "express";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRails, describeRails, paywall, type RoutePrices } from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import { amadeusEnabled, UpstreamError } from "./amadeus.js";
import { knownCities } from "./fixtures.js";
import { BadRequestError, NotFoundError, getOffer, parseSearchParams, searchHotels } from "./service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rails = buildRails();

const PRICES = { search: "$0.005", offer: "$0.003" } as const;

/**
 * Every paid route publishes its request and response schema inside the 402
 * challenge, so an agent that has never seen this API can read one 402 and know
 * how to call the route and what it will get back. `ROUTE_SCHEMAS` is generated
 * from `public/openapi.json` (`npm run schemas`), which is what keeps the
 * challenge and the published OpenAPI document from drifting apart.
 */
const routePrices: RoutePrices = {
  "GET /search": {
    price: PRICES.search,
    description:
      "Hotel offers for a city and date range — hotel, room, board type, cancellation policy, total price",
    mimeType: "application/json",
    outputSchema: ROUTE_SCHEMAS["GET /search"],
  },
  "GET /offer/:offerId": {
    price: PRICES.offer,
    description: "Priced offer detail — full room, policy, and per-night price breakdown",
    mimeType: "application/json",
    outputSchema: ROUTE_SCHEMAS["GET /offer/:offerId"],
  },
};

const app = express();
app.use(express.json());

/** Dual-rail paywall — pay in USDC on Base or Solana, the client picks. */
app.use(paywall(routePrices, rails));

// ————— Free routes —————

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-hotel-search",
    source: amadeusEnabled() ? "amadeus" : "fixture",
    rails: rails.map((r) => r.network),
  });
});

/** City codes the fixture data models explicitly, so a caller can try the API blind. */
app.get("/cities", (_req, res) => {
  res.json({
    note: "Any 3-letter IATA city code works. These are the ones the fixture data models by name and location.",
    source: amadeusEnabled() ? "amadeus" : "fixture",
    cities: knownCities(),
  });
});

// ————— Paid routes —————

app.get("/search", async (req, res) => {
  try {
    const params = parseSearchParams(req.query as Record<string, unknown>);
    res.json(await searchHotels(params));
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/offer/:offerId", async (req, res) => {
  try {
    res.json(await getOffer(req.params.offerId));
  } catch (err) {
    handleError(err, res);
  }
});

// ————— Discovery —————

app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").sendFile(join(ROOT, "public", ".well-known", "x402"));
});
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(join(ROOT, "skill.md"));
});
app.use(express.static(join(ROOT, "public")));

function handleError(err: unknown, res: express.Response): void {
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: "bad_request", message: err.message });
  } else if (err instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
  } else if (err instanceof UpstreamError) {
    console.error(err);
    res.status(502).json({ error: "upstream_error", message: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
}

const port = Number(process.env.PORT ?? 4023);
app.listen(port, () => {
  console.log(`\nx402-hotel-search listening on http://localhost:${port}\n`);
  console.log("  Payment rails (USDC — the client picks):");
  for (const line of describeRails(rails)) console.log(`    ${line}`);
  console.log(
    `\n  Data source: ${
      amadeusEnabled()
        ? "Amadeus (live) — AMADEUS_CLIENT_ID/SECRET detected"
        : 'fixtures (deterministic) — set AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET for live data; responses are labelled source:"fixture"'
    }\n`,
  );
  console.log("  Free routes:");
  console.log("    GET /health              service + data source");
  console.log("    GET /cities              city codes the fixtures model");
  console.log("    GET /.well-known/x402    machine-readable price sheet");
  console.log("    GET /skill.md            agent instructions\n");
  console.log("  Paid routes (x402, USDC on Base or Solana):");
  console.log(`    GET /search              ${PRICES.search}  hotel offers by city/date`);
  console.log(`    GET /offer/:offerId      ${PRICES.offer}  priced offer detail\n`);
});
