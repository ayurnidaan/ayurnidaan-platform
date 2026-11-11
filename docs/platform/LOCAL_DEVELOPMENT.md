# Local development

## Runtime matrix

| Application | Node.js | Package manager | Start command |
| --- | --- | --- | --- |
| Customer mobile | 22.13.x | npm | `npm run dev:customer` |
| Doctor mobile | 22.13.x | npm | `npm run dev:doctor` |
| Admin portal | 22.13.x or newer | npm | `npm run dev:admin` |
| Hospital SaaS | 24 or newer | npm | `npm run dev:hospital` |

The repository intentionally does not use one hoisted dependency installation. Each application keeps its own lockfile because the hospital system and Expo applications have different runtime constraints.

## Configuration

Copy `.env.example` to `.env.local` inside the selected application. Never use a service-role key in a mobile or browser bundle.

The customer and doctor apps use `EXPO_PUBLIC_*` variables and should be configured through local environment files and EAS environments. The admin portal requires browser-safe `VITE_*` values plus server-only Vercel variables for its API. The hospital SaaS configuration is documented in its own `.env.example` and README.

## Verification

```powershell
npm run verify
npm run build:admin
npm run test:hospital
npm run build:hospital
```

For mobile validation, run Expo's dependency checks inside each mobile application and test on the relevant Android/iOS target. Expo SDK 57 targets React Native 0.86 and requires at least Node 22.13.x.

