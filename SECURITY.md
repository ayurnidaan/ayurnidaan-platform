# Security policy

This repository contains healthcare-adjacent software. Treat customer, doctor and patient information as sensitive.

- Report suspected credential exposure privately to the repository owner.
- Do not include production records in fixtures, screenshots, issues or commits.
- Require Row Level Security for client-accessible Supabase tables.
- Keep privileged keys in server-side deployment secrets only.
- Review authorization separately for each system; repository proximity is not an authorization boundary.
- Rotate any key immediately if it is accidentally committed, even if the commit is later removed.

