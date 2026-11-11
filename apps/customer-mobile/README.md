# Ayurnidaan Wellness Android

Ayurnidaan is a React Native and Expo application using Supabase for its database, authentication, and storage.

## Environments

| Git branch | Supabase project | Expo environment | Purpose |
| --- | --- | --- | --- |
| `dev` | `ayurnidaan-dev` | `development` | Development and internal testing |
| `prod` | `ayurnidaan-prod` | `production` | Store releases and real users |

The projects have independent databases, authentication users, storage, URLs, and API keys. Database structures are kept aligned through migrations in `supabase/migrations`.

Changes are developed and verified on `dev`. After approval, merge `dev` into `prod` to deploy the same versioned migrations and application code to production. Do not develop directly on `prod`.

## Local development

1. Install Node.js 22 LTS. The expected version is recorded in `.nvmrc`.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add the `ayurnidaan-dev` project URL and publishable key to `.env.local`.
5. Run `npx expo start --go` for Expo Go.

Local environment files are excluded from Git. Never place a Supabase secret/service-role key or database password in the mobile application.

## Expo/EAS environments

Create the following variables in both the EAS `development` and `production` environments:

- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Use `ayurnidaan-dev` values in development and `ayurnidaan-prod` values in production. These client-side values are embedded in the application; use plain-text or sensitive visibility, not secret visibility.

Build profiles are defined in `eas.json`:

```text
eas build --profile development
eas build --profile preview
eas build --profile production
```

## Application identities

- Development: `com.ayurnidaan.wellness.dev`
- Production: `com.ayurnidaan.wellness`

The separate identifiers allow development and production builds to be installed on the same device.

## Database changes

Every schema change must be represented by a migration in `supabase/migrations`. Row Level Security is required for tables accessible from the application. Migrations reach `ayurnidaan-dev` from the `dev` branch and reach `ayurnidaan-prod` only after promotion to `prod`.
