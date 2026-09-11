"""Draft source-linked retrieval evaluation, not an expert-validated benchmark."""
import json
import time
from collections import defaultdict
from pathlib import Path

from .corpus import REVISION, dump, write_jsonl


def create_dataset(data, destination=Path("eval/questions.jsonl")):
    topics = json.loads(Path("eval/topics.json").read_text(encoding="utf-8"))
    by_xml, by_work = {}, defaultdict(list)
    with (data / "processed/segments.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if row["kind"] not in {"note", "heading"}:
                by_work[row["work"]].append(row)
                for xml_id in row["xml_ids"]:
                    by_xml[row["work"], xml_id] = row
    questions = []
    for topic in topics:
        expected = list({by_xml[topic["work"], xml_id]["id"] for xml_id in topic["xml_ids"]})
        for language, query in topic["queries"].items():
            questions.append({"id": f"{topic['id']}-{language}", "group": topic["id"], "type": "natural_question",
                              "query": query, "language": language, "work": topic["work"],
                              "expected_segment_ids": sorted(expected), "split": topic["split"]})
    for work, rows in sorted(by_work.items()):
        candidates = [r for r in rows if len(r["text"]) >= 120]
        sample = candidates[len(candidates) // 2]
        questions.append({"id": f"quote-{work}", "group": work, "type": "exact_quote",
                          "query": sample["text"][:120], "language": sample["language"], "work": work,
                          "expected_segment_ids": [sample["id"]], "split": "smoke"})
    for i, (language, query) in enumerate([
        ("en", "What is the Wi-Fi password of this library?"),
        ("en", "What was Apple's revenue in 2025?"),
        ("hi", "मेरे बैंक खाते का पासवर्ड क्या है?"),
        ("en", "Which randomized trial in 2024 proved that Charaka used penicillin?"),
        ("en", "What is tomorrow's weather forecast in Delhi?"),
    ]):
        questions.append({"id": f"unanswerable-{i}", "group": f"unanswerable-{i}", "type": "unanswerable",
                          "query": query, "language": language, "work": None, "expected_segment_ids": [], "split": "validation"})
    for row in questions:
        row.update(revision=REVISION, review_status="draft", authored_by="Codex", expert_reviewer=None)
    write_jsonl(destination, questions)
    return len(questions)


def score_results(expected, results):
    expected = set(expected)
    if not expected:
        return {"recall_at_10": None, "reciprocal_rank": None, "returned_evidence": bool(results)}
    found, first = set(), 0
    for rank, hit in enumerate(results[:10], 1):
        matches = expected & {r["segment_id"] for r in hit["references"]}
        found.update(matches)
        if matches and not first:
            first = rank
    return {"recall_at_10": len(found) / len(expected), "reciprocal_rank": 1 / first if first else 0,
            "returned_evidence": bool(results)}


def evaluate(data, retriever, output, dataset=Path("eval/questions.jsonl")):
    rows = [json.loads(line) for line in dataset.read_text(encoding="utf-8").splitlines()]
    results, groups = [], defaultdict(list)
    for row in rows:
        started = time.perf_counter()
        hits = retriever(row["query"], 10, row["work"])
        result = {"id": row["id"], **score_results(row["expected_segment_ids"], hits),
                  "seconds": round(time.perf_counter() - started, 3), "retrieved_ids": [h["id"] for h in hits]}
        results.append(result)
        for group in (row["type"], f"{row['type']}/{row['language']}", f"split/{row['split']}"):
            groups[group].append(result)
    summary = {}
    for name, values in groups.items():
        answerable = [v for v in values if v["recall_at_10"] is not None]
        summary[name] = {"count": len(values), "recall_at_10": sum(v["recall_at_10"] for v in answerable) / len(answerable) if answerable else None,
                         "mrr": sum(v["reciprocal_rank"] for v in answerable) / len(answerable) if answerable else None,
                         "returned_evidence_rate": sum(v["returned_evidence"] for v in values) / len(values)}
    report = {"dataset": str(dataset), "review_status": "draft; no expert validation", "metrics": summary, "results": results,
              "limitations": "Work-filtered, small draft relevance set. Missing judgments can penalize other valid evidence. Exact-quote smoke scores are separate. Evidence return is not answer abstention."}
    dump(output, report)
    return summary
