# TRVLscan Backend

Crypto-powered flight aggregator. Customers pay in USDT (TRC-20) for airline tickets.

## Tech Stack
- Node.js + Express + TypeScript, runtime: `tsx` (NOT ts-node — incompatible with Node v24)
- Supabase (PostgreSQL) for bookings, payments, tickets, users
- Duffel API for flight search/booking (currently sandbox: duffel_test_ prefix)
- NOWPayments for USDT TRC-20 payments with HMAC-SHA512 webhook verification
- frankfurter.app for GBP→USD rates (1hr cache, 1.27 fallback)
- Resend for transactional email (API key set, integration pending)

## Commands
- `npx tsx src/index.ts` — start dev server (port 3000 locally, PORT env on Railway)
- `git add . && git commit -m "msg" && git push` — deploy (Railway auto-deploys from main)

## Architecture
- src/index.ts — Express entry point, cron job (expires bookings >12min)
- src/routes/flights.ts — POST /api/flights/search → Duffel
- src/routes/bookings.ts — POST /api/bookings/create → Supabase + pricing
- src/routes/payments.ts — POST /api/payments/create → NOWPayments
- src/routes/webhooks.ts — POST /api/webhooks/nowpayments → HMAC verify
- src/routes/currency.ts — GET /api/currency/rate
- src/services/currency.ts — getCurrencyRate() with 1hr cache

## Pricing
Duffel GBP × GBP/USD rate × 1.025 = USDT price

## Critical Rules
- NEVER commit .env — secrets only in Railway Dashboard
- Railway uses process.env.PORT (8080), never hardcode 3000
- Always tsx, never ts-node
- Webhook: sort JSON keys before HMAC-SHA512
- formatDuration must handle P1DT8H52M (days in ISO 8601)
- If deploy seems broken, check for stale dist/ folder
