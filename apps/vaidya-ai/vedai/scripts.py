"""Deterministic display-script conversion; stored citation text stays untouched."""
import re
import unicodedata


def with_devanagari(source):
    text = source['sanskrit']
    language = source.get('language', '')
    if 'Deva' in language or (re.search(r'[\u0900-\u097f]', text) and not re.search(r'[A-Za-zÀ-ɏḀ-ỿ]', text)):
        return {**source, 'sanskrit_devanagari': text, 'devanagari_method': 'original'}
    # Some SARIT Sanskrit commentaries omit xml:lang. Recognize their IAST
    # diacritics without treating arbitrary untagged English as Sanskrit.
    inferred_iast = language == 'und' and re.search(r'[āīūṛṝḷḹṅñṭḍṇśṣṃṁḥ]', unicodedata.normalize('NFC', text))
    if language in {'sa', 'san', 'sa-Latn'} or inferred_iast:
        from indic_transliteration import sanscript
        normalized = unicodedata.normalize('NFC', text).replace('’', "'").replace('ʼ', "'")
        converted = sanscript.transliterate(normalized, sanscript.IAST, sanscript.DEVANAGARI)
        return {**source, 'sanskrit_devanagari': converted, 'devanagari_method': 'iast_transliteration'}
    return {**source, 'sanskrit_devanagari': None, 'devanagari_method': 'unavailable'}
