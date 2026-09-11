# Draft evaluation set

`topics.json` contains 12 textual questions in four query languages. `questions.jsonl` resolves their expected evidence against the pinned local corpus, adds one exact-quote smoke case for each of 15 works, and adds five unanswerable prompts: 68 cases total.

These are **Codex-authored draft judgments, not expert-reviewed Sanskrit translations or gold answers**. An expert must verify the questions and relevance labels before using results for a release decision. Exact-quote cases check plumbing; they do not establish semantic retrieval quality. Natural-language questions currently cover three core works, while smoke cases cover all selected works.

Development and validation natural-question groups are separated by work. All language variants of a topic remain in one split. Validation is a provisional development check, not an independently held-out benchmark. The topic questions provide explicit work filters; unfiltered discovery requires a separate benchmark. No answer translation is used as retrieval data.

Recall@10 measures the fraction of expected source segments covered by the first ten chunks; MRR uses the first chunk that covers an expected segment. Unanswerable prompts are excluded from recall/MRR. Their returned-evidence rate measures retrieval behavior only; generated-answer abstention is a separate check.

```powershell
python -m vedai eval-create
python -m vedai evaluate --mode lexical
```
