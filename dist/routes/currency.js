"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const currency_1 = require("../services/currency");
const router = (0, express_1.Router)();
router.get("/rate", async (req, res) => {
    try {
        const from = String(req.query.from ?? "").trim().toUpperCase();
        const to = String(req.query.to ?? "").trim().toUpperCase();
        if (!from || !to) {
            return res.status(400).json({ error: "Query params from and to are required" });
        }
        const rate = await (0, currency_1.getCurrencyRate)(from, to);
        return res.json({
            from,
            to,
            rate,
        });
    }
    catch (error) {
        console.error("Currency rate fetch failed:", error);
        return res.status(500).json({ error: "Failed to fetch currency rate" });
    }
});
exports.default = router;
