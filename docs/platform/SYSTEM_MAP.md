# Platform system map

## Logical topology

```text
Customer mobile ─┐
                 ├── Ayurnidaan Supabase project(s) ── Edge Functions / Storage
Doctor mobile ───┤
Admin portal ────┘

Hospital SaaS frontend ── Hospital Express API ── Hospital PostgreSQL/Supabase + private storage
```

## Ownership matrix

| Capability | Owning system | Primary persistence |
| --- | --- | --- |
| Customer identity and profile | Customer app data model | Ayurnidaan Supabase Auth + `profiles` |
| Assessments and recommendations | Customer app | Ayurnidaan Supabase tables/functions |
| Doctor application submission | Doctor app | `doctor_applications` |
| Doctor verification and visibility | Admin portal | `doctor_applications`, `verified_doctors` |
| Customer appointments, shop and orders | Customer/admin shared contract | Ayurnidaan Supabase |
| IPD admissions and inpatient records | Hospital SaaS | Hospital PostgreSQL/Supabase |
| Hospital pharmacy, rooms and billing | Hospital SaaS | Hospital PostgreSQL/Supabase |

## Shared-contract rules

The customer app, doctor app and admin portal depend on compatible definitions for doctor applications, verified doctors, appointments, products and orders. Before changing one of these schemas:

1. Search all three applications for the affected table or field.
2. Make the database migration backward compatible where possible.
3. update each affected TypeScript type and handover document.
4. deploy the migration before clients that require the new field.

The hospital SaaS is intentionally isolated. Any future connection must use an explicit API or synchronization service with tenant, consent, audit and clinical safety rules; do not join its production database directly to the consumer schema.

