# VedAI Performance and Evaluation Report

Formal six-page A4 report issued on 24 September 2026.

- [Print-ready PDF](VedAI-Performance-Report.pdf)
- [Standalone HTML](VedAI-Performance-Report.html)
- [Application verification record](verification.json)

The report is built from the repository's recorded evaluation results. Retrieval scores, exact-source integrity, structured-answer checks and observed timings retain their original evaluation scopes. Application checks were rerun for this edition without paid model calls.

The HTML embeds both vector charts and its styles. The PDF embeds its fonts. Source links point to repository records, with existing measurements pinned to the verified application revision. The source register is on page six.

To rebuild from the saved verification record:

```powershell
python scripts/build_performance_report.py --date 2026-09-24
```

To refresh application verification, first start the local app on port 8766, then run:

```powershell
python scripts/build_performance_report.py --verify --url http://127.0.0.1:8766 --date 2026-09-24
```

The report builder requires Matplotlib, Playwright with Chromium, and PyMuPDF. It checks page containment, page count, key PDF text and the absence of em and en dashes. Preview images are written to the ignored `data/runtime/performance-report/previews/` directory.
