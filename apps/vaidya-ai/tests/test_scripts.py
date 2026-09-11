import importlib.util
import unittest
import unicodedata

from vedai.scripts import with_devanagari
from vedai.answers import answer, OpenRouter


@unittest.skipUnless(importlib.util.find_spec('indic_transliteration'), 'Install vedai[rag]')
class ScriptTests(unittest.TestCase):
    def test_iast_conversion_preserves_original_and_locators(self):
        original = 'vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ | 1 ||'
        source = {'sanskrit': original, 'language': 'sa-Latn', 'verse_label': 'Ah.1.1.006', 'references': [{'xml_ids': ['source-id']}]}
        result = with_devanagari(source)
        self.assertEqual(result['sanskrit_devanagari'], 'वायुः पित्तं कफश् चेति त्रयो दोषाः । १ ॥')
        self.assertEqual(result['sanskrit'], original)
        self.assertEqual(result['references'], source['references'])
        self.assertEqual(result['verse_label'], source['verse_label'])
        self.assertNotIn('sanskrit_devanagari', source)

    def test_native_devanagari_is_preserved_verbatim(self):
        text = 'वात-पित्त-कफाः । १ ॥\n[पाठभेदः]'
        result = with_devanagari({'sanskrit': text, 'language': 'sa-Deva'})
        self.assertEqual(result['sanskrit_devanagari'], text)
        self.assertEqual(result['devanagari_method'], 'original')

    def test_normalized_diacritics_avagraha_and_line_breaks(self):
        result = with_devanagari({'sanskrit': unicodedata.normalize('NFD', 'so’ham |\nvāta-pitta ||'), 'language': 'sa-Latn'})
        self.assertEqual(result['sanskrit_devanagari'], 'सोऽहम् ।\nवात-पित्त ॥')

    def test_unknown_non_sanskrit_is_not_guessed(self):
        result = with_devanagari({'sanskrit': 'Editorial English note', 'language': 'en'})
        self.assertIsNone(result['sanskrit_devanagari'])
        result = with_devanagari({'sanskrit': 'athāto dīrghañjīvitīyamadhyāyaṃ', 'language': 'und'})
        self.assertEqual(result['sanskrit_devanagari'], 'अथातो दीर्घञ्जीवितीयमध्यायं')

    def test_retrieval_only_also_supplies_devanagari_without_model(self):
        packet = [{'sanskrit': 'vātaḥ', 'language': 'sa-Latn', 'citation_id': 'S1'}]
        result = answer('vata', [], packet=packet, provider=OpenRouter(key='', model=''), generate=False)
        self.assertEqual(result['citations'][0]['sanskrit_devanagari'], 'वातः')
        self.assertEqual(result['citations'][0]['sanskrit'], 'vātaḥ')


if __name__ == '__main__':
    unittest.main()
