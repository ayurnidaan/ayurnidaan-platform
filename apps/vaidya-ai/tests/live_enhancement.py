"""Explicit paid integration checks for colloquial, multi-topic query enhancement."""
import argparse
import json
from pathlib import Path
import sys
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vedai.terminology import canonical


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    questions = ["sar dard and pet kharab lag raha h patli tatti aa rahi h",
                 "सिर में दर्द है और पेट खराब है, पतली टट्टी आ रही है"]
    checks = []
    for index, question in enumerate(questions):
        request = urllib.request.Request(args.url + "/ask", data=json.dumps({"question": question}).encode(),
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
        runtime = Path("data/runtime")
        runtime.mkdir(parents=True, exist_ok=True)
        (runtime / f"enhancement-{index}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        assert result["generation_status"] == "complete", result["generation_status"]
        assert result["evidence_status"] == "supported", result["evidence_status"]
        assert result["query_plan"]["status"] == "enhanced"
        assert 2 <= len(result["query_plan"]["queries"]) <= 4
        text = canonical(" ".join(c["sanskrit"] for c in result["citations"]))
        assert any(t in text for t in ["sirahsula", "siroruk", "siroroga", "sirovyatha", "siroruja"]), "No cited head-pain source"
        assert "atisar" in text, "No cited loose-stool source"
        assert any(c["form"] == "shloka" and c["verse_label"] for c in result["citations"])
        for citation in result["citations"]:
            with urllib.request.urlopen(args.url + "/passages/" + citation["passage_id"]) as response:
                original = json.load(response)
            assert original["sanskrit"] == citation["sanskrit"]
            assert original["references"] == citation["references"]
            assert original["verse_label"] == citation["verse_label"]
            assert citation["title"] and citation["sections"]
        checks.append({"question": question, "model": result["model"], "status": result["evidence_status"],
                       "searches": result["query_plan"]["queries"],
                       "sources": [{k: c[k] for k in ["title", "work", "verse_label", "form", "source_url"]} for c in result["citations"]],
                       "source_texts_and_locators_match": True, "seconds": result["timing"]["total_seconds"]})
        print(f"Passed {'Hinglish' if index == 0 else 'Hindi'} enhancement, symptom coverage and source checks", flush=True)
    Path("reports/query-enhancement-checks.json").write_text(json.dumps({"checks": checks,
        "scope": "Two development smoke cases; source integrity and topic coverage, not expert assessment of Sanskrit interpretation or clinical validity."}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
