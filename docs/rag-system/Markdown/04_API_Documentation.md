# API Documentation

## 1. Document control and integration scope

| Control | Value |
|---|---|
| Document ID / version | VAI-HO-04 / 1.0 — implementation-based handover draft |
| Prepared / application | 11 November 2026 / Vaidya AI 0.7.0 |
| Source commit | `73beef60490f97bfbd2902db152ff99a6484456d` |
| Audience | API consumers, frontend developers, QA and maintainers |
| Authority | `vedai/server.py`, `vedai/answers.py`, `vedai/query_planner.py`, `vedai/passages.py` |
| Verification | Real local requests with the complete rebuilt corpus; no paid model calls |

This reference describes the implemented same-origin JSON API. There is no `/api` prefix and no URL-based version prefix. The CLI defaults to port 8000; examples in this package explicitly start it on 8765. Use `http://127.0.0.1:8765` as the local base URL. Obtain a hosted URL from the operator; a committed Quick Tunnel address is historical and may change.

The package includes `Reference/openapi.generated.json`, exported directly from FastAPI, and `Reference/openapi.handover.json`, which adds explanatory response models and optional authentication metadata for integrators. Response annotations in the enriched file describe observed/source-derived behavior; the application itself does not declare response models for these routes. Runtime request validation remains authoritative.

## 2. Transport, authentication and common behavior

Requests and responses use UTF-8 JSON unless a route serves HTML, static files, or a framework-level plain-text error. Send `Content-Type: application/json` on `/ask`. All route paths below are relative to the selected base URL. There are no pagination parameters, server-history routes, upload routes, cancellation routes, or streaming endpoints.

### 2.1 Optional HTTP Basic authentication

Authentication is disabled when `VEDAI_ACCESS_PASSWORD` is empty. A nonempty password enables HTTP Basic for all routes, including the UI, static assets, health checks, jobs and OpenAPI. The username defaults to `vedai` and can be changed with `VEDAI_ACCESS_USER`. Setting `VEDAI_REQUIRE_AUTH=1` without a password prevents application startup; it does not create a separate login endpoint.

```http
Authorization: Basic <base64-of-username:password>
```

Use HTTPS for remote authenticated access. An authentication failure returns HTTP 401:

```json
{"detail":"Sign in to Vaidya AI"}
```

The response includes `WWW-Authenticate: Basic realm="Vaidya AI", charset="UTF-8"`. The OpenRouter Bearer credential is a separate server-side setting. Clients must not send an OpenRouter API key to the browser application or treat it as this API's authentication token.

### 2.2 Host policy, headers and cross-origin clients

Built-in accepted Host names are `localhost`, `127.0.0.1`, `[::1]` and `testserver`. `VEDAI_ALLOWED_HOSTS` is a comma-separated extension list. An unaccepted Host returns HTTP 400, commonly plain text `Invalid host header`. No CORS middleware is configured. Browser integrations should use the same origin or an operator-approved proxy configuration.

Application middleware sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive Content Security Policy. `connect-src 'self'` matches the same-origin frontend. Proxy or infrastructure responses may have different headers and error formats.

### 2.3 Concurrency and retry policy

Only one `/ask` pipeline runs at a time per application process, shared by synchronous and asynchronous requests. Busy requests receive HTTP 429; no queue or `Retry-After` header is implemented for that error. Back off and retry later, or ask the user to wait. A successful async acceptance has `Retry-After: 2`; the shipped UI polls approximately every 1.5 seconds.

No idempotency key is implemented. Retrying a timed-out or interrupted POST can create a second paid request after the original finishes. If a job ID was received, poll that ID rather than repeating the POST. The client cannot cancel server/provider work by disconnecting.

## 3. Endpoint catalog

| Method | Route | Success | Purpose |
|---|---|---|---|
| GET | `/` | 200 HTML | Reading-room frontend |
| GET | `/static/{path}` | 200 file | CSS, JavaScript and artwork |
| GET | `/health` | 200 JSON | Artifact readiness and generation configuration |
| GET | `/works` | 200 array | Collection catalog and source metadata |
| POST | `/ask` | 200 JSON or 202 JSON | Retrieve and optionally generate a reading |
| GET | `/jobs/{identity}` | 200 JSON | Poll an accepted asynchronous reading |
| GET | `/sources/{chunk_id}` | 200 JSON | Original indexed retrieval chunk |
| GET | `/passages/{passage_id}` | 200 JSON | Complete source unit with display-script metadata |
| GET | `/openapi.json` | 200 JSON | Automatically generated schema |

`/docs` and `/redoc` are disabled. Unsupported HTTP methods normally receive 405 from the framework. There is no `DELETE /jobs/{id}` or `/sessions` API.

## 4. GET /health

**Purpose:** return configuration and file-level readiness without disclosing credentials. No request body or query parameters are defined.

```json
{
  "status": "ready",
  "retrieval": "expanded",
  "answer_contract": "clinical-v1",
  "embedding_model": null,
  "indexed_chunks": null,
  "generation_configured": false,
  "generation_provider": "openrouter",
  "generation_model": null,
  "reasoning_effort": null
}
```

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `ready` or `indexing_required` |
| `retrieval` | string | Server-selected `lexical`, `expanded`, `semantic` or `hybrid` |
| `answer_contract` | string | Current output-contract marker, `clinical-v1` |
| `embedding_model` | string/null | Model from vector manifest, when present |
| `indexed_chunks` | integer/null | Vector-manifest chunk count; **not** lexical or passage count |
| `generation_configured` | boolean | Key and model settings are nonempty; no provider connectivity probe |
| `generation_provider` | string | `openrouter` |
| `generation_model` | string/null | Configured model when generation is enabled |
| `reasoning_effort` | string/null | Configured reasoning level when enabled |

Readiness checks existence of lexical/passage artifacts, `terms.json` for expanded/hybrid, and vector completeness for semantic/hybrid. It does not run an actual query or verify every database/hash. The HTTP status remains 200 for `indexing_required`. Parse the body in monitoring; follow it with a retrieval-only smoke request after deployment. `Reference/health.json` contains the actual handover response.

## 5. GET /works

Returns an unpaginated array derived from `data/processed/works.json`:

```json
[
  {
    "id": "carakasamhita",
    "title": "Charaka Samhita",
    "segments": 0,
    "source_url": "https://github.com/sarit/SARIT-corpus/blob/<revision>/carakasamhita.xml",
    "languages": {"sa-Latn": 0},
    "license_urls": []
  }
]
```

The shape above is illustrative: zero counts and placeholder revision are not measured values. Use `Reference/works.json` for the full, actual 15-work response and exact notices. `languages` is a map of source-language tags to segment counts, not an array. `license_urls` is an array of retained Creative Commons links; an empty array does not itself establish unrestricted use. `id` is the source filename stem and is the accepted work-filter value.

Missing processed metadata returns 503 with `detail: "Corpus is not processed. Run python -m vedai process."`. Catalog availability does not itself mean that search indexes are ready.

## 6. POST /ask — request contract

### 6.1 Complete request example

```json
{
  "question": "What are the three doshas in Ashtanga Hridaya?",
  "answer_language": "en",
  "filters": {
    "work": "astangahrdayasamhita",
    "kind": "base-text",
    "language": null,
    "chapter": null
  },
  "limit": 6,
  "generate": false,
  "allow_general_knowledge": false,
  "enhance": true,
  "conversation": []
}
```

| Field | Type / default | Validation and semantics |
|---|---|---|
| `question` | required string | 1–2,000 characters; whitespace-only rejected; no automatic truncation |
| `answer_language` | string, `en` | `en`, `hi`, or `sa`; controls generation/translation language, not source-language filtering |
| `filters` | object, `{}` | Optional filter fields below; all apply to retrieval |
| `limit` | integer, `6` | 1–10; retrieval breadth for each search, not final generated citation cap |
| `generate` | boolean, `true` | `false` prevents both hosted planning and hosted answer calls |
| `allow_general_knowledge` | boolean, `true` | Permits labeled uncited background if corpus support is insufficient; also controls mixed-answer background |
| `enhance` | boolean, `true` | `false` uses local planning while allowing generation if otherwise enabled |
| `conversation` | array, `[]` | At most four completed prior turns; schema below |

| Filter | Type / default | Meaning |
|---|---|---|
| `work` | string/null, null | Max 100 characters; nonempty value must be a `/works` ID |
| `kind` | string/null, null | `base-text`, `commentary`, or `unknown` |
| `language` | string/null, null | Max 20 characters; exact indexed source-language tag, e.g. `sa-Latn` |
| `chapter` | string/null, null | Max 30 characters; exact `n` value in **any** section ancestor |

The chapter filter can match a part/book number as well as a chapter, depending on edition structure. It is not a guaranteed edition-independent chapter locator. The browser exposes work, layer, answer language and general-knowledge preferences; source language, chapter, `generate`, `enhance` and `limit` are API/CLI controls rather than all being UI settings.

Each conversation item has `question` (required, 1–2,000 characters) and `answer` (optional string, default `""`, maximum 2,000 characters). Extra keys inside a conversation item are forbidden. The top-level request and filter models use Pydantic's default extra-key handling; integrators should omit unknown keys. Models are not strict-typed, so avoid relying on coercion of strings to numbers or booleans.

```json
{
  "question": "Explain the first one further.",
  "conversation": [
    {"question":"What are the three doshas?","answer":"A bounded summary from the previous reading."}
  ]
}
```

The server does not fetch conversation history. The client supplies it. Previous assistant summaries are unverified context; new citations must come from the current evidence packet. If hosted planning is unavailable, local search uses the current question and cannot provide equivalent conversational reference resolution.

### 6.2 Synchronous response envelope

Without `Prefer: respond-async`, `/ask` returns the final reading at HTTP 200 when the pipeline completes. Generation failure or withheld output can still be an HTTP 200 business result. Inspect `evidence_status` and `generation_status`.

| Field | Type | Availability / meaning |
|---|---|---|
| `question`, `answer_language` | strings | Echo current input |
| `citations` | array | Retrieved candidates or final cited source objects |
| `claims` | array | Structured validated claims; empty for retrieval-only/failure |
| `answer` | string/null | Rendered claim text with `[S1]` markers, or null |
| `evidence_status` | string | Evidence state described below |
| `generation_status` | string | Generation state described below |
| `generation_provider` | string | `openrouter` |
| `model`, `reasoning_effort` | string/null | Configured provider metadata |
| `query_plan` | object | Search topics, terms, coverage and optional fallback details |
| `timing` | object | `planning_seconds`, `retrieval_seconds`, `total_seconds` |
| `message` | string | Conditional provider/withholding message |
| `validation_error` | string | Conditional sanitized reason for rejection |
| `question_type`, `findings` | string / array | Present on validated generated output; absent on some fallback paths |
| `answer_source` | string | Generated result's `corpus`, `general_knowledge`, or `insufficient_evidence` |
| `citation_validation` | string | Human-readable validation scope on generated output |
| `fallback_used` | boolean | True for completed general-knowledge fallback |

Do not assume all fields appear on every branch. `Reference/ask-retrieval-response.json` is a complete actual source-bearing response. The following compact excerpt is schematic, with the source array omitted for readability:

```json
{
  "question": "What are the three doshas in Ashtanga Hridaya?",
  "answer_language": "en",
  "citations": [],
  "claims": [],
  "answer": null,
  "generation_provider": "openrouter",
  "model": null,
  "reasoning_effort": null,
  "evidence_status": "retrieved",
  "generation_status": "disabled",
  "query_plan": {"status":"local","queries":[]},
  "timing": {"planning_seconds":0.001,"retrieval_seconds":0.1,"total_seconds":0.2}
}
```

### 6.3 Evidence and generation states

| `evidence_status` | Interpretation |
|---|---|
| `retrieved` | Candidate sources returned; their presence does not establish an answer |
| `supported` | At least one validated textual/interpretive claim cites current stored evidence |
| `general_knowledge` | Completed uncited fallback, explicitly not corpus-verified |
| `insufficient_evidence` | No supported answer; may include labeled priorities, gaps or follow-up questions |

| `generation_status` | Trigger |
|---|---|
| `disabled` | Sources exist and `generate=false` |
| `not_configured` | Sources exist but provider key/model is absent |
| `not_needed` | No packet and generation is disabled or unconfigured |
| `error` | Provider call failed; retrieved sources remain when available |
| `rejected` | Structured output/citation/translation/findings checks failed |
| `complete` | Generated structured response passed implemented validation |

For `disabled`, `not_configured`, `error` and `rejected`, the server truncates returned candidate citations to the requested `limit`. A successful generated answer instead returns only sources actually cited and can exceed that limit, within the evidence-packet bound of 40 units. General-knowledge output has no corpus citation or translation claims.

## 7. Source, claim and query-plan schemas

### 7.1 Source/citation object

| Field | Type | Description |
|---|---|---|
| `citation_id` | string | Response-local label, e.g. `S1`; not a persistent lookup key |
| `passage_id` | string | Persistent 24-character lowercase hexadecimal source-unit ID |
| `chunk_id` | string/null | Originating retrieval chunk; source-navigation candidates can have null |
| `work`, `title` | strings | Canonical work ID and display title |
| `kind`, `layer`, `language` | strings | Source classification, commentary identity and indexed language |
| `sections` | array | Edition-specific ancestry objects |
| `form` | string | `shloka`, `prose`, or `commentary` |
| `verse_label` | string/null | Stored/inferred-from-stored-numbering label; may contain multiple numbers |
| `sanskrit` | string | Full original indexed source unit; unchanged citation text |
| `sanskrit_devanagari` | string/null | Original or deterministically transliterated display text |
| `devanagari_method` | string | `original`, `iast_transliteration`, or `unavailable` |
| `references` | array | Segment IDs, XML IDs, XPath, labels, page and offsets |
| `source_url` | string | Pinned SARIT XML file URL |
| `source_text_sha256` | string | Hash of exact stored source text |
| `search_topics` | array | Topics that contributed the passage to the packet |
| `retrieval_rank` | integer | Conditional chunk-derived candidate rank |
| `retrieval_method` | string | Conditional `source_navigation` marker |
| `match_percent` | number | Unique normalized term coverage, rounded to one decimal place |
| `matched_terms` | array | Terms present in normalized passage text |
| `query_term_count` | integer | Denominator for the coverage percentage |
| `match_label`, `match_method` | strings | Display name and explanation |
| `quote_verified` | boolean | Added to sources cited by validated generated output |
| `translation` | object | Added to sources cited by validated generated output |

`translation` has `text` (string/null), `language`, `model`, `status` (`generated` or `unavailable`) and `review_status` (`not_expert_reviewed`). Exactly one translation entry per distinct cited ID is required from generated output; null text is an explicitly unavailable rendering. Sanskrit answer mode supplies a simpler Sanskrit explanation. Retrieval-only source candidates have no generated translation object.

Sections contain `type`, `subtype`, `n`, `xml_id`, `xpath` and `heading`; some are nullable. References contain `segment_id`, `xml_ids` (array), `xpath`, `labels` (array), `page` (nullable), and zero-based half-open `start`/`end` offsets. Passage offsets refer to the member segment, not to a visual page or a byte position.

### 7.2 Claims and findings

Each validated generated claim contains `text`, `evidence`, and, under the active contract, `basis` and `heading`. Evidence items in the final API response have `citation_id` and `quote`. The application copies `quote` from the stored source; the model is asked only to select IDs.

| Claim `basis` | Corpus evidence allowed? | Meaning |
|---|---|---|
| `textual` | Required | What the supplied text directly states |
| `interpretation` | Required | An inference grounded in supplied source units |
| `general_knowledge` | Must be empty | Traditional/general background outside verified corpus evidence |
| `modern_context` | Must be empty | Modern comparison or context, not verified modern evidence |
| `clinical_priority` | Must be empty | Time-sensitive assessment priority |
| `evidence_gap` | Must be empty | Unavailable or unestablished information |
| `follow_up` | Must be empty | A focused question that could change interpretation |

The claim count is bounded at 16 and claim text at 2,000 characters; generated headings are bounded at 120 characters. Priorities are sorted before other claims after validation. Question types are `textual`, `substance`, `formulation`, `diet`, `disease`, `procedure`, `examination`, and `patient_case`.

Findings are limited to 20 and contain `text` (up to 500 characters), `state` (`present`, `absent`, `unknown`) and `question_quote` (string/null). Present/absent findings require an exact substring from the current or a prior user question. Unknown findings require null. This is structural/source anchoring, not diagnostic validation.

### 7.3 Query plan

The plan has `status` (`local`, `enhanced`, `local_fallback`), `queries`, and `note`. A query normally contains `id` (`Q1` etc.), `topic`, `terms`, `query`, `retrieved_chunks`, `source_passages`, `evidence_passages`, and `cited_passages`. Hosted plans have one to four searches and one to six validated terms per search; local glossary expansion can have a different term count. `used_conversation` appears on successful hosted enhancement. Optional fields include `fallback_reason`, `original_retrieved_chunks`, and `source_guides` (topic/passage-count entries).

Coverage counts answer different questions: retrieved chunks are ranking hits, source passages are resolved units, evidence passages entered the final packet, and cited passages are sources selected by completed supported output. None is a confidence score.

## 8. Asynchronous readings and GET /jobs/{identity}

Add the request header:

```http
Prefer: respond-async
```

An accepted POST returns HTTP 202:

```http
Location: /jobs/0123456789abcdef0123456789abcdef
Retry-After: 2
Content-Type: application/json
```

```json
{"job_id":"0123456789abcdef0123456789abcdef","status":"running"}
```

The ID above is illustrative; generated IDs are 32 lowercase hexadecimal characters from `secrets.token_hex(16)`. Use the returned `Location` rather than constructing one. Polling returns one of:

```json
{"status":"running"}
```

```json
{"status":"complete","result":{"question":"...","citations":[],"claims":[]}}
```

```json
{"status":"error","detail":"The search could not finish. Please try again."}
```

The completed `result` is the same reading envelope as synchronous `/ask`; the compact example omits its remaining fields. A job-level error is returned at HTTP 200 with `status=error`. Missing, evicted or expired IDs return HTTP 404 with `detail: "This reading has expired or the server restarted. Please search again."`. Examples of actual accepted/completed jobs are included in `Reference/async-accepted.json` and `Reference/async-completed.json`.

Jobs are in-memory and process-local. Nonrunning jobs older than 900 seconds **since creation** are eligible for removal. Cleanup and eviction run during submission/polling, with a target capacity around 20 entries; this is not a guaranteed 15-minute retention period after completion. Restart destroys all jobs. The endpoint does not list jobs and does not bind them to individual accounts; possession of an ID plus any configured shared Basic credential is the access boundary.

## 9. GET /sources/{chunk_id}

Returns the original JSON chunk payload stored in `lexical.sqlite3`, without generation, translation, match-score or Devanagari additions. The ID must match `[a-f0-9]{24}`. Response fields are `id`, `work`, `title`, `kind`, `layer`, `language`, `sections`, `source_url`, `text`, and `references`.

This route retrieves a search chunk, which may contain multiple source units or a portion of a longer unit. Use `/passages/{passage_id}` to obtain a complete citation-display unit. The source-reader dialog normally uses source data already returned by `/ask`; it does not need to call this route.

Errors: 404 `Passage not found` for malformed/missing IDs; 503 `Search index is missing` for an absent lexical database. See `Reference/source-response.json` for an actual full payload.

## 10. GET /passages/{passage_id}

Returns the complete stored verse/prose/commentary unit plus `sanskrit_devanagari` and `devanagari_method`. It does not return request-specific citation IDs, match scores, search-topic arrays, generated translations or `quote_verified` metadata.

The ID must match `[a-f0-9]{24}`. The passage store checks its version and processed-segment hash. Malformed/missing IDs return 404 `Passage not found`; missing or stale passage artifacts return 503 with a rebuild-related message. The recorded exact response is `Reference/passage-response.json`.

## 11. Errors and recovery

| HTTP status | Typical cause | Response and client action |
|---|---|---|
| 200, result failure state | Provider failure or rejected generated structure | Check generation/evidence statuses; display retained sources |
| 200, job `error` | Background pipeline failed | Read `detail`; only resubmit when appropriate |
| 202 | Accepted async ask | Persist job ID and poll returned Location |
| 400 | Host rejected | Often plain text; correct server host configuration |
| 401 | Missing/incorrect Basic credential | JSON `detail`; prompt for configured application credential |
| 404 | Unknown source, route or expired job | Verify ID; lost job requires a fresh ask |
| 405 | Unsupported method | Use documented method |
| 422 | Request/body validation, whitespace question, unknown work | Correct input; do not retry unchanged |
| 429 | Another ask is running | Wait/back off; there is no request queue |
| 503 | Missing/stale artifacts, model/retrieval initialization failure, job start failure | Operator fixes prerequisite/configuration |
| 500 | Unhandled exception or corrupt state outside handled cases | Operator inspects application logs; no stable error contract |

Pydantic validation errors have an array in `detail`; custom validation errors have a string. For example:

```json
{"detail":[{"type":"less_than_equal","loc":["body","limit"],"msg":"Input should be less than or equal to 10","input":11,"ctx":{"le":10}}]}
```

Exact framework wording/extra fields can vary with installed dependencies. Other explicit errors include `Please enter a question`, `Unknown work filter`, and `A query is already running. Please try again when it finishes.`. These are messages, not a separate numeric application-error-code system.

## 12. Integration examples

### 12.1 Retrieval-only request with curl

Create `request.json` with the complete request example above, then run:

```bash
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @request.json http://127.0.0.1:8765/ask
```

On Windows PowerShell use `curl.exe` and one line, or `Invoke-RestMethod`:

```powershell
$body = @{question='What are the three doshas?';generate=$false} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8765/ask' -Method Post -ContentType 'application/json' -Body $body
```

For Basic authentication, use curl's `--user USERNAME` so it prompts for a password, or use a credential object with the appropriate PowerShell version. Do not save real credentials into example files.

### 12.2 Python asynchronous client

```python
import time
import httpx

base = 'http://127.0.0.1:8765'
with httpx.Client(base_url=base, timeout=30) as client:
    response = client.post('/ask', headers={'Prefer':'respond-async'},
        json={'question':'What are the three doshas?', 'generate':False})
    response.raise_for_status()
    if response.status_code == 202:
        location = response.headers['Location']
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            poll = client.get(location)
            poll.raise_for_status()
            job = poll.json()
            if job['status'] == 'complete':
                result = job['result']
                break
            if job['status'] == 'error':
                raise RuntimeError(job['detail'])
            time.sleep(2)
        else:
            raise TimeoutError('Keep the saved job ID; do not blindly repeat POST')
    else:
        result = response.json()
    print(result['evidence_status'], result['generation_status'])
```

The client deadline is an example policy, not a server guarantee. Store `location` durably if resuming across client restarts matters. Configured generation can take multiple provider calls; the server has no end-to-end cancellation guarantee.

## 13. API verification and maintenance

Six repository API tests cover retrieval/source routes, validation, host/security headers, bounded conversation, Basic authentication, the asynchronous single-query gate, and missing jobs. They passed as part of the 57-test local suite. This handover additionally captured real full-corpus catalog, health, synchronous/async retrieval, source, passage and error payloads. Live OpenRouter output was not invoked; generated-output schemas above are derived from the implementation and unit tests.

When changing request models or answer branches, update this document, regenerate both OpenAPI artifacts, refresh actual examples, and check frontend handling of optional fields/statuses. Preserve the distinction between persistent passage IDs and response-local citation labels.

[Pinned API implementation](https://github.com/AmRitJain0442/vedai/blob/73beef60490f97bfbd2902db152ff99a6484456d/vedai/server.py)
