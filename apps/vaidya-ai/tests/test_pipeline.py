import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from vedai.corpus import REVISION, extract_archive, extract_work, make_chunks, write_jsonl
from vedai.search import build_index, normalize, search


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def sample(self):
        path = self.root / "sample.xml"
        path.write_text('''<TEI xmlns="http://www.tei-c.org/ns/1.0">
          <teiHeader><fileDesc><titleStmt><title>Test</title></titleStmt>
          <publicationStmt><availability><p>Attribution required</p></availability></publicationStmt>
          </fileDesc></teiHeader><text xml:lang="sa-Latn"><body>
          <div n="1" type="chapter"><head>Chapter one</head>
          <lg xml:id="verse.1"><l><label>1a</label>vāta<note xml:lang="en">editor note</note> pitta</l><l>kapha</l></lg>
          <p xml:id="prose.1">Before <hi>inside</hi> after <app><lem>lemma</lem><rdg>variant</rdg></app>.</p>
          <div type="commentary1" ana="Commentator"><quote type="base-text">Standalone quotation</quote><p>Explanation <quote type="base-text">vāta</quote>.</p></div>
          <p><choice><sic>wrong</sic><corr>right</corr></choice><gap/> end</p></div>
          <div n="2" type="chapter"><p>Second chapter</p></div>
          </body></text></TEI>''', encoding="utf-8")
        return extract_work(path, {"file": "sample.xml", "title": "Sample"}, REVISION)

    def test_inline_text_notes_variants_and_commentary(self):
        meta, segments, _ = self.sample()
        verse = next(s for s in segments if "verse.1" in s["xml_ids"])
        self.assertEqual(verse["text"], "vāta pitta kapha")
        self.assertEqual(verse["labels"], ["1a"])
        notes = [s for s in segments if s["kind"] == "note"]
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["language"], "en")
        prose = next(s for s in segments if "prose.1" in s["xml_ids"])
        self.assertEqual(prose["text"], "Before inside after lemma.")
        commentary = next(s for s in segments if s["kind"] == "commentary")
        self.assertEqual(commentary["layer"], "Commentator")
        self.assertEqual(commentary["inline_quotes"][0]["text"], "vāta")
        self.assertIn("Standalone quotation", [s["text"] for s in segments if s["kind"] == "base-text"])
        self.assertTrue(meta["body_text_coverage_verified"])
        self.assertIn("right [gap] end", [s["text"] for s in segments])
        self.assertEqual(meta["availability"], "Attribution required")

    def test_chunks_keep_citations_and_boundaries(self):
        _, segments, _ = self.sample()
        chunks = make_chunks(segments, 100)
        lookup = {s["id"]: s for s in segments}
        for chunk in chunks:
            self.assertLessEqual(len(chunk["text"]), 100)
            self.assertNotIn(chunk["kind"], {"note", "heading"})
            rebuilt = []
            for ref in chunk["references"]:
                segment = lookup[ref["segment_id"]]
                self.assertEqual(segment["sections"], chunk["sections"])
                self.assertEqual(segment["kind"], chunk["kind"])
                rebuilt.append(segment["text"][ref["start"]:ref["end"]])
            self.assertEqual(chunk["text"], "\n".join(rebuilt))
        self.assertEqual(chunks, make_chunks(segments, 100))
        segments[1]["text"] = "x" * 250
        self.assertTrue(all(len(c["text"]) <= 100 for c in make_chunks(segments, 100)))

    def test_archive_rejects_traversal(self):
        archive = self.root / "unsafe.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("../escaped.txt", "bad")
        with self.assertRaises(ValueError):
            extract_archive(archive, self.root / "out")
        self.assertFalse((self.root / "escaped.txt").exists())

    def test_search_diacritics_devanagari_filters_and_rebuild(self):
        _, segments, _ = self.sample()
        chunks = make_chunks(segments)
        extra = dict(chunks[0], id="devanagari", work="other", text="वात पित्त कफ")
        write_jsonl(self.root / "processed" / "chunks.jsonl", chunks + [extra])
        self.assertEqual(normalize("vāta"), "vata")
        self.assertEqual(normalize("पित्त"), "पित्त")
        self.assertEqual(build_index(self.root), len(chunks) + 1)
        self.assertTrue(search(self.root, "vata", work="sample"))
        self.assertEqual(search(self.root, "पित्त")[0]["id"], "devanagari")
        self.assertEqual(search(self.root, "पित्त", work="sample"), [])
        self.assertEqual(search(self.root, '" OR * :'), [])
        self.assertEqual(search(self.root, "!!!"), [])
        self.assertEqual(build_index(self.root), len(chunks) + 1)


if __name__ == "__main__":
    unittest.main()
