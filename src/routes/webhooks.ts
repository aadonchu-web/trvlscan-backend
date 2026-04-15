import crypto from "crypto";
import express, { Router } from "express";
import { getSupabaseClient } from "./bookings";
import { createDuffelOrder } from "../services/duffelBooking";
import { sendBookingConfirmationEmail } from "../services/email";

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

    const { data: fullBooking } = await supabase
      .from("bookings")
      .select("id, offer_id, passenger_name, passenger_email, passenger_dob, usdt_amount")
      .eq("id", booking.id)
      .single();

    if (fullBooking?.offer_id && fullBooking?.passenger_name) {
      try {
        const nameParts = (fullBooking.passenger_name as string).trim().split(" ");
        const givenName = nameParts[0] ?? "Passenger";
        const familyName = nameParts.slice(1).join(" ") || givenName;

        const order = await createDuffelOrder(fullBooking.offer_id as string, {
          given_name: givenName,
          family_name: familyName,
          born_on: fullBooking.passenger_dob as string,
          email: fullBooking.passenger_email as string,
          gender: "m",
          title: "mr",
        });

        const bookingReference =
          order.booking_reference ?? order.id ?? `TRVL${booking.id.slice(0, 6).toUpperCase()}`;
        const airline = (order as any).owner?.name ?? "Airline";
        const slices = (order as any).slices ?? [];
        const firstSegment = slices[0]?.segments?.[0];
        const departureTime = firstSegment?.departing_at ?? "";
        const origin = firstSegment?.origin?.iata_code ?? "";
        const destination = slices[slices.length - 1]?.segments?.slice(-1)[0]?.destination?.iata_code ?? "";

        await supabase.from("bookings").update({ duffel_order_id: order.id, status: "confirmed" }).eq("id", booking.id);

        await sendBookingConfirmationEmail({
          to: fullBooking.passenger_email as string,
          passengerName: fullBooking.passenger_name as string,
          bookingId: booking.id,
          bookingReference,
          origin,
          destination,
          departureTime: departureTime ? new Date(departureTime).toLocaleString() : "-",
          airline,
          usdtAmount: Number(fullBooking.usdt_amount ?? 0),
        });

        console.log("Duffel order created:", order.id, "Reference:", bookingReference);
      } catch (orderError) {
        console.error("Duffel order or email failed (non-fatal):", orderError);
      }
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
