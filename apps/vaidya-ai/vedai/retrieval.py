"""Resumable local embeddings and exact cosine / lexical rank fusion."""
import hashlib
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path

from .corpus import digest, dump
from .ollama import Ollama, ModelError
from .search import search, normalize

PROMPT_VERSION = "embeddinggemma-retrieval-v1"


def unit_vectors(values):
    import numpy as np
    array = np.asarray(values, dtype=np.float32)
    if array.ndim != 2 or not np.isfinite(array).all():
        raise ValueError("Invalid embedding matrix")
    norms = np.linalg.norm(array, axis=1, keepdims=True)
    if (norms == 0).any():
        raise ValueError("Zero embedding")
    return array / norms


def build_vectors(data, model="embeddinggemma", batch_size=32, client=None):
    if model.split(":")[0] != "embeddinggemma":
        raise ValueError("This embedding profile supports embeddinggemma only; other models require their own prompt profile")
    if not 1 <= batch_size <= 128:
        raise ValueError("Batch size must be between 1 and 128")
    client = client or Ollama()
    model_hash = client.model_digest(model)
    source = data / "processed/chunks.jsonl"
    source_hash = digest(source)
    folder = data / "index"
    folder.mkdir(parents=True, exist_ok=True)
    identity = {"model": model, "model_digest": model_hash, "prompt_version": PROMPT_VERSION, "source_sha256": source_hash}
    manifest_path = folder / "vectors.json"
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
        if any(previous.get(k) != v for k, v in identity.items()):
            raise ValueError("Embedding configuration or corpus changed. Use a new --data directory or move aside data/index/vectors.sqlite3 and vectors.json before rebuilding.")
    dump(manifest_path, {**identity, "complete": False})
    started, embedded = time.perf_counter(), 0
    with closing(sqlite3.connect(folder / "vectors.sqlite3")) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, text_hash TEXT NOT NULL, vector BLOB NOT NULL)")
        existing = dict(db.execute("SELECT id, text_hash FROM vectors"))
        batch, seen = [], set()

        def embed_batch(rows):
            nonlocal embedded
            inputs = [f"title: {c['title']} | text: {c['text']}" for c, _ in rows]
            try:
                values = client.embed(inputs, model)
            except ModelError as error:
                # A transient batch failure is retryable; never enable truncation.
                if "context length" in str(error).lower() or "too long" in str(error).lower():
                    raise ModelError("A chunk exceeds the model token limit. Rechunk it before embedding; no text was truncated.") from error
                time.sleep(1)
                values = client.embed(inputs, model)
            matrix = unit_vectors(values)
            if len(matrix) != len(rows):
                raise ValueError("Embedding response count mismatch")
            for (c, text_hash), vector in zip(rows, matrix):
                db.execute("INSERT OR REPLACE INTO vectors VALUES (?, ?, ?)", (c["id"], text_hash, vector.tobytes()))
            db.commit()
            embedded += len(rows)
            if embedded % (batch_size * 10) == 0:
                print(f"Embedded {embedded:,} new chunks ({len(existing):,} cached), {time.perf_counter()-started:.0f}s", flush=True)

        with source.open(encoding="utf-8") as handle:
            for line in handle:
                c = json.loads(line)
                if c["id"] in seen:
                    raise ValueError("Duplicate source chunk ID")
                seen.add(c["id"])
                text_hash = hashlib.sha256((c["title"] + c["text"]).encode()).hexdigest()
                if existing.get(c["id"]) != text_hash:
                    batch.append((c, text_hash))
                    if len(batch) >= batch_size:
                        embed_batch(batch)
                        batch = []
        if batch:
            embed_batch(batch)
        if {r[0] for r in db.execute("SELECT id FROM vectors")} != seen:
            raise ValueError("Vector/source IDs differ")
        dimensions = db.execute("SELECT length(vector)/4 FROM vectors LIMIT 1").fetchone()[0]
        if db.execute("SELECT count(*) FROM vectors WHERE length(vector) != ?", (dimensions * 4,)).fetchone()[0]:
            raise ValueError("Embedding dimensions changed")
    result = {**identity, "complete": True, "chunks": len(seen), "dimensions": dimensions,
              "newly_embedded": embedded, "seconds": round(time.perf_counter()-started, 2)}
    dump(manifest_path, result)
    dump(Path("reports/embedding-index.json"), result)
    return result


def reciprocal_rank_fusion(rankings, k=60):
    scores, hits = {}, {}
    for ranking in rankings:
        seen = set()
        for rank, hit in enumerate(ranking, 1):
            if hit["id"] in seen:
                continue
            seen.add(hit["id"])
            hits[hit["id"]] = {**hits.get(hit["id"], {}), **hit}
            scores[hit["id"]] = scores.get(hit["id"], 0) + 1 / (k + rank)
    return [{**hits[key], "rrf_score": scores[key]} for key in sorted(scores, key=lambda key: (-scores[key], key))]


class Retriever:
    def __init__(self, data, mode="expanded", client=None):
        import numpy as np
        self.data, self.mode, self.client = data, mode, client or Ollama()
        self.chunks, self.by_id = [], {}
        self.matrix = None
        if mode not in {"lexical", "semantic", "hybrid", "expanded"}:
            raise ValueError("Unknown retrieval mode")
        if mode in {"hybrid", "expanded"}:
            from .terminology import VERSION
            term_manifest = data / "index/terms.json"
            if not term_manifest.exists():
                raise FileNotFoundError("Run python -m vedai terms-index before expanded or hybrid search")
            term_config = json.loads(term_manifest.read_text(encoding="utf-8"))
            if term_config["version"] != VERSION or term_config["source_sha256"] != digest(data / "processed/chunks.jsonl"):
                raise ValueError("Vocabulary index is stale; rebuild terms-index")
        if mode in {"semantic", "hybrid"}:
            path = data / "index/vectors.json"
            if not path.exists():
                raise FileNotFoundError("Run python -m vedai embed before semantic retrieval")
            self.manifest = json.loads(path.read_text(encoding="utf-8"))
            if not self.manifest.get("complete"):
                raise ValueError("Embedding build is incomplete; resume python -m vedai embed")
            if digest(data / "processed/chunks.jsonl") != self.manifest["source_sha256"]:
                raise ValueError("Embedding index is stale")
            if self.client.model_digest(self.manifest["model"]) != self.manifest["model_digest"]:
                raise ValueError("Installed embedding model differs from indexed model")
            with (data / "processed/chunks.jsonl").open(encoding="utf-8") as handle:
                self.chunks = [json.loads(line) for line in handle]
            self.by_id = {c["id"]: c for c in self.chunks}
            with closing(sqlite3.connect(data / "index/vectors.sqlite3")) as db:
                vectors = {key: np.frombuffer(blob, dtype=np.float32) for key, blob in db.execute("SELECT id, vector FROM vectors")}
            if set(vectors) != set(self.by_id):
                raise ValueError("Missing or extra vectors")
            self.matrix = np.stack([vectors[c["id"]] for c in self.chunks])
            if self.matrix.shape != (len(self.chunks), self.manifest["dimensions"]):
                raise ValueError("Vector dimension mismatch")
            if not np.isfinite(self.matrix).all() or not np.allclose(np.linalg.norm(self.matrix, axis=1), 1, atol=1e-4):
                raise ValueError("Embedding index contains invalid vectors")

    def search(self, query, limit=5, work=None, kind=None, language=None, chapter=None):
        import numpy as np
        if not query.strip() or len(query) > 2000 or not 1 <= limit <= 100:
            raise ValueError("Use a nonempty query up to 2000 characters and limit 1–100")
        def allowed(c):
            return ((not work or c["work"] == work) and (not kind or c["kind"] == kind)
                    and (not language or c["language"] == language)
                    and (not chapter or any(s.get("n") == chapter for s in c["sections"])))
        rankings = []
        if self.mode == "lexical":
            rankings.append(search(self.data, query, 100, work, kind, language, chapter))
        if self.mode in {"hybrid", "expanded"}:
            from .terminology import term_search
            rankings.append(term_search(self.data, query, 100, work, kind, language, chapter))
        if self.mode in {"semantic", "hybrid"}:
            vector = unit_vectors(self.client.embed(["task: search result | query: " + query], self.manifest["model"]))[0]
            scores = self.matrix @ vector
            eligible = np.array([i for i, c in enumerate(self.chunks) if allowed(c)], dtype=int)
            indices = eligible[np.argsort(-scores[eligible], kind="stable")[:100]]
            rankings.append([{**self.chunks[i], "cosine_similarity": float(scores[i])} for i in indices])
        ranked = reciprocal_rank_fusion(rankings) if self.mode == "hybrid" else rankings[0]
        result, seen = [], set()
        for hit in ranked:
            identity = normalize(" ".join(hit["text"].split()))
            if identity not in seen:
                seen.add(identity)
                result.append(hit)
                if len(result) >= limit:
                    break
        return result
