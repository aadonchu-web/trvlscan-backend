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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const node_cron_1 = __importDefault(require("node-cron"));
const bookings_1 = __importStar(require("./routes/bookings"));
const flights_1 = __importDefault(require("./routes/flights"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use("/api/webhooks", webhooks_1.default);
app.use(express_1.default.json());
app.use("/api/flights", flights_1.default);
app.use("/api/bookings", bookings_1.default);
app.use("/api/payments", payments_1.default);
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
const port = Number(process.env.PORT) || 3000;
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
