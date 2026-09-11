import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from vedai.answers import answer, evidence_packet, OpenRouter, validate_answer, resolve_citations, citation_schema
from vedai.ollama import ModelError

HIT = {"id": "chunk", "work": "test", "title": "Test", "kind": "base-text", "layer": "base-text", "language": "sa-Latn",
       "sections": [], "text": "vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ", "source_url": "https://example.org", "references": []}


class AnswerTests(unittest.TestCase):
    def valid(self):
        return {"status": "supported", "claims": [{"text": "Three doshas are named.", "evidence": [{"citation_id": "S1", "quote": HIT["text"]}]}]}

    def generated(self):
        value = self.valid()
        value['claims'][0]['evidence'][0].pop('quote')
        value['translations'] = [{'citation_id': 'S1', 'text': 'Vayu, pitta and kapha are the three doshas.'}]
        return value

    def test_valid_citations_and_fabricated_quote_rejected(self):
        packet = evidence_packet([HIT])
        self.assertEqual(validate_answer(json.dumps(self.valid()), packet)["status"], "supported")
        bad = self.valid()
        bad["claims"][0]["evidence"][0]["quote"] = "a fabricated Sanskrit quotation"
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(bad), packet)

    def test_unknown_ids_missing_evidence_and_false_abstention_rejected(self):
        packet = evidence_packet([HIT])
        bad = self.valid()
        bad["claims"][0]["evidence"][0]["citation_id"] = "S999"
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(bad), packet)
        bad["claims"][0]["evidence"] = []
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(bad), packet)
        bad["status"] = "insufficient_evidence"
        with self.assertRaises(ValueError):
            validate_answer(json.dumps(bad), packet)

    @patch("urllib.request.urlopen")
    def test_no_key_means_no_network_and_retrieval_still_works(self, network):
        result = answer("question", [HIT], provider=OpenRouter(key="", model=""))
        self.assertEqual(result["generation_status"], "not_configured")
        self.assertEqual(len(result["citations"]), 1)
        network.assert_not_called()

    @patch("urllib.request.urlopen")
    def test_provider_contract_and_secret_redaction(self, network):
        provider = OpenRouter(key="secret-test-key", model="test/model")
        generated = self.generated()
        network.return_value.__enter__.return_value = io.BytesIO(json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(generated)}}]}).encode())
        result = answer("question", [HIT], provider=provider)
        self.assertEqual(result["generation_status"], "complete")
        translation = result['citations'][0]['translation']
        self.assertEqual(translation['text'], generated['translations'][0]['text'])
        self.assertEqual((translation['language'], translation['model'], translation['review_status']), ('en', 'test/model', 'not_expert_reviewed'))
        self.assertEqual(result['citations'][0]['sanskrit'], HIT['text'])
        request = network.call_args.args[0]
        self.assertEqual(request.full_url, "https://openrouter.ai/api/v1/chat/completions")
        self.assertTrue(json.loads(request.data)["provider"]["require_parameters"])
        network.side_effect = HTTPError(request.full_url, 401, "error", {}, io.BytesIO(b"secret-test-key"))
        with self.assertRaises(ModelError) as error:
            provider.chat([])
        self.assertNotIn("secret-test-key", str(error.exception))

    def test_generated_ids_resolve_to_exact_stored_sanskrit(self):
        packet = evidence_packet([HIT])
        generated = self.generated()
        value = resolve_citations(json.dumps(generated), packet)
        self.assertEqual(value["claims"][0]["evidence"][0]["quote"], HIT["text"])
        generated["claims"][0]["evidence"][0]["citation_id"] = "S999"
        with self.assertRaises(ValueError):
            resolve_citations(json.dumps(generated), packet)
        with self.assertRaises(ValueError):
            resolve_citations(json.dumps(self.valid()), packet)
        ids = citation_schema(packet)["properties"]["claims"]["items"]["properties"]["evidence"]["items"]
        self.assertEqual(ids["properties"]["citation_id"]["enum"], ["S1"])

    def test_translations_cannot_point_to_unknown_uncited_or_duplicate_sources(self):
        packet = evidence_packet([HIT, {**HIT, 'id': 'second'}])
        for entries in [[], [{'citation_id': 'S999', 'text': 'Invented'}],
                        [{'citation_id': 'S2', 'text': 'Uncited'}],
                        [{'citation_id': 'S1', 'text': 'A'}, {'citation_id': 'S1', 'text': 'B'}],
                        [{'citation_id': 'S1', 'text': ' '}],
                        [{'citation_id': 'S1', 'text': 'x' * 12001}],
                        [{'citation_id': 'S1', 'text': 42}]]:
            with self.subTest(entries=str(entries)[:60]):
                generated = self.generated()
                generated['translations'] = entries
                with self.assertRaises(ValueError):
                    resolve_citations(json.dumps(generated), packet)
        generated = self.generated()
        generated.pop('translations')
        with self.assertRaises(ValueError):
            resolve_citations(json.dumps(generated), packet)

    def test_uncertain_translation_can_be_unavailable_without_changing_source(self):
        generated = self.generated()
        generated['translations'][0]['text'] = None
        class Provider:
            configured, model = True, 'fake/sol'
            def chat(self, messages, **kwargs):
                self.payload = json.loads(messages[-1]['content'])
                return json.dumps(generated)
        provider = Provider()
        result = answer('question', [HIT], answer_language='hi', provider=provider)
        self.assertEqual(provider.payload['translation_language'], 'hi')
        self.assertEqual(result['generation_status'], 'complete')
        self.assertEqual(result['citations'][0]['translation']['status'], 'unavailable')
        self.assertEqual(result['citations'][0]['translation']['language'], 'hi')
        self.assertEqual(result['citations'][0]['sanskrit'], HIT['text'])

    @patch('urllib.request.urlopen')
    def test_sol_medium_reasoning_is_sent_for_planning_and_answers(self, network):
        provider = OpenRouter(key='test-key', model='openai/gpt-5.6-sol', reasoning='medium')
        for schema_name, budget in [('search_plan', 5000), ('evidence_answer', 16000)]:
            network.return_value.__enter__.return_value = io.BytesIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{}'}}]}).encode())
            provider.chat([], schema={}, schema_name=schema_name)
            payload = json.loads(network.call_args.args[0].data)
            self.assertEqual(payload['model'], 'openai/gpt-5.6-sol')
            self.assertEqual(payload['reasoning'], {'effort': 'medium'})
            self.assertEqual(payload['max_tokens'], budget)
            self.assertNotIn('temperature', payload)

    def test_evidence_budget_preserves_whole_passages(self):
        self.assertEqual(evidence_packet([HIT], max_characters=5), [])
