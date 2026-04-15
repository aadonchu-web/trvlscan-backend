"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBookingConfirmationEmail = sendBookingConfirmationEmail;
const resend_1 = require("resend");
const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey)
        throw new Error("RESEND_API_KEY is required");
    return new resend_1.Resend(apiKey);
};
async function sendBookingConfirmationEmail(params) {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
        from: "TRVLscan <bookings@trvlscan.com>",
        to: params.to,
        subject: `Booking Confirmed — ${params.origin} → ${params.destination}`,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: #0B1F3A; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">✈ Booking Confirmed</h1>
          <p style="color: #93C5FD; margin: 8px 0 0;">Your flight has been booked successfully</p>
        </div>

        <div style="background: #F8FAFF; padding: 20px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #E2EAF4;">
          <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 18px;">${params.origin} → ${params.destination}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #64748B; font-size: 14px;">Passenger</td><td style="padding: 8px 0; font-weight: 600; color: #0B1F3A; font-size: 14px;">${params.passengerName}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748B; font-size: 14px;">Booking Reference</td><td style="padding: 8px 0; font-weight: 700; color: #2563EB; font-size: 16px; letter-spacing: 2px;">${params.bookingReference}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748B; font-size: 14px;">Airline</td><td style="padding: 8px 0; font-weight: 600; color: #0B1F3A; font-size: 14px;">${params.airline}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748B; font-size: 14px;">Departure</td><td style="padding: 8px 0; font-weight: 600; color: #0B1F3A; font-size: 14px;">${params.departureTime}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748B; font-size: 14px;">Amount Paid</td><td style="padding: 8px 0; font-weight: 700; color: #059669; font-size: 16px;">${params.usdtAmount.toFixed(2)} USDT</td></tr>
          </table>
        </div>

        <div style="background: #EEF4FF; padding: 16px; border-radius: 12px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 14px; color: #1D4ED8;">
            📧 Please save your booking reference <strong>${params.bookingReference}</strong> — you will need it at check-in.
          </p>
        </div>

        <p style="color: #94A3B8; font-size: 12px; text-align: center;">
          TRVLscan.com — Book flights with crypto worldwide
        </p>
      </div>
    `,
    });
    if (error) {
        console.error("Resend email failed:", error);
        throw error;
    }
    return data;
}
