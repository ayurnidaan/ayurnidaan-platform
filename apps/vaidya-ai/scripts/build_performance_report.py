"""Build the formal VedAI report from recorded measurements, with optional verification.

Requires matplotlib, Playwright with Chromium, and PyMuPDF for report generation.
Browser verification uses retrieval-only requests and fixtures, never paid generation.
"""
import argparse
import base64
from datetime import datetime
from html import escape
import io
import json
from pathlib import Path
import re
import statistics
import subprocess
import sys
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/performance'
GREEN = '#18533d'
INK = '#20382e'
MUTED = '#60756b'


def read(name):
    return json.loads((ROOT / 'reports' / name).read_text(encoding='utf-8'))


def verify(url):
    """Capture current checks independently of older evaluation measurements."""
    checks = {}
    commands = {
        'unit_tests': [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-q'],
        'reading_interface': [sys.executable, 'tests/browser_smoke.py', '--url', url,
                              '--output', 'data/runtime/performance-report/interface'],
        'sessions': [sys.executable, 'tests/browser_sessions.py', '--url', url,
                     '--output', 'data/runtime/performance-report/sessions'],
    }
    for name, command in commands.items():
        print(f'Checking {name}...', flush=True)
        run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        output = run.stdout + run.stderr
        if run.returncode:
            raise RuntimeError(f'{name} failed:\n{output}')
        checks[name] = {'passed': True, 'command': command[1:], 'output': output.strip()}
        if name == 'unit_tests':
            checks[name]['count'] = int(re.search(r'Ran (\d+) tests', output).group(1))
            skipped = re.search(r'skipped=(\d+)', output)
            checks[name]['skipped'] = int(skipped.group(1)) if skipped else 0
    checks['reading_interface']['viewports'] = [[1440, 900], [1366, 768], [1024, 768], [768, 1024],
                                               [390, 844], [375, 667], [320, 568], [844, 390]]
    record = {'verified_at': datetime.now().astimezone().isoformat(),
              'code_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'target': 'Local application with paid generation disabled in browser checks',
              'paid_model_calls': 0, 'checks': checks}
    (OUT / 'verification.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    return record


def chart_image(fig, filename):
    fig.savefig(OUT / filename, format='svg', bbox_inches='tight', pad_inches=.04, transparent=True)
    content = (OUT / filename).read_bytes()
    return 'data:image/svg+xml;base64,' + base64.b64encode(content).decode()


CSS = """
@page {size:A4;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#e9eeeb;color:#20382e;font-family:Calibri,'Trebuchet MS',sans-serif;font-size:11pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:210mm;height:297mm;margin:12mm auto;background:white;padding:17mm 19mm 19mm;position:relative;break-after:page;box-shadow:0 3mm 12mm #163f2915;overflow:hidden}.sheet:last-child{break-after:auto}
.running-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:5mm;border-bottom:.35mm solid #18533d;color:#18533d;font-size:8pt;letter-spacing:1.5px;text-transform:uppercase}.brand{font-family:Georgia,serif;letter-spacing:-.4px;font-size:19pt;text-transform:none}.running-head .edition{font-size:7.5pt;letter-spacing:1px}
.footer{position:absolute;left:19mm;right:19mm;bottom:12mm;border-top:.2mm solid #cfdbd4;padding-top:3mm;display:flex;justify-content:space-between;color:#60756b;font-size:7.5pt}.footer span:last-child{font-variant-numeric:tabular-nums}
.eyebrow{font-size:8pt;letter-spacing:1.8px;color:#60756b;text-transform:uppercase;margin:9mm 0 3mm;font-weight:600}h1,h2,h3{font-family:Georgia,serif;color:#18533d;font-weight:400}h1{font-size:40pt;line-height:1.1;letter-spacing:-1.3px;margin:4mm 0 6mm}h2{font-size:27pt;line-height:1.17;letter-spacing:-.6px;margin:0 0 4mm}h3{font-size:15pt;line-height:1.3;margin:7mm 0 3mm}p{margin:0 0 3.5mm}.lead{font-size:12pt;line-height:1.55;color:#405d4e;max-width:160mm}.small{font-size:9pt;line-height:1.5}.tiny{font-size:8pt;line-height:1.45}.muted{color:#60756b}.number{font-variant-numeric:tabular-nums}.intro-rule{width:16mm;border:0;border-top:1mm solid #18533d;margin:8mm 0}
.hero-metric{margin:8mm 0 0;padding:6mm 0;border-top:.2mm solid #cfdbd4;border-bottom:.2mm solid #cfdbd4;display:grid;grid-template-columns:95mm 1fr;gap:6mm;align-items:center}.hero-value{font:70pt/1 Georgia,serif;letter-spacing:-3px;color:#18533d}.hero-value span{font-size:32pt;letter-spacing:-1px}.hero-caption{margin-top:3mm;font-size:9pt;color:#60756b}.hero-description{font-size:10.5pt;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7mm;margin:6mm 0}.metric{padding-right:5mm;border-right:.2mm solid #cfdbd4}.metric:last-child{border:0;padding:0}.metric strong{display:block;font:26pt/1.1 Georgia,serif;color:#18533d;margin-bottom:2mm}.metric span{display:block;font-size:9pt;color:#405d4e}.metric small{display:block;font-size:8pt;color:#60756b;margin-top:2mm}
.note{background:#f0f5f1;border-left:.7mm solid #18533d;padding:4mm 5mm;font-size:9.3pt;line-height:1.5;margin:5mm 0}.note p:last-child{margin:0}.label{font-size:8pt;letter-spacing:1px;text-transform:uppercase;font-weight:600;color:#18533d;display:block;margin-bottom:2mm}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.two-col h3{margin-top:0}.rule-section{border-top:.2mm solid #cfdbd4;padding-top:5mm;margin-top:6mm}
table{border-collapse:collapse;width:100%;font-size:9.5pt;font-variant-numeric:tabular-nums}th{text-align:left;font-size:8pt;letter-spacing:.5px;font-weight:600;color:#60756b;border-bottom:.3mm solid #18533d;padding:2.6mm 2mm}td{padding:2.7mm 2mm;border-bottom:.2mm solid #e0e7e2;vertical-align:top}th:first-child,td:first-child{padding-left:0}th:last-child,td:last-child{padding-right:0}.right{text-align:right}.highlight td{background:#f0f5f1;color:#18533d;font-weight:600}.highlight td:first-child{padding-left:2mm}.highlight td:last-child{padding-right:2mm}.compact{font-size:9pt}.compact td{padding-top:2mm;padding-bottom:2mm}.pass{color:#18533d;white-space:nowrap;font-weight:600}.chart{width:100%;display:block;margin:3mm 0}.figure-caption{font-size:8pt;color:#60756b;margin:2mm 0 5mm}.source-note{font-size:8pt;color:#60756b;margin-top:4mm}.source-note a,.reference a{color:#3a604c;text-decoration:none}a:hover{text-decoration:underline}.section-number{font:11pt Georgia,serif;color:#7a9184;display:block;margin-bottom:2mm}.page-body{padding-bottom:4mm}
.source-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin:5mm 0}.source-stats div{border-top:.5mm solid #18533d;padding-top:3mm}.source-stats strong{display:block;font:22pt Georgia,serif;color:#18533d}.source-stats span{font-size:8.5pt;color:#60756b}.corpus-table{font-size:8.8pt}.corpus-table td{padding:1.7mm 2mm}.corpus-table th{padding-top:2mm;padding-bottom:2mm}.corpus-table td:first-child{width:70%}.check-table td:first-child{width:33%}.check-table td:last-child{width:16%;text-align:right}.check-table{font-size:9pt}.check-table td{padding-top:2.7mm;padding-bottom:2.7mm}
.latency-highlight{display:flex;align-items:baseline;gap:5mm;padding:5mm 0 4mm;border-bottom:.2mm solid #cfdbd4}.latency-highlight strong{font:37pt Georgia,serif;color:#18533d;white-space:nowrap}.latency-highlight span{font-size:10pt;color:#60756b}.verification-strip{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:6mm}.verification-strip>div{border-top:.5mm solid #18533d;padding-top:3mm}.verification-strip strong{font:25pt Georgia,serif;color:#18533d}.verification-strip p{font-size:9pt;margin-top:2mm}.method-grid{display:grid;grid-template-columns:35mm 1fr;column-gap:6mm;row-gap:3.5mm;font-size:9.2pt}.method-grid dt{color:#18533d;font-weight:600}.method-grid dd{margin:0}.references{margin-top:3mm;display:grid;grid-template-columns:1fr 1fr;gap:3.5mm 7mm}.reference{font-size:8pt;line-height:1.45;overflow-wrap:anywhere}.reference strong{display:block;font-size:8.5pt;color:#18533d;margin-bottom:.8mm}.reference .files{color:#60756b;font-family:Calibri,sans-serif}.document-meta{font-size:8pt;color:#60756b;border-top:.2mm solid #cfdbd4;margin-top:5mm;padding-top:3mm}.cover-meta{display:flex;justify-content:space-between;margin-top:6mm;font-size:8.5pt;color:#60756b}.print-hint{max-width:210mm;margin:8mm auto -6mm;color:#405d4e;font-size:10pt;text-align:center}
@media print{body{background:white}.sheet{margin:0;box-shadow:none}.print-hint{display:none}a{text-decoration:none}}
@media screen and (max-width:820px){body{overflow-x:auto}.sheet{margin:6mm auto}.print-hint{width:210mm}}
/* Print rhythm: preserve readable type while keeping each section on one sheet. */
body{font-size:10.5pt;line-height:1.4}h1{font-size:37pt;margin-bottom:5mm}h3{margin-top:4mm;margin-bottom:2.5mm}p{margin-bottom:3mm}.lead{font-size:11.3pt;line-height:1.45}.eyebrow{margin-top:6mm}.hero-metric{margin-top:6mm;padding:5mm 0}.hero-description{font-size:10pt;line-height:1.5}.metrics{margin:4mm 0}.note{padding:3.5mm 4mm;font-size:9pt;margin:4mm 0}.rule-section{padding-top:4mm;margin-top:5mm}td{padding-top:2mm;padding-bottom:2mm}th{padding-top:2mm;padding-bottom:2mm}.compact td{padding-top:1.6mm;padding-bottom:1.6mm}.corpus-table td{padding-top:1.3mm;padding-bottom:1.3mm}.check-table td{padding-top:2mm;padding-bottom:2mm}.method-grid{row-gap:3mm;font-size:9pt}.references{gap:3mm 7mm}.source-note{margin-top:3mm}.verification-strip{margin-top:4mm}
"""


def build(date, verification):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    font = Path('C:/Windows/Fonts/calibri.ttf')
    if font.exists():
        font_manager.fontManager.addfont(str(font))
    plt.rcParams.update({'font.family': 'Calibri' if font.exists() else 'DejaVu Sans', 'font.size': 10,
                         'text.color': INK, 'axes.labelcolor': MUTED, 'xtick.color': MUTED,
                         'ytick.color': INK, 'svg.fonttype': 'path'})
    evaluations = {name: read(f'eval-{name}.json') for name in ['expanded', 'hybrid', 'lexical', 'semantic']}
    expanded = evaluations['expanded']['metrics']
    corpus, integrity, validation = read('corpus-summary.json'), read('passages-integrity.json'), read('validation.json')
    clinical, retrieval = read('clinical-summary.json'), read('clinical-retrieval-checks.json')
    deployment, translations, guides = read('clinical-deployment.json'), read('translation-checks.json'), read('source-guide-checks.json')
    cases = [json.loads(line) for line in (ROOT / 'eval/clinical_cases.jsonl').read_text(encoding='utf-8').splitlines()]
    by_id = {row['id']: row for row in cases}
    patient_cases = sum(by_id[row['id']]['expected_question_type'] == 'patient_case' for row in clinical['cases'])
    urgent_cases = sum(by_id[row['id']]['urgent_priority_expected'] for row in clinical['cases'])
    rows = clinical['cases']
    assert len(rows) == 20 and all(row['passed'] for row in rows)
    assert integrity['full_source_text_and_locators_match']
    assert all(not guide['missing'] for guide in guides['guides'])
    times = [row['seconds'] for row in rows]
    local_times = [row['seconds'] for row in retrieval['cases']]
    unit = verification['checks']['unit_tests']
    unit_passed = unit['count'] - unit['skipped']
    count = len(verification['checks']['reading_interface']['viewports'])
    date_text = datetime.strptime(date, '%Y-%m-%d').strftime('%d %B %Y')
    version = verification['code_commit'][:7]
    source_link = lambda filename, label: f'<a href="../{filename}">{label}</a>'

    # Standard plotting library, common zero baseline, and no truncated score axis.
    fig, ax = plt.subplots(figsize=(7.4, 1.85))
    labels = ['Vocabulary-expanded', 'Hybrid', 'Basic keyword', 'EmbeddingGemma']
    values = [evaluations[name]['metrics']['natural_question']['recall_at_10'] * 100 for name in evaluations]
    bars = ax.barh(labels[::-1], values[::-1], height=.51,
                   color=['#c8d5cc', '#b1c5b7', '#89aa96', GREEN], zorder=3)
    for bar, value in zip(bars, values[::-1]):
        ax.text(value + 1.5, bar.get_y() + bar.get_height()/2, f'{value:.2f}%', va='center', fontsize=10, color=GREEN)
    ax.set_xlim(0, 102)
    ax.set_xticks([0, 25, 50, 75, 100], labels=['0', '25', '50', '75', '100'])
    ax.set_xlabel('Recall@10 (%)', fontsize=9, labelpad=7)
    ax.grid(axis='x', color='#e5ece7', linewidth=.6, zorder=0)
    ax.tick_params(axis='both', length=0, pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    chart = chart_image(fig, 'retrieval-comparison.svg')
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(7.3, 1.2))
    for row, prefix in enumerate(['deep-', 'reference-']):
        series = sorted(c['seconds'] for c in rows if c['id'].startswith(prefix))
        ax.scatter(series, [row + (i % 3 - 1)*.065 for i in range(len(series))], s=32,
                   color=GREEN if row == 0 else '#8ba793', edgecolors='white', linewidth=.6, zorder=3)
    ax.set_yticks([0, 1], ['Clinical cases', 'Reference questions'])
    ax.invert_yaxis()
    ax.set_ylim(1.5, -.5)
    ax.set_xlim(0, 180)
    ax.set_xticks([0, 30, 60, 90, 120, 150, 180])
    ax.set_xlabel('Recorded total time (seconds)', fontsize=9, labelpad=6)
    ax.grid(axis='x', color='#e5ece7', linewidth=.6, zorder=0)
    ax.tick_params(axis='both', length=0, pad=7)
    for spine in ax.spines.values():
        spine.set_visible(False)
    latency_chart = chart_image(fig, 'recorded-answer-latency.svg')
    plt.close(fig)

    pages = []
    def page(title, content, cover=False):
        number = len(pages) + 1
        pages.append(f'''<section class="sheet" aria-label="Page {number}: {escape(title)}">
          <header class="running-head"><span class="brand">VedAI</span><span class="edition">Research &amp; engineering / September 2026</span></header>
          <main class="page-body">{content}</main>
          <footer class="footer"><span>VedAI | Performance &amp; Evaluation Report</span><span>{date_text} &nbsp; / &nbsp; {number:02d}</span></footer>
        </section>''')

    page('Executive overview', f'''
      <p class="eyebrow">Technical performance report / Version 1.0</p>
      <h1>Measured performance.<br>Traceable evidence.</h1>
      <p class="lead">An evaluation of VedAI's Sanskrit retrieval, source preservation,
      structured answer checks and application performance.</p>
      <div class="hero-metric"><div><div class="hero-value">{expanded['natural_question']['recall_at_10']*100:.1f}<span>%</span></div>
      <div class="hero-caption">Retrieval Recall@10 | Vocabulary-expanded baseline</div></div>
      <p class="hero-description">Average coverage of expected source segments within the first ten retrieved chunks,
      measured across 48 natural-language questions in four language forms.</p></div>
      <div class="metrics">
        <div class="metric"><strong>{expanded['natural_question']['mrr']:.3f}</strong><span>Mean reciprocal rank</span><small>Natural-question retrieval</small></div>
        <div class="metric"><strong>15 / 15</strong><span>Exact-quote targets found first</span><small>One target for each indexed work</small></div>
        <div class="metric"><strong>20 / 20</strong><span>Answer check cases passed</span><small>Latest recorded mechanical checks</small></div>
      </div>
      <div class="note"><span class="label">Evaluation scope</span>
      This report presents recorded development measurements. Retrieval percentages describe source recovery;
      answer checks describe structural conformance and source integrity. Each result is tied to its dataset and evaluation procedure.</div>
      <h3>A source-grounded reading system</h3>
      <p>VedAI combines natural-language query planning with retrieval from the SARIT Ayurveda collection.
      Its reading interface presents original Sanskrit, Devanagari rendering, translations and stored book,
      chapter and verse locators alongside the generated answer.</p>
      <div class="two-col rule-section"><div><span class="label">Indexed collection</span><p class="small">15 Ayurveda works<br>26,585 retrieval chunks<br>111,195 complete source passages</p></div>
      <div><span class="label">Report contents</span><p class="small">Retrieval performance and corpus provenance.<br>Answer checks and operational measurements.<br>Evaluation methodology and source records.</p></div></div>
    ''', cover=True)

    score_rows = ''.join(f'''<tr class="{'highlight' if name == 'expanded' else ''}"><td>{label}</td>
      <td class="right">{evaluations[name]['metrics']['natural_question']['recall_at_10']*100:.2f}%</td>
      <td class="right">{evaluations[name]['metrics']['natural_question']['mrr']:.3f}</td></tr>'''
      for name, label in zip(evaluations, labels))
    language_rows = ''.join(f'''<tr><td>{label}</td><td class="right">12</td>
      <td class="right">{expanded['natural_question/'+code]['recall_at_10']*100:.2f}%</td>
      <td class="right">{expanded['natural_question/'+code]['mrr']:.3f}</td></tr>'''
      for code, label in [('en', 'English'), ('hi', 'Hindi'), ('sa-Latn', 'Romanized Sanskrit'), ('sa-Deva', 'Devanagari Sanskrit')])
    page('Retrieval performance', f'''
      <p class="eyebrow">01 / Retrieval evaluation</p><h2>Finding the relevant source.</h2>
      <p class="lead">Vocabulary-expanded retrieval achieved the highest recall and ranking score among the four evaluated configurations.</p>
      <img class="chart" src="{chart}" alt="Recall at ten: vocabulary-expanded 85.42 percent, hybrid 45.83 percent, basic keyword 12.50 percent, EmbeddingGemma 6.25 percent.">
      <table><thead><tr><th>Retrieval configuration</th><th class="right">Recall@10</th><th class="right">MRR</th></tr></thead><tbody>{score_rows}</tbody></table>
      <h3>Performance by query language</h3>
      <table class="compact"><thead><tr><th>Language form</th><th class="right">Questions</th><th class="right">Recall@10</th><th class="right">MRR</th></tr></thead><tbody>{language_rows}</tbody></table>
      <div class="note"><span class="label">What the scores measure</span>
      Recall@10 is the average fraction of expected source segments recovered within ten chunks.
      MRR averages the reciprocal rank of the first relevant chunk, assigning zero when none is found. Higher scores indicate better retrieval.</div>
      <p class="small muted">The 48 questions represent 12 topics in four language forms across three core works.
      Book filters were supplied. These baseline measurements precede AI query enhancement and the later avagraha normalization update.</p>
      <p class="source-note">Records: {source_link('eval-expanded.json', '[R1] Retrieval evaluation files')} and {source_link('../eval/README.md', '[R2] Dataset definition')}.</p>
    ''')

    work_rows = ''.join(f'<tr><td>{escape(row["title"])}</td><td class="right">{row["segments"]:,}</td><td class="right">{row["chunks"]:,}</td></tr>' for row in corpus['works'])
    page('Corpus and source integrity', f'''
      <p class="eyebrow">02 / Collection and provenance</p><h2>Preserving the original evidence.</h2>
      <p class="lead">The complete pinned SARIT download contains 110 files, including 88 XML files.
      The processed Ayurveda collection comprises the following 15 works.</p>
      <div class="source-stats"><div><strong>{corpus['segments']:,}</strong><span>Extracted source segments</span></div>
      <div><strong>{corpus['chunks']:,}</strong><span>Searchable retrieval chunks</span></div>
      <div><strong>{integrity['passages']:,}</strong><span>Complete source passages</span></div></div>
      <table class="corpus-table"><thead><tr><th>Indexed work</th><th class="right">Segments</th><th class="right">Chunks</th></tr></thead><tbody>{work_rows}</tbody></table>
      <div class="two-col rule-section"><div><span class="label">Extraction and index checks</span>
      <p class="small">{validation['source_files_verified']} source files verified<br>{validation['citation_spans_verified']:,} citation spans verified<br>Chunk coverage and index identities verified</p></div>
      <div><span class="label">Passage preservation</span><p class="small">{integrity['source_segments_checked']:,} constituent segments checked<br>{integrity['joined_units']:,} joined source units<br>Stored text and locators matched throughout</p></div></div>
      <p class="small muted">Exact-quote retrieval recovered all 15 target passages at rank 1.
      These checks verify text preservation, traceability and source-location resolution.</p>
      <p class="source-note">Records: [R3] Corpus inventory, [R4] Extraction validation and [R5] Passage integrity. Pinned SARIT revision: <span class="number">{corpus['revision'][:12]}</span>.</p>
    ''')

    check_rows = [
        ('Evidence available', 'A retrieved evidence packet is present.', '20 / 20'),
        ('Source preservation', 'Sanskrit, verse labels, sections and references match storage.', '20 / 20'),
        ('Generation completion', 'A completed structured answer is returned.', '20 / 20'),
        ('Question structure', 'The answer uses an accepted question type.', '20 / 20'),
        ('Clinical priority order', 'The priority statement appears first in designated urgent cases.', f'{urgent_cases} / {urgent_cases}'),
        ('Case findings', 'Patient-case answers include structured findings.', f'{patient_cases} / {patient_cases}'),
        ('Citation separation', 'General and clinical context carry no borrowed corpus citations.', '20 / 20'),
        ('Translation presence', 'Each cited source has a generated translation.', '20 / 20'),
    ]
    checks_html = ''.join(f'<tr><td>{label}</td><td>{description}</td><td class="pass">{passed}</td></tr>' for label, description, passed in check_rows)
    page('Structured answer checks', f'''
      <p class="eyebrow">03 / Answer pipeline verification</p><h2>Consistent answers.<br>Explicit source boundaries.</h2>
      <p class="lead">All 20 development cases passed their latest recorded mechanical checks across implementation iterations.</p>
      <div class="metrics"><div class="metric"><strong>10</strong><span>Clinical case examples</span></div>
      <div class="metric"><strong>10</strong><span>Reference question examples</span></div>
      <div class="metric"><strong>20 / 20</strong><span>Complete check sets passed</span></div></div>
      <table class="check-table"><thead><tr><th>Check</th><th>Acceptance criterion</th><th class="right">Passed</th></tr></thead><tbody>{checks_html}</tbody></table>
      <h3>Additional source and translation checks</h3>
      <div class="two-col"><div><span class="label">Source navigation</span><p class="small">All {len(guides['guides'])} recorded guide ranges resolve their expected verse numbers against the pinned SARIT edition.</p></div>
      <div><span class="label">Translation integration</span><p class="small">Two recorded Sol corpus-answer checks produced five translated source passages in total, with source text and locators preserved.</p></div></div>
      <div class="note"><span class="label">Interpretation of the pass results</span>
      The pass counts describe the stated acceptance criteria. Translation checks establish presence and source binding.
      Conditional checks use only applicable cases. The 20 examples are development regression cases drawn from the supplied Hindi materials.</div>
      <p class="small muted">The recorded set combines each case's latest result. The Sama/Nirama example accepts disease or procedure structure because its question includes both classification and treatment eligibility.</p>
      <p class="source-note">Records: [R6] Clinical check summary, [R7] Source-guide checks and [R8] Translation integration checks.</p>
    ''')

    page('Operational performance', f'''
      <p class="eyebrow">04 / Timing and application checks</p><h2>Execution performance.</h2>
      <p class="lead">Recorded timing separates local retrieval from the complete planning and answer-generation workflow.</p>
      <div class="latency-highlight"><strong>{statistics.median(times):.2f} s</strong><span>Median total time across 20 recorded<br>generated-answer development cases</span></div>
      <img class="chart" src="{latency_chart}" alt="Twenty recorded generated-answer case durations, ranging from 67.54 to 165.92 seconds.">
      <table class="compact"><thead><tr><th>Recorded workload</th><th class="right">Runs</th><th class="right">Median</th><th class="right">Mean</th><th class="right">Observed range</th></tr></thead><tbody>
      <tr><td>Local retrieval only</td><td class="right">20</td><td class="right">{statistics.median(local_times):.2f} s</td><td class="right">{statistics.mean(local_times):.2f} s</td><td class="right">{min(local_times):.2f} to {max(local_times):.2f} s</td></tr>
      <tr><td>Planning and generated answer</td><td class="right">20</td><td class="right">{statistics.median(times):.2f} s</td><td class="right">{statistics.mean(times):.2f} s</td><td class="right">{min(times):.2f} to {max(times):.2f} s</td></tr>
      </tbody></table>
      <p class="figure-caption">Timing includes the work performed by each respective check harness. Generated-answer observations are drawn from the latest recorded case runs across iterations.</p>
      <div class="note"><span class="label">Hosted retrieval observation</span>
      A GCP retrieval replay returned 40 exact stored passages in {deployment['retrieval_replay']['seconds']:.3f} seconds after the source-locator index update. This is a single observed run.</div>
      <h3>Application verification</h3>
      <div class="verification-strip"><div><strong>{unit_passed} / {unit['count']}</strong><p>Local automated tests passed<br>Verification recorded {date_text}</p></div>
      <div><strong>{count} / {count}</strong><p>Reading-interface viewport sizes passed<br>Desktop, tablet, mobile and landscape</p></div></div>
      <p class="small">Browser checks covered contained scrolling, source navigation, Devanagari display, copying and preferences.
      Session checks passed for creation, renaming, deletion, history persistence, context isolation, job recovery,
      updates across tabs and unavailable browser storage.</p>
      <p class="source-note">Records: [R6] Generated-answer timings, [R9] Retrieval and hosted observations, and [R10] Report verification record.</p>
    ''')

    refs = [
        ('R1', 'Retrieval measurements', 'eval-expanded.json; eval-hybrid.json; eval-lexical.json; eval-semantic.json', '../eval-expanded.json'),
        ('R2', 'Dataset and evaluation procedure', 'eval/README.md; eval/questions.jsonl; vedai/evaluation.py', '../../eval/README.md'),
        ('R3', 'Collection inventory', 'reports/corpus-summary.json', '../corpus-summary.json'),
        ('R4', 'Extraction and index checks', 'reports/validation.json', '../validation.json'),
        ('R5', 'Passage preservation', 'reports/passages-integrity.json', '../passages-integrity.json'),
        ('R6', 'Structured answer results', 'reports/clinical-summary.json; tests/live_clinical.py', '../clinical-summary.json'),
        ('R7', 'Source-guide resolution', 'reports/source-guide-checks.json', '../source-guide-checks.json'),
        ('R8', 'Translation integration', 'reports/translation-checks.json', '../translation-checks.json'),
        ('R9', 'Execution-time observations', 'clinical-retrieval-checks.json; clinical-deployment.json', '../clinical-retrieval-checks.json'),
        ('R10', 'Current application verification', 'reports/performance/verification.json', 'verification.json'),
    ]
    references = ''.join(f'<div class="reference"><strong><a href="{path}">[{identity}] {title}</a></strong><span class="files">{files}</span></div>' for identity, title, files, path in refs)
    page('Methodology and source register', f'''
      <p class="eyebrow">05 / Methodology and record register</p><h2>Defined measures.<br>Reproducible records.</h2>
      <dl class="method-grid">
      <dt>Retrieval sample</dt><dd>The draft dataset contains 68 cases: 48 natural questions, 15 exact-quote targets and five unanswerable prompts. Natural questions cover 12 topics across four language forms and three works.</dd>
      <dt>Evaluation design</dt><dd>Relevance labels were authored during development. Work filters were supplied, and vocabulary was refined after inspecting initial results. Development and validation topic groups are separated by work. The scores describe this development dataset.</dd>
      <dt>Recall and ranking</dt><dd>Recall@10 averages expected-segment coverage over answerable questions. MRR averages 1 divided by the first relevant rank, or zero when no relevant chunk appears. Unanswerable prompts are excluded from both measures.</dd>
      <dt>Answer checks</dt><dd>The 20-case summary records the latest mechanical result for each example across iterations. Criteria include completion, structure, source preservation, translation presence and applicable priority or finding requirements.</dd>
      <dt>System versions</dt><dd>Retrieval baselines precede AI enhancement and later text normalization. Recorded Sol answer checks use medium reasoning. Application verification in this report refers to revision {version}.</dd>
      <dt>Timing and rounding</dt><dd>Means and medians are calculated from recorded per-case durations. Workloads and environments are identified alongside each result. Displayed percentages and timings are rounded; source files retain their recorded values.</dd>
      </dl>
      <h3>Source register</h3><div class="references">{references}</div>
      <div class="document-meta"><strong>Document control</strong><br>
      VedAI Performance &amp; Evaluation Report, version 1.0. Prepared {date_text}.<br>
      Corpus: SARIT revision {corpus['revision']}.<br>
      Report generated from repository records. Application checks use retrieval-only requests and browser fixtures.</div>
    ''')

    html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>VedAI | Performance &amp; Evaluation Report</title><style>{CSS}</style></head>
    <body><p class="print-hint">VedAI Performance &amp; Evaluation Report | Print-ready A4 edition</p>{''.join(pages)}</body></html>'''
    # Shared PDFs should link to repository records, never the builder's local filesystem.
    def repository_link(match):
        path = (OUT / match.group(1)).resolve().relative_to(ROOT).as_posix()
        revision = 'main' if path.startswith('reports/performance/') else verification['code_commit']
        return f'href="https://github.com/AmRitJain0442/vedai/blob/{revision}/{quote(path)}"'
    html = re.sub(r'href="([^"]+)"', repository_link, html)
    assert '\u2014' not in html and '\u2013' not in html, 'Use no em or en dashes in the report.'
    target = OUT / 'VedAI-Performance-Report.html'
    target.write_text(html, encoding='utf-8')

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        web = browser.new_page(viewport={'width': 1080, 'height': 1500}, device_scale_factor=1.3)
        web.goto(target.as_uri(), wait_until='networkidle')
        web.evaluate('document.fonts.ready')
        measurements = web.locator('.sheet').evaluate_all('''sheets => sheets.map((sheet, index) => ({
            page: index + 1, bodyBottom: sheet.querySelector('.page-body').getBoundingClientRect().bottom,
            footerTop: sheet.querySelector('.footer').getBoundingClientRect().top,
            overflowX: sheet.scrollWidth > sheet.clientWidth,
            overflowY: sheet.scrollHeight > sheet.clientHeight
        }))''')
        for measurement in measurements:
            if measurement['bodyBottom'] > measurement['footerTop'] - 8 or measurement['overflowX'] or measurement['overflowY']:
                raise ValueError(f'Report page overflow: {measurement}')
        screen = ROOT / 'data/runtime/performance-report/previews'
        screen.mkdir(parents=True, exist_ok=True)
        for i, sheet in enumerate(web.locator('.sheet').all(), 1):
            sheet.screenshot(path=str(screen / f'page-{i}.png'))
        web.pdf(path=str(OUT / 'VedAI-Performance-Report.pdf'), format='A4', print_background=True,
                prefer_css_page_size=True, display_header_footer=False, tagged=True, outline=True)
        browser.close()
    import fitz
    pdf_path = OUT / 'VedAI-Performance-Report.pdf'
    with fitz.open(pdf_path) as pdf:
        assert len(pdf) == 6, f'Expected six pages, got {len(pdf)}'
        text = '\n'.join(page.get_text() for page in pdf)
        assert '\u2014' not in text and '\u2013' not in text
        for required in ['85.4', '0.631', '111,195', '20 / 20', str(unit_passed), '108.83']:
            assert required in text, f'Missing PDF content: {required}'
    print(f'Report written: {pdf_path}\nSix pages, layout checks passed, no em or en dashes.', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', default='2026-09-24', help='Report issue date, YYYY-MM-DD')
    parser.add_argument('--verify', action='store_true', help='Run local application checks before building')
    parser.add_argument('--url', default='http://127.0.0.1:8766')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    verification = verify(args.url) if args.verify else json.loads((OUT / 'verification.json').read_text(encoding='utf-8'))
    build(args.date, verification)


if __name__ == '__main__':
    main()
