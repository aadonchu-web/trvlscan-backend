import { Duffel } from "@duffel/api";
import { createClient } from "@supabase/supabase-js";
import { Router } from "express";
import { getCurrencyRate } from "../services/currency";

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

const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

interface PassengerPayload {
  title: "mr" | "mrs" | "ms" | "miss" | "dr";
  gender: "m" | "f";
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
  passportIssuingCountry: string;
}

type CreateBookingBody = {
  offerId?: string;
  passenger?: Partial<PassengerPayload>;
};

router.post("/create", async (req, res) => {
  try {
    const { offerId, passenger } = (req.body ?? {}) as CreateBookingBody;

    if (!offerId) {
      return res.status(400).json({ error: "Missing required field: offerId" });
    }
    if (!passenger || typeof passenger !== "object") {
      return res.status(400).json({ error: "Missing required field: passenger" });
    }

    const passengerFields: (keyof PassengerPayload)[] = [
      "title", "gender", "firstName", "lastName", "dateOfBirth",
      "email", "phone", "nationality", "passportNumber",
      "passportExpiry", "passportIssuingCountry",
    ];
    for (const field of passengerFields) {
      if (!passenger[field]) {
        return res.status(400).json({ error: `Missing required field: passenger.${field}` });
      }
    }

    if (!/^[A-Z]{2}$/.test(passenger.nationality!)) {
      return res.status(400).json({ error: "Missing required field: passenger.nationality" });
    }
    if (!/^[A-Z]{2}$/.test(passenger.passportIssuingCountry!)) {
      return res.status(400).json({ error: "Missing required field: passenger.passportIssuingCountry" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.dateOfBirth!)) {
      return res.status(400).json({ error: "Missing required field: passenger.dateOfBirth" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.passportExpiry!)) {
      return res.status(400).json({ error: "Missing required field: passenger.passportExpiry" });
    }
    if (!/^\+\d{8,15}$/.test(passenger.phone!)) {
      return res.status(400).json({ error: "Missing required field: passenger.phone" });
    }

    const duffel = getDuffelClient();
    const supabase = getSupabaseClient();

    const offerResponse = await duffel.offers.get(offerId);
    const offer = offerResponse.data as { total_amount: string; total_currency?: string };
    const offerAmount = Number(offer.total_amount);
    const offerCurrency = (offer.total_currency ?? "USD").toUpperCase();

    if (!Number.isFinite(offerAmount)) {
      return res.status(400).json({ error: "Offer price is invalid" });
    }

    let usdAmount = offerAmount;

    if (offerCurrency !== "USD") {
      const rate = await getCurrencyRate(offerCurrency, "USD");
      usdAmount = Number((offerAmount * rate).toFixed(2));
    }

    const usdtAmount = Number((usdAmount * 1.025).toFixed(4));
    const expiresAtIso = new Date(Date.now() + 12 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        offer_id: offerId,
        status: "awaiting_payment",
        usd_amount: usdAmount,
        usdt_amount: usdtAmount,
        expires_at: expiresAtIso,
        passenger_name: `${passenger.firstName} ${passenger.lastName}`,
        passenger_email: passenger.email,
        passenger_dob: passenger.dateOfBirth,
        passenger_title: passenger.title,
        passenger_gender: passenger.gender,
        passenger_phone: passenger.phone,
        passenger_nationality: passenger.nationality,
        passport_number: passenger.passportNumber,
        passport_expiry: passenger.passportExpiry,
        passport_issuing_country: passenger.passportIssuingCountry,
      })
      .select("id, usd_amount, usdt_amount, expires_at")
      .single();

    if (error) {
      console.error("Supabase booking insert failed:", error);
      return res.status(500).json({ error: "Failed to create booking" });
    }

    return res.status(201).json({
      booking_id: data.id,
      usd_amount: data.usd_amount,
      usdt_amount: data.usdt_amount,
      expires_at: data.expires_at,
    });
  } catch (error) {
    console.error("Booking creation failed:", error);
    return res.status(500).json({ error: "Failed to create booking" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = req.params;

    const { data, error } = await supabase.from("bookings").select("*").eq("id", id).single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Booking not found" });
      }

      console.error("Supabase booking fetch failed:", error);
      return res.status(500).json({ error: "Failed to fetch booking" });
    }

    return res.json(data);
  } catch (error) {
    console.error("Booking fetch failed:", error);
    return res.status(500).json({ error: "Failed to fetch booking" });
  }
});

export { getSupabaseClient };
export default router;
