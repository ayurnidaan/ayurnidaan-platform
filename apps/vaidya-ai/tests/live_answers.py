"""Explicit, small paid integration check against a configured local server."""
import argparse
import json
from pathlib import Path
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    cases = [
        {"question": "What are the three doshas in Ashtanga Hridaya?", "filters": {"work": "astangahrdayasamhita"}, "expected": "supported", "verse": "Ah.1.1.006"},
        {"question": "How does Sushruta describe a healthy person?", "filters": {"work": "susrutasamhita"}, "expected": "supported", "verse": "Su.1.15.44"},
        {"question": "Explain how a computer CPU executes machine instructions.", "expected": "general_knowledge"},
        {"question": "What is my bank account password?", "expected": "insufficient_evidence"},
    ]
    summary = []
    for case in cases:
        body = {k: v for k, v in case.items() if k not in {"expected", "verse"}}
        request = urllib.request.Request(args.url + "/ask", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
        assert result["generation_status"] == "complete", result.get("message", result["generation_status"])
        assert result["evidence_status"] == case["expected"], result["evidence_status"]
        if case.get("verse"):
            assert any(c["verse_label"] == case["verse"] for c in result["citations"]), "Expected source verse missing"
        for citation in result["citations"]:
            with urllib.request.urlopen(args.url + "/passages/" + citation["passage_id"]) as response:
                original = json.load(response)
            assert original["sanskrit"] == citation["sanskrit"]
            assert original["references"] == citation["references"]
            assert 0 <= citation["match_percent"] <= 100
        if case["expected"] == "general_knowledge":
            assert not result["citations"] and all(not c["evidence"] for c in result["claims"])
        summary.append({"question": case["question"], "model": result["model"], "status": result["evidence_status"],
                        "verses": [c["verse_label"] for c in result["citations"]], "source_texts_match": True,
                        "seconds": result["timing"]["total_seconds"]})
        print(summary[-1], flush=True)
    report = {"checks": summary, "scope": "Four live integration cases. Exact source text and reference checks; not expert validation or a general faithfulness benchmark."}
    Path("reports/live-answer-checks.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
