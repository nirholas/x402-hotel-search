// Fixture data — used when AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET are unset.
// Deterministic: the same query always produces the same hotels and offers, so
// agents can build and test the search -> offer flow without an Amadeus account.

export interface HotelAddress {
  cityCode: string;
  cityName: string;
  countryCode: string;
  line: string;
}

export interface RoomDetail {
  type: string;
  beds: number;
  bedType: string;
  description: string;
}

export interface HotelOffer {
  offerId: string;
  source: "amadeus" | "fixture";
  hotel: {
    hotelId: string;
    name: string;
    rating: number;
    address: HotelAddress;
    geo: { latitude: number; longitude: number };
    amenities: string[];
  };
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  room: RoomDetail;
  boardType: string;
  price: { total: string; perNight: string; currency: string };
  cancellation: { refundable: boolean; deadline: string | null; policy: string };
  available: boolean;
}

export interface SearchParams {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  rooms: number;
  max: number;
}

/** A handful of cities with plausible coordinates, so fixture geo isn't nonsense. */
const CITIES: Record<string, { name: string; country: string; lat: number; lon: number }> = {
  NYC: { name: "New York", country: "US", lat: 40.7128, lon: -74.006 },
  LON: { name: "London", country: "GB", lat: 51.5072, lon: -0.1276 },
  PAR: { name: "Paris", country: "FR", lat: 48.8566, lon: 2.3522 },
  TYO: { name: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
  SFO: { name: "San Francisco", country: "US", lat: 37.7749, lon: -122.4194 },
  BER: { name: "Berlin", country: "DE", lat: 52.52, lon: 13.405 },
  SIN: { name: "Singapore", country: "SG", lat: 1.3521, lon: 103.8198 },
  BCN: { name: "Barcelona", country: "ES", lat: 41.3874, lon: 2.1686 },
};

const BRANDS = [
  { prefix: "Harbour", suffix: "Hotel", tier: 3 },
  { prefix: "The Meridian", suffix: "", tier: 4 },
  { prefix: "Lantern", suffix: "Inn", tier: 2 },
  { prefix: "Grand Palm", suffix: "Resort", tier: 5 },
  { prefix: "Cornerstone", suffix: "Suites", tier: 3 },
  { prefix: "Northgate", suffix: "Lodge", tier: 2 },
  { prefix: "Aurelia", suffix: "House", tier: 4 },
  { prefix: "Quayside", suffix: "Hotel", tier: 3 },
];

const STREETS = ["Market St", "King's Road", "Rue Lafayette", "Union Ave", "Harbour Way", "Elm Street"];

const AMENITY_POOL = [
  "WIFI",
  "PARKING",
  "RESTAURANT",
  "FITNESS_CENTER",
  "SWIMMING_POOL",
  "AIRPORT_SHUTTLE",
  "PETS_ALLOWED",
  "BUSINESS_CENTER",
  "SPA",
  "BREAKFAST",
];

const ROOM_TYPES: Array<{ type: string; beds: number; bedType: string; description: string }> = [
  { type: "STANDARD_DOUBLE", beds: 1, bedType: "DOUBLE", description: "Standard double room, city view" },
  { type: "SUPERIOR_KING", beds: 1, bedType: "KING", description: "Superior king room with desk and lounge chair" },
  { type: "TWIN", beds: 2, bedType: "TWIN", description: "Twin room with two single beds" },
  { type: "JUNIOR_SUITE", beds: 1, bedType: "KING", description: "Junior suite with separate seating area" },
];

const BOARD_TYPES = ["ROOM_ONLY", "BREAKFAST", "HALF_BOARD"];

/** FNV-1a 32-bit — stable, dependency-free string hash. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from the query. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function knownCities(): Array<{ cityCode: string; name: string; country: string }> {
  return Object.entries(CITIES).map(([cityCode, c]) => ({
    cityCode,
    name: c.name,
    country: c.country,
  }));
}

/**
 * Generate deterministic hotel offers for a query. Any 3-letter city code works;
 * unknown codes get coordinates derived from the code itself so geo stays stable.
 */
export function fixtureOffers(p: SearchParams): HotelOffer[] {
  const city = CITIES[p.cityCode] ?? {
    name: p.cityCode,
    country: "XX",
    // Derive a stable pseudo-location for unknown city codes.
    lat: ((hash(p.cityCode) % 14000) / 100 - 70),
    lon: ((hash(p.cityCode + "lon") % 36000) / 100 - 180),
  };
  const nights = nightsBetween(p.checkInDate, p.checkOutDate);
  const seed = hash(`${p.cityCode}|${p.checkInDate}|${p.checkOutDate}|${p.adults}|${p.rooms}`);
  const rand = rng(seed);

  const offers: HotelOffer[] = [];
  for (let i = 0; i < p.max; i++) {
    const brand = BRANDS[Math.floor(rand() * BRANDS.length)];
    const room = ROOM_TYPES[Math.floor(rand() * ROOM_TYPES.length)];
    const boardType = BOARD_TYPES[Math.floor(rand() * BOARD_TYPES.length)];

    // Base rate scales with the brand tier, plus a stable per-hotel jitter.
    const base = 55 + brand.tier * 38 + rand() * 60;
    const occupancyMultiplier = 1 + (p.adults - 1) * 0.18 + (p.rooms - 1) * 0.9;
    const perNight = base * occupancyMultiplier;
    const total = perNight * nights;

    const amenityCount = 3 + Math.floor(rand() * 4);
    const amenities: string[] = [];
    for (let a = 0; a < amenityCount; a++) {
      const pick = AMENITY_POOL[Math.floor(rand() * AMENITY_POOL.length)];
      if (!amenities.includes(pick)) amenities.push(pick);
    }

    const refundable = rand() > 0.35;
    const hotelId = `FX${p.cityCode}${String(1000 + Math.floor(rand() * 8999))}`;

    offers.push({
      // Params are encoded in the id so /offer/:id is stateless in fixture mode.
      offerId: `fx-${p.cityCode}-${p.checkInDate}-${p.checkOutDate}-${p.adults}-${p.rooms}-${i}`,
      source: "fixture",
      hotel: {
        hotelId,
        name: `${brand.prefix}${brand.suffix ? " " + brand.suffix : ""} ${city.name}`,
        rating: brand.tier,
        address: {
          cityCode: p.cityCode,
          cityName: city.name,
          countryCode: city.country,
          line: `${10 + Math.floor(rand() * 300)} ${STREETS[Math.floor(rand() * STREETS.length)]}`,
        },
        geo: {
          latitude: Number((city.lat + (rand() - 0.5) * 0.08).toFixed(5)),
          longitude: Number((city.lon + (rand() - 0.5) * 0.08).toFixed(5)),
        },
        amenities,
      },
      checkInDate: p.checkInDate,
      checkOutDate: p.checkOutDate,
      nights,
      adults: p.adults,
      room,
      boardType,
      price: {
        total: total.toFixed(2),
        perNight: perNight.toFixed(2),
        currency: "USD",
      },
      cancellation: refundable
        ? {
            refundable: true,
            deadline: `${daysBefore(p.checkInDate, 2)}T18:00:00Z`,
            policy: "Free cancellation until 18:00 local time two days before check-in.",
          }
        : {
            refundable: false,
            deadline: null,
            policy: "Non-refundable rate — no cancellation or date change.",
          },
      available: true,
    });
  }

  return offers.sort((a, b) => Number(a.price.total) - Number(b.price.total));
}

/** Re-derive a single fixture offer from its id (fixture offer detail is stateless). */
export function fixtureOfferById(offerId: string): HotelOffer | undefined {
  const m = offerId.match(
    /^fx-([A-Z0-9]{3})-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)-(\d+)$/,
  );
  if (!m) return undefined;
  const offers = fixtureOffers({
    cityCode: m[1],
    checkInDate: m[2],
    checkOutDate: m[3],
    adults: Number(m[4]),
    rooms: Number(m[5]),
    max: 20,
  });
  return offers.find((o) => o.offerId === offerId);
}
