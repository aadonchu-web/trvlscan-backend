"use client";

import { useEffect, useMemo, useState } from "react";
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

function getAirlineInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "-") {
    return "FL";
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatDateTabLabel(date: Date) {
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildDateWindow(baseDateString: string) {
  const parsedDate = new Date(baseDateString);
  const baseDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const result: { key: string; label: string; isoDate: string }[] = [];

  for (let offset = -3; offset <= 3; offset += 1) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + offset);
    const isoDate = date.toISOString().slice(0, 10);
    result.push({
      key: `${isoDate}-${offset}`,
      label: formatDateTabLabel(date),
      isoDate,
    });
  }

  return result;
}

function getPriceInUsdt(totalAmount: number, gbpUsdRate: number | null) {
  if (gbpUsdRate === null) {
    return totalAmount;
  }
  return totalAmount * gbpUsdRate * 1.025;
}

function getDurationMinutes(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value.trim());
  if (!match) {
    return 0;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

const DATE_PRICE_MULTIPLIERS: Record<number, number> = {
  [-3]: 1.12,
  [-2]: 1.07,
  [-1]: 1.03,
  0: 1,
  1: 1.04,
  2: 1.08,
  3: 1.15,
};

export default function ResultsPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [searchInfo, setSearchInfo] = useState<{
    origin: string;
    destination: string;
    departure_date: string;
    passengers: number;
  } | null>(null);
  const [gbpUsdRate, setGbpUsdRate] = useState<number | null>(null);
  const [isRateLoading, setIsRateLoading] = useState(true);
  const [selectingOfferId, setSelectingOfferId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedStops, setSelectedStops] = useState<number[]>([]);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [maxPriceFilter, setMaxPriceFilter] = useState(0);
  const [departureHourLimit, setDepartureHourLimit] = useState(24);
  const [maxDurationHours, setMaxDurationHours] = useState(1);
  const [sortBy, setSortBy] = useState<"best" | "shortest" | "departure" | "arrival">("best");
  const [showMobilePanel, setShowMobilePanel] = useState<"sort" | "filter" | null>(null);
  const [expandedOffer, setExpandedOffer] = useState<string | null>(null);
  const [filterMaxArr, setFilterMaxArr] = useState(24);

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
        setSelectedDate(parsedParams.departure_date ?? "");
      } catch {
        setSearchInfo(null);
      }
    }
  }, []);

  const dateOptions = useMemo(
    () => buildDateWindow(selectedDate || searchInfo?.departure_date || ""),
    [searchInfo?.departure_date, selectedDate],
  );
  const activeDate = selectedDate || dateOptions[3]?.isoDate || "";

  const normalizedOffers = useMemo(() => {
    return offers.map((offer, index) => {
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
      const stopsRaw = readValue(offer, ["number_of_stops", "stops", "itinerary.stops"], "0");
      const totalAmount = readNumber(offer, [
        "total_amount",
        "price",
        "price_total",
        "fare.total_amount",
      ]);
      const totalCurrency = readValue(offer, ["total_currency", "currency"], "GBP");
      const offerId = readValue(offer, ["id"], "");
      const airlineIata = readValue(offer, [
        "owner.iata_code",
        "slices.0.segments.0.marketing_carrier.iata_code",
        "slices.0.segments.0.operating_carrier.iata_code",
        "airline_iata",
        "iata_code",
      ]);
      const departureDate = new Date(departureTime);
      const departureDateIso = Number.isNaN(departureDate.getTime())
        ? activeDate
        : departureDate.toISOString().slice(0, 10);
      const departureHour = Number.isNaN(departureDate.getTime()) ? 0 : departureDate.getHours();
      const arrivalDate = new Date(arrivalTime);
      const arrivalMinutes = Number.isNaN(arrivalDate.getTime())
        ? Number.MAX_SAFE_INTEGER
        : arrivalDate.getHours() * 60 + arrivalDate.getMinutes();
      const durationMinutes = getDurationMinutes(duration);
      const durationHours = Math.max(1, Math.ceil(durationMinutes / 60));
      const numericStops = Number(stopsRaw);
      const stops = Number.isFinite(numericStops) ? Math.max(0, numericStops) : 0;
      const stopLabel = stops <= 0 ? "Nonstop" : `${stops} ${stops === 1 ? "stop" : "stops"}`;
      const usdtPrice = getPriceInUsdt(totalAmount, gbpUsdRate);
      const baggageValue = readValue(
        offer,
        ["conditions.change_before_departure", "baggage"],
        "",
      ).toLowerCase();
      const hasCheckedBag =
        baggageValue.includes("checked") ||
        baggageValue.includes("include") ||
        baggageValue.includes("1pc");

      return {
        offer,
        key: offerId || `${airline}-${departureTime}-${arrivalTime}-${index}`,
        offerId,
        airline,
        departureTime,
        arrivalTime,
        duration,
        durationMinutes,
        durationHours,
        stops,
        stopLabel,
        totalAmount,
        totalCurrency,
        usdtPrice,
        airlineIata: airlineIata === "-" ? "-" : airlineIata.toUpperCase().slice(0, 2),
        departureHour,
        arrivalMinutes,
        departureDateIso,
        hasCheckedBag,
      };
    });
  }, [activeDate, gbpUsdRate, offers]);

  const uniqueStopOptions = useMemo(() => {
    const values = Array.from(new Set(normalizedOffers.map((item) => item.stops)));
    return values.sort((a, b) => a - b);
  }, [normalizedOffers]);

  const uniqueAirlineOptions = useMemo(() => {
    const values = Array.from(new Set(normalizedOffers.map((item) => item.airline)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [normalizedOffers]);

  const minPrice = useMemo(() => {
    if (normalizedOffers.length === 0) {
      return 0;
    }
    return Math.floor(Math.min(...normalizedOffers.map((item) => item.usdtPrice)));
  }, [normalizedOffers]);

  const maxPrice = useMemo(() => {
    if (normalizedOffers.length === 0) {
      return 0;
    }
    return Math.ceil(Math.max(...normalizedOffers.map((item) => item.usdtPrice)));
  }, [normalizedOffers]);

  const maxDurationAvailable = useMemo(() => {
    if (normalizedOffers.length === 0) {
      return 1;
    }
    return Math.max(1, ...normalizedOffers.map((item) => item.durationHours));
  }, [normalizedOffers]);

  useEffect(() => {
    setSelectedStops(uniqueStopOptions);
  }, [uniqueStopOptions]);

  useEffect(() => {
    setSelectedAirlines(uniqueAirlineOptions);
  }, [uniqueAirlineOptions]);

  useEffect(() => {
    setMaxPriceFilter(maxPrice);
  }, [maxPrice]);

  useEffect(() => {
    setMaxDurationHours(maxDurationAvailable);
  }, [maxDurationAvailable]);

  const stopMinPriceMap = useMemo(() => {
    const map = new Map<number, number>();
    uniqueStopOptions.forEach((stopCount) => {
      const stopPrices = normalizedOffers
        .filter((item) => item.stops === stopCount)
        .map((item) => item.usdtPrice);
      if (stopPrices.length > 0) {
        map.set(stopCount, Math.min(...stopPrices));
      }
    });
    return map;
  }, [normalizedOffers, uniqueStopOptions]);

  const airlineMinPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    uniqueAirlineOptions.forEach((airline) => {
      const prices = normalizedOffers.filter((item) => item.airline === airline).map((item) => item.usdtPrice);
      if (prices.length > 0) {
        map.set(airline, Math.min(...prices));
      }
    });
    return map;
  }, [normalizedOffers, uniqueAirlineOptions]);

  const dateMinPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    dateOptions.forEach((option) => {
      const prices = normalizedOffers
        .filter((item) => item.departureDateIso === option.isoDate)
        .map((item) => item.usdtPrice);
      if (prices.length > 0) {
        map.set(option.isoDate, Math.min(...prices));
      }
    });
    return map;
  }, [dateOptions, normalizedOffers]);

  const cheapestDatePrice = useMemo(() => {
    const allPrices = Array.from(dateMinPriceMap.values());
    if (allPrices.length === 0) {
      return null;
    }
    return Math.min(...allPrices);
  }, [dateMinPriceMap]);

  const currentMinUsdtPrice = useMemo(() => {
    if (normalizedOffers.length === 0) {
      return null;
    }
    return Math.min(...normalizedOffers.map((item) => item.usdtPrice));
  }, [normalizedOffers]);

  const filteredOffers = useMemo(() => {
    return normalizedOffers.filter((item) => {
      if (activeDate && item.departureDateIso !== activeDate) {
        return false;
      }
      if (!selectedStops.includes(item.stops)) {
        return false;
      }
      if (!selectedAirlines.includes(item.airline)) {
        return false;
      }
      if (item.usdtPrice > maxPriceFilter) {
        return false;
      }
      if (item.departureHour > departureHourLimit) {
        return false;
      }
      const arrHour = (() => {
        const arr = readValue(item.offer, ["arrival_time", "arrival", "outbound.arrival_time"]);
        const parsedDate = new Date(arr);
        return Number.isNaN(parsedDate.getTime())
          ? 0
          : parsedDate.getHours() + parsedDate.getMinutes() / 60;
      })();
      if (arrHour > filterMaxArr) {
        return false;
      }
      if (item.durationHours > maxDurationHours) {
        return false;
      }
      return true;
    });
  }, [
    activeDate,
    departureHourLimit,
    maxDurationHours,
    maxPriceFilter,
    normalizedOffers,
    filterMaxArr,
    selectedAirlines,
    selectedStops,
  ]);

  const sortedOffers = useMemo(() => {
    const items = [...filteredOffers];
    items.sort((a, b) => {
      if (sortBy === "shortest") {
        return a.durationMinutes - b.durationMinutes;
      }
      if (sortBy === "departure") {
        return a.departureHour - b.departureHour;
      }
      if (sortBy === "arrival") {
        return a.arrivalMinutes - b.arrivalMinutes;
      }
      return a.usdtPrice - b.usdtPrice;
    });
    return items;
  }, [filteredOffers, sortBy]);

  const cheapestVisiblePrice = useMemo(() => {
    if (sortedOffers.length === 0) {
      return null;
    }
    return Math.min(...sortedOffers.map((item) => item.usdtPrice));
  }, [sortedOffers]);

  const toggleStop = (value: number) => {
    setSelectedStops((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const toggleAirline = (value: string) => {
    setSelectedAirlines((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const sortOptions: { key: "best" | "shortest" | "departure" | "arrival"; label: string }[] = [
    { key: "best", label: "Best Price" },
    { key: "shortest", label: "Shortest" },
    { key: "departure", label: "Departure" },
    { key: "arrival", label: "Arrival" },
  ];

  const handleSelect = (offer: OfferRecord) => {
    const offerId = readValue(offer, ["id"], "");
    if (!offerId) {
      return;
    }

    setSelectingOfferId(offerId);
    sessionStorage.setItem("selectedOffer", JSON.stringify(offer));
    router.push("/flight-summary");
  };

  const minPriceForStop = (stop: number) => stopMinPriceMap.get(stop);
  const minPriceForAirline = (airline: string) => airlineMinPriceMap.get(airline);

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
    <main className="min-h-screen bg-[#F0F4F9] px-4 py-8 text-[#0B1F3A] md:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <div className="w-full rounded-2xl border border-[#E2EAF4] bg-white px-4 py-3 text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className="font-semibold text-[#0B1F3A]">
              {searchInfo?.origin ?? "-"} <span className="mx-1 text-slate-400">→</span>{" "}
              {searchInfo?.destination ?? "-"}
            </span>
            <span className="text-slate-300">|</span>
            <span>{searchInfo?.departure_date ?? "-"}</span>
            <span className="text-slate-300">|</span>
            <span>{searchInfo?.passengers ?? 1} passenger(s)</span>
            <span className="rounded-full bg-[#DBEAFE] px-2.5 py-1 text-xs font-semibold text-[#2563EB]">
              One Way
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-1">
            {dateOptions.map((dateOption) => {
              const offsetFromCenter = dateOptions.findIndex((option) => option.key === dateOption.key) - 3;
              const date = new Date(dateOption.isoDate);
              const isSelected = dateOption.isoDate === activeDate;
              const minDatePrice = dateMinPriceMap.get(dateOption.isoDate);
              const isCheapestDate =
                cheapestDatePrice !== null &&
                minDatePrice !== undefined &&
                Math.abs(minDatePrice - cheapestDatePrice) < 0.01;
              const isCenterDate = offsetFromCenter === 0;
              const priceMultiplier = DATE_PRICE_MULTIPLIERS[offsetFromCenter] ?? 1;
              const tabPrice =
                currentMinUsdtPrice === null ? undefined : Math.max(0, currentMinUsdtPrice * priceMultiplier);
              const hasRenderablePrice = !isRateLoading && tabPrice !== undefined;

              return (
                <button
                  key={dateOption.key}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateOption.isoDate);
                  }}
                  className={`min-w-[112px] rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? "border-[#2563EB] bg-[#DBEAFE]"
                      : "border-[#E2EAF4] bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs text-slate-400">
                    {date.toLocaleDateString([], { weekday: "short" })}
                  </p>
                  <p className="text-[13px] font-semibold text-[#0B1F3A]">
                    {date.toLocaleDateString([], { month: "short", day: "numeric" })}
                  </p>
                  <p
                    className={`mt-1 text-xs font-medium ${
                      !hasRenderablePrice
                        ? "text-slate-500"
                        : isCenterDate
                          ? isCheapestDate
                            ? "text-emerald-600"
                            : "text-slate-500"
                          : "text-slate-400"
                    }`}
                  >
                    {!hasRenderablePrice
                      ? "--"
                      : `${isCenterDate ? "" : "~"}${tabPrice.toFixed(2)} USDT`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-4">
          <aside className="hidden w-56 flex-shrink-0 rounded-2xl border border-[#E2EAF4] bg-white p-4 lg:sticky lg:top-6 lg:block">
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500">STOPS</p>
              <div className="mt-2 space-y-2">
                {uniqueStopOptions.map((stop) => {
                  const label = stop === 0 ? "Nonstop" : `${stop} stop${stop > 1 ? "s" : ""}`;
                  const minStopPrice = stopMinPriceMap.get(stop);
                  return (
                    <label key={stop} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedStops.includes(stop)}
                          onChange={() => {
                            toggleStop(stop);
                          }}
                          className="h-4 w-4 rounded border-[#E2EAF4] text-[#2563EB] focus:ring-[#2563EB]"
                        />
                        <span>{label}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {minStopPrice !== undefined ? `${minStopPrice.toFixed(0)} USDT` : "--"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500">PRICE (USDT)</p>
              <p className="mt-1 text-sm text-slate-500">
                Up to <span className="font-semibold text-[#0B1F3A]">{maxPriceFilter} USDT</span>
              </p>
              <input
                type="range"
                min={minPrice}
                max={Math.max(minPrice, maxPrice)}
                value={maxPriceFilter}
                onChange={(event) => {
                  setMaxPriceFilter(Number(event.target.value));
                }}
                className="mt-2 w-full accent-[#2563EB]"
              />
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500">DEPARTURE TIME</p>
              <p className="mt-1 text-sm text-slate-500">
                00:00 - <span className="font-semibold text-[#0B1F3A]">{departureHourLimit}:00</span>
              </p>
              <input
                type="range"
                min={0}
                max={24}
                value={departureHourLimit}
                onChange={(event) => {
                  setDepartureHourLimit(Number(event.target.value));
                }}
                className="mt-2 w-full accent-[#2563EB]"
              />
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500">AIRLINES</p>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                {uniqueAirlineOptions.map((airline) => {
                  const minAirlinePrice = airlineMinPriceMap.get(airline);
                  return (
                    <label key={airline} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedAirlines.includes(airline)}
                          onChange={() => {
                            toggleAirline(airline);
                          }}
                          className="h-4 w-4 rounded border-[#E2EAF4] text-[#2563EB] focus:ring-[#2563EB]"
                        />
                        <span className="truncate">{airline}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {minAirlinePrice !== undefined ? `${minAirlinePrice.toFixed(0)} USDT` : "--"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500">DURATION</p>
              <p className="mt-1 text-sm text-slate-500">
                Up to <span className="font-semibold text-[#0B1F3A]">{maxDurationHours}h</span>
              </p>
              <input
                type="range"
                min={1}
                max={Math.max(1, maxDurationAvailable)}
                value={maxDurationHours}
                onChange={(event) => {
                  setMaxDurationHours(Number(event.target.value));
                }}
                className="mt-2 w-full accent-[#2563EB]"
              />
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((option) => {
                  const isActive = sortBy === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSortBy(option.key);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        isActive
                          ? "border-[#2563EB] bg-[#2563EB] text-white"
                          : "border-[#E2EAF4] bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-slate-500">{sortedOffers.length} flights found</p>
            </div>

            {sortedOffers.length === 0 ? (
              <div className="rounded-2xl border border-[#E2EAF4] bg-white p-6 text-sm text-slate-500">
                No flights found
              </div>
            ) : (
              <div className="space-y-3">
                {sortedOffers.map((item) => {
                  const airlineInitials = getAirlineInitials(item.airline);
                  const logoUrl = item.airlineIata && item.airlineIata !== "-"
                    ? `https://www.gstatic.com/flights/airline_logos/70px/${item.airlineIata}.png`
                    : "";
                  const isSelecting = selectingOfferId === item.offerId;
                  const isCheapest =
                    cheapestVisiblePrice !== null && Math.abs(item.usdtPrice - cheapestVisiblePrice) < 0.01;
                  const hasNonstop = item.stops === 0;
                  const numericStops = item.stops;
                  const stopText = numericStops === 0 ? "Nonstop" : `${numericStops} stop${numericStops > 1 ? "s" : ""}`;
                  const segments = (() => {
                    const offerData = item.offer as Record<string, unknown>;
                    const slices = offerData?.slices as unknown[];
                    if (
                      Array.isArray(slices) &&
                      slices[0] &&
                      typeof slices[0] === "object" &&
                      Array.isArray((slices[0] as Record<string, unknown>).segments)
                    ) {
                      return (slices[0] as Record<string, unknown>).segments as Record<string, unknown>[];
                    }
                    const segs = offerData?.segments;
                    if (Array.isArray(segs)) {
                      return segs as Record<string, unknown>[];
                    }
                    return null;
                  })();
                  const departureDate = new Date(item.departureTime).toLocaleDateString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });

                  return (
                    <article
                      key={item.key}
                      className="rounded-2xl border border-[#E2EAF4] bg-white p-4"
                    >
                      {(isCheapest || hasNonstop) && (
                        <div className="mb-2 flex gap-2">
                          {isCheapest && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              Cheapest
                            </span>
                          )}
                          {hasNonstop && (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-[#2563EB]">
                              Nonstop
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="airline-logo-wrap flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E2EAF4] bg-white">
                            {logoUrl ? (
                              <>
                                <img
                                  src={logoUrl}
                                  alt={item.airline}
                                  width={22}
                                  height={22}
                                  className="object-contain"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                    const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                                    if (fallback) {
                                      fallback.style.display = "flex";
                                    }
                                  }}
                                />
                                <span className="hidden h-6 w-6 items-center justify-center rounded-full bg-[#DBEAFE] text-[10px] font-semibold text-[#2563EB]">
                                  {airlineInitials}
                                </span>
                              </>
                            ) : (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DBEAFE] text-[10px] font-semibold text-[#2563EB]">
                                {airlineInitials}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-[#0B1F3A]">{item.airline}</span>
                        </div>
                      </div>

                      <div className="mb-1 flex items-center gap-2">
                        <span className="w-14 text-xl font-bold text-[#0B1F3A]">{formatTime(item.departureTime)}</span>
                        <div className="flex flex-1 flex-col items-center">
                          <span className="text-[11px] text-slate-400">{formatDuration(item.duration)}</span>
                          <div className="relative my-0.5 h-px w-full bg-slate-200">
                            <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300" />
                            <div className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300" />
                          </div>
                          <span className={`text-[11px] ${numericStops === 0 ? "text-emerald-600" : "text-slate-400"}`}>
                            {stopText}
                          </span>
                        </div>
                        <span className="w-14 text-right text-xl font-bold text-[#0B1F3A]">
                          {formatTime(item.arrivalTime)}
                        </span>
                      </div>

                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                          {searchInfo?.origin ?? "-"} → {searchInfo?.destination ?? "-"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            item.hasCheckedBag ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {item.hasCheckedBag ? "Checked bag incl." : "Carry-on only"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-lg font-bold text-[#2563EB]">
                            {isRateLoading ? "..." : `${item.usdtPrice.toFixed(2)} USDT`}
                          </span>
                          <p className="text-xs text-slate-400">
                            {item.totalAmount.toFixed(2)} {item.totalCurrency}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelect(item.offer);
                          }}
                          disabled={isSelecting}
                          className="h-10 rounded-xl bg-[#2563EB] px-5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {isSelecting ? "..." : "Select →"}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedOffer(expandedOffer === item.offerId ? null : item.offerId)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 border-t border-[#F0F4F9] pt-3 text-xs text-slate-400"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7 10l5 5 5-5z" />
                        </svg>
                        {expandedOffer === item.offerId ? "Hide details" : "Flight details"}
                      </button>

                      {expandedOffer === item.offerId && (
                        <div className="mt-3 border-t border-[#F0F4F9] pt-3">
                          <div className="mb-4 flex items-center justify-between rounded-xl bg-[#F8FAFF] px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold text-[#0B1F3A]">
                                {searchInfo?.origin ?? "-"} → {searchInfo?.destination ?? "-"}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {departureDate} · {stopText}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-[#2563EB]">{formatDuration(item.duration)}</p>
                          </div>

                          <div className="mb-4 flex flex-wrap gap-2">
                            <span className="flex items-center gap-1 rounded-full bg-[#EAF3DE] px-3 py-1 text-xs text-[#3B6D11]">
                              ✓ Carry-on included
                            </span>
                            {readValue(item.offer, ["total_currency"], "") && (
                              <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs text-[#2563EB]">
                                Economy
                              </span>
                            )}
                          </div>

                          {segments ? (
                            <div className="space-y-0">
                              {segments.map((seg, idx) => {
                                const segDep = String(
                                  seg?.departing_at ?? seg?.departure_at ?? seg?.departure_time ?? seg?.departure ?? "",
                                );
                                const segArr = String(
                                  seg?.arriving_at ?? seg?.arrival_at ?? seg?.arrival_time ?? seg?.arrival ?? "",
                                );
                                const segOriginData = (seg?.origin ?? {}) as Record<string, unknown>;
                                const segDestData = (seg?.destination ?? {}) as Record<string, unknown>;
                                const segOrigin = String(
                                  segOriginData?.iata_code ??
                                    seg?.origin_iata_code ??
                                    seg?.origin_iata ??
                                    seg?.departure_airport ??
                                    "",
                                );
                                const segOriginCity = String(
                                  (segOriginData?.city_name ??
                                    (segOriginData?.city as Record<string, unknown> | undefined)?.name ??
                                    segOriginData?.name ??
                                    "") as string,
                                );
                                const segOriginAirport = String(segOriginData?.name ?? "");
                                const segDest = String(
                                  segDestData?.iata_code ??
                                    seg?.destination_iata_code ??
                                    seg?.destination_iata ??
                                    seg?.arrival_airport ??
                                    "",
                                );
                                const segDestCity = String(
                                  (segDestData?.city_name ??
                                    (segDestData?.city as Record<string, unknown> | undefined)?.name ??
                                    segDestData?.name ??
                                    "") as string,
                                );
                                const segDestAirport = String(segDestData?.name ?? "");
                                const marketingCarrier = (seg?.marketing_carrier ?? {}) as Record<string, unknown>;
                                const operatingCarrier = (seg?.operating_carrier ?? {}) as Record<string, unknown>;
                                const carrier = (seg?.carrier ?? {}) as Record<string, unknown>;
                                const segAirline = String(
                                  marketingCarrier?.name ??
                                    operatingCarrier?.name ??
                                    carrier?.name ??
                                    seg?.airline_name ??
                                    seg?.airline ??
                                    item.airline,
                                );
                                const segAirlineIata = String(
                                  marketingCarrier?.iata_code ??
                                    operatingCarrier?.iata_code ??
                                    carrier?.iata_code ??
                                    seg?.airline_iata ??
                                    "",
                                );
                                const segFlightNo = String(
                                  seg?.marketing_carrier_flight_number ?? seg?.flight_number ?? seg?.number ?? "",
                                );
                                const segDuration = String(seg?.duration ?? "");
                                const nextSeg = segments[idx + 1];
                                const layoverMinutes = nextSeg
                                  ? (() => {
                                      const arrMs = new Date(segArr).getTime();
                                    const nextSegDep = String(
                                      nextSeg?.departing_at ??
                                        nextSeg?.departure_at ??
                                        nextSeg?.departure_time ??
                                        nextSeg?.departure ??
                                        "",
                                    );
                                      const nextDepMs = new Date(
                                      nextSegDep,
                                      ).getTime();
                                      if (Number.isNaN(arrMs) || Number.isNaN(nextDepMs)) {
                                        return null;
                                      }
                                      return Math.round((nextDepMs - arrMs) / 60000);
                                    })()
                                  : null;

                                return (
                                  <div key={`${item.key}-seg-${idx}`}>
                                    <div className="flex gap-3">
                                      <div className="flex w-[10px] flex-shrink-0 flex-col items-center">
                                        <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#2563EB]" />
                                        <div className="w-px flex-1 bg-slate-200" />
                                      </div>
                                      <div className="pb-2">
                                        <p className="text-sm font-bold text-[#0B1F3A]">{formatTime(segDep)}</p>
                                        {(segOriginCity || segOrigin) && (
                                          <p className="text-sm text-[#0B1F3A]">{segOriginCity || segOrigin}</p>
                                        )}
                                        {segOriginAirport && segOriginAirport !== segOriginCity && (
                                          <p className="text-xs text-slate-400">
                                            {segOriginAirport}
                                            {segOrigin ? ` (${segOrigin})` : ""}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex gap-3">
                                      <div className="flex w-[10px] flex-shrink-0 flex-col items-center">
                                        <div className="h-2 w-2 rounded-full bg-transparent" />
                                        <div className="w-px flex-1 bg-slate-200" />
                                      </div>
                                      <div className="mb-2 flex-1 rounded-xl bg-[#F8FAFF] px-3 py-2.5">
                                        <div className="mb-1 flex items-center gap-2">
                                          {segAirlineIata && (
                                            <img
                                              src={`https://www.gstatic.com/flights/airline_logos/70px/${segAirlineIata}.png`}
                                              width={18}
                                              height={18}
                                              className="object-contain"
                                              alt={segAirline}
                                              onError={(event) => {
                                                event.currentTarget.style.display = "none";
                                              }}
                                            />
                                          )}
                                          <span className="text-xs font-medium text-[#0B1F3A]">{segAirline}</span>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                          Travel time:{" "}
                                          <span className="font-semibold text-[#2563EB]">
                                            {formatDuration(segDuration)}
                                          </span>
                                          {segFlightNo && (
                                            <span className="ml-2 text-slate-400">
                                              · {segAirlineIata}
                                              {segFlightNo}
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex gap-3">
                                      <div className="flex w-[10px] flex-shrink-0 flex-col items-center">
                                        <div
                                          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                                            layoverMinutes !== null ? "bg-slate-300" : "bg-emerald-500"
                                          }`}
                                        />
                                        {layoverMinutes !== null ? <div className="w-px flex-1 bg-slate-200" /> : null}
                                      </div>
                                      <div className="pb-2">
                                        <p className="text-sm font-bold text-[#0B1F3A]">{formatTime(segArr)}</p>
                                        {(segDestCity || segDest) && (
                                          <p className="text-sm text-[#0B1F3A]">{segDestCity || segDest}</p>
                                        )}
                                        {segDestAirport && segDestAirport !== segDestCity && (
                                          <p className="text-xs text-slate-400">
                                            {segDestAirport}
                                            {segDest ? ` (${segDest})` : ""}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {layoverMinutes !== null && (
                                      <div className="flex gap-3">
                                        <div className="flex w-[10px] flex-shrink-0 flex-col items-center">
                                          <div className="h-2 w-2 rounded-full bg-transparent" />
                                          <div className="w-px flex-1 bg-slate-200" />
                                        </div>
                                        <div
                                          className={`mb-2 flex-1 rounded-xl border px-3 py-2 ${
                                            layoverMinutes > 600
                                              ? "border-orange-200 bg-orange-50"
                                              : "border-[#E2EAF4] bg-white"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <svg
                                              width="12"
                                              height="12"
                                              viewBox="0 0 24 24"
                                              fill={layoverMinutes > 600 ? "#f97316" : "#94a3b8"}
                                            >
                                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
                                            </svg>
                                            <p className="text-xs text-slate-500">
                                              {Math.floor(layoverMinutes / 60)}h {layoverMinutes % 60}m layover ·{" "}
                                              {segDestAirport || segDestCity || segDest}
                                              {layoverMinutes > 600 && (
                                                <span className="ml-1 font-semibold text-orange-500">· Overnight</span>
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <div className="flex flex-col items-center">
                                <div className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
                                <div className="my-1 min-h-[50px] w-px bg-slate-200" />
                                <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                              </div>
                              <div className="flex-1 space-y-4">
                                <div>
                                  <p className="text-sm font-bold text-[#0B1F3A]">{formatTime(item.departureTime)}</p>
                                  <p className="text-xs text-slate-400">{searchInfo?.origin ?? "-"} · Departure</p>
                                </div>
                                <div className="rounded-xl bg-[#F8FAFF] px-3 py-2 text-xs text-slate-500">
                                  {item.airline} · {formatDuration(item.duration)}
                                  {numericStops > 0 && (
                                    <span className="ml-1 text-orange-500">
                                      · {numericStops} stop{numericStops > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-[#0B1F3A]">{formatTime(item.arrivalTime)}</p>
                                  <p className="text-xs text-slate-400">{searchInfo?.destination ?? "-"} · Arrival</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>

      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center overflow-hidden rounded-full bg-[#0B1F3A] shadow-lg lg:hidden">
        <button
          type="button"
          onClick={() => setShowMobilePanel("sort")}
          className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h6v-2H3v2zm0-5h12v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
          Sort
        </button>
        <span className="h-5 w-px bg-white/20" />
        <button
          type="button"
          onClick={() => setShowMobilePanel("filter")}
          className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39A.998.998 0 0 0 18.95 4H5.04a1 1 0 0 0-.79 1.61z" />
          </svg>
          Filter
        </button>
      </div>

      <div className={`fixed inset-0 z-50 lg:hidden ${showMobilePanel ? "block" : "hidden"}`}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobilePanel(null)} />

        <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white">
          {showMobilePanel === "sort" && (
            <div>
              <div className="flex items-center justify-between border-b border-[#F0F4F9] px-5 py-4">
                <h3 className="text-base font-semibold text-[#0B1F3A]">Sort by</h3>
                <button
                  type="button"
                  onClick={() => setShowMobilePanel(null)}
                  className="text-xl text-slate-400"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-0 px-5 py-3">
                {[
                  { value: "best", label: "Best Price" },
                  { value: "shortest", label: "Shortest Duration" },
                  { value: "departure", label: "Earliest Departure" },
                  { value: "arrival", label: "Arrival Time" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSortBy(option.value as "best" | "shortest" | "departure" | "arrival");
                      setShowMobilePanel(null);
                    }}
                    className={`flex w-full items-center justify-between border-b border-[#F0F4F9] py-4 text-sm ${
                      sortBy === option.value ? "font-semibold text-[#2563EB]" : "text-[#0B1F3A]"
                    }`}
                  >
                    {option.label}
                    {sortBy === option.value && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#2563EB">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showMobilePanel === "filter" && (
            <div className="max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 flex items-center justify-between border-b border-[#F0F4F9] bg-white px-5 py-4">
                <h3 className="text-base font-semibold text-[#0B1F3A]">Filters</h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStops(uniqueStopOptions);
                      setMaxPriceFilter(maxPrice);
                      setDepartureHourLimit(24);
                      setFilterMaxArr(24);
                      setMaxDurationHours(maxDurationAvailable);
                      setSelectedAirlines(uniqueAirlineOptions);
                    }}
                    className="text-sm text-[#2563EB]"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMobilePanel(null)}
                    className="text-xl text-slate-400"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Price (USDT)</p>
                <input
                  type="range"
                  min={minPrice}
                  max={Math.max(minPrice, maxPrice)}
                  value={maxPriceFilter}
                  step="1"
                  onChange={(event) => setMaxPriceFilter(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>${minPrice}</span>
                  <span>Up to ${maxPriceFilter}</span>
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Duration</p>
                <input
                  type="range"
                  min={60}
                  max={Math.max(60, maxDurationAvailable * 60)}
                  value={maxDurationHours * 60}
                  step="30"
                  onChange={(event) => setMaxDurationHours(Math.max(1, Math.ceil(Number(event.target.value) / 60)))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>1h</span>
                  <span>Up to {maxDurationHours}h</span>
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Departure time</p>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={departureHourLimit}
                  step="1"
                  onChange={(event) => setDepartureHourLimit(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>00:00</span>
                  <span>Up to {departureHourLimit}:59</span>
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Arrival time</p>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={filterMaxArr}
                  step="1"
                  onChange={(event) => setFilterMaxArr(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>00:00</span>
                  <span>{filterMaxArr >= 24 ? "23:59" : `${String(filterMaxArr).padStart(2, "0")}:00`}</span>
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Stops</p>
                <div className="space-y-3">
                  {[0, 1, 2].map((stop) => {
                    const key = Math.min(stop, 3);
                    const price = minPriceForStop(key);
                    return (
                      <label key={stop} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedStops.includes(key)}
                            onChange={() => toggleStop(key)}
                            className="h-4 w-4 accent-[#2563EB]"
                          />
                          <span className="text-sm text-[#0B1F3A]">
                            {stop === 0 ? "Nonstop" : stop === 1 ? "1 stop" : "2+ stops"}
                          </span>
                        </div>
                        {price !== undefined && (
                          <span className="text-sm text-slate-400">{Math.round(price)} USDT</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border-b border-[#F0F4F9] px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Airlines</p>
                <div className="space-y-3">
                  {uniqueAirlineOptions.map((airline) => {
                    const price = minPriceForAirline(airline);
                    return (
                      <label key={airline} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedAirlines.includes(airline)}
                            onChange={() => toggleAirline(airline)}
                            className="h-4 w-4 accent-[#2563EB]"
                          />
                          <span className="text-sm text-[#0B1F3A]">{airline}</span>
                        </div>
                        {price !== undefined && (
                          <span className="text-sm text-slate-400">{Math.round(price)} USDT</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sticky bottom-0 border-t border-[#F0F4F9] bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowMobilePanel(null)}
                  className="h-12 w-full rounded-2xl bg-[#2563EB] text-sm font-semibold text-white"
                >
                  Show {filteredOffers.length} flights
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
