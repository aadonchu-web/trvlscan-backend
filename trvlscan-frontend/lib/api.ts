const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

export type SearchFlightsParams = {
  origin: string;
  destination: string;
  departure_date: string;
  passengers: number;
};

export type CreateBookingParams = {
  offerId: string;
  passengerName: string;
  passengerEmail: string;
  passengerDob: string;
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchFlights(params: SearchFlightsParams) {
  const payload = {
    origin: params.origin,
    destination: params.destination,
    departure_date: params.departure_date,
    passengers: params.passengers,
  };

  return request("/api/flights/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createBooking(params: CreateBookingParams) {
  const payload = {
    offer_id: params.offerId,
    passenger_name: params.passengerName,
    passenger_email: params.passengerEmail,
    passenger_dob: params.passengerDob,
  };

  return request("/api/bookings/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPayment(bookingId: string) {
  return request("/api/payments/create", {
    method: "POST",
    body: JSON.stringify({ booking_id: bookingId }),
  });
}

export async function getPaymentStatus(bookingId: string) {
  return request(`/api/payments/status/${bookingId}`);
}
