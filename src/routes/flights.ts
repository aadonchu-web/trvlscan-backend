import { Duffel } from "@duffel/api";
import { Router } from "express";

const router = Router();

const getDuffelClient = () => {
  const duffelApiKey = process.env.DUFFEL_API_KEY;

  if (!duffelApiKey) {
    throw new Error("DUFFEL_API_KEY is required");
  }

  if (!duffelApiKey.startsWith("duffel_test_")) {
    throw new Error("DUFFEL_API_KEY must be a sandbox token starting with duffel_test_");
  }

  return new Duffel({
    token: duffelApiKey,
  });
};

type DuffelCondition = {
  allowed?: boolean;
  penalty_amount?: string | null;
  penalty_currency?: string | null;
} | null;

type DuffelBaggage = {
  type?: string;
  quantity?: number;
};

type DuffelPassengerOnSegment = {
  cabin_class?: string | null;
  cabin_class_marketing_name?: string | null;
  baggages?: DuffelBaggage[];
};

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  expires_at?: string;
  cabin_class?: string | null;
  conditions?: {
    change_before_departure?: DuffelCondition;
    refund_before_departure?: DuffelCondition;
  };
  owner?: {
    name?: string;
    logo_url?: string | null;
  };
  slices?: Array<{
    duration?: string | null;
    fare_brand_name?: string | null;
    segments?: Array<{
      id: string;
      departing_at: string;
      arriving_at: string;
      duration?: string | null;
      origin?: { iata_code?: string };
      destination?: { iata_code?: string };
      marketing_carrier?: { iata_code?: string; name?: string };
      operating_carrier?: { iata_code?: string; name?: string };
      passengers?: DuffelPassengerOnSegment[];
    }>;
  }>;
};

type BaggageEntry = { included: boolean; quantity: number };

type FarePolicy = {
  allowed: boolean;
  penalty_amount: string | null;
  penalty_currency: string | null;
};

const titleCase = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const extractFareBrandName = (offer: DuffelOffer): string | null => {
  const firstSlice = offer.slices?.[0];
  return firstSlice?.fare_brand_name ?? null;
};

const extractCabinClassMarketingName = (offer: DuffelOffer): string | null => {
  const firstPassenger = offer.slices?.[0]?.segments?.[0]?.passengers?.[0];
  if (firstPassenger?.cabin_class_marketing_name) {
    return firstPassenger.cabin_class_marketing_name;
  }
  return titleCase(offer.cabin_class ?? null);
};

const extractBaggageSummary = (
  offer: DuffelOffer,
): { carry_on: BaggageEntry; checked: BaggageEntry } => {
  const slices = offer.slices ?? [];
  if (slices.length === 0) {
    return {
      carry_on: { included: false, quantity: 0 },
      checked: { included: false, quantity: 0 },
    };
  }

  let minCarryOn = Infinity;
  let minChecked = Infinity;

  for (const slice of slices) {
    const firstPassenger = slice.segments?.[0]?.passengers?.[0];
    const baggages = firstPassenger?.baggages ?? [];

    let carryOnQty = 0;
    let checkedQty = 0;
    for (const bag of baggages) {
      const qty = typeof bag.quantity === "number" ? bag.quantity : 0;
      if (bag.type === "carry_on") carryOnQty += qty;
      else if (bag.type === "checked") checkedQty += qty;
    }

    if (carryOnQty < minCarryOn) minCarryOn = carryOnQty;
    if (checkedQty < minChecked) minChecked = checkedQty;
  }

  if (!Number.isFinite(minCarryOn)) minCarryOn = 0;
  if (!Number.isFinite(minChecked)) minChecked = 0;

  return {
    carry_on: { included: minCarryOn > 0, quantity: minCarryOn },
    checked: { included: minChecked > 0, quantity: minChecked },
  };
};

const extractPolicy = (condition: DuffelCondition | undefined): FarePolicy => ({
  allowed: condition?.allowed ?? false,
  penalty_amount: condition?.penalty_amount ?? null,
  penalty_currency: condition?.penalty_currency ?? null,
});

const simplifySegment = (segment: NonNullable<NonNullable<DuffelOffer["slices"]>[number]["segments"]>[number]) => ({
  id: segment.id,
  departure_time: segment.departing_at,
  arrival_time: segment.arriving_at,
  duration: segment.duration ?? null,
  origin: segment.origin?.iata_code ?? null,
  destination: segment.destination?.iata_code ?? null,
  marketing_carrier: {
    code: segment.marketing_carrier?.iata_code ?? null,
    name: segment.marketing_carrier?.name ?? null,
  },
  operating_carrier: {
    code: segment.operating_carrier?.iata_code ?? null,
    name: segment.operating_carrier?.name ?? null,
  },
});

const simplifySlice = (slice: NonNullable<DuffelOffer["slices"]>[number]) => {
  const segments = slice.segments ?? [];
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  return {
    origin: firstSegment?.origin?.iata_code ?? null,
    destination: lastSegment?.destination?.iata_code ?? null,
    departure_time: firstSegment?.departing_at ?? null,
    arrival_time: lastSegment?.arriving_at ?? null,
    duration: slice.duration ?? null,
    number_of_stops: Math.max(segments.length - 1, 0),
    segments: segments.map(simplifySegment),
  };
};

const simplifyOffer = (offer: DuffelOffer) => {
  const slices = (offer.slices ?? []).map(simplifySlice);
  const firstSlice = slices[0];

  return {
    id: offer.id,
    total_amount: offer.total_amount,
    total_currency: offer.total_currency,
    departure_time: firstSlice?.departure_time ?? null,
    arrival_time: firstSlice?.arrival_time ?? null,
    duration: firstSlice?.duration ?? null,
    airline: {
      name: offer.owner?.name ?? null,
      logo_url: offer.owner?.logo_url ?? null,
    },
    number_of_stops: firstSlice?.number_of_stops ?? 0,
    segments: firstSlice?.segments ?? [],
    slices,
    expires_at: offer.expires_at,
    fare_brand_name: extractFareBrandName(offer),
    cabin_class_marketing_name: extractCabinClassMarketingName(offer),
    baggage_summary: extractBaggageSummary(offer),
    change_policy: extractPolicy(offer.conditions?.change_before_departure),
    refund_policy: extractPolicy(offer.conditions?.refund_before_departure),
  };
};

const simplifyPartialOffer = (offer: DuffelOffer) => {
  const slices = (offer.slices ?? []).map(simplifySlice);
  const firstSlice = slices[0];
  const firstSegment = firstSlice?.segments?.[0];

  return {
    id: offer.id,
    total_amount: offer.total_amount,
    total_currency: offer.total_currency,
    departure_time: firstSlice?.departure_time ?? null,
    arrival_time: firstSlice?.arrival_time ?? null,
    duration: firstSlice?.duration ?? null,
    airline: {
      name: offer.owner?.name ?? null,
      iata: firstSegment?.marketing_carrier?.code ?? null,
      logo_url: offer.owner?.logo_url ?? null,
    },
    number_of_stops: firstSlice?.number_of_stops ?? 0,
    segments: firstSlice?.segments ?? [],
    slice: firstSlice
      ? { origin: firstSlice.origin, destination: firstSlice.destination }
      : null,
    partial: true,
  };
};

type PartialSearchSlice = {
  origin: string;
  destination: string;
  departure_date: string;
};

const validatePartialSearchInput = (
  body: any,
):
  | { ok: true; slices: PartialSearchSlice[]; passengers: number; cabin_class: string }
  | { ok: false; error: string } => {
  const { slices, passengers, cabin_class } = body ?? {};

  if (!Array.isArray(slices) || slices.length === 0) {
    return { ok: false, error: "slices[] is required and must be non-empty" };
  }

  const normalized: PartialSearchSlice[] = [];
  for (const slice of slices) {
    if (!slice || !slice.origin || !slice.destination || !slice.departure_date) {
      return {
        ok: false,
        error: "Each slice must include origin, destination, and departure_date",
      };
    }
    normalized.push({
      origin: slice.origin,
      destination: slice.destination,
      departure_date: slice.departure_date,
    });
  }

  const passengerCount = Number(passengers);
  if (!Number.isInteger(passengerCount) || passengerCount <= 0) {
    return { ok: false, error: "passengers must be a positive integer" };
  }

  return {
    ok: true,
    slices: normalized,
    passengers: passengerCount,
    cabin_class: cabin_class ?? "economy",
  };
};

router.post("/search", async (req, res) => {
  try {
    const duffel = getDuffelClient();
    const {
      slices: rawSlices,
      origin,
      destination,
      departure_date,
      passengers,
      cabin_class,
    } = req.body ?? {};

    const inputSlices = Array.isArray(rawSlices) && rawSlices.length > 0
      ? rawSlices
      : origin && destination && departure_date
      ? [{ origin, destination, departure_date }]
      : null;

    if (!inputSlices) {
      return res.status(400).json({
        error:
          "Missing required fields: provide slices[] or origin, destination, departure_date",
      });
    }

    if (passengers === undefined) {
      return res.status(400).json({
        error: "Missing required field: passengers",
      });
    }

    const normalizedSlices = [] as Array<{
      origin: string;
      destination: string;
      departure_date: string;
      arrival_time: null;
      departure_time: null;
    }>;

    for (const slice of inputSlices) {
      if (!slice || !slice.origin || !slice.destination || !slice.departure_date) {
        return res.status(400).json({
          error: "Each slice must include origin, destination, and departure_date",
        });
      }
      normalizedSlices.push({
        origin: slice.origin,
        destination: slice.destination,
        departure_date: slice.departure_date,
        arrival_time: null,
        departure_time: null,
      });
    }

    const passengerCount = Number(passengers);

    if (!Number.isInteger(passengerCount) || passengerCount <= 0) {
      return res.status(400).json({
        error: "passengers must be a positive integer",
      });
    }

    const offerRequestResponse = await duffel.offerRequests.create({
      slices: normalizedSlices,
      passengers: Array.from({ length: passengerCount }, () => ({
        type: "adult",
      })),
      cabin_class: cabin_class ?? "economy",
      return_offers: true,
    });

    const offers = (offerRequestResponse.data.offers ?? []).map((offer) =>
      simplifyOffer(offer as DuffelOffer),
    );

    return res.json({ offers });
  } catch (error) {
    console.error("Duffel flight search failed:", error);
    return res.status(500).json({ error: "Failed to search flights" });
  }
});

router.post("/partial-search", async (req, res) => {
  try {
    const validated = validatePartialSearchInput(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }

    const duffel = getDuffelClient();
    const response = await duffel.partialOfferRequests.create({
      slices: validated.slices.map((s) => ({
        origin: s.origin,
        destination: s.destination,
        departure_date: s.departure_date,
        arrival_time: null,
        departure_time: null,
      })),
      passengers: Array.from({ length: validated.passengers }, () => ({
        type: "adult",
      })),
      cabin_class: validated.cabin_class as any,
    });

    const offers = (response.data.offers ?? []).map((offer) =>
      simplifyPartialOffer(offer as DuffelOffer),
    );

    return res.json({
      partial_offer_request_id: response.data.id,
      total_slices: response.data.slices?.length ?? validated.slices.length,
      offers,
    });
  } catch (error) {
    console.error("Duffel partial search failed:", error);
    return res.status(500).json({ error: "Failed to create partial offer request" });
  }
});

router.post("/partial-search/select", async (req, res) => {
  try {
    const { partial_offer_request_id, selected_partial_offer_ids } = req.body ?? {};

    if (!partial_offer_request_id || typeof partial_offer_request_id !== "string") {
      return res.status(400).json({ error: "partial_offer_request_id is required" });
    }

    if (
      !Array.isArray(selected_partial_offer_ids) ||
      selected_partial_offer_ids.length === 0 ||
      selected_partial_offer_ids.some((id) => typeof id !== "string" || !id)
    ) {
      return res
        .status(400)
        .json({ error: "selected_partial_offer_ids must be a non-empty string array" });
    }

    const duffel = getDuffelClient();
    const response = await duffel.partialOfferRequests.get(partial_offer_request_id, {
      "selected_partial_offer[]": selected_partial_offer_ids,
    });

    const offers = (response.data.offers ?? []).map((offer) =>
      simplifyPartialOffer(offer as DuffelOffer),
    );

    return res.json({
      done: false,
      partial_offer_request_id: response.data.id,
      total_slices: response.data.slices?.length ?? null,
      selected_count: selected_partial_offer_ids.length,
      offers,
    });
  } catch (error) {
    console.error("Duffel partial select failed:", error);
    return res.status(500).json({ error: "Failed to fetch next slice partial offers" });
  }
});

router.post("/partial-search/fares", async (req, res) => {
  try {
    const { partial_offer_request_id, selected_partial_offer_ids } = req.body ?? {};

    if (!partial_offer_request_id || typeof partial_offer_request_id !== "string") {
      return res.status(400).json({ error: "partial_offer_request_id is required" });
    }

    if (
      !Array.isArray(selected_partial_offer_ids) ||
      selected_partial_offer_ids.length === 0 ||
      selected_partial_offer_ids.some((id) => typeof id !== "string" || !id)
    ) {
      return res
        .status(400)
        .json({ error: "selected_partial_offer_ids must be a non-empty string array" });
    }

    const duffel = getDuffelClient();
    const response = await duffel.partialOfferRequests.getFaresById(
      partial_offer_request_id,
      { "selected_partial_offer[]": selected_partial_offer_ids },
    );

    const offers = (response.data.offers ?? []).map((offer) =>
      simplifyOffer(offer as DuffelOffer),
    );

    return res.json({ offers });
  } catch (error) {
    console.error("Duffel partial fares failed:", error);
    return res.status(500).json({ error: "Failed to fetch fares for selected partial offers" });
  }
});

router.get("/offer/:id", async (req, res) => {
  try {
    const duffel = getDuffelClient();
    const { id } = req.params;

    const offerResponse = await duffel.offers.get(id);
    const offer = simplifyOffer(offerResponse.data as DuffelOffer);

    return res.json(offer);
  } catch (error) {
    console.error("Duffel offer fetch failed:", error);
    return res.status(500).json({ error: "Failed to fetch offer" });
  }
});

router.get("/airports", async (req, res) => {
  try {
    const duffel = getDuffelClient();
    const query = req.query.query as string;

    if (!query || query.length < 2) {
      return res.json([]);
    }

    const response = await duffel.suggestions.list({ query });

    const airports = (response.data ?? [])
      .filter((s: any) => s.type === "airport")
      .slice(0, 6)
      .map((s: any) => ({
        iata_code: s.iata_code,
        name: s.name,
        city: s.city_name ?? "",
      }));

    return res.json(airports);
  } catch (error) {
    console.error("Airport search failed:", error);
    return res.status(500).json({ error: "Failed to search airports" });
  }
});

export default router;
