"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPayment, getPaymentStatus } from "@/lib/api";

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

type PaymentStatusResponse = {
  status?: string;
  payment_status?: string;
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
  const [copySuccess, setCopySuccess] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("pending");

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
        if (!booking) return;
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
    if (!booking?.booking_id || paymentStatus === "confirmed") {
      return;
    }

    let isCancelled = false;

    async function pollStatus() {
      try {
        if (!booking) return;
        const response = (await getPaymentStatus(booking.booking_id)) as PaymentStatusResponse;
        if (isCancelled) {
          return;
        }

        const nextStatus = (response.payment_status ?? response.status ?? "").toLowerCase();
        if (nextStatus) {
          setPaymentStatus(nextStatus);
        }
      } catch {
        // Ignore transient polling errors and keep waiting state.
      }
    }

    void pollStatus();
    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 8000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [booking?.booking_id, paymentStatus]);

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
      return "--:--:--";
    }

    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);

  const offer = booking?.selected_offer;
  const airline = readValue(offer, ["airline.name", "airline_name", "airline", "carrier"]);
  const departure = readValue(offer, ["departure_time", "departure"]);
  const arrival = readValue(offer, ["arrival_time", "arrival"]);
  const duration = readValue(offer, ["duration"]);
  const stops = readValue(offer, ["number_of_stops", "stops"], "0");
  const totalAmount = readValue(offer, ["total_amount"], "-");
  const totalCurrency = readValue(offer, ["total_currency"], "GBP");
  const network = "Tron (TRC20)";

  const handleCopyAddress = async () => {
    if (!payment?.pay_address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payment.pay_address);
      setCopySuccess(true);
      window.setTimeout(() => {
        setCopySuccess(false);
      }, 1800);
    } catch {
      setCopySuccess(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF3FA] px-4 py-10 text-[#0B1F3A] md:px-8">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-[#DCE6F3] bg-white p-6 shadow-[0_20px_45px_rgba(12,33,66,0.12)] md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0F2748]">Transfer Funds now!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Booking ID: <span className="font-medium text-[#0F2748]">{params.id}</span>
            </p>
            <p className="mt-4 text-sm font-semibold text-[#1C355E]">
              Payment Amount 💎{" "}
              <span className="text-lg text-[#0F2748]">
                {(payment?.pay_amount ?? booking?.usdt_amount ?? 0).toFixed(2)} USDT (TRC20)
              </span>
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-[#2563EB]">
            <span>🕒</span>
            <span>{timerText}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 rounded-xl border border-[#E3EBF6] bg-[#F9FBFF] p-5 md:grid-cols-2">
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#E3EBF6] bg-white p-4">
            <p className="mb-3 text-sm font-medium text-[#1C355E]">Scan this code</p>
            {payment?.pay_address ? (
              <QRCodeSVG value={payment.pay_address} size={150} />
            ) : (
              <div className="flex h-[150px] w-[150px] items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
                Creating payment...
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#E3EBF6] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Network</p>
            <p className="mt-1 text-sm font-medium text-[#0F2748]">{network}</p>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Wallet Address
            </p>
            <div className="mt-2 flex items-start gap-3">
              <p className="flex-1 break-all rounded-lg bg-[#F4F7FC] p-3 text-sm text-[#0F2748]">
                {isCreatingPayment ? "Creating payment..." : payment?.pay_address ?? "Address unavailable"}
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleCopyAddress();
                }}
                disabled={!payment?.pay_address}
                className="rounded-lg bg-[#0F2748] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#13335e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copySuccess ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#E3EBF6] bg-white p-4">
          {paymentStatus === "confirmed" ? (
            <p className="text-sm font-semibold text-emerald-600">
              Payment confirmed. Your booking is now secured.
            </p>
          ) : (
            <div className="flex items-center gap-3 text-sm font-medium text-[#1C355E]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#BFDBFE] border-t-[#2563EB]" />
              <span>Awaiting payment confirmation...</span>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-[#E3EBF6] bg-[#F9FBFF] p-4">
          <p className="text-sm text-[#1C355E]">
            {booking?.search_params?.origin ?? "-"} to {booking?.search_params?.destination ?? "-"} on{" "}
            {booking?.search_params?.departure_date ?? "-"} for {booking?.search_params?.passengers ?? 1}{" "}
            passenger(s)
          </p>
          <p className="mt-2 text-sm text-[#456287]">
            {airline} | {formatTime(departure)} - {formatTime(arrival)} | {formatDuration(duration)} | {stops}{" "}
            stop(s)
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Offer price: {totalAmount} {totalCurrency}
          </p>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
