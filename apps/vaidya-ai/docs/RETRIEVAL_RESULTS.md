# Retrieval experiment: local prototype

All 26,585 corpus chunks were indexed with EmbeddingGemma, using the model's query/document prefixes, 768-dimensional normalized embeddings, and exact cosine search. Model digest, input hash and build duration are in `reports/embedding-index.json`. The full build completed in approximately 18 minutes on the local machine; completed batches are reusable.

These measurements predate AI query enhancement and the later avagraha normalization update. They describe the earlier retrieval baseline, not the current end-to-end answer pipeline.

## Draft natural-question results

| Query language | Cases | Original lexical recall@10 | Semantic recall@10 | Expanded vocabulary recall@10 | Hybrid recall@10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| English | 12 | 0.0% | 0.0% | 75.0% | 25.0% |
| Hindi | 12 | 0.0% | 0.0% | 83.3% | 25.0% |
| Romanized Sanskrit | 12 | 50.0% | 16.7% | 91.7% | 66.7% |
| Devanagari Sanskrit | 12 | 0.0% | 8.3% | 91.7% | 66.7% |
| All natural questions | 48 | 12.5% | 6.25% | 85.4% | 45.8% |

The expanded vocabulary method also retrieved all 15 exact-quote smoke targets at rank 1. Those smoke results are separate from the natural-question results.

## Decision

Use `expanded` retrieval as the current default. It transliterates Devanagari into IAST for a derived search field, removes Latin diacritics and editorial hyphens, expands English/Hindi query terms with a draft Ayurveda vocabulary, and uses SQLite trigram BM25 to match Sanskrit compounds. Original evidence text is preserved unchanged.

Keep `semantic` and `hybrid` available as experimental modes. The model's multilingual training did not translate into good retrieval on this Sanskrit sample. Adding its candidate ranking reduced the expanded method's measured performance, so it is not the default. No second embedding model has been benchmarked yet.

## Limits of the evidence

- The 68-case dataset is Codex-authored and has no expert review. Its 48 natural questions cover three core works, not all 15 works.
- Language variants share questions and nearby source passages; they are not 48 independent concepts.
- Work filters are supplied. These scores do not measure unfiltered discovery.
- The vocabulary was added after inspecting initial results and is relevant to these topics. The reported validation split is a development check, not independent held-out evidence. New expert-authored questions are required before claiming generalization.
- Relevance judgments list expected passages, not every potentially valid source. Recall@10 is not answer accuracy, faithfulness, translation quality, or clinical validity.
- Dense retrieval always returns candidates, including for unanswerable questions. Vocabulary search returned candidates for two of five unanswerable prompts. Neither behavior establishes generated-answer abstention.
- GPT Luna via OpenRouter passed four live integration checks after this retrieval experiment (see `reports/live-answer-checks.json`). Contract tests also check schema, quotation integrity, fallback labeling, and secret handling. Neither set measures expert-rated interpretation quality; the retrieval metrics above are unchanged and do not score the later full-verse evidence packing or AI query enhancement. The two new Hinglish/Hindi checks are in `reports/query-enhancement-checks.json`; they do not establish general retrieval accuracy.

Reports: `eval-lexical.json`, `eval-semantic.json`, `eval-expanded.json`, and `eval-hybrid.json` under `reports/`. `eval-hybrid-initial.json` preserves the earlier combination of the original lexical index and semantic search, before script normalization and vocabulary expansion.

References: [EmbeddingGemma prompt conventions](https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers) and [Indic transliteration library](https://github.com/indic-transliteration/indic_transliteration_py).
