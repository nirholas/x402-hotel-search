/**
 * Hotel search domain logic. Live Amadeus when keys are present, deterministic
 * fixtures otherwise. Every response carries `source: "amadeus" | "fixture"`.
 */
import { amadeusEnabled, amadeusGet } from "./amadeus.js";
import {
  fixtureOfferById,
  fixtureOffers,
  nightsBetween,
  type HotelOffer,
  type SearchParams,
} from "./fixtures.js";

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}

const CITY_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSearchParams(q: Record<string, unknown>): SearchParams {
  const cityCode = String(q.cityCode ?? q.city ?? "").toUpperCase();
  const checkInDate = String(q.checkInDate ?? q.checkIn ?? "");
  const checkOutDate = String(q.checkOutDate ?? q.checkOut ?? "");
  const adults = clamp(Number(q.adults ?? 1) || 1, 1, 9);
  const rooms = clamp(Number(q.rooms ?? 1) || 1, 1, 5);
  const max = clamp(Number(q.max ?? 5) || 5, 1, 20);

  if (!CITY_CODE.test(cityCode)) {
    throw new BadRequestError("cityCode must be a 3-letter IATA city code, e.g. NYC");
  }
  if (!ISO_DATE.test(checkInDate)) throw new BadRequestError("checkInDate must be YYYY-MM-DD");
  if (!ISO_DATE.test(checkOutDate)) throw new BadRequestError("checkOutDate must be YYYY-MM-DD");
  if (Date.parse(`${checkOutDate}T00:00:00Z`) <= Date.parse(`${checkInDate}T00:00:00Z`)) {
    throw new BadRequestError("checkOutDate must be after checkInDate");
  }
  if (nightsBetween(checkInDate, checkOutDate) > 30) {
    throw new BadRequestError("stay must be 30 nights or fewer");
  }
  return { cityCode, checkInDate, checkOutDate, adults, rooms, max };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Live offers from /search are cached so /offer/:id can return their detail. */
const liveOfferCache = new Map<string, HotelOffer>();
const LIVE_CACHE_MAX = 500;

function cacheLiveOffer(offer: HotelOffer): void {
  if (liveOfferCache.size >= LIVE_CACHE_MAX) {
    const first = liveOfferCache.keys().next().value;
    if (first !== undefined) liveOfferCache.delete(first);
  }
  liveOfferCache.set(offer.offerId, offer);
}

// ————— Amadeus response shapes (only the fields we read) —————

interface AmadeusHotelRef {
  hotelId?: string;
  name?: string;
  rating?: string;
  cityCode?: string;
  latitude?: number;
  longitude?: number;
  address?: { lines?: string[]; cityName?: string; countryCode?: string };
  amenities?: string[];
}

interface AmadeusHotelOfferEntry {
  hotel?: AmadeusHotelRef;
  available?: boolean;
  offers?: Array<{
    id?: string;
    checkInDate?: string;
    checkOutDate?: string;
    boardType?: string;
    room?: { type?: string; typeEstimated?: { beds?: number; bedType?: string }; description?: { text?: string } };
    guests?: { adults?: number };
    price?: { total?: string; currency?: string };
    policies?: { cancellations?: Array<{ deadline?: string; amount?: string }> };
  }>;
}

function normalizeAmadeusOffer(entry: AmadeusHotelOfferEntry, raw: NonNullable<AmadeusHotelOfferEntry["offers"]>[number]): HotelOffer {
  const h = entry.hotel ?? {};
  const checkInDate = raw.checkInDate ?? "";
  const checkOutDate = raw.checkOutDate ?? "";
  const nights = checkInDate && checkOutDate ? nightsBetween(checkInDate, checkOutDate) : 1;
  const total = Number(raw.price?.total ?? 0);
  const cancellation = raw.policies?.cancellations?.[0];

  return {
    offerId: `am-${raw.id ?? ""}`,
    source: "amadeus",
    hotel: {
      hotelId: h.hotelId ?? "",
      name: h.name ?? "Unknown hotel",
      rating: Number(h.rating ?? 0),
      address: {
        cityCode: h.cityCode ?? "",
        cityName: h.address?.cityName ?? "",
        countryCode: h.address?.countryCode ?? "",
        line: (h.address?.lines ?? []).join(", "),
      },
      geo: { latitude: h.latitude ?? 0, longitude: h.longitude ?? 0 },
      amenities: h.amenities ?? [],
    },
    checkInDate,
    checkOutDate,
    nights,
    adults: raw.guests?.adults ?? 1,
    room: {
      type: raw.room?.type ?? "UNKNOWN",
      beds: raw.room?.typeEstimated?.beds ?? 1,
      bedType: raw.room?.typeEstimated?.bedType ?? "UNKNOWN",
      description: raw.room?.description?.text ?? "",
    },
    boardType: raw.boardType ?? "ROOM_ONLY",
    price: {
      total: raw.price?.total ?? "0",
      perNight: (total / Math.max(1, nights)).toFixed(2),
      currency: raw.price?.currency ?? "USD",
    },
    cancellation: cancellation?.deadline
      ? {
          refundable: true,
          deadline: cancellation.deadline,
          policy: `Free cancellation until ${cancellation.deadline}.`,
        }
      : { refundable: false, deadline: null, policy: "Non-refundable rate." },
    available: entry.available ?? true,
  };
}

export interface SearchResult {
  source: "amadeus" | "fixture";
  query: SearchParams;
  nights: number;
  currency: string;
  offers: HotelOffer[];
  retrievedAt: string;
}

export async function searchHotels(params: SearchParams): Promise<SearchResult> {
  const nights = nightsBetween(params.checkInDate, params.checkOutDate);

  if (amadeusEnabled()) {
    // Amadeus wants explicit hotel ids, so resolve the city to a hotel list first.
    const list = (await amadeusGet("/v1/reference-data/locations/hotels/by-city", {
      cityCode: params.cityCode,
    })) as { data?: Array<{ hotelId?: string }> };
    const hotelIds = (list.data ?? [])
      .map((h) => h.hotelId)
      .filter((id): id is string => Boolean(id))
      .slice(0, Math.max(params.max, 10));

    if (hotelIds.length === 0) {
      return {
        source: "amadeus",
        query: params,
        nights,
        currency: "USD",
        offers: [],
        retrievedAt: new Date().toISOString(),
      };
    }

    const data = (await amadeusGet("/v3/shopping/hotel-offers", {
      hotelIds: hotelIds.join(","),
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      adults: String(params.adults),
      roomQuantity: String(params.rooms),
      currency: "USD",
    })) as { data?: AmadeusHotelOfferEntry[] };

    const offers: HotelOffer[] = [];
    for (const entry of data.data ?? []) {
      for (const raw of entry.offers ?? []) {
        const normalized = normalizeAmadeusOffer(entry, raw);
        cacheLiveOffer(normalized);
        offers.push(normalized);
      }
    }
    offers.sort((a, b) => Number(a.price.total) - Number(b.price.total));

    return {
      source: "amadeus",
      query: params,
      nights,
      currency: "USD",
      offers: offers.slice(0, params.max),
      retrievedAt: new Date().toISOString(),
    };
  }

  return {
    source: "fixture",
    query: params,
    nights,
    currency: "USD",
    offers: fixtureOffers(params),
    retrievedAt: new Date().toISOString(),
  };
}

export interface OfferDetail {
  source: "amadeus" | "fixture";
  offerId: string;
  confirmed: boolean;
  offer: HotelOffer;
  priceBreakdown: {
    nights: number;
    perNight: string;
    total: string;
    currency: string;
    note: string;
  };
  priceGuarantee: string;
  pricedAt: string;
}

export async function getOffer(offerId: string): Promise<OfferDetail> {
  if (offerId.startsWith("am-")) {
    const rawId = offerId.slice(3);
    const data = (await amadeusGet(`/v3/shopping/hotel-offers/${encodeURIComponent(rawId)}`, {})) as {
      data?: AmadeusHotelOfferEntry;
    };
    const entry = data.data;
    const raw = entry?.offers?.[0];
    if (!entry || !raw) {
      // Fall back to what /search cached for this id before giving up.
      const cached = liveOfferCache.get(offerId);
      if (!cached) {
        throw new NotFoundError(
          "Unknown or expired offerId — hotel offers are time-limited. Run /search again for a fresh id.",
        );
      }
      return detailFrom(cached, "amadeus", "Served from this session's search cache; re-run /search for a live re-price.");
    }
    const offer = normalizeAmadeusOffer(entry, raw);
    cacheLiveOffer(offer);
    return detailFrom(
      offer,
      "amadeus",
      "Confirmed by the Amadeus Hotel Offer Search at pricedAt; rates can still change until booking.",
    );
  }

  const offer = fixtureOfferById(offerId);
  if (!offer) throw new NotFoundError(`Unknown offerId: ${offerId}`);
  return detailFrom(offer, "fixture", "Fixture mode — deterministic price, stable for identical queries.");
}

function detailFrom(
  offer: HotelOffer,
  source: "amadeus" | "fixture",
  priceGuarantee: string,
): OfferDetail {
  return {
    source,
    offerId: offer.offerId,
    confirmed: true,
    offer,
    priceBreakdown: {
      nights: offer.nights,
      perNight: offer.price.perNight,
      total: offer.price.total,
      currency: offer.price.currency,
      note: `${offer.price.perNight} ${offer.price.currency} per night x ${offer.nights} night(s), ${offer.adults} adult(s).`,
    },
    priceGuarantee,
    pricedAt: new Date().toISOString(),
  };
}
