# Ayurnidaan Doctor

Expo SDK 57 doctor application for registration, verification-aware access and doctor workflows.

## Local setup

1. Use Node 22.13.x.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and add the development Supabase URL and publishable key.
4. Run `npm start`.

Never place a service-role key in this application. Database structure is versioned under `supabase/migrations`.

