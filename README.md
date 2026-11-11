# Ayurnidaan Platform

This repository is the consolidated engineering and handover home for the four Ayurnidaan systems:

| System | Location | Runtime | Purpose |
| --- | --- | --- | --- |
| Customer app | `apps/customer-mobile` | Expo SDK 57 / React Native | Consumer wellness, assessments, appointments, recommendations, shop and payments |
| Doctor app | `apps/doctor-mobile` | Expo SDK 57 / React Native | Doctor onboarding, verification-aware access and clinical/practice workflows |
| Admin portal | `apps/admin-portal` | React / Vite / Vercel | Administration of doctors, customers, appointments, inventory and orders |
| Hospital SaaS | `apps/hospital-saas` | React / Vite / Express | IPD patient care, therapies, pharmacy, billing, rooms and clinical records |

The original projects remain unchanged. This repository contains clean source snapshots with local secrets, dependency folders, build output, platform-generated metadata and nested Git histories excluded.

## Start here

1. Read [`docs/platform/SYSTEM_MAP.md`](docs/platform/SYSTEM_MAP.md) for ownership and data boundaries.
2. Read [`docs/platform/LOCAL_DEVELOPMENT.md`](docs/platform/LOCAL_DEVELOPMENT.md) for runtime and setup requirements.
3. Copy the relevant `.env.example` to `.env.local` inside the application you want to run.
4. Install and run only that application. Each app remains independently deployable.

```powershell
# Customer mobile app
npm run setup:customer
npm run dev:customer

# Doctor mobile app
npm run setup:doctor
npm run dev:doctor

# Admin portal
npm run setup:admin
npm run dev:admin

# Hospital SaaS
npm run setup:hospital
npm run dev:hospital
```

Run `npm run verify` from the repository root to check the monorepo structure, configuration templates and accidental secret/build-artifact inclusion.

## Documentation

- Platform-wide architecture and integration boundaries: `docs/platform/`
- Customer app handover documents: `docs/customer-app/`
- Doctor app handover documents: `docs/doctor-app/`
- Admin portal handover documents: `docs/admin-portal/`
- Hospital SaaS API, workflows and artwork notes: `docs/hospital-saas/`
- System-specific technical notes remain beside their source under each `apps/*` directory.

## Important integration boundary

The customer app, doctor app and admin portal use the Ayurnidaan Supabase application data model. The hospital SaaS is a separately deployable IPD product with its own PostgreSQL/Supabase schema and authentication model. Sharing this repository does not merge production databases or make a hospital clinician account interchangeable with an app doctor account.

## Repository policy

- Never commit `.env`, `.env.local`, service-role keys, database passwords, payment secrets or signing files.
- Keep every database change in a versioned migration in the owning system.
- Run the owning system's checks before deployment.
- Use Node 22.13.x for Expo SDK 57 projects. The hospital SaaS currently requires Node 24+.
- Treat the Word documents in `docs/` as handover artifacts and the Markdown files as the maintainable engineering source of truth.

