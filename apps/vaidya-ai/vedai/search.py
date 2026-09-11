"""Local lexical baseline. Cross-language semantic retrieval is a planned phase."""
import json
import sqlite3
import unicodedata
from contextlib import closing


def normalize(text):
    # Remove Latin diacritics only: Devanagari vowel signs must survive.
    result, latin = [], False
    for char in unicodedata.normalize("NFD", text.lower()):
        if unicodedata.combining(char) or unicodedata.category(char).startswith("M"):
            if not latin:
                result.append(char)
        else:
            latin = "LATIN" in unicodedata.name(char, "")
            result.append(char)
    return unicodedata.normalize("NFC", "".join(result))


def build_index(data):
    path = data / "index" / "lexical.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("DROP TABLE IF EXISTS chunks")
        db.execute("CREATE VIRTUAL TABLE chunks USING fts5(id UNINDEXED, work, title, text, payload UNINDEXED, tokenize='unicode61 categories ''L* N* M*''')")
        with (data / "processed" / "chunks.jsonl").open(encoding="utf-8") as rows:
            for line in rows:
                c = json.loads(line)
                db.execute("INSERT INTO chunks VALUES (?, ?, ?, ?, ?)",
                           (c["id"], c["work"], normalize(c["title"]), normalize(c["text"]), line))
        count = db.execute("SELECT count(*) FROM chunks").fetchone()[0]
    return count


def search(data, query, limit=5, work=None, kind=None, language=None, chapter=None):
    if not 1 <= limit <= 100:
        raise ValueError("Limit must be between 1 and 100")
    tokens = []
    current = []
    for char in normalize(query) + " ":
        if unicodedata.category(char)[0] in "LNM":
            current.append(char)
        elif current:
            tokens.append("".join(current))
            current = []
    if not tokens:
        return []
    expression = " OR ".join('"' + token + '"' for token in dict.fromkeys(tokens))
    path = data / "index" / "lexical.sqlite3"
    if not path.exists():
        raise FileNotFoundError("Run python -m vedai index first")
    with closing(sqlite3.connect(path)) as db:
        sql = "SELECT payload, bm25(chunks) FROM chunks WHERE chunks MATCH ?"
        args = [expression]
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
        sql += " ORDER BY bm25(chunks) LIMIT ?"
        args.append(limit)
        return [{**json.loads(row), "bm25": rank} for row, rank in db.execute(sql, args)]
