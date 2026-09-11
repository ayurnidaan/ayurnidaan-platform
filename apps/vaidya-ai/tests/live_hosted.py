"""Explicit paid browser check through the configured Cloudflare endpoint."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.request
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--access-file', type=Path, default=Path('data/runtime/deployment-access.json'))
    parser.add_argument('--case-id', help='Use one imported Hindi clinical regression case')
    args = parser.parse_args()
    case = None
    if args.case_id:
        case = next(c for c in (json.loads(line) for line in Path('eval/clinical_cases.jsonl').read_text(encoding='utf-8').splitlines()) if c['id'] == args.case_id)
    access = json.loads(args.access_file.read_text(encoding='utf-8'))
    url = access['url']
    assert url.startswith('https://')
    credentials = None
    if access.get('access') != 'public':
        credentials = {key: access[key] for key in ['username', 'password']}
        credentials['origin'] = url
    output = Path('data/runtime/browser-hosted-clinical' if case else 'data/runtime/browser-hosted')
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 900}, http_credentials=credentials)
        errors, completed, polls = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def response_seen(response):
            if '/jobs/' in response.url and response.status == 200:
                polls.append(response.url)
                payload = response.json()
                if payload.get('status') == 'complete':
                    completed.append(payload['result'])
        page.on('response', response_seen)
        response = page.goto(url, wait_until='networkidle')
        assert response.status == 200 and response.headers.get('server') == 'cloudflare'
        page.locator('#preferences > summary').click()
        page.locator('#work').select_option('' if case else 'carakasamhita')
        page.locator('#kind').select_option('base-text')
        page.locator('#answer-language').select_option('hi' if case else 'en')
        page.locator('#question').fill(case['question'] if case else 'How does Charaka define Ayurveda?')
        with page.expect_response('**/ask') as response:
            page.locator('#submit').click()
        assert response.value.status == 202
        page.locator('#results').wait_for(state='visible', timeout=420000)
        assert completed and polls and not errors, errors
        result = completed[-1]
        assert result['generation_status'] == 'complete' and result['evidence_status'] == 'supported'
        assert result['model'] == 'openai/gpt-5.6-sol' and result['reasoning_effort'] == 'medium'
        assert result['citations'] and page.locator('.translation-text').count() == len(result['citations'])
        if case:
            assert result['question_type'] == case['expected_question_type']
            assert page.locator('.case-findings').count() == 1
            assert page.locator('.answer-section').count() == len(result['claims'])
            if case['urgent_priority_expected']:
                assert page.locator('.answer-section').first.get_attribute('data-basis') == 'clinical_priority'
                assert page.locator('.clinical-priority .cite').count() == 0
            page.locator('.case-findings summary').click()
            assert page.locator('.case-findings li').count() == len(result['findings'])
        headers = {}
        if credentials:
            encoded = base64.b64encode((access['username'] + ':' + access['password']).encode()).decode()
            headers['Authorization'] = 'Basic ' + encoded
        for citation in result['citations']:
            assert citation['translation']['status'] == 'generated'
            request = urllib.request.Request(url + '/passages/' + citation['passage_id'], headers=headers)
            with urllib.request.urlopen(request, timeout=30) as response:
                original = json.load(response)
            for field in ['sanskrit', 'verse_label', 'references', 'sections']:
                assert original[field] == citation[field]
        page.locator('.answer-scroll').evaluate('el => el.scrollTop = 0')
        page.screenshot(path=str(output / 'live-desktop.png'))
        page.locator('.source-actions button').first.click()
        assert page.locator('#dialog-translation .translation-text').inner_text() == result['citations'][0]['translation']['text']
        page.screenshot(path=str(output / 'live-source-reader.png'))
        page.keyboard.press('Escape')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('#show-sources').click()
        page.locator('.translation-text').first.scroll_into_view_if_needed()
        assert page.evaluate('document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth && scrollY === 0')
        page.screenshot(path=str(output / 'live-mobile.png'))
        browser.close()
    (output / 'live-reading.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'url': url, 'access': 'password' if credentials else 'public', 'project': 'tribe-v2-host',
              'vm': 'vedai-web', 'zone': 'us-central1-a', 'model': result['model'], 'reasoning_effort': result['reasoning_effort'],
              'async_submission_status': 202, 'completed_poll_count': len(polls), 'generation_status': result['generation_status'],
              'source_texts_and_locators_match': True, 'translations_rendered': len(result['citations']),
              'viewport_contained': True, 'javascript_errors': errors, 'timing': result['timing'],
              'scope': 'One paid hosted development reading; source integrity and UI checks, not expert translation assessment.'}
    if case:
        report.update({'case_id': case['id'], 'question_type': result['question_type'], 'findings': len(result['findings']),
                       'clinical_priority_first': result['claims'][0]['basis'] == 'clinical_priority'})
    Path('reports/clinical-hosted-checks.json' if case else 'reports/hosted-checks.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Hosted Sol/medium reading passed: {len(result["citations"])} translated sources, {len(polls)} polls, original locators checked.')


if __name__ == '__main__':
    main()
