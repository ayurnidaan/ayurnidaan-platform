# Ayurnidaan Admin Portal

React/Vite administration portal for doctor review, customer oversight, appointments, inventory and orders.

## Local setup

1. Use Node 22.13.x or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and use development-only values.
4. Run `npm run dev`.

The browser receives only `VITE_SUPABASE_URL` and the publishable/anon key. `SUPABASE_SERVICE_ROLE_KEY` belongs only in the server-side deployment environment. Administrator access is controlled by `ADMIN_EMAILS` and server-side verification in the API.

