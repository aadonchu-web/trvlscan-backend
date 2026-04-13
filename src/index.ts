import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import cors from "cors";
import express from "express";
import cron from "node-cron";
import bookingsRouter, { getSupabaseClient } from "./routes/bookings";
import flightsRouter from "./routes/flights";
import paymentsRouter from "./routes/payments";
import webhooksRouter from "./routes/webhooks";

const app = express();

app.use(cors());
app.use("/api/webhooks", webhooksRouter);
app.use(express.json());
app.use("/api/flights", flightsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);

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

const port = process.env.PORT || 3000;

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
