import cors from "cors";
import express from "express";
import cron from "node-cron";
import bookingsRouter, { getSupabaseClient } from "./routes/bookings";
import currencyRouter from "./routes/currency";
import flightsRouter from "./routes/flights";
import paymentsRouter from "./routes/payments";
import webhooksRouter from "./routes/webhooks";
import { createDuffelOrder } from "./services/duffelBooking";
import { sendBookingConfirmationEmail } from "./services/email";

if (process.env.NODE_ENV !== "production") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config();
  } catch (_e) {}
}

const app = express();

app.use(cors());
app.use("/api/webhooks", webhooksRouter);
app.use(express.json());
app.use("/api/flights", flightsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/currency", currencyRouter);

const appRouter = (app as any)._router ?? (app as any).router;

if (appRouter?.stack) {
  appRouter.stack.forEach((middleware: any) => {
    if (middleware.route) {
      console.log("Route:", middleware.route.path);
    } else if (middleware.name === "router") {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          console.log("Router route:", handler.route.path, handler.route.methods);
        }
      });
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
  });
});

app.post("/api/test/confirm-payment", express.json(), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production" });
  }

  try {
    const { booking_id } = req.body as { booking_id?: string };
    if (!booking_id) return res.status(400).json({ error: "booking_id required" });

    const response = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/bookings/${booking_id}`);
    const booking = (await response.json()) as { id?: string; status?: string };

    if (!booking.id) return res.status(404).json({ error: "Booking not found" });
    if (booking.status === "confirmed") return res.json({ ok: true, message: "Already confirmed" });

    const supabase = getSupabaseClient();

    await supabase.from("payments").update({ status: "finished" }).eq("booking_id", booking_id);
    await supabase.from("bookings").update({ status: "confirmed" }).eq("id", booking_id);

    const { data: fullBooking } = await supabase
      .from("bookings")
      .select("id, offer_id, passenger_name, passenger_email, passenger_dob, usdt_amount")
      .eq("id", booking_id)
      .single();

    if (fullBooking?.offer_id && fullBooking?.passenger_name) {
      const nameParts = (fullBooking.passenger_name as string).trim().split(" ");
      const givenName = nameParts[0] ?? "Test";
      const familyName = nameParts.slice(1).join(" ") || givenName;

      const order = await createDuffelOrder(fullBooking.offer_id as string, {
        given_name: givenName,
        family_name: familyName,
        born_on: fullBooking.passenger_dob as string,
        email: fullBooking.passenger_email as string,
        gender: "m",
        title: "mr",
      });

      const bookingReference = order.booking_reference ?? `TEST${booking_id.slice(0, 6).toUpperCase()}`;

      await sendBookingConfirmationEmail({
        to: fullBooking.passenger_email as string,
        passengerName: fullBooking.passenger_name as string,
        bookingId: booking_id,
        bookingReference,
        origin: "LAX",
        destination: "LHR",
        departureTime: new Date().toLocaleString(),
        airline: "Test Airline",
        usdtAmount: Number(fullBooking.usdt_amount ?? 0),
      });

      return res.json({ ok: true, order_id: order.id, booking_reference: bookingReference });
    }

    return res.json({ ok: true, message: "Confirmed but no offer_id to create order" });
  } catch (error) {
    console.error("Test confirm failed:", error);
    return res.status(500).json({ error: String(error) });
  }
});

const port = parseInt(process.env.PORT || "3000", 10);

cron.schedule("* * * * *", async () => {
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("bookings")
      .update({ status: "expired" })
      .eq("status", "awaiting_payment")
      .lt("expires_at", nowIso);

    if (error) {
      console.error("Booking expiry cron update failed:", error);
    }
  } catch (error) {
    console.error("Booking expiry cron run failed:", error);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
