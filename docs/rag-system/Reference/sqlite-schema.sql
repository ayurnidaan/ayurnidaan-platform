-- Database: lexical.sqlite3

CREATE VIRTUAL TABLE chunks USING fts5(id UNINDEXED, work, title, text, payload UNINDEXED, tokenize='unicode61 categories ''L* N* M*''');

-- Database: terms.sqlite3

CREATE VIRTUAL TABLE terms USING fts5(id UNINDEXED, work UNINDEXED, text, payload UNINDEXED, tokenize='trigram');

-- Database: passages.sqlite3

CREATE TABLE passages (id TEXT PRIMARY KEY, payload TEXT NOT NULL);

CREATE TABLE segment_passages (segment_id TEXT PRIMARY KEY, passage_id TEXT NOT NULL);

CREATE INDEX passages_source_locator ON passages (json_extract(payload, '$.work'), json_extract(payload, '$.references[0].xml_ids[0]'));

-- Optional database: vectors.sqlite3 (from retrieval.py; not built for this handover)

CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, text_hash TEXT NOT NULL, vector BLOB NOT NULL);
