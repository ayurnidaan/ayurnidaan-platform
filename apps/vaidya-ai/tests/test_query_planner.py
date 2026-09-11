import importlib.util
import json
import re
import unittest
from unittest.mock import Mock

from vedai.ollama import ModelError
from vedai.query_planner import enhance_query, validate_plan, retrieve_plan, PLAN_SCHEMA
from vedai.terminology import query_terms, symptom_concepts


@unittest.skipUnless(importlib.util.find_spec("indic_transliteration"), "Install vedai[rag]")
class QueryPlannerTests(unittest.TestCase):
    def test_followup_context_reaches_planner_but_new_session_is_empty(self):
        provider = Mock(configured=True)
        provider.chat.return_value = json.dumps({'queries': [{'topic': 'Vata', 'terms': ['vata']} ]})
        history = [{'question': 'What are the doshas?', 'answer': 'Vata, pitta, kapha.'}]
        plan = enhance_query('Explain the first one', provider, conversation=history)
        self.assertTrue(plan['used_conversation'])
        self.assertEqual(json.loads(provider.chat.call_args.args[0][1]['content'])['conversation'], history)
        plan = enhance_query('Explain Ayurveda', provider)
        self.assertFalse(plan['used_conversation'])
        self.assertEqual(json.loads(provider.chat.call_args.args[0][1]['content'])['conversation'], [])

    def test_hinglish_and_hindi_recognize_distinct_topics_without_filler(self):
        q = "sar dard and pet kharab lag raha h patli tatti aa rahi h"
        self.assertEqual({c["id"] for c in symptom_concepts(q)}, {"headache", "stomach_discomfort", "loose_stools"})
        self.assertIn("atisara", query_terms(q))
        self.assertIn("sirahsula", query_terms(q))
        self.assertFalse({"sar", "pet", "raha", "tatti", "lag"} & set(query_terms(q)))
        self.assertEqual({c["id"] for c in symptom_concepts("सिर में दर्द और पतली टट्टी")}, {"headache", "loose_stools"})
        self.assertEqual(symptom_concepts("a dastardly character with a headachery name"), [])

    def test_bounded_structured_plan_and_untrusted_terms(self):
        valid = {"queries": [{"topic": "Loose stools", "terms": ["atīsāra", "atisara"]}]}
        plan = validate_plan(json.dumps(valid))
        self.assertEqual(plan[0]["terms"], ["atisara"])
        self.assertEqual(validate_plan(json.dumps({"queries": [{"topic": "Head pain", "terms": ["śiro'rti"]}]}))[0]["terms"], ["sirorti"])
        for bad in [{"queries": []}, {"queries": valid["queries"] * 5},
                    {"queries": [{"topic": "x", "terms": ["Su.1.15.44"]}]},
                    {"queries": [{"topic": "x", "terms": ["DROP TABLE;"]}]},
                    {"queries": [{"topic": "x", "terms": ["atisara"], "work": "invented"}]}]:
            with self.assertRaises(ValueError):
                validate_plan(json.dumps(bad))

    def test_provider_schema_and_validator_agree_on_four_word_search_limit(self):
        pattern = PLAN_SCHEMA['properties']['queries']['items']['properties']['terms']['items']['pattern']
        valid = 'āyus tasya hitāhitam'
        self.assertIsNotNone(re.fullmatch(pattern, valid))
        self.assertTrue(validate_plan(json.dumps({'queries': [{'topic': 'Definition', 'terms': [valid]}]})))
        too_long = 'mānaṃ ca tac ca yatroktam'
        self.assertIsNone(re.fullmatch(pattern, too_long))
        with self.assertRaises(ValueError):
            validate_plan(json.dumps({'queries': [{'topic': 'Definition', 'terms': [too_long]}]}))

    def test_retrieval_only_never_calls_provider_and_errors_fall_back(self):
        provider = Mock(configured=True)
        plan = enhance_query("sar dard", provider, enabled=False)
        provider.chat.assert_not_called()
        self.assertEqual(plan["status"], "local")
        provider.chat.side_effect = ModelError("secret provider detail")
        fallback = enhance_query("patli tatti", provider)
        self.assertEqual(fallback["status"], "local_fallback")
        self.assertNotIn("secret", json.dumps(fallback))
        self.assertIn("atisara", fallback["queries"][0]["terms"])

    def test_fanout_preserves_filters_merges_sources_and_covers_topics(self):
        retriever, store = Mock(), Mock()
        retriever.search.side_effect = [[{"id": "h1"}], [{"id": "h2"}]]
        def packet(query, hits, limit):
            prefix = "head" if hits[0]["id"] == "h1" else "stool"
            return [{"passage_id": prefix + str(i), "sanskrit": "sirahsula" if prefix == "head" else "atisara"} for i in range(30)]
        store.packet.side_effect = packet
        plan = {"status": "local", "queries": validate_plan(json.dumps({"queries": [
            {"topic": "Headache", "terms": ["sirahsula"]}, {"topic": "Loose stools", "terms": ["atisara"]}]}))}
        filters = {"work": "test", "kind": "base-text", "chapter": "5", "language": "sa-Latn"}
        hits, sources = retrieve_plan("symptoms", plan, retriever, store, filters=filters)
        self.assertEqual(len(hits), 2)
        self.assertEqual(len(sources), 40)
        self.assertEqual([p["search_topics"][0] for p in sources[:2]], ["Headache", "Loose stools"])
        self.assertEqual(len({p["citation_id"] for p in sources}), 40)
        self.assertTrue(all(p["match_percent"] == 50 for p in sources))
        for call in retriever.search.call_args_list:
            self.assertEqual(call.kwargs, filters)

    def test_rewrite_cannot_discard_original_question_evidence(self):
        retriever, store = Mock(), Mock()
        retriever.search.side_effect = [[{"id": "rewrite"}], [{"id": "original"}]]
        store.packet.side_effect = [
            [{"passage_id": "rewritten-source", "sanskrit": "pitta kapha"}],
            [{"passage_id": "direct-source", "sanskrit": "vayuh pittam kaphas ceti trayo dosah"}]]
        plan = {"status": "enhanced", "queries": [{"id": "Q1", "topic": "Doshas", "terms": ["pitta", "kapha"], "query": "pitta kapha"}]}
        _, packet = retrieve_plan("three doshas", plan, retriever, store, filters={"kind": "base-text"})
        self.assertEqual(packet[0]["passage_id"], "direct-source")
        self.assertEqual(plan["original_retrieved_chunks"], 1)
        self.assertEqual(retriever.search.call_args.args[0], "three doshas")
