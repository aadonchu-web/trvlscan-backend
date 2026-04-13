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

type CreateBookingBody = {
  offer_id?: string;
  passenger_name?: string;
  passenger_email?: string;
  passenger_dob?: string;
};

router.post("/create", async (req, res) => {
  try {
    const { offer_id, passenger_name, passenger_email, passenger_dob } = (req.body ??
      {}) as CreateBookingBody;

    if (!offer_id || !passenger_name || !passenger_email || !passenger_dob) {
      return res.status(400).json({
        error:
          "Missing required fields: offer_id, passenger_name, passenger_email, passenger_dob",
      });
    }

    const duffel = getDuffelClient();
    const supabase = getSupabaseClient();

    const offerResponse = await duffel.offers.get(offer_id);
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
        offer_id,
        status: "awaiting_payment",
        usd_amount: usdAmount,
        usdt_amount: usdtAmount,
        expires_at: expiresAtIso,
        passenger_name,
        passenger_email,
        passenger_dob,
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
