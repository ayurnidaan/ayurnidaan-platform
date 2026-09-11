# Reference material

This folder supports the five handover documents. Application evidence refers to commit `73beef60490f97bfbd2902db152ff99a6484456d` and was collected on 11 November 2026.

| File | Use |
|---|---|
| `openapi.generated.json` | Unmodified FastAPI-generated schema, including actual request models |
| `openapi.handover.json` | Enriched integration schema with source-derived response models, optional authentication and error/async descriptions |
| `sqlite-schema.sql` | Actual DDL from the default runtime databases; optional vector declaration identified separately |
| `source-register.json` | Inspected Python files, content hashes, top-level symbols and source line numbers |
| `verification.json` | Local test outcome, corpus integrity checks, counts, screenshot conditions and untested scope |
| `environment-versions.txt` | Observed Python/package versions; not a project lockfile |
| `document-build.json` | Document word/page counts and rendered contents sections |
| `pdf-layout-check.json` | Automated rendered text-boundary checks and per-page word counts |
| `package-validation.json` | Final content, schema, link and document-structure verification |
| `health.json`, `works.json` | Actual local catalog/readiness responses |
| `ask-request.json` | Actual retrieval-only request used to capture the API example |
| `ask-retrieval-response.json` | Complete actual reading response including original Sanskrit and source annotations |
| `async-accepted.json`, `async-completed.json` | Actual accepted-job headers/body and completed poll response |
| `source-response.json`, `passage-response.json` | Actual indexed chunk and complete source-unit payloads |
| `validation-error.json`, `unknown-passage-error.json` | Actual input/resource error examples |

Runtime examples use generation disabled and carry no credentials. Job IDs in the captured examples are historical ephemeral identifiers and cannot be resumed against another server. No generated answer, translation or live provider result has been fabricated. Response fields for generated branches are documented from repository code and unit tests.

The enriched OpenAPI document is a handover aid. The runtime application has no declared response models for its routes, so its native OpenAPI export leaves many success schemas unspecified. The enriched file preserves native request schemas and explicitly identifies its response additions.

The SQL file describes separate database files. Do not execute all declarations into a single production database as a deployment migration. Use the repository's index builders to create a consistent corpus/index set.
