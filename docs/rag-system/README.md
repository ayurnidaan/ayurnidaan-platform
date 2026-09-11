# Vaidya AI — RAG System Handover

**Prepared:** 11 November 2026  
**Repository:** https://github.com/AmRitJain0442/vedai  
**Inspected commit:** `73beef60490f97bfbd2902db152ff99a6484456d`  
**Application:** VedAI 0.7.0; user-facing name Vaidya AI  
**Status:** Version 1.0 handover drafts, ready for repository-owner/receiving-team review

This package contains all five requested documents, totaling **67 PDF pages** and approximately **16,860 words**. Each document is supplied as a formatted PDF, an editable Word file, and a Markdown source. PDFs include linked contents, page numbers and document bookmarks; Word documents contain embedded figures, structured headings and linked section indexes.

| No. | Document | PDF pages | Files |
|---|---|---|---|
| 03 | Software Architecture Document | 11 | [PDF](PDF/03_Software_Architecture_Document.pdf) · [Word](Word/03_Software_Architecture_Document.docx) · [Markdown](Markdown/03_Software_Architecture_Document.md) |
| 04 | API Documentation | 14 | [PDF](PDF/04_API_Documentation.pdf) · [Word](Word/04_API_Documentation.docx) · [Markdown](Markdown/04_API_Documentation.md) |
| 05 | Database Documentation | 13 | [PDF](PDF/05_Database_Documentation.pdf) · [Word](Word/05_Database_Documentation.docx) · [Markdown](Markdown/05_Database_Documentation.md) |
| 06 | Installation & Deployment Guide | 13 | [PDF](PDF/06_Installation_and_Deployment_Guide.pdf) · [Word](Word/06_Installation_and_Deployment_Guide.docx) · [Markdown](Markdown/06_Installation_and_Deployment_Guide.md) |
| 07 | User Manual | 16 | [PDF](PDF/07_User_Manual.pdf) · [Word](Word/07_User_Manual.docx) · [Markdown](Markdown/07_User_Manual.md) |

## Suggested reading order

For engineering handover, read 03 → 05 → 04 → 06. Readers and demonstrators can start with 07. Extract the entire ZIP before opening linked resources. Keep the `assets` folder beside `Markdown` so source-document images resolve. Word files and PDFs embed their figures and can be shared independently.

## Supporting material

- `Reference/openapi.generated.json`: exact framework-generated API specification.
- `Reference/openapi.handover.json`: response-enriched integration specification with optional Basic authentication and async/error contracts.
- `Reference/sqlite-schema.sql`: schema extracted from actual runtime indexes, with optional vector DDL separately identified.
- `Reference/*response.json` and related JSON examples: real local catalog, reading, source and job payloads.
- `Reference/verification.json`: local verification scope and measured corpus counts.
- `Reference/source-register.json`: source file hashes, symbols and line numbers.
- `Reference/environment-versions.txt`: observed verification environment.
- `assets/`: nine real application screenshots and three architecture/data diagrams.
- `SHA256SUMS.txt`: integrity hashes for the package files, excluding itself.

See [Reference/README.md](Reference/README.md) for the full reference index.

## Implementation and verification basis

The source was cloned and inspected at the recorded commit. The full pinned SARIT corpus was downloaded, processed and indexed: **15 works, 145,600 segments, 26,585 chunks and 111,195 complete source units**. Integrity verification checked 110 source-file hashes and 119,774 citation spans. **All 57 unit tests passed.** Real retrieval-only API requests and actual desktop/mobile browser flows were exercised. Screenshots use unmodified application code and authentic source data.

No paid OpenRouter calls, live infrastructure changes or local embedding rebuilds were performed. Generated-output contracts and Linux deployment steps are documented from code, tests and committed deployment scripts; the documents distinguish these from locally observed behavior. The repository's historical model choice, retrieval metrics and hosting identifiers are recorded as such, rather than asserted as newly verified live state.

## Receiving-team acceptance

These are implementation-based drafts, not signed approvals. Before operational acceptance, the repository owner and receiving maintainers should assign the application/deployment owner, corpus-update owner, model-credential/billing owner and subject-review owner; confirm the actual deployment address/access mode; and record backup/rollback locations in their controlled inventory. Real API keys, passwords, corpus runtime databases and private environment files are intentionally outside this document package.

Document 06 contains concrete setup, release, verification and recovery procedures. Document 07 explains browser-local history and the absence of server-side account history or portable session export. Recommendations are labeled separately from shipped functionality throughout the set.
