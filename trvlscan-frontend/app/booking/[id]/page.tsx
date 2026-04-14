type BookingPageProps = {
  params: {
    id: string;
  };
};

export default function BookingPage({ params }: BookingPageProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#061834] via-[#0a2450] to-[#041022] px-6 py-12 text-white md:px-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur">
        <h1 className="text-3xl font-semibold">Payment</h1>
        <p className="mt-3 text-blue-100/90">
          Booking reference: <span className="font-medium text-white">{params.id}</span>
        </p>
        <p className="mt-2 text-blue-100/90">
          Payment form layout is ready. Checkout components will be added here.
        </p>
      </section>
    </main>
  );
}
