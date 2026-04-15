"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    if (typeof current === "string" && current.trim()) return current;
    if (typeof current === "number" && Number.isFinite(current)) return String(current);
  }
  return fallback;
}

function readNumber(offer: OfferRecord, paths: string[], fallback = 0) {
  for (const path of paths) {
    const value = readValue(offer, [path], "");
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatDuration(value: string) {
  if (!value) return "-";
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value.trim());
  if (!match) return value;
  const days = parseInt(match[1] ?? "0");
  const hours = parseInt(match[2] ?? "0");
  const minutes = parseInt(match[3] ?? "0");
  const totalHours = days * 24 + hours;
  const parts = [];
  if (totalHours > 0) parts.push(`${totalHours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ") || "0m";
}

export default function FlightSummaryPage() {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferRecord | null>(null);
  const [searchInfo, setSearchInfo] = useState<{
    origin: string;
    destination: string;
    departure_date: string;
    passengers: number;
  } | null>(null);
  const [gbpUsdRate, setGbpUsdRate] = useState<number>(1.27);
  const [checkedBag, setCheckedBag] = useState(false);

  useEffect(() => {
    const rawOffer = sessionStorage.getItem("selectedOffer");
    const rawSearch = sessionStorage.getItem("searchParams");
    if (rawOffer) {
      try {
        setOffer(JSON.parse(rawOffer));
      } catch {
        // no-op
      }
    }
    if (rawSearch) {
      try {
        setSearchInfo(JSON.parse(rawSearch));
      } catch {
        // no-op
      }
    }
    const cached = Number(sessionStorage.getItem("currencyRate_GBP_USD"));
    if (cached > 0) setGbpUsdRate(cached);
  }, []);

  if (!offer)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F0F4F9]">
        <p className="text-sm text-slate-400">Loading...</p>
      </main>
    );

  const airline = readValue(offer, ["airline.name", "airline_name", "airline", "carrier"]);
  const airlineIata = readValue(offer, [
    "owner.iata_code",
    "slices.0.segments.0.marketing_carrier.iata_code",
    "airline_iata",
  ]);
  const departure = readValue(offer, ["departure_time", "departure"]);
  const arrival = readValue(offer, ["arrival_time", "arrival"]);
  const duration = readValue(offer, ["duration"]);
  const stops = readValue(offer, ["number_of_stops", "stops"], "0");
  const totalAmount = readNumber(offer, ["total_amount", "price"]);
  const totalCurrency = readValue(offer, ["total_currency", "currency"], "GBP");
  const usdBase = totalCurrency.toUpperCase() === "GBP" ? totalAmount * gbpUsdRate : totalAmount;
  const usdtBase = usdBase * 1.025;
  const checkedBagPrice = usdBase * 0.15;
  const totalUsdt = checkedBag ? usdtBase + checkedBagPrice : usdtBase;
  const numStops = Number(stops);
  const stopLabel = numStops === 0 ? "Nonstop" : `${stops} stop${numStops > 1 ? "s" : ""}`;

  const handleContinue = () => {
    sessionStorage.setItem(
      "baggageSelection",
      JSON.stringify({ checkedBag, checkedBagPrice: checkedBag ? checkedBagPrice : 0 }),
    );
    router.push("/passenger");
  };

  return (
    <main className="min-h-screen bg-[#F0F4F9] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="mb-4 flex items-center justify-between px-1">
          {["Search", "Flight", "Passenger", "Payment"].map((step, i) => (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    i === 1
                      ? "bg-[#2563EB] text-white"
                      : i < 1
                        ? "bg-[#2563EB] text-white"
                        : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {i < 1 ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] ${i === 1 ? "font-semibold text-[#2563EB]" : "text-slate-400"}`}>
                  {step}
                </span>
              </div>
              {i < 3 && <div className={`mx-1 mb-4 h-px w-12 sm:w-20 ${i < 1 ? "bg-[#2563EB]" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E2EAF4] bg-white">
          <div className="bg-[#0B1F3A] px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Departing Flight</p>
            <p className="mt-0.5 text-lg font-bold text-white">
              {searchInfo?.origin} → {searchInfo?.destination}
            </p>
            <p className="mt-0.5 text-sm text-slate-300">
              Departure: {formatDate(departure)} | {formatTime(departure)}
            </p>
          </div>

          <div className="px-5 py-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E2EAF4] bg-white">
                {airlineIata && airlineIata !== "-" ? (
                  <img
                    src={`https://www.gstatic.com/flights/airline_logos/70px/${airlineIata}.png`}
                    width={28}
                    height={28}
                    style={{ objectFit: "contain" }}
                    alt={airline}
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs font-bold text-slate-400">{airline.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">{airline}</p>
                <p className="text-xs text-slate-400">
                  {formatDuration(duration)} · {stopLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#0B1F3A]">{formatTime(departure)}</p>
                <p className="mt-0.5 text-xs text-slate-400">{searchInfo?.origin}</p>
              </div>
              <div className="flex flex-1 flex-col items-center gap-1">
                <p className="text-xs text-slate-400">{formatDuration(duration)}</p>
                <div className="relative h-px w-full bg-slate-200">
                  <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300" />
                  <div className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300" />
                </div>
                <p className={`text-xs ${numStops === 0 ? "text-emerald-600" : "text-slate-400"}`}>{stopLabel}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#0B1F3A]">{formatTime(arrival)}</p>
                <p className="mt-0.5 text-xs text-slate-400">{searchInfo?.destination}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E2EAF4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#F0F4F9] px-5 py-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0B1F3A">
              <path d="M20 6h-2.18c.07-.44.18-.88.18-1.5 0-2.21-1.79-4-4-4h-4C7.79.5 6 2.29 6 4.5c0 .62.11 1.06.18 1.5H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8-3.5h4c.83 0 1.5.67 1.5 1.5S16.83 5.5 16 5.5h-4C11.17 5.5 10.5 4.83 10.5 4s.67-1.5 1.5-1.5z" />
            </svg>
            <p className="text-sm font-semibold text-[#0B1F3A]">Add Baggage</p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Carry-on Baggage</p>
              <div className="flex items-center justify-between rounded-xl border border-[#E2EAF4] px-4 py-3">
                <p className="text-sm text-[#0B1F3A]">1 × Cabin bag</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-emerald-600">Included</p>
                  <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#2563EB]">
                    <div className="h-2 w-2 rounded-full bg-[#2563EB]" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Checked Baggage</p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setCheckedBag(false)}
                  className={`w-full rounded-xl border px-4 py-3 transition ${
                    !checkedBag ? "border-[#2563EB] bg-[#EEF4FF]" : "border-[#E2EAF4]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[#0B1F3A]">No checked baggage</p>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        !checkedBag ? "border-[#2563EB]" : "border-slate-300"
                      }`}
                    >
                      {!checkedBag && <div className="h-2 w-2 rounded-full bg-[#2563EB]" />}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedBag(true)}
                  className={`w-full rounded-xl border px-4 py-3 transition ${
                    checkedBag ? "border-[#2563EB] bg-[#EEF4FF]" : "border-[#E2EAF4]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-sm text-[#0B1F3A]">1 × Checked bag (23kg)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#0B1F3A]">+${checkedBagPrice.toFixed(2)}</p>
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                          checkedBag ? "border-[#2563EB]" : "border-slate-300"
                        }`}
                      >
                        {checkedBag && <div className="h-2 w-2 rounded-full bg-[#2563EB]" />}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2EAF4] bg-white px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">Total Charge</p>
            <p className="text-xl font-bold text-[#2563EB]">{totalUsdt.toFixed(2)} USDT</p>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="h-12 w-full rounded-2xl bg-[#2563EB] text-sm font-semibold text-white"
          >
            Continue to Passenger Details →
          </button>
        </div>
      </div>
    </main>
  );
}
