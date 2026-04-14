"use client";

import { useEffect, useState } from "react";

type OfferRecord = Record<string, unknown>;

function readValue(offer: OfferRecord, paths: string[], fallback = "-") {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = offer;

    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }

    if (typeof current === "string" && current.trim()) {
      return current;
    }

    if (typeof current === "number" && Number.isFinite(current)) {
      return String(current);
    }
  }

  return fallback;
}

function readNumber(offer: OfferRecord, paths: string[], fallback = 0) {
  for (const path of paths) {
    const value = readValue(offer, [path], "");
    if (value === "") {
      continue;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value.trim());
  if (!match) {
    return value;
  }

  const hours = match[1] ? `${match[1]}h` : "";
  const minutes = match[2] ? `${match[2]}m` : "";
  return [hours, minutes].filter(Boolean).join(" ") || "0m";
}

export default function ResultsPage() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [searchInfo, setSearchInfo] = useState<{
    origin: string;
    destination: string;
    departure_date: string;
    passengers: number;
  } | null>(null);
  const [gbpUsdRate, setGbpUsdRate] = useState<number | null>(null);
  const [isRateLoading, setIsRateLoading] = useState(true);

  useEffect(() => {
    const rawOffers = sessionStorage.getItem("searchOffers");
    const rawSearchParams = sessionStorage.getItem("searchParams");

    if (rawOffers) {
      try {
        const parsedOffers = JSON.parse(rawOffers);
        setOffers(Array.isArray(parsedOffers) ? (parsedOffers as OfferRecord[]) : []);
      } catch {
        setOffers([]);
      }
    }

    if (rawSearchParams) {
      try {
        const parsedParams = JSON.parse(rawSearchParams) as {
          origin?: string;
          destination?: string;
          departure_date?: string;
          passengers?: number;
        };
        setSearchInfo({
          origin: parsedParams.origin ?? "-",
          destination: parsedParams.destination ?? "-",
          departure_date: parsedParams.departure_date ?? "-",
          passengers: Number(parsedParams.passengers ?? 1),
        });
      } catch {
        setSearchInfo(null);
      }
    }
  }, []);

  useEffect(() => {
    const from = "GBP";
    const to = "USD";
    const cacheKey = `currencyRate_${from}_${to}`;
    const cachedRate = sessionStorage.getItem(cacheKey);
    if (cachedRate) {
      const parsedRate = Number(cachedRate);
      if (Number.isFinite(parsedRate) && parsedRate > 0) {
        setGbpUsdRate(parsedRate);
        setIsRateLoading(false);
        return;
      }
    }

    let isCancelled = false;

    async function fetchRate() {
      setIsRateLoading(true);
      try {
        const response = await fetch(
          "https://trvlscan-backend-production.up.railway.app/api/currency/rate?from=GBP&to=USD",
        );
        if (!response.ok) {
          throw new Error("Failed to fetch GBP/USD rate");
        }

        const payload = (await response.json()) as { rate?: number };
        const usdRate = Number(payload.rate);
        if (Number.isFinite(usdRate) && usdRate > 0 && !isCancelled) {
          setGbpUsdRate(usdRate);
          sessionStorage.setItem(cacheKey, String(usdRate));
        }
      } catch {
        if (!isCancelled) {
          setGbpUsdRate(null);
        }
      } finally {
        if (!isCancelled) {
          setIsRateLoading(false);
        }
      }
    }

    fetchRate();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#061834] via-[#0a2450] to-[#041022] px-6 py-12 text-white md:px-10">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur">
        <h1 className="text-3xl font-semibold">Flight results</h1>
        {searchInfo && (
          <p className="mt-3 text-blue-100/90">
            {searchInfo.origin} to {searchInfo.destination} on {searchInfo.departure_date} for{" "}
            {searchInfo.passengers} passenger(s)
          </p>
        )}

        {offers.length === 0 ? (
          <p className="mt-6 text-blue-100/90">No flights found</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {offers.map((offer, index) => {
              const airline = readValue(offer, [
                "airline.name",
                "airline_name",
                "airline",
                "carrier",
                "itinerary.airline_name",
              ]);
              const departureTime = readValue(offer, [
                "departure_time",
                "departure",
                "outbound.departure_time",
                "itinerary.departure_time",
              ]);
              const arrivalTime = readValue(offer, [
                "arrival_time",
                "arrival",
                "outbound.arrival_time",
                "itinerary.arrival_time",
              ]);
              const duration = readValue(offer, ["duration", "flight_duration", "itinerary.duration"]);
              const stops = readValue(offer, ["number_of_stops", "stops", "itinerary.stops"], "0");
              const totalAmount = readNumber(offer, [
                "total_amount",
                "price",
                "price_total",
                "fare.total_amount",
              ]);
              const totalCurrency = readValue(offer, ["total_currency", "currency"], "GBP");
              const offerId = readValue(offer, ["id"], "");
              const usdEstimate = gbpUsdRate !== null ? (totalAmount * gbpUsdRate).toFixed(2) : null;

              return (
                <article
                  key={offerId || `${airline}-${departureTime}-${arrivalTime}-${index}`}
                  className="rounded-xl border border-white/10 bg-[#0b2a58]/60 p-5"
                >
                  <p className="text-lg font-semibold">{airline}</p>
                  <p className="mt-1 text-sm text-blue-100/90">
                    {formatTime(departureTime)} - {formatTime(arrivalTime)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-blue-100/95">
                    <p>Duration: {formatDuration(duration)}</p>
                    <p>Stops: {stops}</p>
                    <p className="col-span-2 text-sm text-blue-100/75">
                      {totalAmount.toFixed(2)} {totalCurrency}
                    </p>
                    <p className="col-span-2 text-lg font-semibold text-white">
                      {isRateLoading ? "Loading..." : usdEstimate ? `${usdEstimate} USD` : "Rate unavailable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mt-5 h-10 rounded-lg bg-white px-4 text-sm font-semibold text-[#072252] transition hover:bg-blue-100"
                  >
                    Select
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
