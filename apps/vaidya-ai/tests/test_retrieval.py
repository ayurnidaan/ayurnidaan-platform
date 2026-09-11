import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

try:
    import numpy
except ImportError:
    numpy = None

from vedai.corpus import write_jsonl
from vedai.retrieval import build_vectors, Retriever, reciprocal_rank_fusion
from vedai.search import build_index


class FakeEmbedding:
    def __init__(self):
        self.calls = 0
        self.revision = "fake-digest"

    def model_digest(self, model):
        return self.revision

    def embed(self, texts, model):
        self.calls += 1
        return [[1., 0.] if "health" in text else [0., 1.] for text in texts]


@unittest.skipUnless(numpy is not None, "Install vedai[rag] for vector tests")
class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        common = {"title": "Test", "kind": "base-text", "layer": "base-text", "language": "sa-Latn", "sections": [], "references": [], "source_url": "https://example.org"}
        self.rows = [{**common, "id": "a", "work": "one", "text": "health"},
                     {**common, "id": "b", "work": "two", "text": "astronomy"}]
        write_jsonl(self.data / "processed/chunks.jsonl", self.rows)
        build_index(self.data)
        self.client = FakeEmbedding()

    def tearDown(self):
        self.temp.cleanup()

    @patch("vedai.retrieval.dump")
    def test_resume_filters_and_model_revision_guard(self, unused):
        # Keep report side effects in the fixture while allowing its manifest.
        from vedai.corpus import dump as real_dump
        unused.side_effect = lambda path, value: real_dump(path, value) if path.is_relative_to(self.data) else None
        build_vectors(self.data, client=self.client)
        calls = self.client.calls
        build_vectors(self.data, client=self.client)
        self.assertEqual(calls, self.client.calls)
        retriever = Retriever(self.data, "semantic", self.client)
        self.assertEqual(retriever.search("health")[0]["id"], "a")
        self.assertEqual(retriever.search("health", work="two")[0]["id"], "b")
        self.assertEqual(retriever.search("health", kind="commentary"), [])
        self.client.revision = "different"
        with self.assertRaisesRegex(ValueError, "differs"):
            Retriever(self.data, "semantic", self.client)

    def test_rrf_rewards_agreement_without_repeated_votes(self):
        a, b = self.rows
        hits = reciprocal_rank_fusion([[b, a, a], [a]])
        self.assertEqual(hits[0]["id"], "a")
        self.assertAlmostEqual(hits[0]["rrf_score"], 1 / 62 + 1 / 61)
