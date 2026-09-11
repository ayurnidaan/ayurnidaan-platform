# Contributing

## Change workflow

1. Identify the owning system in `docs/platform/SYSTEM_MAP.md`.
2. Create a focused branch.
3. Update source, migrations and documentation together.
4. Run `npm run verify` at the repository root.
5. Run the checks documented by the affected application.
6. Deploy the affected system independently; a monorepo change does not imply a coordinated release unless the interface contract changed.

## Database changes

Never make an undocumented production-only schema edit. Add a timestamped migration to the owning application's `supabase/migrations` directory and document backward-compatibility requirements for other consumers.

For Vaidya AI, SQLite indexes are derived corpus artifacts rather than Supabase migrations. Change its index builders/manifests and tests together, rebuild a consistent dataset, and follow `apps/vaidya-ai/MONOREPO.md` and the RAG database handover guide. Do not add a Supabase migration for an unrelated local corpus-index change.

## Credentials

Commit placeholders only. Client publishable Supabase values belong in local/EAS/Vercel environment configuration; service-role keys and database credentials are server-only.

