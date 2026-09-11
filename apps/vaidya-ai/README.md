# VedAI

Explore the [SARIT Ayurveda corpus](https://github.com/sarit/SARIT-corpus) through natural-language retrieval, a local reading interface, and an OpenRouter answer-generation adapter with citation checks.

**Status:** all nine requested works plus six related works are processed. GPT 5.6 Sol (`openai/gpt-5.6-sol`) is connected through OpenRouter with medium reasoning. Corpus answers include checked quotations and complete source passages; questions unsupported by the corpus can receive clearly labeled general-knowledge answers without corpus citations. The app enhances prompts into focused subqueries and presents the search plan in a white-and-green glass reading interface. Retrieval judgments and Sanskrit interpretation still need expert review.

## Open the reading room

```powershell
python -m pip install ".[rag,test]"
python -m vedai terms-index
python -m vedai passages-index
python -m vedai serve --port 8765
```

Visit **http://127.0.0.1:8765**. The existing local corpus and lexical index are prerequisites; on a fresh clone, run the download/process/index commands below first. The default `expanded` retriever uses draft Ayurveda vocabulary, Devanagari-to-IAST normalization, and substring matching within Sanskrit compounds. It runs without Ollama or an API key. Generation uses OpenRouter only when configured.

The complete local vector index is also built. Vector modes remain experimental because they underperformed vocabulary retrieval on the draft evaluation. To reproduce or try them:

```powershell
ollama pull embeddinggemma
python -m vedai embed
python -m vedai serve --port 8765 --mode hybrid
```

Ollama must be running for embedding and semantic/hybrid queries. EmbeddingGemma is a 622 MB local model. The embedding profile currently supports this model family only.

The embedding build is resumable: completed batches are cached in SQLite. Re-running `embed` with the same corpus, model digest, and prompt version skips completed chunks. Truncation is disabled, so an overlong passage fails explicitly. Changing the source corpus or embedding model requires rebuilding the vector index.

The reading room fits the viewport as a compact white-and-green glass desk. On desktop, the question controls sit beside independently scrolling answer and source panels. Smaller screens switch between Answer and Original passages; citation buttons open the source view and bring the cited passage into view. Search preferences open in a compact popover, and search topics expand beside the reading. Keyboard focus highlights the entire composer without drawing lines across the text. You can copy original Sanskrit, start a new question, and reopen readings from the session menu. The transparent green clay illustration and its generation prompt are documented in [design assets](docs/DESIGN_ASSETS.md).

## Sessions and follow-ups

Use **Sessions** to create, switch, rename or delete separate conversations. Each question saves its full answer, original Sanskrit (including Devanagari), translations, source locators, search plan and preferences. Expand an answer preview in the chat history or open its complete reading. Reloading restores the selected session. **New question** stays in the current session; **New session** starts with no earlier context.

History uses IndexedDB in the current browser profile and origin, with no account or server-side history listing. Anyone using that browser profile can read it; other visitors cannot browse it through the public app. Clearing browser data deletes it, private browsing may discard it, and a changed temporary Cloudflare hostname has separate storage. Storage failures display a warning and keep sessions in memory for the open tab only.

Follow-ups send the latest four completed questions and bounded answer summaries (up to 2,000 characters each) from the selected session to the planner and answer model. Older readings remain available in history but are outside model context. Prior assistant text is unverified context; citations are checked against newly retrieved evidence, and case observations must quote a current or prior user question. When planning is unavailable, local search uses the current question only. Interrupted asynchronous requests can resume waiting through their saved job ID without submitting another paid query, while the server retains the job (up to 15 minutes, or until restart/eviction).

## Sanskrit and translations

Shlokas and other Sanskrit source passages display in Devanagari first, with a dedicated copy button. IAST editions are converted deterministically using the existing transliteration library, without a model call; native Devanagari is preserved verbatim. Expand “Indexed Sanskrit · Latin / IAST” to inspect the unchanged source text. This script conversion is separate from the AI translation and does not change source IDs, verse references or match scores.

The [Hindi clinical example implementation](docs/CLINICAL_CASES.md) adds separate sections for direct textual evidence, interpretation, modern context, clinical priorities, evidence gaps and follow-up questions. Patient findings distinguish present, absent and unknown information. Source-navigation guides retrieve adjacent passages for the supplied topics; clinical context cannot borrow a Sanskrit citation. The 20 imported examples remain review-pending regression cases, not corpus evidence or a validated clinical benchmark.

Each cited source card shows its original Sanskrit followed by an AI translation in the selected answer language (English or Hindi; Sanskrit mode provides a simpler Sanskrit explanation). The source reader also displays the translation beside the same stored book, chapter, and verse metadata. Translations are generated in the answer call, with one entry per cited source ID. Unknown, duplicate, missing, and uncited translation references fail validation. If a source cannot be reliably translated, its translation is explicitly unavailable.

Only original Sanskrit and source locators are checked against the corpus. AI translations are not published translations and have not been independently reviewed for accuracy or completeness. Retrieval-only searches and unavailable generation show original text with a translation-unavailable message. General-knowledge answers have no corpus translations or citations.

## Query enhancement

A configured request uses GPT 5.6 Sol twice: first to understand the question, then to generate the cited answer and per-source translations. Both calls use medium reasoning. The planner produces up to four topics with up to six search terms each. It handles colloquial Hinglish such as `sar dard and pet kharab lag raha h patli tatti aa rahi h` as separate head-pain and digestive/loose-stool searches. These are tentative search interpretations, not diagnoses.

Each topic is searched independently with the selected work, language, text-layer, and chapter filters. With no layer filter, the app includes base-text candidates alongside commentary candidates. It also searches the **original question**, so a poor rewrite cannot discard direct evidence. Whole source units are interleaved across searches and deduplicated into a maximum 40-passage, 24,000-character evidence packet. No verse text or reference locator is generated by the planner.

The UI shows each topic, its terms, retrieval counts, and cited-passage counts. Source cards display the book title, book/sthana number, chapter, verse/source locator, full Sanskrit verse group, and query-term match. The match denominator uses the unique terms in the search plan; it is not a confidence probability. The original-question search may contribute passages independently of the enhanced searches.

`generate: false` disables both hosted calls. An unavailable or invalid planner falls back to the local vocabulary without an automatic paid retry. `enhance: false` (or CLI `--no-enhance`) uses local planning while keeping hosted answer generation. Answers containing invalid source IDs or malformed claims remain withheld. The model selects source IDs; the app resolves them to stored Sanskrit directly, so generation cannot introduce spelling changes into the displayed source. General-knowledge fallback remains separately labeled and uncited.

## OpenRouter configuration

Copy `.env.example` to `.env` in the repository root and fill in `OPENROUTER_API_KEY`. The server and CLI load these settings automatically:

```dotenv
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=openai/gpt-5.6-sol
OPENROUTER_REASONING_EFFORT=medium
```

Process environment variables take precedence over `.env`. Restart the server after changing settings. Credentials remain server-side, and `.env` is ignored by Git. There is no automatic paid retry. Alternative models must support strict JSON-schema output.

Every corpus-backed claim must select an evidence ID from the retrieved packet. The app attaches its exact stored source text as the evidence quotation; the model does not generate the Sanskrit quotation. Invalid answers are withheld; retrieved passages remain visible. These checks establish source identity and quotation integrity, **not correctness of the Sanskrit interpretation**.

When the retrieved passages do not support an answer, GPT 5.6 Sol may answer from general knowledge. These answers are explicitly labeled and carry no book, verse citation, or match percentage. Disable the general-knowledge option under Search preferences, send `allow_general_knowledge: false`, or use `ask --corpus-only` to require corpus evidence. Unknown questions may still receive an insufficient-evidence response.

Source cards show the book, available verse identifier, full shloka, commentary identity, and XML locators. Split verse halves are joined within the same source section and layer, including numbered Ashtanga Sangraha paragraph pairs. If one XML verse group contains several printed numbers, all those numbers are shown; the app preserves the edition's grouping. Prose is labeled as prose; missing verse numbers are never invented. **Query-term match** is `100 ? matched unique expanded search terms / all unique expanded search terms`, after script, diacritic, editorial-hyphen, and avagraha normalization. It measures term coverage, not semantic similarity, answer confidence, or factual accuracy.

```powershell
python -m vedai ask "What are the three doshas?" --work astangahrdayasamhita --retrieval-only
python -m vedai evaluate --mode lexical
python -m vedai evaluate --mode expanded
python -m vedai evaluate --mode semantic
python -m vedai evaluate --mode hybrid
```

See [the draft evaluation set](eval/README.md) for metric definitions and limitations. Do not combine exact-quote smoke scores with natural-question scores.

## Corpus snapshot

Pinned upstream revision: `1eac9ee0b055c8d11147edac4a75c76008ccc363`.

- Complete archive: 110 files, including 88 XML files; about 32 MiB compressed and 171 MiB extracted.
- Selected Ayurveda and rasaśāstra works: **15**.
- Extracted segments, including headings and nonempty notes: **145,600**.
- Retrieval chunks, excluding headings and notes: **26,585**.
- Complete source units for citation display: **111,195** (verse, prose, and commentary).

These counts describe the pinned repository snapshot. The ZIP includes the corpus and repository files; upstream tooling submodules are not bundled in GitHub archives and are not needed for ingestion. Individual editions may have gaps or incomplete coverage.

## Included works

| Requested work | Upstream file |
| --- | --- |
| Charaka Samhita | `carakasamhita.xml` |
| Sushruta Samhita | `susrutasamhita.xml` |
| Ashtanga Hridaya | `astangahrdayasamhita.xml` |
| Ashtanga Sangraha | `astangasangraha.xml` |
| Bhela Samhita | `bhelasamhita.xml` |
| Chakradatta | `cakradatta.xml` |
| Chakrapani's Ayurvedadipika | `cakrapanidatta-ayurvedadipika.xml` |
| Arunadatta's Sarvangasundara | `arunadatta-sarvangasundara.xml` |
| Rasa Ratna Samuccaya with commentaries | `vagbhata-rasaratnasamuccaya-comms.xml` |

Also processed: Ayurvedasutram, Siddhayoga, Ugraditya's Kalyanakaraka, Rasahrdayatantra, Rasaratnakara's Rasayanakhanda, and Rasarnava. Selection is defined in [config/ayurveda.json](config/ayurveda.json). The Arunadatta file includes the base text and Ayurvedarasayana as well as Sarvangasundara; typed layers remain labeled separately.

## Run locally

Python 3.10+ with SQLite FTS5 support. Corpus processing and the original keyword baseline require no third-party packages or API keys. The app and vector retrieval use the optional `rag` dependencies. Run from the repository root:

```powershell
python -m vedai download
python -m vedai process
python -m vedai index
python -m vedai verify
python -m vedai search "vata pitta" --work carakasamhita --limit 3
python -m vedai search "पित्त" --work cakradatta --limit 3
python -m unittest discover -s tests -v
```

The downloader pins the upstream commit, validates the ZIP, extracts every archive member, and records file hashes. Running the commands again rebuilds derived artifacts. To choose a different local data directory, put `--data PATH` before the subcommand.

The `search` command remains the original SQLite FTS5 BM25 baseline with OR matching, Unicode-aware tokenization, and Latin diacritic normalization (`vāta` → `vata`). The reading room and `ask` command default to vocabulary-expanded BM25 over a script-normalized trigram index, which finds Sanskrit terms inside compounds. Experimental `hybrid` mode combines this ranking with EmbeddingGemma cosine search using reciprocal rank fusion. Results are deduplicated by normalized exact text. Work, text-layer, language, and section-number filters apply before candidate ranking. Very short or common queries can produce weak results.

Earlier draft natural-question recall@10 (48 cases, before AI enhancement and avagraha normalization): **12.5% original lexical**, **6.25% semantic**, **45.8% hybrid**, **85.4% vocabulary-expanded**. These are development results from a small, work-filtered, non-expert-reviewed dataset, not general accuracy or answer-quality scores. See [the retrieval report](docs/RETRIEVAL_RESULTS.md).

## Local artifacts

| Path | Contents |
| --- | --- |
| `data/raw/SARIT-corpus-<revision>.zip` | Full pinned archive |
| `data/raw/SARIT-corpus-<revision>/` | Complete extracted repository snapshot |
| `data/source_manifest.json` | Provenance and full file hash inventory |
| `data/processed/works/*.jsonl` | Extracted segments for each selected work |
| `data/processed/segments.jsonl` | Combined segments, headings, and notes |
| `data/processed/chunks.jsonl` | Citation-bearing retrieval chunks |
| `data/processed/headers/*.xml` | Original TEI header content, serialized as XML |
| `data/processed/works.json` | Titles, authors, languages, and availability metadata |
| `data/index/lexical.sqlite3` | Local search index |
| `data/index/terms.sqlite3` | Script-normalized trigram index for vocabulary retrieval |
| `data/index/passages.sqlite3` | Complete source units and segment-to-passage mappings |
| `data/index/passages.json` | Source hash and passage-index version |
| `data/index/vectors.sqlite3` | Cached local embedding vectors |
| `data/index/vectors.json` | Model digest, source hash, prompt version, and build completeness |
| `reports/` | Committed inventory, counts, and verification results |

Raw text, processed datasets, and indexes stay in the local `data/` directory, which Git ignores. The GitHub repository contains the pipeline, configuration, plan, tests, and reports; a fresh clone regenerates the datasets with the commands above.

## Extraction and citations

The parser preserves Sanskrit Unicode and inline text, prefers lemmas over variant readings, and records gaps explicitly. Notes are emitted separately; empty note markers remain in the raw XML. Each segment records its source file, XPath, available XML IDs and labels, section ancestry, language, commentary layer, and the most recently encountered page milestone. Missing language tags remain `und`.

Chunks contain at most 1,800 characters and stay inside their work, section, language, and commentary layer. Citations include segment offsets and pinned GitHub file URLs. XPath locators use the TEI namespace; the URLs open the source file, not a rendered verse viewer. Small chunks are expected when the source alternates between base text and commentaries.

The [passage integrity report](reports/passages-integrity.json) checks every complete source unit against its original extracted segments and locators.

Processing checks that all normalized body text under the documented extraction policy survives. `verify` checks every downloaded file hash, unique IDs, all chunk-to-segment offsets, complete retrieval-text coverage, and search index IDs. Unit tests cover mixed XML content, standalone quotations, notes, chunk boundaries, archive traversal rejection, and Romanized/Devanagari search.

## Source attribution

The corpus is provided by [SARIT](https://github.com/sarit/SARIT-corpus), with authors, editors, transcribers, and availability statements in each TEI header. Per-work notices and license links are retained in the processed metadata and [corpus report](reports/corpus-summary.json). This project does not replace or relicense those notices.

See [docs/RAG_PLAN.md](docs/RAG_PLAN.md) for the implementation milestones, evaluation gates, proposed API, and multilingual retrieval design.

## API and operational scope

- `GET /health`: index status and whether answer generation is configured; no credentials.
- `GET /works`: available works and source metadata.
- `POST /ask` with `Prefer: respond-async`: returns HTTP 202 and a job ID; `GET /jobs/{id}` polls the completed reading.
- `POST /ask`: `{ "question": "...", "answer_language": "en", "filters": { "work": "carakasamhita", "kind": "base-text" }, "generate": false }`.
- `GET /sources/{chunk_id}`: full source chunk and passage references.
- `GET /passages/{passage_id}`: complete cited source unit with book, verse, Sanskrit, and original XML locators.

API filters also support `language` and `chapter`; `chapter` matches a section `n` value in the ancestry, so it can match a part or chapter depending on the edition. Citations refer to original source files and section/verse locators. The in-app source reader displays the complete cited verse or prose unit. Generation resolves retrieval chunks to these source units before assembling the model evidence packet; oversized units are omitted rather than truncated.

This is a single-query reading prototype, also hosted on a dedicated GCP VM behind a public Cloudflare Tunnel. See [deployment and access](docs/DEPLOYMENT.md). The server binds to `127.0.0.1`; browser requests and model responses are not logged by the app. Session history lives only in browser memory. “Stop waiting” cancels the browser wait, not an already-running provider request. The hosted browser uses background jobs and polling for long readings. Streaming, durable chat history, Sanskrit expert review, a second embedding-model benchmark, and translated indexes remain future work. The vocabulary is a draft search aid, not an authoritative translation dictionary.

Optional browser check against a running server: install Playwright and its Chromium browser, then run `python tests/browser_smoke.py`. It disables hosted generation for its requests and saves screenshots under `data/runtime/browser/`.

Run `python tests/browser_sessions.py --url http://127.0.0.1:8765` for session CRUD, reload persistence, context bounds and isolation, interrupted-job recovery, multi-tab updates, mobile containment and unavailable-storage checks. Its query responses are browser fixtures, so it never calls the paid model.

Explicit paid integration checks: `python tests/live_enhancement.py` covers Hinglish and Hindi symptom searches; see [the enhancement report](reports/query-enhancement-checks.json). Run checks sequentially because the server handles one query at a time. The earlier four-case check is `python tests/live_answers.py` against a configured running server. The committed [live-check report](reports/live-answer-checks.json) covers two corpus answers, a general-knowledge answer, and an unknowable question. These are development smoke checks, not an expert faithfulness benchmark.

Implementation references: [Ollama embeddings](https://docs.ollama.com/capabilities/embeddings), [EmbeddingGemma retrieval prompts](https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers), [OpenRouter API](https://openrouter.ai/docs/quickstart), and [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

The Sol/medium translation integration check is `python tests/live_translations.py` (explicit paid requests). It covers an English Hinglish-symptom reading, a Hindi Charaka definition, and uncited general knowledge; results are recorded in [the translation checks](reports/translation-checks.json). Model configuration was checked against [official OpenAI documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol) and the OpenRouter model catalog.
