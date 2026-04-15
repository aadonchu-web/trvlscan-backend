"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "@/lib/api";

type OfferRecord = Record<string, unknown>;

type SearchInfo = {
  origin: string;
  destination: string;
  departure_date: string;
  passengers: number;
};

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
    if (!value) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
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

export default function PassengerPage() {
  const router = useRouter();
  const [selectedOffer, setSelectedOffer] = useState<OfferRecord | null>(null);
  const [searchInfo, setSearchInfo] = useState<SearchInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const rawOffer = sessionStorage.getItem("selectedOffer");
    const rawSearchParams = sessionStorage.getItem("searchParams");

    if (rawOffer) {
      try {
        const parsed = JSON.parse(rawOffer);
        if (parsed && typeof parsed === "object") {
          setSelectedOffer(parsed as OfferRecord);
        }
      } catch {
        setSelectedOffer(null);
      }
    }

    if (rawSearchParams) {
      try {
        const parsed = JSON.parse(rawSearchParams) as Partial<SearchInfo>;
        setSearchInfo({
          origin: parsed.origin ?? "-",
          destination: parsed.destination ?? "-",
          departure_date: parsed.departure_date ?? "-",
          passengers: Number(parsed.passengers ?? 1),
        });
      } catch {
        setSearchInfo(null);
      }
    }
  }, []);

  const summary = useMemo(() => {
    if (!selectedOffer) {
      return {
        offerId: "",
        route: `${searchInfo?.origin ?? "SFO"} -> ${searchInfo?.destination ?? "LAX"}`,
        dateTime: searchInfo?.departure_date ?? "-",
        durationStops: "-",
        usdtPrice: "-",
        fiatPrice: "-",
      };
    }

    const offerId = readValue(selectedOffer, ["id"], "");
    const departureTime = readValue(selectedOffer, [
      "departure_time",
      "departure",
      "outbound.departure_time",
      "itinerary.departure_time",
    ]);
    const duration = readValue(selectedOffer, ["duration", "flight_duration", "itinerary.duration"]);
    const stops = readValue(selectedOffer, ["number_of_stops", "stops", "itinerary.stops"], "0");
    const totalAmount = readNumber(selectedOffer, [
      "total_amount",
      "price",
      "price_total",
      "fare.total_amount",
    ]);
    const totalCurrency = readValue(selectedOffer, ["total_currency", "currency"], "GBP");
    const route =
      searchInfo?.origin && searchInfo?.destination
        ? `${searchInfo.origin} -> ${searchInfo.destination}`
        : "SFO -> LAX";

    const cachedRate = Number(sessionStorage.getItem("currencyRate_GBP_USD") ?? "");
    const gbpToUsd = Number.isFinite(cachedRate) && cachedRate > 0 ? cachedRate : 1.27;
    const usdBase = totalCurrency.toUpperCase() === "GBP" ? totalAmount * gbpToUsd : totalAmount;
    const usdtPrice = usdBase > 0 ? `${(usdBase * 1.025).toFixed(2)} USDT` : "-";

    const numericStops = Number(stops);
    const stopText =
      Number.isFinite(numericStops) && numericStops <= 0
        ? "Non-stop"
        : `${stops} ${numericStops === 1 ? "stop" : "stops"}`;

    return {
      offerId,
      route,
      dateTime: formatDateTime(departureTime),
      durationStops: `${formatDuration(duration)} | ${stopText}`,
      usdtPrice,
      fiatPrice: `${totalAmount.toFixed(2)} ${totalCurrency}`,
    };
  }, [searchInfo, selectedOffer]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!selectedOffer || !summary.offerId) {
      setSubmitError("No selected flight found. Please choose a flight again.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const gender = String(formData.get("gender") ?? "male");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const nationality = String(formData.get("nationality") ?? "").trim();

    const passengerData = {
      gender,
      firstName,
      lastName,
      dateOfBirth,
      email,
      phone,
      nationality,
    };

    setIsSubmitting(true);
    try {
      sessionStorage.setItem("passengerData", JSON.stringify(passengerData));

      const booking = (await createBooking({
        offerId: summary.offerId,
        passengerName: `${firstName} ${lastName}`.trim(),
        passengerEmail: email,
        passengerDob: dateOfBirth,
      })) as {
        booking_id: string;
        usd_amount?: number;
        usdt_amount?: number;
        expires_at?: string;
      };

      sessionStorage.setItem(
        "currentBooking",
        JSON.stringify({
          ...booking,
          selected_offer: selectedOffer,
          search_params: searchInfo,
          passenger_data: passengerData,
        }),
      );

      router.push(`/booking/${booking.booking_id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F0F4F9] px-4 py-4 text-[#0B1F3A] sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-semibold text-white">
                  ✓
                </span>
                <span className="text-[#2563EB]">Search</span>
              </div>
              <div className="h-px flex-1 bg-[#2563EB]" />
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-semibold text-white">
                  2
                </span>
                <span className="text-[#2563EB]">Flight</span>
              </div>
              <div className="h-px flex-1 bg-[#2563EB]" />
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-semibold text-white">
                  3
                </span>
                <span className="font-semibold text-[#2563EB]">Passenger Details</span>
              </div>
              <div className="h-px flex-1 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
                  4
                </span>
                <span>Payment</span>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-[#E2EAF4] bg-white p-4">
            <h1 className="text-lg font-semibold text-[#0B1F3A]">Passenger Details</h1>
            <p className="mt-1 text-sm text-slate-400">Traveler 1 · Adult</p>

            <form onSubmit={handleSubmit} className="mt-3 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <input type="radio" name="gender" value="male" defaultChecked className="peer sr-only" />
                    <span className="inline-flex rounded-xl border border-[#E2EAF4] px-5 py-1.5 text-sm text-slate-500 transition peer-checked:border-[#2563EB] peer-checked:bg-[#EEF4FF] peer-checked:text-[#2563EB]">
                      Male
                    </span>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" name="gender" value="female" className="peer sr-only" />
                    <span className="inline-flex rounded-xl border border-[#E2EAF4] px-5 py-1.5 text-sm text-slate-500 transition peer-checked:border-[#2563EB] peer-checked:bg-[#EEF4FF] peer-checked:text-[#2563EB]">
                      Female
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                <div>
                  <label
                    htmlFor="firstName"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    First name*
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    required
                    className="box-border h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Last name*
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    required
                    className="box-border h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="dateOfBirth"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Date of birth*
                </label>
                <div className="overflow-hidden">
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    required
                    className="h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none focus:border-[#2563EB] box-border"
                  />
                </div>
                <p className="mt-1 hidden text-xs text-slate-500 sm:block">As shown on passport</p>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Email*
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                    className="box-border h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 hidden text-xs text-slate-500 sm:block">Booking confirmation sent here</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Phone*
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    required
                    className="box-border h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="nationality"
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Nationality*
                  </label>
                  <input
                    id="nationality"
                    name="nationality"
                    required
                    className="box-border h-10 w-full max-w-full rounded-xl border border-[#E2EAF4] px-4 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {submitError ? (
                <p className="text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 h-11 w-full rounded-xl bg-[#2563EB] text-sm font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Processing..." : "Continue to Payment →"}
              </button>
            </form>
          </section>
        </div>

        <aside className="h-fit w-full overflow-hidden rounded-2xl border border-[#E2EAF4] bg-white lg:sticky lg:top-6 lg:w-72">
          <div className="bg-[#0B1F3A] px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wider opacity-60">Flight Summary</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{summary.route.replace("->", "→")}</p>
              <p className="text-sm font-bold text-[#93C5FD]">{summary.usdtPrice}</p>
            </div>
          </div>

          <div className="space-y-2 px-4 py-3">
            <p className="flex items-center gap-2 py-2 text-sm text-slate-600">
              <span aria-hidden>📅</span>
              <span>{summary.dateTime}</span>
            </p>
            <p className="flex items-center gap-2 py-2 text-sm text-slate-600">
              <span aria-hidden>🕒</span>
              <span>{summary.durationStops}</span>
            </p>

            <div className="border-t border-[#F0F4F9]" />

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Total to pay</p>
              <p className="text-2xl font-bold text-[#2563EB]">{summary.usdtPrice}</p>
              <p className="mt-0.5 text-sm text-slate-400">{summary.fiatPrice}</p>
            </div>

            <div className="hidden rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 sm:block">
              <p className="text-xs text-amber-700">Price guaranteed for 12 min after booking</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
