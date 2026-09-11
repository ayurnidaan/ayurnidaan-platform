"""Draft clinical regression checks. --live makes paid OpenRouter calls.

Mechanical checks are not physician review or a clinical accuracy score.
Reference answers never enter the prompt or retrieval index.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vedai.answers import OpenRouter, answer
from vedai.passages import PassageStore
from vedai.query_planner import enhance_query, retrieve_plan
from vedai.retrieval import Retriever


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--ids', nargs='*')
    parser.add_argument('--output', type=Path, default=Path('reports/clinical-checks.json'))
    args = parser.parse_args()
    cases = [json.loads(line) for line in Path('eval/clinical_cases.jsonl').read_text(encoding='utf-8').splitlines()]
    if args.ids:
        cases = [c for c in cases if c['id'] in args.ids]
        if len(cases) != len(set(args.ids)):
            raise ValueError('Unknown case ID')
    provider, store, retriever = OpenRouter(), PassageStore(Path('data')), Retriever(Path('data'), 'expanded')
    if args.live and not provider.configured:
        raise ValueError('OpenRouter is not configured')
    folder = Path('data/runtime/clinical-live' if args.live else 'data/runtime/clinical-retrieval')
    folder.mkdir(parents=True, exist_ok=True)
    report = {'created_at': datetime.now(timezone.utc).isoformat(), 'live': args.live,
              'review_status': 'physician_review_pending',
              'scope': 'Mechanical source/structure checks only; not semantic or clinical validation.', 'cases': []}
    for case in cases:
        started = time.perf_counter()
        plan = enhance_query(case['question'], provider, enabled=args.live)
        hits, packet = retrieve_plan(case['question'], plan, retriever, store)
        checks = {'has_retrieved_passages': bool(packet), 'source_text_and_locators_exact': all(
            all(p[k] == store.get(p['passage_id'])[k] for k in ['sanskrit', 'verse_label', 'sections', 'references']) for p in packet)}
        result = answer(case['question'], hits, 'hi', provider, args.live, packet, query_plan=plan)
        if args.live:
            checks.update({'generation_complete': result['generation_status'] == 'complete',
                           'question_type': result.get('question_type') in (case.get('acceptable_question_types') or [case['expected_question_type']]),
                           'priority_first': not case['urgent_priority_expected'] or bool(result['claims'] and result['claims'][0].get('basis') == 'clinical_priority'),
                           'case_findings': case['expected_question_type'] != 'patient_case' or bool(result.get('findings')),
                           'context_not_cited': all(not c['evidence'] for c in result['claims'] if c.get('basis') in ['general_knowledge', 'modern_context', 'clinical_priority', 'evidence_gap', 'follow_up']),
                           'translations_present': all(p.get('translation', {}).get('status') == 'generated' for p in result['citations']) if result['generation_status'] == 'complete' else False})
        (folder / f"{case['id']}.json").write_text(json.dumps({**result, 'query_plan': plan}, ensure_ascii=False, indent=2), encoding='utf-8')
        row = {'id': case['id'], 'checks': checks, 'passed': all(checks.values()),
               'planning': plan['status'], 'generation': result['generation_status'],
               'validation_error': result.get('validation_error'), 'question_type': result.get('question_type'),
               'passages': len(packet), 'citations': len(result['citations']),
               'seconds': round(time.perf_counter()-started, 2)}
        report['cases'].append(row)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(row), flush=True)
    if not all(c['passed'] for c in report['cases']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
