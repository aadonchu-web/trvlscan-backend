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
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const bookings_1 = require("./bookings");
const router = (0, express_1.Router)();
const getIpnSecret = () => {
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!ipnSecret) {
        throw new Error("NOWPAYMENTS_IPN_SECRET is required");
    }
    return ipnSecret;
};
const sortKeysRecursively = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortKeysRecursively);
    }
    if (value !== null && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
            acc[key] = sortKeysRecursively(value[key]);
            return acc;
        }, {});
    }
    return value;
};
const safeCompareHexSignatures = (actual, expected) => {
    const actualBuffer = Buffer.from(actual, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (actualBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(actualBuffer, expectedBuffer);
};
router.post("/nowpayments", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    try {
        const signatureHeader = req.header("x-nowpayments-sig");
        if (!signatureHeader) {
            return res.status(400).json({ error: "Missing x-nowpayments-sig header" });
        }
        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({ error: "Invalid raw request body" });
        }
        const rawBody = req.body.toString("utf-8");
        const parsedBody = JSON.parse(rawBody);
        const sortedBody = JSON.stringify(sortKeysRecursively(parsedBody));
        const ipnSecret = getIpnSecret();
        const calculatedSignature = crypto_1.default
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
        const supabase = (0, bookings_1.getSupabaseClient)();
        const { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .select("id, status")
            .eq("id", orderId)
            .single();
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
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            return res.status(400).json({ error: "Invalid JSON body" });
        }
        console.error("NOWPayments webhook handling failed:", error);
        return res.status(500).json({ error: "Failed to handle webhook" });
    }
});
exports.default = router;
