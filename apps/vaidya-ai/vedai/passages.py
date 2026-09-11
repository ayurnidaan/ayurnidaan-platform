"""Resolve retrieval chunks to full source verses/prose with honest match scores."""
import hashlib
import json
import re
import sqlite3
from collections import OrderedDict
from contextlib import closing

from .corpus import digest, dump
from .terminology import canonical, query_terms

VERSION = "source-passages-v2"


def verse_identity(segment):
    leaf = segment["xpath"].rsplit("/", 1)[-1].split("[")[0]
    bases = [re.sub(r"(?<=\d)(?:ab|cd|ef|gh|[a-h])$", "", x) for x in segment["xml_ids"]]
    has_parts = any(a != b for a, b in zip(bases, segment["xml_ids"]))
    # This edition also encodes metrical half-verses as adjacent p elements:
    # a numbered first half ending in |, then an unnumbered half ending in ||.
    sangraha_half = (segment["work"] == "astangasangraha" and leaf == "p" and bool(bases)
                     and len(segment["text"]) < 400 and re.search(r"(?<!\|)\|\s*$", segment["text"]))
    is_verse = leaf in {"lg", "l"} or (leaf == "ab" and has_parts) or sangraha_half
    if not is_verse:
        return None, "commentary" if segment["kind"] == "commentary" else "prose"
    # A TEI verse group is already one complete source unit. Adjacent half-verses
    # encoded as separate ab/l elements can share the same printed identifier.
    return (bases[0] if bases else None), "shloka"


def build_passages(data):
    source = data / "processed/segments.jsonl"
    groups = OrderedDict()
    previous = None
    with source.open(encoding="utf-8") as handle:
        for line in handle:
            s = json.loads(line)
            if s["kind"] in {"note", "heading"}:
                previous = None
                continue
            verse, form = verse_identity(s)
            context = tuple(section["xpath"] for section in s["sections"])
            if previous:
                prev, prev_key = previous
                same_scope = all(s[k] == prev[k] for k in ("work", "kind", "layer", "language", "sections"))
                adjacent = (s["xpath"].rsplit("/", 1)[0] == prev["xpath"].rsplit("/", 1)[0]
                            and s["xpath"].endswith(f"/p[{int(prev['xpath'].rsplit('/p[', 1)[1][:-1])+1}]"))
                if same_scope and adjacent and not s["xml_ids"] and len(s["text"]) < 400 and re.search(r"\|\|\s*$", s["text"]):
                    groups[prev_key]["segments"].append(s)
                    previous = None
                    continue
            key = (s["work"], s["kind"], s["layer"], context, verse or s["id"])
            groups.setdefault(key, {"segments": [], "verse": verse, "form": form})["segments"].append(s)
            previous = (s, key) if s["work"] == "astangasangraha" and "/p[" in s["xpath"] and form == "shloka" else None
    folder = data / "index"
    folder.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(folder / "passages.sqlite3")) as db, db:
        db.execute("DROP TABLE IF EXISTS passages")
        db.execute("DROP TABLE IF EXISTS segment_passages")
        db.execute("CREATE TABLE passages (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("CREATE TABLE segment_passages (segment_id TEXT PRIMARY KEY, passage_id TEXT NOT NULL)")
        for group in groups.values():
            segments = group["segments"]
            first = segments[0]
            identity = hashlib.sha256((VERSION + ":" + ":".join(s["id"] for s in segments)).encode()).hexdigest()[:24]
            text = "\n".join(s["text"] for s in segments)
            verse = group["verse"]
            if not verse and group["form"] == "shloka":
                numbers = re.findall(r"(?:॥|\|\|)\s*([०-९0-9]+)\s*(?:॥|\|\|)", text)
                verse = ", ".join(dict.fromkeys(numbers)) if numbers else None
            payload = {"passage_id": identity, **{k: first[k] for k in ("work", "title", "kind", "layer", "language", "sections", "source_url")},
                       "form": group["form"], "verse_label": verse, "sanskrit": text,
                       "references": [{"segment_id": s["id"], "xml_ids": s["xml_ids"], "xpath": s["xpath"],
                                       "labels": s["labels"], "page": s["page"], "start": 0, "end": len(s["text"])} for s in segments],
                       "source_text_sha256": hashlib.sha256(text.encode()).hexdigest()}
            db.execute("INSERT INTO passages VALUES (?, ?)", (identity, json.dumps(payload, ensure_ascii=False)))
            db.executemany("INSERT INTO segment_passages VALUES (?, ?)", [(s["id"], identity) for s in segments])
    dump(folder / "passages.json", {"version": VERSION, "source_sha256": digest(source), "passages": len(groups)})
    return len(groups)


def match_score(question, text, terms=None):
    terms = query_terms(question) if terms is None else sorted(set(terms))
    normalized = canonical(text)
    matched = [term for term in terms if term in normalized]
    return {"match_percent": round(100 * len(matched) / len(terms), 1) if terms else 0.0,
            "match_label": "Query-term match", "matched_terms": matched, "query_term_count": len(terms),
            "match_method": "Percent of unique script-normalized, vocabulary-expanded query terms appearing in this passage. Not answer confidence or factual accuracy."}


class PassageStore:
    def __init__(self, data):
        self.path = data / "index/passages.sqlite3"
        manifest_path = data / "index/passages.json"
        if not self.path.exists() or not manifest_path.exists():
            raise FileNotFoundError("Run python -m vedai passages-index to enable exact verse citations")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["version"] != VERSION or manifest["source_sha256"] != digest(data / "processed/segments.jsonl"):
            raise ValueError("Exact passage index is stale; rebuild passages-index")
        # Source navigation must not scan every JSON payload on the hosted VM.
        # This auxiliary index does not change source units or their identities.
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE INDEX IF NOT EXISTS passages_source_locator ON passages "
                       "(json_extract(payload, '$.work'), json_extract(payload, '$.references[0].xml_ids[0]'))")

    def get(self, passage_id):
        with closing(sqlite3.connect(self.path)) as db:
            row = db.execute("SELECT payload FROM passages WHERE id = ?", (passage_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def guided(self, question, filters=None):
        """Resolve navigation locations to stored units, respecting all filters.

        Guides select candidates, never establish relevance or supply quoted text.
        No missing locator is reconstructed and no external sample answer is indexed.
        """
        from pathlib import Path
        from .terminology import symptom_concepts
        filters = filters or {}
        concepts = {c['id'] for c in symptom_concepts(question)}
        guides = json.loads((Path(__file__).parent / 'source_guides.json').read_text(encoding='utf-8'))['guides']
        results = []
        with closing(sqlite3.connect(self.path)) as db:
            for guide in guides:
                if not concepts.intersection(guide['concepts']) or (filters.get('work') and filters['work'] != guide['work']):
                    continue
                rows = db.execute("SELECT payload FROM passages WHERE json_extract(payload, '$.work') = ? "
                                  "AND json_extract(payload, '$.references[0].xml_ids[0]') >= ? "
                                  "AND json_extract(payload, '$.references[0].xml_ids[0]') < ?",
                                  (guide['work'], guide['prefix'], guide['prefix'] + '\uffff'))
                found = []
                for row in rows:
                    source = json.loads(row[0])
                    if any(filters.get(k) and filters[k] != source[k] for k in ('kind', 'language')):
                        continue
                    if filters.get('chapter') and not any(s.get('n') == filters['chapter'] for s in source['sections']):
                        continue
                    identifier = source['references'][0]['xml_ids'][0]
                    number = re.match(r'(\d+)', identifier[len(guide['prefix']):])
                    if number and any(start <= int(number[1]) <= end for start, end in guide['ranges']):
                        found.append({**source, **match_score(question, source['sanskrit']),
                                      'retrieval_method': 'source_navigation', 'chunk_id': None})
                if found:
                    found.sort(key=lambda p: int(re.match(r'(\d+)', p['references'][0]['xml_ids'][0][len(guide['prefix']):])[1]))
                    results.append(({'topic': guide['topic']}, found))
        return results

    def packet(self, question, hits, limit=40, max_characters=20000):
        candidates = {}
        with closing(sqlite3.connect(self.path)) as db:
            for rank, hit in enumerate(hits, 1):
                for ref in hit["references"]:
                    row = db.execute("SELECT p.payload FROM passages p JOIN segment_passages s ON p.id=s.passage_id WHERE s.segment_id=?", (ref["segment_id"],)).fetchone()
                    if not row:
                        raise ValueError("A retrieved segment has no source passage")
                    passage = json.loads(row[0])
                    if passage["passage_id"] not in candidates:
                        candidates[passage["passage_id"]] = {**passage, "chunk_id": hit["id"], "retrieval_rank": rank,
                                                           **match_score(question, passage["sanskrit"])}
        # Prioritize the relevant verse inside each retrieved chunk, keeping full
        # source units and exact original identifiers rather than model-created quotes.
        ranked = sorted(candidates.values(), key=lambda p: (-p["match_percent"], p["retrieval_rank"]))
        packet, total = [], 0
        for p in ranked:
            if total + len(p["sanskrit"]) > max_characters:
                continue
            total += len(p["sanskrit"])
            packet.append({**p, "citation_id": f"S{len(packet)+1}"})
            if len(packet) >= limit:
                break
        return packet
