"""Explicit paid checks for Sol/medium and source-bound translations."""
import argparse
import json
from pathlib import Path
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    args = parser.parse_args()
    cases = [
        {'question': 'sar dard and pet kharab lag raha h patli tatti aa rahi h', 'answer_language': 'en'},
        {'question': 'चरक के अनुसार आयुर्वेद की परिभाषा क्या है?', 'answer_language': 'hi', 'filters': {'work': 'carakasamhita'}},
        {'question': 'What does a computer CPU do?', 'answer_language': 'en'},
    ]
    runtime = Path('data/runtime')
    runtime.mkdir(parents=True, exist_ok=True)
    checks = []
    for index, body in enumerate(cases):
        request = urllib.request.Request(args.url + '/ask', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=420) as response:
            result = json.load(response)
        (runtime / f'translation-{index}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        assert result['model'] == 'openai/gpt-5.6-sol'
        assert result['reasoning_effort'] == 'medium'
        assert result['generation_status'] == 'complete', result.get('message', result['generation_status'])
        assert result['query_plan']['status'] == 'enhanced'
        if index == 2:
            assert result['evidence_status'] == 'general_knowledge'
            assert result['citations'] == []
            assert all(not c['evidence'] for c in result['claims'])
        else:
            assert result['evidence_status'] == 'supported'
            assert result['citations']
            assert {r['citation_id'] for c in result['claims'] for r in c['evidence']} == {c['citation_id'] for c in result['citations']}
            for citation in result['citations']:
                translation = citation['translation']
                assert translation['status'] == 'generated' and translation['text'].strip()
                assert translation['language'] == body['answer_language']
                assert translation['model'] == result['model']
                assert translation['review_status'] == 'not_expert_reviewed'
                with urllib.request.urlopen(args.url + '/passages/' + citation['passage_id'], timeout=30) as response:
                    original = json.load(response)
                for field in ['sanskrit', 'references', 'verse_label', 'sections', 'title']:
                    assert original[field] == citation[field], field
                if body['answer_language'] == 'hi':
                    assert any('\u0900' <= char <= '\u097f' for char in translation['text'])
        checks.append({'question': body['question'], 'language': body['answer_language'], 'model': result['model'],
                       'reasoning_effort': result['reasoning_effort'], 'status': result['evidence_status'],
                       'translated_sources': len(result['citations']), 'source_texts_and_locators_match': True,
                       'seconds': result['timing']['total_seconds']})
        print(f"Passed case {index + 1}: {result['evidence_status']}, {len(result['citations'])} translated sources", flush=True)
    Path('reports/translation-checks.json').write_text(json.dumps({'checks': checks,
        'scope': 'Development checks for source binding, original text integrity, model configuration and translation presence. Translation accuracy and completeness have not been independently assessed by a Sanskrit expert.'}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
