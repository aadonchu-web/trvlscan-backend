"use client";

import { useEffect, useMemo, useState } from "react";
import { createPayment } from "@/lib/api";

type BookingPageProps = {
  params: {
    id: string;
  };
};

type BookingSessionData = {
  booking_id: string;
  usdt_amount?: number;
  expires_at?: string;
  selected_offer?: Record<string, unknown>;
  search_params?: {
    origin?: string;
    destination?: string;
    departure_date?: string;
    passengers?: number;
  } | null;
};

type PaymentData = {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  expires_at?: string;
};

function readValue(source: Record<string, unknown> | undefined, paths: string[], fallback = "-") {
  if (!source) {
    return fallback;
  }

  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = source;

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

function formatDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value.trim());
  if (!match) {
    return value;
  }

  const hours = match[1] ? `${match[1]}h` : "";
  const minutes = match[2] ? `${match[2]}m` : "";
  return [hours, minutes].filter(Boolean).join(" ") || "0m";
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

export default function BookingPage({ params }: BookingPageProps) {
  const [booking, setBooking] = useState<BookingSessionData | null>(null);
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    const rawBooking = sessionStorage.getItem("currentBooking");
    if (!rawBooking) {
      setError("No booking found in this session.");
      setIsCreatingPayment(false);
      return;
    }

    try {
      const parsed = JSON.parse(rawBooking) as BookingSessionData;
      setBooking(parsed);
    } catch {
      setError("Unable to read booking details.");
      setIsCreatingPayment(false);
    }
  }, []);

  useEffect(() => {
    if (!booking?.booking_id) {
      return;
    }

    let isCancelled = false;

    async function initPayment() {
      setIsCreatingPayment(true);
      setError(null);
      try {
        const response = (await createPayment(booking.booking_id)) as PaymentData;
        if (!isCancelled) {
          setPayment(response);
        }
      } catch (paymentError) {
        if (!isCancelled) {
          setError(
            paymentError instanceof Error ? paymentError.message : "Failed to initialize payment.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsCreatingPayment(false);
        }
      }
    }

    void initPayment();

    return () => {
      isCancelled = true;
    };
  }, [booking?.booking_id]);

  useEffect(() => {
    const expiresAt = payment?.expires_at ?? booking?.expires_at;
    if (!expiresAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const expiryMs = new Date(expiresAt).getTime();
      if (!Number.isFinite(expiryMs)) {
        setRemainingSeconds(null);
        return;
      }

      const nowMs = Date.now();
      const seconds = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
      setRemainingSeconds(seconds);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [booking?.expires_at, payment?.expires_at]);

  const timerText = useMemo(() => {
    if (remainingSeconds === null) {
      return "--:--";
    }

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);

  const offer = booking?.selected_offer;
  const airline = readValue(offer, ["airline.name", "airline_name", "airline", "carrier"]);
  const departure = readValue(offer, ["departure_time", "departure"]);
  const arrival = readValue(offer, ["arrival_time", "arrival"]);
  const duration = readValue(offer, ["duration"]);
  const stops = readValue(offer, ["number_of_stops", "stops"], "0");
  const totalAmount = readValue(offer, ["total_amount"], "-");
  const totalCurrency = readValue(offer, ["total_currency"], "GBP");

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#061834] via-[#0a2450] to-[#041022] px-6 py-12 text-white md:px-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur">
        <h1 className="text-3xl font-semibold">Payment</h1>
        <p className="mt-3 text-blue-100/90">
          Booking ID: <span className="font-medium text-white">{params.id}</span>
        </p>

        <div className="mt-6 rounded-xl border border-white/10 bg-[#0b2a58]/60 p-5">
          <h2 className="text-lg font-semibold">Flight summary</h2>
          <p className="mt-2 text-sm text-blue-100/90">
            {booking?.search_params?.origin ?? "-"} to {booking?.search_params?.destination ?? "-"} on{" "}
            {booking?.search_params?.departure_date ?? "-"} for {booking?.search_params?.passengers ?? 1}{" "}
            passenger(s)
          </p>
          <p className="mt-2 text-sm text-blue-100/90">
            {airline} | {formatTime(departure)} - {formatTime(arrival)} | {formatDuration(duration)} | {stops}{" "}
            stop(s)
          </p>
          <p className="mt-2 text-sm text-blue-100/75">
            Offer price: {totalAmount} {totalCurrency}
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-[#0b2a58]/60 p-5">
          <p className="text-sm text-blue-100/80">USDT amount to pay</p>
          <p className="mt-1 text-3xl font-semibold text-cyan-300">
            {booking?.usdt_amount?.toFixed(4) ?? "-"} USDT
          </p>
          <p className="mt-4 text-sm text-blue-100/80">Wallet address (QR placeholder)</p>
          <p className="mt-1 break-all rounded-lg bg-[#041022]/60 p-3 text-sm text-white">
            {isCreatingPayment
              ? "Creating payment..."
              : payment?.pay_address ?? "Address unavailable"}
          </p>
          <p className="mt-4 text-sm text-blue-100/80">Time remaining</p>
          <p className="mt-1 text-xl font-semibold text-white">{timerText}</p>
          <p className="mt-4 text-sm text-yellow-300">Payment status: Waiting for payment...</p>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
