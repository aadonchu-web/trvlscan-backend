import { Router } from "express";
import { getCurrencyRate } from "../services/currency";

const router = Router();

router.get("/rate", async (req, res) => {
  try {
    const from = String(req.query.from ?? "").trim().toUpperCase();
    const to = String(req.query.to ?? "").trim().toUpperCase();

    if (!from || !to) {
      return res.status(400).json({ error: "Query params from and to are required" });
    }

    const rate = await getCurrencyRate(from, to);

    return res.json({
      from,
      to,
      rate,
    });
  } catch (error) {
    console.error("Currency rate fetch failed:", error);
    return res.status(500).json({ error: "Failed to fetch currency rate" });
  }
});

export default router;
