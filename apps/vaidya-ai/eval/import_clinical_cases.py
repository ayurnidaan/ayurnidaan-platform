"""Import user-authored examples as review-pending evaluation data, never corpus evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('deep', type=Path)
    parser.add_argument('reference', type=Path)
    args = parser.parse_args()
    types = ['substance', 'formulation', 'diet', 'disease', 'disease', 'disease', 'procedure', 'examination', 'patient_case', 'patient_case']
    cases = []
    for group, path in [('deep', args.deep), ('reference', args.reference)]:
        content = path.read_text(encoding='utf-8')
        parts = re.split(r'^## (\d+)\. (.+)\n', content, flags=re.M)
        for offset in range(1, len(parts), 3):
            number, title, body = parts[offset:offset+3]
            question = re.search(r'\*\*डॉक्टर का प्रश्न:\*\*\s*(.+)', body).group(1).strip().strip('“”')
            answer = body.split('\n', 2)[-1].split('\n---\n')[0].strip()
            cases.append({'id': f'{group}-{int(number):02}', 'title': title, 'question': question,
                          'expected_question_type': types[int(number)-1] if group == 'reference' else ('disease' if int(number) == 4 else 'patient_case'),
                          'acceptable_question_types': ['disease', 'procedure'] if group == 'reference' and int(number) == 6 else [],
                          'urgent_priority_expected': group == 'deep' and int(number) in [3, 6, 9, 10],
                          'review_status': 'physician_review_pending', 'source_file': path.name,
                          'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'reference_answer_md': answer})
    assert len(cases) == 20 and len({c['id'] for c in cases}) == 20
    target = Path(__file__).with_name('clinical_cases.jsonl')
    target.write_text(''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in cases), encoding='utf-8')
    print(f'Imported {len(cases)} draft examples; not added to retrieval indexes.')


if __name__ == '__main__':
    main()
