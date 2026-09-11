import unittest
from vedai.evaluation import score_results


class EvaluationTests(unittest.TestCase):
    def test_partial_multi_passage_recall_and_rank(self):
        hits = [{"references": [{"segment_id": "irrelevant"}]}, {"references": [{"segment_id": "one"}]}]
        score = score_results(["one", "two"], hits)
        self.assertEqual(score["recall_at_10"], 0.5)
        self.assertEqual(score["reciprocal_rank"], 0.5)

    def test_unanswerable_is_not_counted_as_retrieval_success(self):
        self.assertIsNone(score_results([], [])['recall_at_10'])
        self.assertFalse(score_results([], [])['returned_evidence'])
