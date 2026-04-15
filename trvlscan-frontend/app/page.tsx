"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { useRouter } from "next/navigation";

type AirportSuggestion = {
  name: string;
  iata_code: string;
};

export default function HomePage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabinClass, setCabinClass] = useState("economy");
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<AirportSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<AirportSuggestion[]>([]);
  const [originSelected, setOriginSelected] = useState<string | null>(null);
  const [destinationSelected, setDestinationSelected] = useState<string | null>(null);
  const router = useRouter();

  const searchAirports = async (
    query: string,
    setSuggestions: Dispatch<SetStateAction<AirportSuggestion[]>>,
  ) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://trvlscan-backend-production.up.railway.app/api/flights/airports?query=${encodeURIComponent(query)}`,
      );
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      setSuggestions([]);
    }
  };

  const handleSearch = () => {
    if (!originSelected || !destinationSelected) {
      alert("Please select an airport from the dropdown");
      return;
    }
    const params = {
      origin: originSelected,
      destination: destinationSelected,
      date,
      passengers,
      cabinClass,
    };
    sessionStorage.setItem("searchParams", JSON.stringify(params));
    router.push("/results");
  };

  return (
    <main className="text-on-surface">
      <nav className="glass-nav fixed top-0 z-50 w-full shadow-sm shadow-primary/5">
        <div className="mx-auto flex h-20 w-full max-w-screen-2xl items-center justify-between px-8">
          <div className="flex items-center gap-12">
            <span className="font-headline text-2xl font-black tracking-tighter text-on-surface">TRVLscan</span>
            <div className="hidden items-center gap-8 md:flex">
              <a
                className="border-b-2 border-primary px-1 py-1 font-semibold text-primary transition-colors duration-300"
                href="#"
              >
                Flights
              </a>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 rounded-full bg-secondary-container px-4 py-1.5 text-sm font-bold text-on-secondary-container">
              <span className="h-2 w-2 rounded-full bg-on-secondary-container" />
              USDT · TRC-20
            </div>
            <button className="material-symbols-outlined text-outline transition-all hover:text-primary">
              account_circle
            </button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-surface-container-low px-8 pb-24 pt-40">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div className="z-10">
            <h1 className="mb-6 font-headline text-6xl font-extrabold leading-[1.1] tracking-tight text-on-surface md:text-7xl">
              Every flight,
              <br />
              booked in <span className="text-primary">USDT.</span>
            </h1>
            <p className="mb-10 max-w-lg text-xl leading-relaxed text-on-surface-variant">
              Access global aviation networks and pay instantly with USDT on the world's most secure travel rails.
            </p>
            <div className="mb-8 flex gap-4 overflow-x-auto pb-2">
              <button className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined text-sm">flight</span> Flights
              </button>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="aspect-square w-full rotate-3 overflow-hidden rounded-[3rem] shadow-2xl shadow-on-surface/10">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtF4qDXeaORJ8gOG512BgYFxIRqBjwR_KsMqOuVSpW1p3VME5ItT0Br2vmM7P6jsECq_uB0lZMbp0rfVKeu3o8plLx2uWHeDnlZ_gP02RErAVE1wpp0nz7EdKm_X_BkmPHG_LFkWIF3wIyukJRpOY2kEvrI9JXhIuQcenEGiezaQwdHDVp9qTVjS1ipCbQzQqX2jyvkUNBM-xVtX6X_ngsqhR3s5gcezj1jtFpe0MkgtdMUW-vFnhj9jELpR8XEH1P2c92_8KEWXgS"
                alt="Travel hero"
              />
            </div>
            <div className="-rotate-6 absolute -bottom-10 -left-20 flex h-48 w-72 flex-col justify-between rounded-3xl border border-white/50 bg-white p-6 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-tighter text-outline">
                  Verified USDT Payment
                </span>
                <span className="material-symbols-outlined text-secondary">check_circle</span>
              </div>
              <div className="font-headline text-2xl font-bold">
                4,281.00 <span className="text-sm font-medium text-outline">USDT</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary-container">
                <div className="h-full w-full bg-secondary" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-16 max-w-7xl px-8">
        <div className="rounded-[2rem] border border-white/10 bg-surface-container-lowest p-8 shadow-xl shadow-on-surface/5">
          <div className="grid grid-cols-1 items-end gap-6 md:grid-cols-12">
            <div className="space-y-2 md:col-span-3">
              <label className="ml-2 text-xs font-bold uppercase tracking-wider text-outline">From</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                  flight_takeoff
                </span>
                <input
                  className="w-full rounded-xl border-none bg-surface-container-low py-4 pl-12 pr-4 font-medium text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20"
                  placeholder="Origin City"
                  type="text"
                  value={originQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setOrigin(value);
                    setOriginQuery(value);
                    setOriginSelected(null);
                    searchAirports(value, setOriginSuggestions);
                  }}
                />
                {originSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-2 max-h-[200px] overflow-y-auto rounded-xl bg-white shadow-lg">
                    {originSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.iata_code}-${suggestion.name}`}
                        type="button"
                        onClick={() => {
                          setOriginQuery(suggestion.name);
                          setOrigin(suggestion.name);
                          setOriginSelected(suggestion.iata_code);
                          setOriginSuggestions([]);
                        }}
                        className="block w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-surface-container-low"
                      >
                        {suggestion.iata_code} — {suggestion.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center pb-2 md:col-span-1">
              <button
                onClick={() => {
                  const oldOrigin = origin;
                  const oldOriginQuery = originQuery;
                  const oldOriginSelected = originSelected;
                  setOrigin(destination);
                  setOriginQuery(destinationQuery);
                  setOriginSelected(destinationSelected);
                  setDestination(oldOrigin);
                  setDestinationQuery(oldOriginQuery);
                  setDestinationSelected(oldOriginSelected);
                  setOriginSuggestions([]);
                  setDestinationSuggestions([]);
                }}
                className="rounded-full bg-surface-container-high p-3 text-primary transition-all hover:bg-primary hover:text-white"
              >
                <span className="material-symbols-outlined">swap_horiz</span>
              </button>
            </div>

            <div className="space-y-2 md:col-span-3">
              <label className="ml-2 text-xs font-bold uppercase tracking-wider text-outline">To</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                  flight_land
                </span>
                <input
                  className="w-full rounded-xl border-none bg-surface-container-low py-4 pl-12 pr-4 font-medium text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20"
                  placeholder="Destination City"
                  type="text"
                  value={destinationQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDestination(value);
                    setDestinationQuery(value);
                    setDestinationSelected(null);
                    searchAirports(value, setDestinationSuggestions);
                  }}
                />
                {destinationSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-2 max-h-[200px] overflow-y-auto rounded-xl bg-white shadow-lg">
                    {destinationSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.iata_code}-${suggestion.name}`}
                        type="button"
                        onClick={() => {
                          setDestinationQuery(suggestion.name);
                          setDestination(suggestion.name);
                          setDestinationSelected(suggestion.iata_code);
                          setDestinationSuggestions([]);
                        }}
                        className="block w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-surface-container-low"
                      >
                        {suggestion.iata_code} — {suggestion.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="ml-2 text-xs font-bold uppercase tracking-wider text-outline">Depart</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                  calendar_today
                </span>
                <input
                  className="w-full rounded-xl border-none bg-surface-container-low py-4 pl-12 pr-4 font-medium text-on-surface focus:ring-2 focus:ring-primary/20"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="ml-2 text-xs font-bold uppercase tracking-wider text-outline">Pax</label>
              <div className="relative">
                <input
                  className="w-full rounded-xl border-none bg-surface-container-low px-4 py-4 font-medium text-on-surface focus:ring-2 focus:ring-primary/20"
                  min="1"
                  type="number"
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                onClick={handleSearch}
                className="signature-gradient flex w-full items-center justify-center gap-2 rounded-xl py-4 font-bold text-on-primary shadow-lg shadow-primary/30 transition-all active:scale-95"
              >
                Search Flights
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-surface-container border-opacity-50 pt-6">
            <div className="flex gap-2">
              <button
                onClick={() => setCabinClass("economy")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  cabinClass === "economy"
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Economy
              </button>
              <button
                onClick={() => setCabinClass("premium_economy")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  cabinClass === "premium_economy"
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Premium Economy
              </button>
              <button
                onClick={() => setCabinClass("business")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  cabinClass === "business"
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Business
              </button>
              <button
                onClick={() => setCabinClass("first")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  cabinClass === "first"
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                First
              </button>
            </div>
            <button className="flex items-center gap-1 text-sm font-bold text-primary hover:underline underline-offset-4">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Add return date
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-24">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-primary">
              Curated Journeys
            </span>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight">Popular Routes</h2>
          </div>
          <button className="group flex items-center gap-2 font-bold text-primary">
            View all destinations
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
              arrow_forward
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { code: "DXB → LHR", title: "Dubai to London", sub: "Daily direct flights available", price: "412" },
            { code: "JFK → CDG", title: "New York to Paris", sub: "Experience the city of lights", price: "585" },
            { code: "SIN → HND", title: "Singapore to Tokyo", sub: "Premier Asian connectivity", price: "320" },
            { code: "LAX → SYD", title: "Los Angeles to Sydney", sub: "Trans-pacific luxury routes", price: "890" },
          ].map((route) => (
            <div
              key={route.code}
              className="group cursor-pointer rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm shadow-on-surface/5 transition-all duration-300 hover:bg-primary hover:text-white"
            >
              <div className="mb-6 flex items-start justify-between">
                <div className="rounded-2xl bg-primary/10 p-3 group-hover:bg-white/20">
                  <span className="material-symbols-outlined text-primary group-hover:text-white">flight_takeoff</span>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-outline group-hover:text-white/60">
                  {route.code}
                </span>
              </div>
              <h3 className="mb-1 text-xl font-bold">{route.title}</h3>
              <p className="mb-6 text-sm text-outline group-hover:text-white/80">{route.sub}</p>
              <div className="border-t border-surface-container pt-4 group-hover:border-white/20">
                <span className="text-xs font-medium text-outline group-hover:text-white/60">From</span>
                <div className="text-xl font-black">
                  {route.price} <span className="text-xs font-bold">USDT</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface-container-low px-8 py-24">
        <div className="mx-auto mb-16 max-w-7xl text-center">
          <h2 className="mb-4 font-headline text-4xl font-extrabold tracking-tight">Precision Booking Service</h2>
          <p className="mx-auto max-w-2xl text-on-surface-variant">
            Travel redefined for the digital era. Secure, instant, and borderless flight transactions.
          </p>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-4">
          {[
            {
              n: "01",
              t: "Search",
              d: "Browse thousands of global destinations and luxury flight options in our refined interface.",
            },
            {
              n: "02",
              t: "Choose",
              d: "Select your preferred class and amenities. Our digital platform handles the complexity.",
            },
            {
              n: "03",
              t: "Enter details",
              d: "Provide passenger information through our secure, encrypted data gateway.",
            },
            {
              n: "04",
              t: "Pay in USDT",
              d: "Complete your booking instantly using USDT via TRC-20 network.",
            },
          ].map((item) => (
            <div
              key={item.n}
              className="flex h-full flex-col rounded-[2rem] bg-white p-8 shadow-sm transition-all duration-500 hover:shadow-xl"
            >
              <div className="font-headline mb-6 text-5xl font-black text-primary/10">{item.n}</div>
              <h4 className="mb-3 text-lg font-bold">{item.t}</h4>
              <p className="text-sm leading-relaxed text-outline">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-surface px-12 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex flex-col items-start justify-between gap-12 md:flex-row">
            <div className="space-y-6">
              <span className="font-headline text-2xl font-black tracking-tighter text-on-surface">TRVLscan</span>
              <p className="max-w-xs text-sm leading-relaxed text-outline">
                The ultimate digital gateway for the modern traveler. Book global flights with the precision of
                blockchain.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
              <div className="space-y-4">
                <h5 className="text-sm font-bold uppercase tracking-widest text-primary">Service</h5>
                <ul className="space-y-2 text-sm font-medium text-on-surface-variant">
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      How it works
                    </a>
                  </li>
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Destinations
                    </a>
                  </li>
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Booking Policy
                    </a>
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h5 className="text-sm font-bold uppercase tracking-widest text-primary">Support</h5>
                <ul className="space-y-2 text-sm font-medium text-on-surface-variant">
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      FAQ
                    </a>
                  </li>
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Live Chat
                    </a>
                  </li>
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Contact
                    </a>
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h5 className="text-sm font-bold uppercase tracking-widest text-primary">Legal</h5>
                <ul className="space-y-2 text-sm font-medium text-on-surface-variant">
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Privacy
                    </a>
                  </li>
                  <li>
                    <a className="transition-all hover:text-primary" href="#">
                      Terms
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-surface-container-high pt-8 md:flex-row">
            <p className="text-xs text-outline">© 2025 TRVLscan. The Flight Concierge.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
