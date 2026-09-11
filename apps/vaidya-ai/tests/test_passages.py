import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from vedai.corpus import write_jsonl
from vedai.passages import build_passages, PassageStore, match_score
from vedai.answers import answer, validate_answer
from vedai.settings import local_settings


@unittest.skipUnless(importlib.util.find_spec("indic_transliteration"), "Install vedai[rag]")
class PassageTests(unittest.TestCase):
    def test_full_verse_joins_source_halves_without_inventing_numbers(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            common = {"work": "susruta", "title": "Sushruta", "kind": "base-text", "layer": "base-text", "language": "sa-Latn", "sections": [], "source_url": "https://example.org", "labels": [], "page": None}
            rows = [{**common, "id": "a", "xml_ids": ["Su.1.15.44ab"], "xpath": "/TEI/text[1]/body[1]/ab[1]", "text": "samadoṣaḥ samāgniśca /"},
                    {**common, "id": "b", "xml_ids": ["Su.1.15.44cd"], "xpath": "/TEI/text[1]/body[1]/ab[2]", "text": "svasthā ityabhidhīyate //"},
                    {**common, "id": "c", "xml_ids": [], "xpath": "/TEI/text[1]/body[1]/p[1]", "text": "A prose passage."}]
            write_jsonl(data / "processed/segments.jsonl", rows)
            self.assertEqual(build_passages(data), 2)
            store = PassageStore(data)
            packet = store.packet("healthy", [{"id": "chunk", "references": [{"segment_id": "a"}]}])
            self.assertEqual(len(packet), 1)
            self.assertEqual(packet[0]["sanskrit"], rows[0]["text"] + "\n" + rows[1]["text"])
            self.assertEqual(packet[0]["verse_label"], "Su.1.15.44")
            self.assertEqual(packet[0]["form"], "shloka")
            self.assertEqual(len(packet[0]["references"]), 2)
            self.assertEqual(store.get(packet[0]["passage_id"])["sanskrit"], packet[0]["sanskrit"])
            prose = store.packet("passage", [{"id": "chunk", "references": [{"segment_id": "c"}]}])[0]
            self.assertEqual(prose["form"], "prose")
            self.assertIsNone(prose["verse_label"])

    def test_match_is_defined_overlap_not_probability(self):
        score = match_score("pitta kapha", "pitta")
        self.assertEqual(score["match_percent"], round(100 * len(score["matched_terms"]) / score["query_term_count"], 1))
        self.assertEqual(match_score("!!!", "pitta")["match_percent"], 0)
        self.assertIn("Not answer confidence", score["match_method"])

    def test_sangraha_paragraph_halves_and_multi_numbered_groups(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            common = {"work": "astangasangraha", "title": "Ashtanga Sangraha", "kind": "base-text", "layer": "base-text", "language": "sa-Latn", "sections": [], "source_url": "https://example.org", "labels": [], "page": None}
            rows = [{**common, "id": "a", "xml_ids": ["AS.Utt.2.45"], "xpath": "/TEI/body/p[1]", "text": "śirorukcchardyatīsāranāśanaṃ mūrdhalepanam |"},
                    {**common, "id": "b", "xml_ids": [], "xpath": "/TEI/body/p[2]", "text": "gavādanīṃ dāḍimaṃ ca tṛḍvān koṣṇāmbhasā pibet ||"},
                    {**common, "id": "c", "xml_ids": [], "xpath": "/TEI/body/p[3]", "text": "Unrelated prose."},
                    {**common, "id": "d", "xml_ids": [], "xpath": "/TEI/body/lg[1]", "text": "first ||108|| second ||109||"}]
            write_jsonl(data / "processed/segments.jsonl", rows)
            self.assertEqual(build_passages(data), 3)
            packet = PassageStore(data).packet("atisara", [{"id": "hit", "references": [{"segment_id": x} for x in ["a", "c", "d"]]}])
            joined = next(p for p in packet if p["verse_label"] == "AS.Utt.2.45")
            self.assertEqual(len(joined["references"]), 2)
            self.assertEqual(joined["sanskrit"], rows[0]["text"] + "\n" + rows[1]["text"])
            self.assertTrue(any(p["verse_label"] == "108, 109" for p in packet))


class FallbackTests(unittest.TestCase):
    class Provider:
        configured, model = True, "fake/luna"
        def chat(self, messages, **kwargs):
            return json.dumps({"status": "general_knowledge", "claims": [{"text": "Photosynthesis converts light energy into chemical energy.", "evidence": []}], "translations": []})

    def test_general_answer_without_retrieved_evidence(self):
        result = answer("What is photosynthesis?", [], provider=self.Provider())
        self.assertEqual(result["evidence_status"], "general_knowledge")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["citations"], [])
        self.assertIsNotNone(result["answer"])

    def test_corpus_only_disallows_fallback(self):
        result = answer("question", [], provider=self.Provider(), allow_general=False)
        self.assertEqual(result["evidence_status"], "insufficient_evidence")

    def test_general_knowledge_cannot_fabricate_corpus_citations(self):
        value = {"status": "general_knowledge", "claims": [{"text": "Answer", "evidence": [{"citation_id": "S1", "quote": "invented"}]}]}
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(value), [])
        value["claims"][0] = {"text": "According to verse 123 this is true.", "evidence": []}
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(value), [])

    def test_settings_are_not_executed_or_interpolated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text('OPENROUTER_API_KEY="literal-$VALUE"\nOPENROUTER_MODEL=openai/gpt-5.6-luna\nOPENROUTER_REASONING_EFFORT=medium\nUNRELATED=ignored', encoding="utf-8")
            self.assertEqual(local_settings(path), {"OPENROUTER_API_KEY": "literal-$VALUE", "OPENROUTER_MODEL": "openai/gpt-5.6-luna", "OPENROUTER_REASONING_EFFORT": "medium"})
