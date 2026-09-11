# Vaidya AI in the Ayurnidaan platform

The full original VedAI source snapshot is in this directory. Run its CLI, data-build and release commands **from this directory** so `config`, `.env`, `data` and `reports` resolve correctly. The maintained Python package/CLI remains `vedai`; the product is branded Vaidya AI.

```powershell
Set-Location apps/vaidya-ai
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install ".[rag,test]"
.\.venv\Scripts\python.exe -m vedai download
.\.venv\Scripts\python.exe -m vedai process
.\.venv\Scripts\python.exe -m vedai index
.\.venv\Scripts\python.exe -m vedai terms-index
.\.venv\Scripts\python.exe -m vedai passages-index
.\.venv\Scripts\python.exe -m vedai verify
.\.venv\Scripts\python.exe -m vedai serve --port 8765
```

On Linux/macOS use `.venv/bin/python`. Generated data and credentials stay local. Copy `.env.example` to **`.env`** in this directory for the three supported OpenRouter settings; the other platform apps' `.env.local` convention does not apply here. Default expanded retrieval does not need a model key or Ollama. Configure optional generation and deployment using the original README and `docs/DEPLOYMENT.md`.

From the monorepo root, `npm run setup:rag`, `npm run dev:rag` and `npm run verify:rag` are convenience commands using `python` from the current environment. Activate the intended Python environment first. No npm dependencies or frontend compilation are needed for this Python application.

The original app README and reports retain their upstream links and historical deployment identifiers. The current import source and date are documented in [`../../docs/platform/RAG_IMPORT.md`](../../docs/platform/RAG_IMPORT.md). The five handover documents and ZIP are in [`../../docs/rag-system/`](../../docs/rag-system/README.md).

No user accounts or production data are shared with the other four applications by this import. Review access, provider credentials and deployment separately. The active monorepo CI workflow is `.github/workflows/vaidya-ai-tests.yml` at repository root.
