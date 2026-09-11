"""Reproducible downloads and TEI extraction using Python's standard library."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import unicodedata
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

REVISION = "1eac9ee0b055c8d11147edac4a75c76008ccc363"
SOURCE = "https://github.com/sarit/SARIT-corpus"
NS = {"t": "http://www.tei-c.org/ns/1.0"}
XML = "{http://www.w3.org/XML/1998/namespace}"
BLOCKS = {"p", "ab", "lg", "l", "head", "trailer", "item"}


def tag(node):
    return node.tag.rsplit("}", 1)[-1]


def clean(value):
    return unicodedata.normalize("NFC", " ".join(value.split()))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def extract_archive(archive, destination):
    """Reject paths outside the target and symlinks before extracting anything."""
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            resolved = (destination / entry.filename).resolve()
            if not resolved.is_relative_to(destination) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f"Unsafe archive member: {entry.filename}")
        if z.testzip() is not None:
            raise ValueError("Archive checksum failure")
        z.extractall(destination)


def download(data, revision=REVISION):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Revision must be a full Git commit SHA")
    raw = data / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    archive = raw / f"SARIT-corpus-{revision}.zip"
    url = f"{SOURCE}/archive/{revision}.zip"
    if not archive.exists():
        partial = archive.with_suffix(".zip.part")
        with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
        partial.replace(archive)
    with zipfile.ZipFile(archive) as z:
        if z.comment.decode("ascii") != revision:
            raise ValueError("Archive commit does not match requested revision")
    extract_archive(archive, raw)
    root = raw / f"SARIT-corpus-{revision}"
    files = sorted(p for p in root.rglob("*") if p.is_file())
    inventory = [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size,
                  "sha256": digest(p)} for p in files]
    manifest = {"repository": SOURCE, "revision": revision, "archive_url": url,
                "archive_sha256": digest(archive), "archive_bytes": archive.stat().st_size,
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
                "file_count": len(files), "xml_file_count": sum(p.suffix == ".xml" for p in files),
                "extracted_bytes": sum(p.stat().st_size for p in files), "files": inventory}
    dump(data / "source_manifest.json", manifest)
    return root, manifest


def visible(node):
    """Retain inline text and tails, but keep notes and variant readings separate."""
    if tag(node) in {"note", "label", "rdg", "del"}:
        return ""
    if tag(node) == "gap":
        return " [gap] "
    if tag(node) in {"lb", "caesura"}:
        return " "
    if tag(node) == "choice":
        preferred = next((c for name in ("corr", "reg", "expan", "orig", "sic", "abbr")
                          for c in node if tag(c) == name), None)
        if preferred is not None:
            return visible(preferred)
    parts = [node.text or ""]
    for child in node:
        parts.append(visible(child))
        if tag(child) in {"l", "p", "ab", "lg", "item"}:
            parts.append(" ")
        parts.append(child.tail or "")
    return "".join(parts)


def extract_work(path, spec, revision):
    root = ET.parse(path).getroot()
    body = root.find(".//t:body", NS)
    if body is None:
        raise ValueError(f"No TEI body in {path}")
    header = root.find("t:teiHeader", NS)
    if header is None:
        raise ValueError(f"No TEI header in {path}")
    availability = header.find(".//t:availability", NS)
    text_node = root.find("t:text", NS)
    language = (body.get(XML + "lang") or (text_node.get(XML + "lang") if text_node is not None else None)
                or root.get(XML + "lang") or "und")
    meta = {**spec, "sha256": digest(path), "revision": revision,
            "source_url": f"{SOURCE}/blob/{revision}/{path.name}", "language": language,
            "tei_titles": [clean("".join(n.itertext())) for n in header.findall("./t:fileDesc/t:titleStmt/t:title", NS)],
            "authors": [clean("".join(n.itertext())) for n in header.findall("./t:fileDesc/t:titleStmt/t:author", NS)],
            "availability": clean("".join(availability.itertext())) if availability is not None else None,
            "license_urls": sorted({n.get("target") for n in availability.iter()
                                    if n.get("target") and "creativecommons.org" in n.get("target")}) if availability is not None else []}
    segments = []
    page = None

    def walk(node, xpath, sections, kind, layer, lang, inside=False):
        nonlocal page
        name = tag(node)
        lang = node.get(XML + "lang", lang)
        node_type = node.get("type", "")
        if name == "pb":
            page = node.get("n")
        if name in {"div", "quote"} and (node_type.startswith("commentary") or node_type in {"base-text", "unknown"}):
            kind = "commentary" if node_type.startswith("commentary") else node_type
            layer = node.get("ana") or node_type
        elif name == "div":
            sections = sections + [{"type": node_type, "subtype": node.get("subtype") or node.get("ana"),
                                    "n": node.get("n"), "xml_id": node.get(XML + "id"), "xpath": xpath,
                                    "heading": " | ".join(clean(visible(c)) for c in node if tag(c) == "head")}]
        standalone_quote = name == "quote" and not any(tag(n) in BLOCKS for n in node.iter() if n is not node)
        emit = (name in BLOCKS or name == "note" or standalone_quote) and not inside
        if emit:
            content = clean("".join(node.itertext())) if name == "note" else clean(visible(node))
            if content:
                ids = [n.get(XML + "id") for n in node.iter() if n.get(XML + "id")]
                labels = [clean("".join(n.itertext())) for n in node.iter() if tag(n) == "label"]
                inline = [{"type": n.get("type"), "ana": n.get("ana"), "text": clean(visible(n))}
                          for n in node.iter() if tag(n) == "quote" and n.get("type")]
                identity = hashlib.sha256(f"{revision}/{path.name}:{xpath}".encode()).hexdigest()[:24]
                segments.append({"id": identity, "work": path.stem, "title": spec["title"],
                                 "kind": "note" if name == "note" else ("heading" if name in {"head", "trailer"} else kind),
                                 "layer": layer, "language": lang, "sections": sections,
                                 "xml_ids": ids, "labels": labels, "xpath": xpath, "page": page,
                                 "source_url": meta["source_url"], "text": content,
                                 "inline_quotes": inline})
        counts = Counter()
        for child in node:
            child_tag = tag(child)
            counts[child_tag] += 1
            child_path = f"{xpath}/{child_tag}[{counts[child_tag]}]"
            # Notes inside a selected block are emitted separately exactly once.
            child_inside = inside or emit
            if child_tag == "note" and name != "note":
                child_inside = False
            walk(child, child_path, sections, kind, layer, lang, child_inside)

    walk(body, "/TEI/text[1]/body[1]", [], spec.get("kind", "base-text"), spec.get("kind", "base-text"), language)
    expected = re.sub(r"\s+", "", unicodedata.normalize("NFC", visible(body)))
    extracted = re.sub(r"\s+", "", "".join(s["text"] for s in segments if s["kind"] != "note"))
    if expected != extracted:
        raise ValueError(f"Body text coverage mismatch in {path.name}; extraction must be reviewed")
    meta["body_text_coverage_verified"] = True
    meta["segments"] = len(segments)
    meta["characters"] = sum(len(s["text"]) for s in segments)
    meta["kinds"] = dict(Counter(s["kind"] for s in segments))
    meta["languages"] = dict(Counter(s["language"] for s in segments))
    return meta, segments, ET.tostring(header, encoding="unicode")


def split_text(text, limit):
    start = 0
    while start < len(text):
        end = min(start + limit, len(text))
        if end < len(text):
            space = text.rfind(" ", start, end)
            if space > start:
                end = space
        yield start, end, text[start:end]
        start = end
        while start < len(text) and text[start].isspace():
            start += 1


def make_chunks(segments, max_chars=1800):
    if max_chars < 100:
        raise ValueError("Chunk size must be at least 100 characters")
    chunks, pending, key, size = [], [], None, 0

    def flush():
        if not pending:
            return
        first = pending[0][0]
        refs = [{"segment_id": s["id"], "xpath": s["xpath"], "xml_ids": s["xml_ids"],
                 "labels": s["labels"], "page": s["page"], "start": start, "end": end}
                for s, start, end, _ in pending]
        identity = hashlib.sha256(json.dumps(refs, sort_keys=True).encode()).hexdigest()[:24]
        chunks.append({"id": identity, **{k: first[k] for k in ("work", "title", "kind", "layer", "language", "sections", "source_url")},
                       "text": "\n".join(piece for _, _, _, piece in pending), "references": refs})

    for s in segments:
        if s["kind"] in {"note", "heading"}:
            continue
        group = (s["work"], s["kind"], s["layer"], s["language"], tuple(d["xpath"] for d in s["sections"]))
        for start, end, piece in split_text(s["text"], max_chars):
            if pending and (key != group or size + len(piece) + 1 > max_chars):
                flush()
                pending, size = [], 0
            key = group
            size += len(piece) + (1 if pending else 0)
            pending.append((s, start, end, piece))
    flush()
    return chunks


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")


def process(data, config, report_dir):
    source = json.loads((data / "source_manifest.json").read_text(encoding="utf-8"))
    revision = source["revision"]
    root = data / "raw" / f"SARIT-corpus-{revision}"
    specs = json.loads(config.read_text(encoding="utf-8"))
    out = data / "processed"
    metadata, all_segments = [], []
    for spec in specs:
        path = root / spec["file"]
        if not path.is_file():
            raise FileNotFoundError(f"Selected work missing: {path}")
        meta, segments, header = extract_work(path, spec, revision)
        metadata.append(meta)
        all_segments.extend(segments)
        (out / "headers").mkdir(parents=True, exist_ok=True)
        (out / "headers" / path.name).write_text(header, encoding="utf-8")
        write_jsonl(out / "works" / f"{path.stem}.jsonl", segments)
    chunks = make_chunks(all_segments)
    write_jsonl(out / "segments.jsonl", all_segments)
    write_jsonl(out / "chunks.jsonl", chunks)
    dump(out / "works.json", metadata)
    summary = {"revision": revision, "source": SOURCE, "corpus_files": source["file_count"],
               "corpus_xml_files": source["xml_file_count"], "archive_bytes": source["archive_bytes"],
               "extracted_bytes": source["extracted_bytes"], "selected_works": len(specs),
               "requested_works_found": sum(s.get("requested", False) for s in specs),
               "segments": len(all_segments), "chunks": len(chunks),
               "works": [{**m, "chunks": sum(c["work"] == Path(m["file"]).stem for c in chunks)} for m in metadata]}
    dump(report_dir / "corpus-summary.json", summary)
    dump(report_dir / "source-manifest.json", source)
    return summary
