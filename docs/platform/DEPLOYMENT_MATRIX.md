# Deployment matrix

| System | Deployment target | Database/services | Release trigger |
| --- | --- | --- | --- |
| Customer app | EAS / Android distribution | Ayurnidaan Supabase dev/prod | Approved mobile release build |
| Doctor app | EAS / Android, iOS or web as configured | Ayurnidaan Supabase | Approved doctor app build |
| Admin portal | Vercel | Ayurnidaan Supabase | Vercel production deployment |
| Hospital SaaS | Vercel web/API | Dedicated hospital Supabase/PostgreSQL and storage | Hospital tests + production deployment |

## Release order for shared customer/doctor/admin changes

1. Apply backward-compatible database migrations.
2. Deploy server-side functions or admin API changes.
3. Deploy the admin portal if operational controls are needed.
4. Release doctor/customer clients.
5. Monitor database errors, authentication failures and business workflow metrics.

Hospital releases follow the independent runbook in `apps/hospital-saas/README.md`.

