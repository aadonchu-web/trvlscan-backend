import crypto from "crypto";
import express, { Router } from "express";
import { getSupabaseClient } from "./bookings";

const router = Router();

type NowPaymentsWebhookPayload = {
  payment_id?: string | number;
  payment_status?: string;
  order_id?: string;
};

const getIpnSecret = () => {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;

  if (!ipnSecret) {
    throw new Error("NOWPAYMENTS_IPN_SECRET is required");
  }

  return ipnSecret;
};

const sortKeysRecursively = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }

  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysRecursively((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
};

const safeCompareHexSignatures = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

router.post("/nowpayments", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signatureHeader = req.header("x-nowpayments-sig");

    if (!signatureHeader) {
      return res.status(400).json({ error: "Missing x-nowpayments-sig header" });
    }

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "Invalid raw request body" });
    }

    const rawBody = req.body.toString("utf-8");
    const parsedBody = JSON.parse(rawBody) as NowPaymentsWebhookPayload;
    const sortedBody = JSON.stringify(sortKeysRecursively(parsedBody));
    const ipnSecret = getIpnSecret();

    const calculatedSignature = crypto
      .createHmac("sha512", ipnSecret)
      .update(sortedBody)
      .digest("hex");

    if (!safeCompareHexSignatures(signatureHeader, calculatedSignature)) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (parsedBody.payment_status !== "finished") {
      return res.status(200).json({ ok: true });
    }

    const orderId = parsedBody.order_id;

    if (!orderId) {
      return res.status(400).json({ error: "Missing order_id" });
    }

    const supabase = getSupabaseClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("id", orderId)
      .single<{ id: string; status: string }>();

    if (bookingError) {
      if (bookingError.code === "PGRST116") {
        return res.status(404).json({ error: "Booking not found" });
      }

      console.error("Supabase booking fetch failed:", bookingError);
      return res.status(500).json({ error: "Failed to fetch booking" });
    }

    if (booking.status === "confirmed") {
      return res.status(200).json({ ok: true });
    }

    const paymentId = parsedBody.payment_id ? String(parsedBody.payment_id) : null;
    const paymentStatus = parsedBody.payment_status;

    const paymentUpdate = paymentId
      ? supabase
          .from("payments")
          .update({ status: paymentStatus })
          .eq("booking_id", booking.id)
          .eq("nowpayments_id", paymentId)
      : supabase.from("payments").update({ status: paymentStatus }).eq("booking_id", booking.id);

    const { error: paymentUpdateError } = await paymentUpdate;

    if (paymentUpdateError) {
      console.error("Supabase payment update failed:", paymentUpdateError);
      return res.status(500).json({ error: "Failed to update payment status" });
    }

    const { error: bookingUpdateError } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", booking.id);

    if (bookingUpdateError) {
      console.error("Supabase booking update failed:", bookingUpdateError);
      return res.status(500).json({ error: "Failed to update booking status" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    console.error("NOWPayments webhook handling failed:", error);
    return res.status(500).json({ error: "Failed to handle webhook" });
  }
});

export default router;
