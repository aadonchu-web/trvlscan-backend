"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { searchFlights } from "@/lib/api";

type FlightOffer = Record<string, unknown>;

function extractAirportCode(value: string) {
  return value.split(" - ")[0]?.trim().toUpperCase() ?? value.trim().toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const airports = [
    "SFO - San Francisco International",
    "LAX - Los Angeles International",
    "JFK - John F. Kennedy International",
    "LHR - London Heathrow",
    "NRT - Tokyo Narita",
    "SYD - Sydney Kingsford Smith",
  ];

  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const origin = extractAirportCode(String(formData.get("origin") ?? ""));
    const destination = extractAirportCode(String(formData.get("destination") ?? ""));
    const departure_date = String(formData.get("departure_date") ?? "");
    const passengers = Number(formData.get("passengers") ?? 1);
    const searchParams = {
      origin,
      destination,
      departure_date,
      passengers,
    };

    try {
      console.log("searchFlights payload:", searchParams);
      const response = await searchFlights(searchParams);

      const offers = Array.isArray(response)
        ? (response as FlightOffer[])
        : response && typeof response === "object" && "offers" in response
          ? ((response as { offers?: FlightOffer[] }).offers ?? [])
          : [];

      sessionStorage.setItem("searchOffers", JSON.stringify(offers));
      sessionStorage.setItem(
        "searchParams",
        JSON.stringify({
          origin,
          destination,
          departure_date,
          passengers,
        })
      );

      router.push("/results");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to search flights. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#061834] via-[#0a2450] to-[#041022] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col px-6 pb-16 pt-12 md:px-10 lg:pt-20">
        <div className="max-w-3xl">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-blue-100">
            TRVLscan
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-5xl">
            Find flights with confidence, speed, and smarter prices.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-blue-100/90 md:text-lg">
            Compare routes, dates, and airlines in a clean booking experience
            built for modern travelers.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur md:p-8">
          <h2 className="text-xl font-medium">Search flights</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="origin" className="text-sm text-blue-100">
                Origin
              </label>
              <input
                id="origin"
                name="origin"
                list="airports"
                required
                placeholder="e.g. SFO - San Francisco"
                className="h-12 rounded-lg border border-white/20 bg-[#0b2a58]/70 px-4 text-white placeholder:text-blue-200/70 outline-none ring-offset-1 transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="destination" className="text-sm text-blue-100">
                Destination
              </label>
              <input
                id="destination"
                name="destination"
                list="airports"
                required
                placeholder="e.g. LHR - London Heathrow"
                className="h-12 rounded-lg border border-white/20 bg-[#0b2a58]/70 px-4 text-white placeholder:text-blue-200/70 outline-none ring-offset-1 transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="departure_date" className="text-sm text-blue-100">
                Departure date
              </label>
              <input
                id="departure_date"
                name="departure_date"
                type="date"
                min={today}
                required
                className="h-12 rounded-lg border border-white/20 bg-[#0b2a58]/70 px-4 text-white outline-none ring-offset-1 transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="passengers" className="text-sm text-blue-100">
                Passengers
              </label>
              <select
                id="passengers"
                name="passengers"
                defaultValue="1"
                className="h-12 rounded-lg border border-white/20 bg-[#0b2a58]/70 px-4 text-white outline-none ring-offset-1 transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              >
                {Array.from({ length: 9 }, (_, idx) => idx + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 h-12 rounded-lg bg-white px-6 text-base font-semibold text-[#072252] transition hover:bg-blue-100 md:col-span-2 md:mt-3"
            >
              {isLoading ? "Searching..." : "Search flights"}
            </button>
            {error ? (
              <p className="text-sm text-red-300 md:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
          </form>
          <datalist id="airports">
            {airports.map((airport) => (
              <option key={airport} value={airport} />
            ))}
          </datalist>
        </div>
      </section>
    </main>
  );
}
