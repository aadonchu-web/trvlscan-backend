"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const node_cron_1 = __importDefault(require("node-cron"));
const bookings_1 = __importStar(require("./routes/bookings"));
const currency_1 = __importDefault(require("./routes/currency"));
const flights_1 = __importDefault(require("./routes/flights"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const duffelBooking_1 = require("./services/duffelBooking");
const email_1 = require("./services/email");
if (process.env.NODE_ENV !== "production") {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("dotenv").config();
    }
    catch (_e) { }
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use("/api/webhooks", webhooks_1.default);
app.use(express_1.default.json());
app.use("/api/flights", flights_1.default);
app.use("/api/bookings", bookings_1.default);
app.use("/api/payments", payments_1.default);
app.use("/api/currency", currency_1.default);
const appRouter = app._router ?? app.router;
if (appRouter?.stack) {
    appRouter.stack.forEach((middleware) => {
        if (middleware.route) {
            console.log("Route:", middleware.route.path);
        }
        else if (middleware.name === "router") {
            middleware.handle.stack.forEach((handler) => {
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
app.post("/api/test/confirm-payment", express_1.default.json(), async (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Not available in production" });
    }
    try {
        const { booking_id } = req.body;
        if (!booking_id)
            return res.status(400).json({ error: "booking_id required" });
        const response = await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/bookings/${booking_id}`);
        const booking = (await response.json());
        if (!booking.id)
            return res.status(404).json({ error: "Booking not found" });
        if (booking.status === "confirmed")
            return res.json({ ok: true, message: "Already confirmed" });
        const supabase = (0, bookings_1.getSupabaseClient)();
        await supabase.from("payments").update({ status: "finished" }).eq("booking_id", booking_id);
        await supabase.from("bookings").update({ status: "confirmed" }).eq("id", booking_id);
        const { data: fullBooking } = await supabase
            .from("bookings")
            .select("id, offer_id, passenger_name, passenger_email, passenger_dob, usdt_amount")
            .eq("id", booking_id)
            .single();
        if (fullBooking?.offer_id && fullBooking?.passenger_name) {
            const nameParts = fullBooking.passenger_name.trim().split(" ");
            const givenName = nameParts[0] ?? "Test";
            const familyName = nameParts.slice(1).join(" ") || givenName;
            const order = await (0, duffelBooking_1.createDuffelOrder)(fullBooking.offer_id, {
                given_name: givenName,
                family_name: familyName,
                born_on: fullBooking.passenger_dob,
                email: fullBooking.passenger_email,
                gender: "m",
                title: "mr",
            });
            const bookingReference = order.booking_reference ?? `TEST${booking_id.slice(0, 6).toUpperCase()}`;
            await (0, email_1.sendBookingConfirmationEmail)({
                to: fullBooking.passenger_email,
                passengerName: fullBooking.passenger_name,
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
    }
    catch (error) {
        console.error("Test confirm failed:", error);
        return res.status(500).json({ error: String(error) });
    }
});
const port = parseInt(process.env.PORT || "3000", 10);
node_cron_1.default.schedule("* * * * *", async () => {
    try {
        const supabase = (0, bookings_1.getSupabaseClient)();
        const nowIso = new Date().toISOString();
        const { error } = await supabase
            .from("bookings")
            .update({ status: "expired" })
            .eq("status", "awaiting_payment")
            .lt("expires_at", nowIso);
        if (error) {
            console.error("Booking expiry cron update failed:", error);
        }
    }
    catch (error) {
        console.error("Booking expiry cron run failed:", error);
    }
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
