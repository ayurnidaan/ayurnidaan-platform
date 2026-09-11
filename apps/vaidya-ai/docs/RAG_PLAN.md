# VedAI RAG implementation plan

## Goal and current boundary

Accept natural-language questions, retrieve relevant SARIT Ayurveda passages, and produce answers with verifiable citations. Initial prompt languages: English, Hindi, Romanized Sanskrit, and Devanagari Sanskrit. These are target capabilities to evaluate, not capabilities of the current keyword baseline.

Implemented: complete pinned corpus download, source inventories, structured extraction, SQLite BM25, script-normalized vocabulary retrieval, resumable local EmbeddingGemma vectors, experimental hybrid retrieval, a draft evaluation set, a reading interface and API, and an OpenRouter adapter with citation checks. Vocabulary retrieval is the current default based on the draft evaluation results. OpenRouter now uses GPT 5.6 Sol (`openai/gpt-5.6-sol`) with medium reasoning for planning and answers. Per-source AI translations accompany the original Sanskrit; source IDs are checked, while translation accuracy still needs expert review. See `reports/translation-checks.json` for the Sol integration checks; earlier Luna reports remain historical baselines. The white-and-green glass UI displays focused AI-enhanced subqueries, full source units, book/chapter/verse locators, and query-term match percentages. Up to four subqueries and the original question feed a diverse evidence packet; local vocabulary is the planner fallback. Expert answer-quality validation remains pending. Local retrieval requires no paid inference service.

This is an experimental prototype: expert review gates below remain open. Implementing an API or interface does not mean retrieval or interpretation has passed those gates. See the README and `reports/eval-*.json` for current capabilities and measured draft results.

## Data foundation

- Keep the complete original XML archive and extracted files under `data/raw/`.
- Preserve original TEI headers and availability notices, source revision, file hashes, work titles, source language tags, XPath locators, XML IDs, labels, page milestones, section ancestry, and commentary identity.
- Use the canonical root XML files once. Do not also ingest the corpus aggregator or generated/transliterated copies as independent evidence.
- Emit prose and verse without nested duplication. Store notes separately. Retain typed quotations as annotations on their containing segment.
- Preserve gaps as `[gap]`. Select TEI lemma over variant readings and corrected/regularized text for `choice`; original variants remain in the raw XML.
- Build chunks of at most 1,800 characters without crossing work, section, commentary layer, or language boundaries. Store offsets back to source segments. This is a character budget, not a token budget; add the chosen embedding tokenizer before embedding.
- Keep original Sanskrit as the evidence. Search normalization removes Latin diacritics, preserving Devanagari marks. Transliteration and translation should become separate derived fields.

The Arunadatta file also includes the base text and Ayurvedarasayana. The Rasa Ratna Samuccaya file includes multiple commentaries. Retain these labels in retrieval and answers. A file's presence does not establish that its edition covers every chapter of a work. Missing source language tags are recorded as `und`; inspect these before automatic translation. The first selection is explicit and curated, not a claim that every medically relevant passage in the full SARIT corpus has been classified.

## Phase 1: validate the evidence corpus

1. Review source coverage, retained annotations, chapter boundaries, and available verse identifiers across all selected works, including incomplete or damaged passages.
2. Create 60–100 expert-reviewed question/passage pairs across works, scripts, base texts, and commentaries. Include unanswerable questions and questions requiring multiple passages. Separate development and held-out evaluation sets.
3. Measure the current lexical baseline: recall@10, MRR, coverage by language, and citation resolution. Use these measurements to decide the next retrieval approach.
4. Audit per-work availability metadata when adding derivative translations or distributing derived datasets. Source notices are carried forward automatically.

Acceptance: every chunk resolves to its source segment and pinned XML; no silent parse failures; no duplicated nested body blocks; evaluation data has a recorded reviewer and expected evidence.

## Phase 2: multilingual hybrid retrieval

1. Add a reviewed Ayurveda vocabulary mapping English/Hindi concepts to Sanskrit terms and common transliterations. Keep literal user text alongside expanded terms.
2. Benchmark candidate multilingual embedding models on the held-out Sanskrit tasks. Do not assume a multilingual label implies good Sanskrit retrieval. Compare original Sanskrit embeddings with a separately labeled translation-assisted index.
3. Cache embeddings by chunk text hash, model identifier/version, and normalization version. Batch requests with retries and an explicit cost estimate before a corpus-wide hosted run.
4. For the local prototype, persist vectors beside the SQLite lexical index. Select the vector storage engine after model dimension, corpus size, and deployment requirements are known.
5. Retrieve lexical and vector candidates, merge ranks with reciprocal rank fusion, rerank a bounded candidate set, and expand selected hits to neighboring passages within the same chapter and layer.
6. Filter by work, chapter, language, and commentary. Group duplicated base-text quotations so they do not crowd out independent evidence.

Acceptance: improve held-out recall@10 over the lexical baseline overall, with separately reported English, Hindi, Romanized Sanskrit, and Devanagari results. Set latency and cost budgets using measured local results.

## Phase 3: grounded answer generation

1. Assemble a bounded evidence packet with Sanskrit text, section references, commentary names, and stable citation IDs.
2. Ask the selected language model to answer from the packet when supported; otherwise allow a separately labeled general-knowledge answer when enabled by the user. Treat retrieved text as source material, not instructions. Separate translation, textual interpretation, and quotations.
3. Require corpus claims to select retrieved citation IDs; attach exact Sanskrit quotations directly from indexed source units. General-knowledge answers must carry no corpus citations or invented reference locators; use insufficient evidence when neither source can answer reliably. Validate cited IDs server-side and reject references outside the retrieved packet.
4. Show disagreements between sources with separate citations. Do not present a generated English rendering as an established published translation.
5. Frame medical passages as historical textual evidence. Questions asking for personal treatment should not turn historical regimens into individualized prescribing.

Acceptance: manually score faithfulness, citation correctness, translation quality, and abstention on held-out questions. Require 100% mechanically resolvable citation IDs; report expert quality scores before calling the system ready.

## Phase 4: application

Build an API and a simple chat interface once retrieval and grounding meet the evaluation gates.

Proposed API:

```json
POST /ask
{
  "question": "What does Charaka say about the purpose of Ayurveda?",
  "answer_language": "en",
  "filters": {"works": ["carakasamhita"]}
}
```

```json
{
  "answer": "...",
  "evidence_status": "supported",
  "citations": [
    {
      "chunk_id": "...",
      "work": "carakasamhita",
      "section": "...",
      "xml_ids": ["..."],
      "source_url": "https://github.com/sarit/SARIT-corpus/blob/<revision>/carakasamhita.xml",
      "xpath": "...",
      "sanskrit": "...",
      "translation": "..."
    }
  ]
}
```

The examples above describe the target interface. The implemented endpoint uses a singular `filters.work` and returns `claims`, `citations`, `evidence_status`, and `generation_status`; see the README and `/openapi.json` for its current request schema. GitHub URLs open the source file, while the implemented in-app source reader displays the complete cited source unit and its XML locators.

The interface should show the answer, expandable original passages, translation labels, and filters. Add cancellation, streaming, retrieval feedback, and timing. Keep credentials server-side and private user prompts out of default logs.

## Delivery order

| Milestone | Deliverable | Exit criterion |
| --- | --- | --- |
| Foundation — implemented | Downloader, extractor, chunks, lexical index, reports | All selected files process and integrity tests pass |
| Retrieval evaluation | Reviewed questions and baseline report | Evidence and metrics reviewed |
| Multilingual retrieval | Hybrid retriever and model comparison | Held-out improvement demonstrated |
| Grounded answers | Citation-validated `/ask` backend | Faithfulness and abstention reviewed |
| Product | Chat and source viewer | End-to-end acceptance tests pass |

Next validation tasks: have a Sanskrit/Ayurveda expert review the draft judgments and vocabulary, broaden natural-language questions beyond three core works, compare a second embedding model, and evaluate GPT 5.6 Sol translation and answer faithfulness and abstention beyond the development smoke checks, including the new Hinglish/Hindi multi-topic cases. Translation-assisted retrieval, reranking, neighbor expansion, and streaming remain planned.
