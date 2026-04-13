import { Router } from "express";
import { getSupabaseClient } from "./bookings";

const router = Router();

type CreatePaymentBody = {
  booking_id?: string;
};

type BookingRecord = {
  id: string;
  status: string;
  usdt_amount: number;
  expires_at: string;
};

type NowPaymentsCreateResponse = {
  payment_id?: string | number;
  pay_address?: string;
  pay_amount?: string | number;
  pay_currency?: string;
};

const getNowPaymentsApiKey = () => {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;

  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is required");
  }

  return apiKey;
};

const getFrontendUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error("FRONTEND_URL is required");
  }

  return frontendUrl.replace(/\/+$/, "");
};

router.post("/create", async (req, res) => {
  try {
    const { booking_id } = (req.body ?? {}) as CreatePaymentBody;

    if (!booking_id) {
      return res.status(400).json({ error: "booking_id is required" });
    }

    const supabase = getSupabaseClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, usdt_amount, expires_at")
      .eq("id", booking_id)
      .single<BookingRecord>();

    if (bookingError) {
      if (bookingError.code === "PGRST116") {
        return res.status(404).json({ error: "Booking not found" });
      }

      console.error("Supabase booking fetch failed:", bookingError);
      return res.status(500).json({ error: "Failed to fetch booking" });
    }

    if (booking.status !== "awaiting_payment") {
      return res.status(400).json({ error: "Booking is not awaiting payment" });
    }

    const now = Date.now();
    const expiresAt = new Date(booking.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return res.status(400).json({ error: "Booking has expired" });
    }

    const nowPaymentsApiKey = getNowPaymentsApiKey();
    const frontendUrl = getFrontendUrl();
    const callbackUrl = `${frontendUrl}/api/webhooks/nowpayments`;

    const nowPaymentsResponse = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": nowPaymentsApiKey,
      },
      body: JSON.stringify({
        price_amount: booking.usdt_amount,
        price_currency: "usdttrc20",
        pay_currency: "usdttrc20",
        order_id: booking.id,
        order_description: `Flight booking ${booking.id}`,
        ipn_callback_url: callbackUrl,
      }),
    });

    if (!nowPaymentsResponse.ok) {
      const errorText = await nowPaymentsResponse.text();
      console.error("NOWPayments payment creation failed:", errorText);
      return res.status(502).json({ error: "Failed to create payment with NOWPayments" });
    }

    const nowPayment = (await nowPaymentsResponse.json()) as NowPaymentsCreateResponse;
    const paymentId = nowPayment.payment_id ? String(nowPayment.payment_id) : null;

    if (!paymentId || !nowPayment.pay_address || nowPayment.pay_amount === undefined) {
      console.error("Unexpected NOWPayments create response:", nowPayment);
      return res.status(502).json({ error: "Invalid payment response from NOWPayments" });
    }

    const { error: paymentInsertError } = await supabase.from("payments").insert({
      booking_id: booking.id,
      nowpayments_id: paymentId,
      usdt_amount: booking.usdt_amount,
      status: "pending",
    });

    if (paymentInsertError) {
      console.error("Supabase payment insert failed:", paymentInsertError);
      return res.status(500).json({ error: "Failed to save payment record" });
    }

    return res.status(201).json({
      payment_id: paymentId,
      pay_address: nowPayment.pay_address,
      pay_amount: Number(nowPayment.pay_amount),
      pay_currency: nowPayment.pay_currency ?? "usdttrc20",
      expires_at: booking.expires_at,
    });
  } catch (error) {
    console.error("Payment creation failed:", error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

router.get("/status/:booking_id", async (req, res) => {
  try {
    const { booking_id } = req.params;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("payments")
      .select("booking_id, nowpayments_id, status")
      .eq("booking_id", booking_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase payment fetch failed:", error);
      return res.status(500).json({ error: "Failed to fetch payment status" });
    }

    if (!data) {
      return res.status(404).json({ error: "Payment not found for booking" });
    }

    return res.json({
      booking_id: data.booking_id,
      payment_id: data.nowpayments_id,
      status: data.status,
    });
  } catch (error) {
    console.error("Payment status fetch failed:", error);
    return res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

export default router;
