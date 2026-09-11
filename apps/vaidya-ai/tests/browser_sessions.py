"""Session persistence, isolation and recovery against a running app; no paid calls."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def result(question):
    return {'question': question, 'answer_language': 'en', 'model': 'test/model',
            'evidence_status': 'supported', 'generation_status': 'complete',
            'claims': [{'text': 'A saved answer for ' + question, 'heading': 'Reading', 'basis': 'textual',
                        'evidence': [{'citation_id': 'S1'}]}],
            'citations': [{'citation_id': 'S1', 'title': 'Saved source', 'form': 'shloka', 'verse_label': '1.1',
                           'sections': [{'type': 'book', 'n': '1'}, {'type': 'chapter', 'n': '1'}],
                           'references': [{'xml_ids': ['source.1.1'], 'page': '2'}],
                           'kind': 'base-text', 'layer': 'base-text', 'language': 'sa-Latn',
                           'sanskrit': 'vāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ',
                           'sanskrit_devanagari': 'वायुः पित्तं कफश्चेति त्रयो दोषाः',
                           'devanagari_method': 'iast_transliteration', 'quote_verified': True,
                           'translation': {'status': 'generated', 'text': 'Three doshas.', 'language': 'en', 'model': 'test/model'},
                           'source_url': 'https://example.org/source'}]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8766')
    parser.add_argument('--output', type=Path, default=Path('data/runtime/browser-sessions'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        pending = {'question': None, 'complete': False}

        def ask(route):
            body = route.request.post_data_json
            requests.append(body)
            if body['question'].startswith('Slow'):
                pending.update(question=body['question'], complete=False)
                route.fulfill(status=202, json={'job_id': 'session-fixture', 'status': 'running'})
            else:
                route.fulfill(json=result(body['question']))

        context.route('**/ask', ask)
        context.route('**/jobs/session-fixture', lambda route: route.fulfill(json=(
            {'status': 'complete', 'result': result(pending['question'])} if pending['complete'] else {'status': 'running'})))

        def ready():
            expect(page.locator('#open-sessions')).to_be_enabled()

        def sessions():
            page.locator('#open-sessions').click()
            expect(page.locator('#sessions-dialog')).to_be_visible()

        def submit(question):
            page.locator('#question').fill(question)
            page.locator('#submit').click()
            expect(page.locator('#result-question')).to_have_text(question)
            expect(page.locator('#submit')).to_be_enabled()

        page.goto(args.url)
        ready()
        submit('What are the three doshas?')
        assert requests[-1]['conversation'] == []
        original = page.locator('.source .devanagari-text').first.inner_text()
        page.reload()
        ready()
        expect(page.locator('#result-question')).to_have_text('What are the three doshas?')
        assert page.locator('.source .devanagari-text').first.inner_text() == original
        assert page.locator('.translation-text').first.inner_text() == 'Three doshas.'
        for i in range(6):
            submit(f'Explain further {i}')
        assert len(requests[-1]['conversation']) == 4
        assert requests[-1]['conversation'][0]['question'] == 'Explain further 1'
        assert all(set(turn) == {'question', 'answer'} for turn in requests[-1]['conversation'])
        sessions()
        assert page.locator('.chat-turn').count() == 7  # History is not capped at the model window.
        page.locator('#rename-session').click()
        page.locator('#session-name').fill('Dosha study')
        page.locator('#rename-form button[type=submit]').click()
        expect(page.locator('#session-title')).to_have_text('Dosha study')
        first_id = page.locator('.session-item[aria-pressed=true]').get_attribute('data-session-id')
        page.screenshot(path=str(args.output / 'sessions-desktop.png'))
        for width, height in [(390, 844), (320, 568), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth')
            for selector in ['#create-session', '#continue-session', '#session-turns']:
                box = page.locator(selector).bounding_box()
                assert box and box['height'] > 0 and box['y'] >= 0 and box['y'] + box['height'] <= height, (selector, box)
            assert page.locator('#session-turns').evaluate('el => el.scrollHeight > el.clientHeight')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(args.output / 'sessions-mobile.png'))
        page.locator('#create-session').click()
        expect(page.locator('#sessions-dialog')).not_to_be_visible()
        submit('An unrelated new question')
        assert requests[-1]['conversation'] == []
        sessions()
        second_id = page.locator('.session-item[aria-pressed=true]').get_attribute('data-session-id')
        assert page.locator('.chat-turn').count() == 1
        page.locator(f'[data-session-id="{first_id}"]').click()
        assert page.locator('.chat-turn').count() == 7
        page.locator('.open-reading').first.click()
        expect(page.locator('#result-question')).to_have_text('What are the three doshas?')
        submit('Continue the dosha study')
        assert all(turn['question'] != 'An unrelated new question' for turn in requests[-1]['conversation'])
        expect(page.locator('#active-session')).to_have_text('Dosha study')

        # A query finishing after switching sessions must remain in its original session.
        page.locator('#question').fill('Slow reading while switching')
        with page.expect_response('**/jobs/session-fixture'):
            page.locator('#submit').click()
        sessions()
        expect(page.locator('#delete-session')).to_be_disabled()
        page.locator(f'[data-session-id="{second_id}"]').click()
        page.locator('#close-sessions').click()
        pending['complete'] = True
        expect(page.locator('#submit')).to_be_enabled(timeout=15000)
        expect(page.locator('#result-question')).to_have_text('An unrelated new question')
        sessions()
        page.locator(f'[data-session-id="{first_id}"]').click()
        page.locator('.open-reading').last.click()
        expect(page.locator('#result-question')).to_have_text('Slow reading while switching')

        # Resume a saved job after refresh without making another POST /ask.
        page.locator('#question').fill('Slow reading across refresh')
        with page.expect_response('**/jobs/session-fixture'):
            page.locator('#submit').click()
        count = len(requests)
        page.reload()
        ready()
        sessions()
        pending['complete'] = True
        page.locator('.resume-reading').click()
        expect(page.locator('#result-question')).to_have_text('Slow reading across refresh')
        expect(page.locator('#submit')).to_be_enabled()
        assert len(requests) == count

        # Atomic updates keep edits and readings from two tabs in one session.
        other = context.new_page()
        other.goto(args.url)
        expect(other.locator('#open-sessions')).to_be_enabled()
        other.locator('#open-sessions').click()
        other.locator(f'[data-session-id="{first_id}"]').click()
        other.locator('#rename-session').click()
        other.locator('#session-name').fill('Shared browser session')
        other.locator('#rename-form button[type=submit]').click()
        expect(other.locator('#session-title')).to_have_text('Shared browser session')
        submit('Another turn from the first tab')
        expect(page.locator('#active-session')).to_have_text('Shared browser session')
        other.close()
        sessions()
        page.locator('#delete-session').click()
        page.locator('#cancel-delete').click()
        assert page.locator('.session-item').count() == 2
        page.locator('#delete-session').click()
        page.locator('#confirm-delete').click()
        expect(page.locator('.session-item')).to_have_count(1)
        page.locator('#close-sessions').click()
        page.reload()
        ready()
        expect(page.locator('#result-question')).to_have_text('An unrelated new question')
        sessions()
        expect(page.locator('.session-item')).to_have_count(1)

        # A separate visitor profile starts with empty history.
        visitor = browser.new_context()
        fresh = visitor.new_page()
        fresh.goto(args.url)
        expect(fresh.locator('#open-sessions')).to_be_enabled()
        fresh.locator('#open-sessions').click()
        assert fresh.locator('.chat-turn').count() == 0
        assert 'Dosha study' not in fresh.locator('#sessions-dialog').inner_text()
        visitor.close()

        # Storage unavailable: honest notice, still usable within the tab.
        temporary = browser.new_context()
        temporary.add_init_script("Object.defineProperty(window, 'indexedDB', {get() {throw new Error('Storage blocked');}})")
        temporary.route('**/ask', lambda route: route.fulfill(json=result(route.request.post_data_json['question'])))
        transient = temporary.new_page()
        transient.goto(args.url)
        expect(transient.locator('#storage-warning')).to_be_visible()
        expect(transient.locator('#submit')).to_be_enabled()
        transient.locator('#question').fill('Temporary reading')
        transient.locator('#submit').click()
        expect(transient.locator('#result-question')).to_have_text('Temporary reading')
        transient.locator('#open-sessions').click()
        expect(transient.locator('.chat-turn')).to_have_count(1)
        temporary.close()
        assert not errors, errors
        browser.close()
    print('Session CRUD, full-history persistence, context bounds/isolation, job recovery, multi-tab updates, mobile layout and unavailable storage passed; no paid calls.')


if __name__ == '__main__':
    main()
