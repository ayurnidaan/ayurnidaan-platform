"""Script-normalized substring retrieval with an explicitly draft vocabulary."""
import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from .corpus import digest, dump
from .search import normalize

VERSION = "iast-substring-v2"
STOP = set("how does do what which are is the a an of in and or to for with as by from named listed say says according terms according describe described gives about between into that this its there where when whom can explain compare compared contrast foundation constituents methods supports they their have has was were charaka caraka sushruta susruta ashtanga astanga hridaya hrdaya samhita sam hita kim ca katham ke ki ka ko kya kaise me mem haim hai se ke anusara bataye bataya batae kya yah yaha tatha".split())


def canonical(text):
    from indic_transliteration import sanscript
    if re.search(r"[\u0900-\u097f]", text):
        text = sanscript.transliterate(text, sanscript.DEVANAGARI, sanscript.IAST)
    return normalize(text).replace("-", "").replace("'", "").replace("’", "").replace("+", "")


def symptom_concepts(query):
    """Draft phrase mappings for search, never a diagnosis of the speaker."""
    text = canonical(query)
    glossary = json.loads((Path(__file__).parent / "ayurveda_terms.json").read_text(encoding="utf-8"))
    found = []
    for entry in glossary["entries"]:
        if "concept" not in entry:
            continue
        aliases = [alias for alias in entry["aliases"] if re.search(
            r"\b" + re.escape(canonical(alias)).replace(r"\ ", r"\s+") + r"\b", text)]
        if aliases:
            found.append({"id": entry["concept"], "label": entry["label"],
                          "aliases": aliases, "terms": entry["terms"]})
    return found


def query_terms(query):
    canonical_query = canonical(query)
    concepts = symptom_concepts(query)
    remaining = canonical_query
    for concept in concepts:
        for alias in sorted(concept["aliases"], key=len, reverse=True):
            remaining = re.sub(r"\b" + re.escape(canonical(alias)).replace(r"\ ", r"\s+") + r"\b", " ", remaining)
    fillers = set("lag laga lagta lagti raha rahi rahe hai hain ho hua hui mujhe mere mera meri mein bahut bhi aur raha hoon hun please feeling feel having getting".split()) if concepts else set()
    terms = {w for w in re.findall(r"[a-z]+", remaining) if len(w) >= 3 and w not in STOP | fillers}
    for concept in concepts:
        terms.update(concept["terms"])
    glossary = json.loads((Path(__file__).parent / "ayurveda_terms.json").read_text(encoding="utf-8"))
    for entry in glossary["entries"]:
        if "concept" in entry:
            continue
        for alias in entry["aliases"]:
            alias = canonical(alias)
            if re.search(r"\b" + re.escape(alias) + r"[a-z]*\b", canonical_query):
                terms.update(entry["terms"])
                break
    return sorted(terms)[:60]


def build_terms(data):
    folder = data / "index"
    folder.mkdir(parents=True, exist_ok=True)
    source = data / "processed/chunks.jsonl"
    with closing(sqlite3.connect(folder / "terms.sqlite3")) as db, db:
        db.execute("DROP TABLE IF EXISTS terms")
        db.execute("CREATE VIRTUAL TABLE terms USING fts5(id UNINDEXED, work UNINDEXED, text, payload UNINDEXED, tokenize='trigram')")
        with source.open(encoding="utf-8") as handle:
            for line in handle:
                c = json.loads(line)
                db.execute("INSERT INTO terms VALUES (?, ?, ?, ?)", (c["id"], c["work"], canonical(c["text"]), line))
        count = db.execute("SELECT count(*) FROM terms").fetchone()[0]
    dump(folder / "terms.json", {"version": VERSION, "source_sha256": digest(source), "chunks": count})
    return count


def term_search(data, query, limit=100, work=None, kind=None, language=None, chapter=None):
    terms = query_terms(query)
    if not terms:
        return []
    path = data / "index/terms.sqlite3"
    if not path.exists():
        raise FileNotFoundError("Run python -m vedai terms-index for cross-script vocabulary retrieval")
    sql = "SELECT payload, bm25(terms) FROM terms WHERE terms MATCH ?"
    args = []
    if work:
        sql += " AND work = ?"
        args.append(work)
    for field, value in (("kind", kind), ("language", language)):
        if value:
            sql += f" AND json_extract(payload, '$.{field}') = ?"
            args.append(value)
    if chapter:
        sql += " AND EXISTS (SELECT 1 FROM json_each(json_extract(payload, '$.sections')) WHERE json_extract(value, '$.n') = ?)"
        args.append(chapter)
    sql += " ORDER BY bm25(terms) LIMIT ?"
    args.append(limit)
    with closing(sqlite3.connect(path)) as db:
        def retrieve(search_terms, base_first=False):
            expression = " OR ".join('"' + t + '"' for t in search_terms)
            statement = sql
            if base_first and not kind:
                statement = statement.replace("ORDER BY bm25(terms)", "ORDER BY CASE WHEN json_extract(payload, '$.kind') = 'base-text' THEN 0 ELSE 1 END, bm25(terms)")
            return [{**json.loads(payload), "term_bm25": rank} for payload, rank in db.execute(statement, [expression, *args])]
        concepts = symptom_concepts(query)
        if not concepts:
            return retrieve(terms)
        # Interleave symptom searches so the commonest condition cannot crowd
        # out another. Keep the caller's work/layer/language/chapter filters.
        rankings = [retrieve(c["terms"], base_first=True) for c in concepts]
        rankings.append(retrieve(terms))
        result, seen = [], set()
        for offset in range(limit):
            for ranking in rankings:
                if offset < len(ranking) and ranking[offset]["id"] not in seen:
                    hit = ranking[offset]
                    seen.add(hit["id"])
                    result.append(hit)
                    if len(result) == limit:
                        return result
        return result
