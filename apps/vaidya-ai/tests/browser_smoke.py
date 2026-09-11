"""Manual end-to-end check against a running local app; requires Playwright."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def assert_fixed_viewport(page):
    assert page.evaluate("""() => document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight
        && window.scrollY === 0"""), "The document must stay within the viewport"
    for selector in ['#question', '#submit', '.site-header']:
        box = page.locator(selector).bounding_box()
        assert box and box['y'] >= 0 and box['y'] + box['height'] <= page.viewport_size['height'], selector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--output", type=Path, default=Path("data/runtime/browser"))
    parser.add_argument("--access-file", type=Path, help="Git-ignored JSON with hosted username/password")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        credentials = None
        if args.access_file:
            access = json.loads(args.access_file.read_text(encoding='utf-8'))
            if access.get('access') != 'public':
                credentials = {'username': access['username'], 'password': access['password'], 'origin': args.url}
        page = browser.new_page(viewport={"width": 1440, "height": 900}, http_credentials=credentials)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        # Explicitly disable generation so this test never incurs hosted cost.
        def retrieval_only(route):
            body = route.request.post_data_json
            body["generate"] = False
            import json
            headers = dict(route.request.headers)
            headers.pop('prefer', None)
            route.continue_(post_data=json.dumps(body), headers=headers)
        page.route("**/ask", retrieval_only)
        page.goto(args.url, wait_until="networkidle")
        page.locator('.hero-art img').evaluate('(image) => image.decode()')
        page.evaluate('Promise.all(document.getAnimations().map(animation => animation.finished))')
        assert page.locator('.hero-art img').evaluate('(image) => image.complete && image.naturalWidth > 0')
        assert_fixed_viewport(page)
        page.screenshot(path=str(args.output / "desktop.png"), full_page=True)
        page.locator("#question").click()
        assert page.locator("#question").evaluate("el => getComputedStyle(el).outlineStyle === 'none' && getComputedStyle(el).borderTopWidth === '0px' && getComputedStyle(el).borderBottomWidth === '0px'")
        assert page.locator(".composer").evaluate("el => el.matches(':focus-within')")
        page.screenshot(path=str(args.output / "focused-composer.png"), full_page=True)
        page.locator("#preferences > summary").click()
        assert_fixed_viewport(page)
        page.locator("#work").select_option("astangahrdayasamhita")
        assert 'Ashtanga Hridaya' in page.locator('#filter-summary').inner_text()
        page.locator("#question").fill("What are the three doshas in Ashtanga Hridaya?")
        with page.expect_response('**/ask') as response:
            page.locator("#submit").click()
        page.locator("#results").wait_for(state="visible", timeout=120000)
        reading = response.value.json()
        assert_fixed_viewport(page)
        assert page.locator(".source").count() > 0
        assert 'Translation is not available' in page.locator('.source-translation').first.inner_text()
        assert page.locator("#query-plan").is_visible()
        assert page.locator(".plan-card").count() > 0
        assert page.locator(".source").first.locator(".source-location .locator").count() == 3
        page.locator(".source button").first.click()
        assert page.locator("#source-dialog").is_visible()
        devanagari = reading['citations'][0]['sanskrit_devanagari']
        assert devanagari and any('\u0900' <= c <= '\u097f' for c in devanagari)
        assert page.locator('#dialog-sanskrit .devanagari-text').inner_text() == devanagari
        original = reading['citations'][0]['sanskrit']
        page.locator('#dialog-sanskrit .original-script summary').click()
        assert page.locator('#dialog-sanskrit .original-script blockquote').inner_text() == original
        assert page.locator("#dialog-location .locator").count() == 3
        page.keyboard.press("Escape")
        assert not page.locator("#source-dialog").is_visible()
        page.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=args.url)
        page.locator('.copy-source').first.click()
        page.locator('#toast').wait_for(state='visible')
        assert page.evaluate('navigator.clipboard.readText()') == original
        page.locator('.copy-devanagari').first.click()
        page.wait_for_function('(text) => navigator.clipboard.readText().then(value => value === text)', arg=devanagari)
        assert page.locator('.source .devanagari-text').first.inner_text() == devanagari
        page.screenshot(path=str(args.output / "results.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator('#show-sources').click()
        assert page.locator('#show-sources').get_attribute('aria-pressed') == 'true'
        assert page.locator('#evidence-panel').is_visible()
        assert not page.locator('#answer-panel').is_visible()
        page.locator('#query-plan > summary').click()
        page.locator('.plan-card').first.wait_for(state='visible')
        assert page.locator('.plan-body').evaluate('el => el.getBoundingClientRect().bottom <= innerHeight')
        page.keyboard.press('Escape')
        assert_fixed_viewport(page)
        page.screenshot(path=str(args.output / "mobile-results.png"), full_page=True)
        page.locator('#new-reading').click()
        assert page.locator('#empty').is_visible()
        assert not page.locator('#results').is_visible()
        assert page.locator('#question').input_value() == ''
        page.locator('#open-sessions').click()
        page.locator('.open-reading').first.click()
        assert page.locator('#results').is_visible()
        assert not page.locator('#sessions-dialog').evaluate('el => el.open')
        # Replay retrieved sources with one UI-only claim to exercise citation
        # navigation without asking the hosted model to generate an answer.
        citation_id = reading['citations'][-1]['citation_id']
        reading['claims'] = [
            {'text': 'Clinical priority fixture.', 'basis': 'clinical_priority', 'heading': 'Assessment first', 'evidence': []},
            {'text': 'Source navigation fixture.', 'basis': 'textual', 'heading': 'Textual comparison', 'evidence': [{'citation_id': citation_id}]}]
        reading['findings'] = [{'text': 'Fever', 'state': 'absent', 'question_quote': 'No fever'},
                               {'text': 'Strength', 'state': 'unknown', 'question_quote': None}]
        reading['evidence_status'] = 'supported'
        reading['model'] = 'openai/gpt-5.6-sol'
        reading['reasoning_effort'] = 'medium'
        reading['citations'][-1]['translation'] = {'text': 'Translation display fixture.', 'language': 'en',
            'model': reading['model'], 'status': 'generated', 'review_status': 'not_expert_reviewed'}
        page.unroute('**/ask', retrieval_only)
        page.route('**/ask', lambda route: route.fulfill(status=202, json={'job_id': 'browser-fixture', 'status': 'running'}))
        polls = []
        def job_result(route):
            polls.append(1)
            route.fulfill(json={'status': 'running'} if len(polls) == 1 else {'status': 'complete', 'result': reading})
        page.route('**/jobs/browser-fixture', job_result)
        page.locator('#question').fill('Explain these sources further.')
        page.locator('#submit').click()
        page.locator('.cite').wait_for(state='visible')
        assert len(polls) >= 2
        page.locator('.cite').click()
        assert page.locator('#evidence-panel').is_visible()
        assert page.locator('#show-sources').get_attribute('aria-pressed') == 'true'
        assert page.evaluate("document.activeElement.closest('.source').id") == f'source-{citation_id}'
        assert page.locator('#evidence').evaluate('el => el.scrollTop > 0')
        assert page.locator('#model-label').inner_text() == 'GPT 5.6 Sol · medium'
        translated_source = page.locator(f'#source-{citation_id}')
        assert translated_source.locator('.translation-text').inner_text() == 'Translation display fixture.'
        translated_source.locator('.source-actions button').first.click()
        assert page.locator('#dialog-translation .translation-text').inner_text() == 'Translation display fixture.'
        assert 'Not expert-reviewed' in page.locator('#dialog-translation').inner_text()
        page.keyboard.press('Escape')
        assert_fixed_viewport(page)
        page.locator('#show-answer').click()
        assert page.locator('#answer-panel').is_visible()
        assert page.locator('.clinical-priority .claim').inner_text() == 'Clinical priority fixture.'
        assert page.locator('.clinical-priority .cite').count() == 0
        page.locator('.case-findings summary').click()
        assert 'Explicitly absent' in page.locator('.case-findings').inner_text()
        assert 'Not established' in page.locator('.case-findings').inner_text()
        assert 'Indexed SARIT edition' in page.locator('.edition-note').first.inner_text()
        # Fit the real reading content and controls at common viewport sizes.
        viewports = [(1440, 900), (1366, 768), (1024, 768), (768, 1024), (390, 844), (375, 667), (320, 568), (844, 390)]
        for width, height in viewports:
            page.set_viewport_size({'width': width, 'height': height})
            assert_fixed_viewport(page)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(args.url, wait_until="networkidle")
        page.locator('#results').wait_for(state='visible')
        page.locator('#new-reading').click()
        page.screenshot(path=str(args.output / "mobile.png"), full_page=True)
        for width, height in viewports:
            page.set_viewport_size({'width': width, 'height': height})
            assert_fixed_viewport(page)
            assert page.locator('#empty').evaluate('el => el.scrollHeight <= el.clientHeight'), (width, height)
        page.set_viewport_size({'width': 320, 'height': 568})
        page.locator('#preferences > summary').click()
        page.locator('#answer-language').select_option('hi')
        assert page.locator('.filter-grid').evaluate('el => el.getBoundingClientRect().bottom <= innerHeight')
        page.locator('#allow-general').uncheck()
        assert not page.locator('#allow-general').is_checked()
        assert_fixed_viewport(page)
        page.keyboard.press('Escape')
        assert not page.locator('#preferences').evaluate('el => el.open')
        assert not errors, errors
        browser.close()
        print("Eight viewport sizes, contained scrolling, mobile reading views, citation navigation, focus styling, preferences, retrieval, source dialog, clipboard, history and JavaScript checks passed")


if __name__ == "__main__":
    main()
