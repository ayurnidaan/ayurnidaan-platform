"""Full local artifact integrity checks; requires an ingested corpus."""
import json
import sqlite3
from contextlib import closing

from .corpus import digest, dump


def verify(data, reports):
    manifest = json.loads((data / "source_manifest.json").read_text(encoding="utf-8"))
    root = data / "raw" / f"SARIT-corpus-{manifest['revision']}"
    for file in manifest["files"]:
        if digest(root / file["path"]) != file["sha256"]:
            raise ValueError(f"Source file changed: {file['path']}")
    segments = {}
    with (data / "processed" / "segments.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            s = json.loads(line)
            if s["id"] in segments:
                raise ValueError("Duplicate segment ID")
            segments[s["id"]] = s
    ids, covered, count = set(), {}, 0
    with (data / "processed" / "chunks.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            c = json.loads(line)
            if c["id"] in ids or not c["text"] or len(c["text"]) > 1800:
                raise ValueError("Invalid chunk")
            ids.add(c["id"])
            pieces = []
            for ref in c["references"]:
                s = segments[ref["segment_id"]]
                for key in ("work", "kind", "layer", "language", "sections", "source_url"):
                    if c[key] != s[key]:
                        raise ValueError(f"Chunk crosses {key} boundary")
                if ref["xpath"] != s["xpath"] or ref["xml_ids"] != s["xml_ids"]:
                    raise ValueError("Broken source locator")
                piece = s["text"][ref["start"]:ref["end"]]
                pieces.append(piece)
                covered.setdefault(s["id"], []).append((ref["start"], ref["end"], piece))
                count += 1
            if c["text"] != "\n".join(pieces):
                raise ValueError("Chunk text does not match source segments")
    for s in segments.values():
        if s["kind"] in {"note", "heading"}:
            continue
        spans = sorted(covered.get(s["id"], []))
        if any(a[1] > b[0] for a, b in zip(spans, spans[1:])):
            raise ValueError("Duplicated segment offsets")
        if "".join("".join(p.split()) for _, _, p in spans) != "".join(s["text"].split()):
            raise ValueError("Segment text missing from chunks")
    with closing(sqlite3.connect(data / "index" / "lexical.sqlite3")) as db:
        indexed = {r[0] for r in db.execute("SELECT id FROM chunks")}
        if indexed != ids:
            raise ValueError("Search index is out of date")
    result = {"source_files_verified": len(manifest["files"]), "unique_segments": len(segments),
              "unique_chunks": len(ids), "citation_spans_verified": count,
              "chunk_coverage_verified": True, "index_ids_verified": True}
    dump(reports / "validation.json", result)
    return result
