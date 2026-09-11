# Local development

## Runtime matrix

| Application | Runtime | Package manager | Start command |
| --- | --- | --- | --- |
| Customer mobile | Node 22.13.x | npm | `npm run dev:customer` |
| Doctor mobile | Node 22.13.x | npm | `npm run dev:doctor` |
| Admin portal | Node 22.13.x or newer | npm | `npm run dev:admin` |
| Hospital SaaS | Node 24 or newer | npm | `npm run dev:hospital` |
| Vaidya AI / VedAI | Python 3.10+ with SQLite FTS5/trigram/JSON | pip + optional extras | `npm run dev:rag` |

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


## Vaidya AI / VedAI Python setup

Run source commands from `apps/vaidya-ai`, not the monorepo root. Use its `MONOREPO.md` for venv creation and the full `download → process → index → terms-index → passages-index → verify` sequence. A normal clone excludes the corpus/indexes. Once built, `python -m vedai serve --port 8765` serves the app at `http://127.0.0.1:8765`.

The root `setup:rag`, `dev:rag` and `verify:rag` scripts use `python` from the active environment and do not install npm dependencies. Use a Python virtual environment. Only the app's three OpenRouter settings are read from `apps/vaidya-ai/.env`; `VEDAI_*` access/host settings and `OLLAMA_HOST` must be process environment variables. Retrieval works without generation credentials.

Run `npm run verify:rag` for the Python unit/API suite. Browser and live-provider scripts are separate checks; live-provider scripts can incur charges. Full setup and Linux deployment instructions are in `docs/rag-system/Markdown/06_Installation_and_Deployment_Guide.md`.
