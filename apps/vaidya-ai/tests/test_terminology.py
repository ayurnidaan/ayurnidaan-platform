import importlib.util
import tempfile
import unittest
from pathlib import Path

from vedai.corpus import write_jsonl
from vedai.terminology import canonical, query_terms, build_terms, term_search


@unittest.skipUnless(importlib.util.find_spec("indic_transliteration"), "Install vedai[rag] for transliteration")
class TerminologyTests(unittest.TestCase):
    def test_script_normalization_and_word_boundaries(self):
        self.assertEqual(canonical("पित्त"), canonical("pitta"))
        self.assertEqual(canonical("āyur-veda"), "ayurveda")
        self.assertEqual(canonical("śiro'rti"), canonical("śiro+rti"))
        self.assertIn("pitta", query_terms("What are the doshas?"))
        self.assertNotIn("pitta", query_terms("a pseudoshadow"))

    def test_substring_retrieval_inside_sanskrit_compounds(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            rows = [{"id": "one", "work": "test", "text": "yatroktamāyurvedaḥ sa ucyate", "kind": "base-text", "language": "sa-Latn", "sections": []},
                    {"id": "two", "work": "test", "text": "पित्तं कफः", "kind": "commentary", "language": "sa-Deva", "sections": []}]
            write_jsonl(data / "processed/chunks.jsonl", rows)
            self.assertEqual(build_terms(data), 2)
            self.assertEqual(term_search(data, "Ayurveda")[0]["id"], "one")
            self.assertEqual(term_search(data, "pitta")[0]["id"], "two")
            self.assertEqual(term_search(data, "pitta", kind="base-text"), [])
            self.assertEqual(term_search(data, "Ayurveda", work="missing"), [])
