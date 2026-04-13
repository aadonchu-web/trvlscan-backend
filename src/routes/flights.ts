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

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  expires_at?: string;
  owner?: {
    name?: string;
    logo_url?: string | null;
  };
  slices?: Array<{
    duration?: string | null;
    segments?: Array<{
      id: string;
      departing_at: string;
      arriving_at: string;
      duration?: string | null;
      origin?: { iata_code?: string };
      destination?: { iata_code?: string };
      marketing_carrier?: { iata_code?: string; name?: string };
      operating_carrier?: { iata_code?: string; name?: string };
    }>;
  }>;
};

const simplifyOffer = (offer: DuffelOffer) => {
  const firstSlice = offer.slices?.[0];
  const segments = firstSlice?.segments ?? [];
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  return {
    id: offer.id,
    total_amount: offer.total_amount,
    total_currency: offer.total_currency,
    departure_time: firstSegment?.departing_at ?? null,
    arrival_time: lastSegment?.arriving_at ?? null,
    duration: firstSlice?.duration ?? null,
    airline: {
      name: offer.owner?.name ?? null,
      logo_url: offer.owner?.logo_url ?? null,
    },
    number_of_stops: Math.max(segments.length - 1, 0),
    segments: segments.map((segment) => ({
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
    })),
    expires_at: offer.expires_at,
  };
};

router.post("/search", async (req, res) => {
  try {
    const duffel = getDuffelClient();
    const { origin, destination, departure_date, passengers } = req.body ?? {};

    if (!origin || !destination || !departure_date || passengers === undefined) {
      return res.status(400).json({
        error:
          "Missing required fields: origin, destination, departure_date, passengers",
      });
    }

    const passengerCount = Number(passengers);

    if (!Number.isInteger(passengerCount) || passengerCount <= 0) {
      return res.status(400).json({
        error: "passengers must be a positive integer",
      });
    }

    const offerRequestResponse = await duffel.offerRequests.create({
      slices: [
        {
          origin,
          destination,
          departure_date,
        },
      ],
      passengers: Array.from({ length: passengerCount }, () => ({
        type: "adult",
      })),
      cabin_class: "economy",
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

export default router;
