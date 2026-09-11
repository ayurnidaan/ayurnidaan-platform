# Hindi clinical example implementation

The two user-supplied Hindi documents contain 20 draft reference examples. They define desired behavior, not validated medical protocols. `eval/clinical_cases.jsonl` preserves their questions, reference answers, provenance hashes and `physician_review_pending` status. The application never loads these answers as retrieval evidence. These are development regression cases, not a held-out accuracy benchmark.

## Answer behavior

`clinical-v1` adds eight question structures: textual search, substance, formulation, diet, disease, procedure, examination and patient case. Each generated section carries its own heading and evidence basis:

| Basis | Citation rule |
| --- | --- |
| Direct textual evidence | Must cite an indexed source |
| Interpretation of the text | Must cite its basis; remains an interpretation |
| General knowledge | No corpus citation; disabled by the general-knowledge preference |
| Modern clinical context | No corpus citation; explicitly not source-verified; disabled by that preference |
| Clinical priority | No borrowed Sanskrit citation; displayed first |
| Evidence gap or follow-up question | No invented reference |

Supported status means the textual portion has corpus citations; it does not certify the clinical context. Unavailable evidence can still produce a useful missing-information question or an urgent assessment priority. Patient-specific drug doses and procedural orders are not generated; textual principles and eligibility questions can still be discussed.

Patient findings distinguish reported present, explicitly absent and unknown. Present/absent findings must carry an exact substring from the submitted case; unknown findings carry no observation quote. This checks provenance, not whether the model interpreted the quote correctly. Missing examination findings must not become normal findings or an invented constitution/strength assessment.

The clinician-facing instructions cover the examples' distinctions: patient versus disease strength; diagnostic versus treatment evidence; fever timing versus dosha classification; formulation variants; subtype uncertainty; existing medicines; and modern diagnoses that are not one-to-one translations of classical categories. Urgent clinical priorities take precedence over textual discussion.

## Retrieval and sources

The query planner searches disease distinctions and treatment eligibility separately. The local glossary also recognizes the supplied Hindi terminology. `source_guides.json` adds navigation to relevant existing SARIT chapter/verse ranges. It resolves XML IDs against the indexed edition, includes adjacent whole source units and honors the user's work/layer/language/chapter filters. It never creates a missing verse. At most 24 guided units enter the 40-unit packet, leaving room for independent search. The reference-answer prose is never passed to the model.

The 19 initial guide ranges resolve in the pinned SARIT corpus; see `reports/source-guide-checks.json`. These locators were selected using the supplied examples, so their coverage is not independent evidence of retrieval quality. A retrieved passage still needs to support the model's claim.

Original Sanskrit, source IDs, books, chapters and locators remain copied from storage. Charaka's `level1`/`level2` section metadata now displays as book/chapter. Source cards show the pinned edition revision and available TEI page markers, or explicitly say printed-page mapping is unavailable. TEI page markers have not been checked against a printed edition. Translations remain AI renderings requiring review.

Madhavanidana is **not** among the 15 indexed Ayurveda works. Its references in the supplied examples must not be presented as verified corpus citations. Relevant passages from available works can be used with their own attribution; missing support must be reported. Modern guideline retrieval is also not implemented: modern context is labeled model knowledge, not verified contemporary evidence.

## Verification

```powershell
python -m unittest discover -s tests -v
python tests/live_clinical.py --output reports/clinical-retrieval-checks.json
python tests/browser_smoke.py --url http://127.0.0.1:8766
# Explicitly paid generation; questions only, no reference answers in the prompt:
python tests/live_clinical.py --live --ids deep-06 reference-01
```

The live harness checks completion, question type, priority placement in the four designated urgent cases, case findings, translations and exact stored source text/locators. Its pass flag is mechanical; it does not grade entailment, diagnostic correctness, source interpretation or treatment safety. Full model outputs stay in ignored runtime files. The supplied examples require physician/source review before becoming a clinical gold standard.

The [verification summary](../reports/clinical-summary.json) records the latest checks for all 20 cases across development iterations. All latest mechanical checks pass; 49 local unit tests and eight browser viewport sizes also pass. The Sama/Nirama question includes a shodhana-eligibility question, so either disease or procedure structure is accepted; the initial single-type mismatch is retained in the earlier report. A rerun also verified that the direct answer precedes general procedural cautions.

The [hosted check](../reports/clinical-hosted-checks.json) verifies a public Hindi bleeding-case reading with priority first, 11 case findings and five translated source passages. Source navigation now uses an auxiliary SQLite index on work/XML locator; a subsequent hosted retrieval replay returned 40 exact stored passages in 2.738 seconds without a model call. This is an observed development run, not a latency guarantee.

Safety-priority design was cross-checked against [NHS vomiting blood](https://www.nhs.uk/symptoms/vomiting-blood/), [sciatica emergency symptoms](https://www.nhs.uk/conditions/sciatica/), [sudden confusion](https://www.nhs.uk/symptoms/confusion/) and [septic arthritis](https://www.nhs.uk/conditions/septic-arthritis/). Structured response design follows [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). These engineering references are not automatically supplied as citations to generated answers.
