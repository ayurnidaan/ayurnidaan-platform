# Expo HAS CHANGED

Before changing either Expo application, read the exact Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/.

# Monorepo boundaries

- `apps/customer-mobile` and `apps/doctor-mobile` are Expo SDK 57 applications.
- `apps/admin-portal` is the administration web application.
- `apps/hospital-saas` is the independently deployed IPD web/API application.
- Do not copy secrets between systems or assume that separate Supabase projects share users or data.
- Keep changes scoped to the owning application unless the task explicitly requires a cross-system contract change.

