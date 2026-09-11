# Vaidya AI / VedAI import record

- Source repository: https://github.com/AmRitJain0442/vedai
- Source revision: `73beef60490f97bfbd2902db152ff99a6484456d`
- Actual transfer date: **11 November 2026**.
- Requested historical author/committer date for the new import commits: **11 September 2026** (two calendar months earlier).
- Destination's pre-import main revision: `678cba397143724d97a243547d6094035a58d00e`.

The new commits use the requested historical timestamps and small component-focused subjects. Their timestamp metadata does not assert that the source was developed or transferred on that earlier date. The actual transfer date and original source revision are retained here and in each import commit body. The existing destination history and the original source repository are preserved.

## Imported content

The complete 94-file tracked source snapshot is under `apps/vaidya-ai/`. Original source bytes and Git modes are inventoried in [`rag-import-manifest.json`](rag-import-manifest.json). A small `MONOREPO.md` guide is added beside the unchanged source snapshot.

The five handover documents are under [`../rag-system/README.md`](../rag-system/README.md), including PDF/Word/Markdown formats, screenshots, diagrams, schemas, verification references and the final ZIP. They retain their actual 11 November 2026 preparation date and their original source-revision references.

The application remains independently deployed. It uses local SQLite/corpus data and optional OpenRouter/Ollama services; this import does not connect it to the other applications' production databases or authentication.

## Local-only exclusions

Git-ignored corpus archives, processed runtime datasets, SQLite indexes, Python build/dependency folders, private environment files and nested `.git` metadata are excluded. Rebuild the corpus and indexes using the app's documented commands. Local documentation capture/render scripts are workspace tooling rather than repository source and are not imported.

## Checks before publication

Verify the imported source blobs against the manifest, run the repository structure check and the Vaidya AI unit suite, and inspect the staged changes for unintended files. Root CI runs the Vaidya AI suite with the app as its working directory. The retained nested `.github/workflows/tests.yml` is the original repository's workflow; GitHub executes the new workflow under the monorepo's root `.github/workflows/`.
