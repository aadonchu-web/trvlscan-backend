import { Duffel } from "@duffel/api";

const getDuffelClient = () => {
  const token = process.env.DUFFEL_API_KEY;
  if (!token) throw new Error("DUFFEL_API_KEY is required");
  return new Duffel({ token });
};

type PassengerInfo = {
  given_name: string;
  family_name: string;
  born_on: string;
  email: string;
  phone_number?: string;
  gender: "m" | "f";
  title: "mr" | "ms" | "mrs" | "miss";
};

export async function createDuffelOrder(offerId: string, passenger: PassengerInfo) {
  const duffel = getDuffelClient();

  const order = await duffel.orders.create({
    type: "instant",
    selected_offers: [offerId],
    passengers: [
      {
        id: "passenger_1",
        given_name: passenger.given_name,
        family_name: passenger.family_name,
        born_on: passenger.born_on,
        email: passenger.email,
        phone_number: passenger.phone_number ?? "+15555555555",
        gender: passenger.gender,
        title: passenger.title,
      },
    ],
    payments: [
      {
        type: "balance",
        amount: "0",
        currency: "GBP",
      },
    ],
  });

  return order.data;
}
