import copy
import json
import unittest

from vedai.answers import answer, evidence_packet, resolve_citations, citation_schema
from vedai.clinical import validate_findings

HIT = {'id': 'test', 'work': 'test', 'title': 'Test source', 'kind': 'base-text',
       'layer': 'base-text', 'language': 'sa-Latn', 'sections': [], 'references': [],
       'source_url': 'https://example.org', 'text': 'source Sanskrit exactly as stored'}


class ClinicalTests(unittest.TestCase):
    def test_history_can_anchor_user_observations_but_not_assistant_diagnoses_or_old_citations(self):
        history = [{'question': 'No fever. Pain for two days.', 'answer': 'Possible infection. Old source S99.'}]
        self.value['findings'] = [{'text': 'Fever', 'state': 'absent', 'question_quote': 'No fever.'}]
        from unittest.mock import Mock
        provider = Mock(configured=True, model='test', reasoning='medium')
        provider.chat.return_value = json.dumps(self.value)
        result = answer('What else should I look for?', [], packet=self.packet, provider=provider, conversation=history)
        self.assertEqual(result['generation_status'], 'complete')
        sent = json.loads(provider.chat.call_args.args[0][1]['content'])
        self.assertEqual(sent['conversation'], history)
        self.value['findings'][0]['question_quote'] = 'Possible infection.'
        provider.chat.return_value = json.dumps(self.value)
        self.assertEqual(answer('What else?', [], packet=self.packet, provider=provider, conversation=history)['generation_status'], 'rejected')
        self.value['findings'] = []
        self.value['claims'][0]['evidence'][0]['citation_id'] = 'S99'
        provider.chat.return_value = json.dumps(self.value)
        self.assertEqual(answer('What else?', [], packet=self.packet, provider=provider, conversation=history)['generation_status'], 'rejected')

    def setUp(self):
        self.packet = evidence_packet([HIT])
        self.value = {'status': 'supported', 'question_type': 'patient_case', 'findings': [],
                      'claims': [self.claim('textual', 'The text describes a feature.', [{'citation_id': 'S1'}]),
                                 self.claim('clinical_priority', 'Seek urgent assessment.')],
                      'translations': [{'citation_id': 'S1', 'text': 'A translation.'}]}

    def claim(self, basis, text, evidence=None):
        return {'basis': basis, 'heading': 'Heading', 'text': text, 'evidence': evidence or []}

    def test_mixed_answer_keeps_clinical_context_uncited_and_priority_first(self):
        result = resolve_citations(json.dumps(self.value), self.packet)
        self.assertEqual(result['claims'][0]['basis'], 'clinical_priority')
        self.assertEqual(result['claims'][0]['evidence'], [])
        self.assertEqual(result['claims'][1]['evidence'][0]['quote'], HIT['text'])

    def test_context_cannot_borrow_sanskrit_citation(self):
        for basis in ['modern_context', 'clinical_priority', 'evidence_gap', 'follow_up']:
            value = copy.deepcopy(self.value)
            value['claims'][0]['basis'] = basis
            with self.subTest(basis=basis), self.assertRaises(ValueError):
                resolve_citations(json.dumps(value), self.packet)

    def test_text_and_interpretation_need_evidence_and_supported_needs_citations(self):
        for basis in ['textual', 'interpretation', 'evidence_gap']:
            value = copy.deepcopy(self.value)
            value['claims'] = [self.claim(basis, 'No supporting citation.')]
            value['translations'] = []
            with self.subTest(basis=basis), self.assertRaises(ValueError):
                resolve_citations(json.dumps(value), self.packet)

    def test_missing_evidence_can_still_provide_priority_and_useful_questions(self):
        value = {'status': 'insufficient_evidence', 'question_type': 'patient_case', 'findings': [],
                 'claims': [self.claim('clinical_priority', 'Seek urgent assessment.'),
                            self.claim('evidence_gap', 'The requested passage was not retrieved.'),
                            self.claim('follow_up', 'When did the change begin?')], 'translations': []}
        self.assertEqual(len(resolve_citations(json.dumps(value), [])['claims']), 3)

    def test_unknown_is_distinct_from_absent_and_observations_require_exact_question_quote(self):
        question = 'No fever. Pain for two days.'
        findings = [{'text': 'Fever', 'state': 'absent', 'question_quote': 'No fever.'},
                    {'text': 'Pain', 'state': 'present', 'question_quote': 'Pain for two days.'},
                    {'text': 'Appetite', 'state': 'unknown', 'question_quote': None}]
        self.assertEqual(validate_findings(findings, question), findings)
        for bad in [{'text': 'BP normal', 'state': 'present', 'question_quote': 'BP normal'},
                    {'text': 'Appetite', 'state': 'unknown', 'question_quote': 'No fever.'},
                    {'text': 'Strength', 'state': 'medium', 'question_quote': None}]:
            with self.subTest(finding=bad), self.assertRaises(ValueError):
                validate_findings([bad], question)

    def test_uncited_hindi_and_english_fabricated_locators_rejected(self):
        for text in ['श्लोक १५ में लिखा है', 'अध्याय 21 says', 'पृष्ठ 123', 'verse 12', 'https://invented.example']:
            value = copy.deepcopy(self.value)
            value['claims'].append(self.claim('modern_context', text))
            with self.subTest(text=text), self.assertRaises(ValueError):
                resolve_citations(json.dumps(value), self.packet)

    def test_general_knowledge_setting_applies_to_mixed_answers(self):
        value = copy.deepcopy(self.value)
        value['claims'].append(self.claim('modern_context', 'An unverified differential.'))
        class Provider:
            configured, model = True, 'test/model'
            def chat(self, *args, **kwargs):
                return json.dumps(value)
        result = answer('Case question', [HIT], provider=Provider(), allow_general=False)
        self.assertEqual(result['generation_status'], 'rejected')

    def test_provider_schema_requires_typed_claims_and_bounded_case_fields(self):
        schema = citation_schema(self.packet)
        self.assertIn('findings', schema['required'])
        self.assertIn('question_type', schema['required'])
        claim = schema['properties']['claims']['items']
        self.assertIn('basis', claim['required'])
        self.assertIn('heading', claim['required'])
        self.assertEqual(schema['properties']['findings']['maxItems'], 20)

    def test_no_passages_and_general_disabled_still_allows_priority_and_evidence_gap(self):
        value = {'status': 'insufficient_evidence', 'question_type': 'patient_case', 'findings': [],
                 'claims': [self.claim('clinical_priority', 'Seek urgent assessment.'),
                            self.claim('evidence_gap', 'No supporting passage was retrieved.')], 'translations': []}
        class Provider:
            configured, model = True, 'test/model'
            def chat(self, *args, **kwargs):
                return json.dumps(value)
        result = answer('Case question', [], provider=Provider(), allow_general=False)
        self.assertEqual(result['generation_status'], 'complete')
        self.assertEqual(result['evidence_status'], 'insufficient_evidence')
        self.assertEqual(result['claims'][0]['basis'], 'clinical_priority')

    def test_cited_prose_cannot_add_fabricated_locator_in_heading(self):
        self.value['claims'][0]['heading'] = 'Chapter 999'
        with self.assertRaises(ValueError):
            resolve_citations(json.dumps(self.value), self.packet)


if __name__ == '__main__':
    unittest.main()
