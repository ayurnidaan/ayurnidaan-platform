"""Local reading room API. Credentials stay in server environment variables."""
import json
import os
import base64
import binascii
import secrets
from pathlib import Path
import re
import sqlite3
import threading
import time
from contextlib import closing
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .answers import OpenRouter, answer
from .ollama import ModelError
from .retrieval import Retriever
from .passages import PassageStore
from .scripts import with_devanagari
from .query_planner import enhance_query, retrieve_plan


class Filters(BaseModel):
    work: str | None = Field(default=None, max_length=100)
    kind: Literal["base-text", "commentary", "unknown"] | None = None
    language: str | None = Field(default=None, max_length=20)
    chapter: str | None = Field(default=None, max_length=30)


class ConversationTurn(BaseModel):
    model_config = {"extra": "forbid"}
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(default="", max_length=2000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer_language: Literal["en", "hi", "sa"] = "en"
    filters: Filters = Field(default_factory=Filters)
    limit: int = Field(default=6, ge=1, le=10)
    generate: bool = True
    allow_general_knowledge: bool = True
    enhance: bool = True
    conversation: list[ConversationTurn] = Field(default_factory=list, max_length=4)


def create_app(data=Path("data"), mode="expanded", retriever=None, provider=None):
    app = FastAPI(title="Vaidya AI reading room", version="0.7.0", docs_url=None, redoc_url=None)
    hosts = ["localhost", "127.0.0.1", "[::1]", "testserver"]
    hosts.extend(h.strip() for h in os.getenv("VEDAI_ALLOWED_HOSTS", "").split(',') if h.strip())
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    access_user, access_password = os.getenv('VEDAI_ACCESS_USER', 'vedai'), os.getenv('VEDAI_ACCESS_PASSWORD', '')
    if os.getenv('VEDAI_REQUIRE_AUTH') == '1' and not access_password:
        raise ValueError('Hosted access requires VEDAI_ACCESS_PASSWORD')
    folder = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=folder), name="static")
    generation = provider or OpenRouter()
    gate = threading.Lock()
    jobs, jobs_lock = {}, threading.Lock()
    state = {"retriever": retriever, "passages": None}

    @app.middleware("http")
    async def headers(request: Request, call_next):
        authenticated = not access_password
        if access_password:
            try:
                scheme, encoded = request.headers.get('authorization', '').split(' ', 1)
                user, password = base64.b64decode(encoded, validate=True).decode('utf-8').split(':', 1)
                authenticated = (scheme.lower() == 'basic'
                    and secrets.compare_digest(user.encode(), access_user.encode())
                    and secrets.compare_digest(password.encode(), access_password.encode()))
            except (ValueError, UnicodeError, binascii.Error):
                authenticated = False
        response = await call_next(request) if authenticated else JSONResponse(
            {'detail': 'Sign in to Vaidya AI'}, status_code=401,
            headers={'WWW-Authenticate': 'Basic realm="Vaidya AI", charset="UTF-8"'})
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/")
    def home():
        return FileResponse(folder / "index.html")

    @app.get("/health")
    def health():
        path = data / "index/vectors.json"
        manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        ready = all((data / path).exists() for path in ("index/lexical.sqlite3", "index/passages.sqlite3", "index/passages.json"))
        if mode in {"hybrid", "semantic"}:
            ready = ready and manifest.get("complete", False)
        if mode in {"hybrid", "expanded"}:
            ready = ready and (data / "index/terms.json").exists()
        return {"status": "ready" if ready else "indexing_required", "retrieval": mode, "answer_contract": "clinical-v1",
                "embedding_model": manifest.get("model"), "indexed_chunks": manifest.get("chunks"),
                "generation_configured": generation.configured, "generation_provider": "openrouter",
                "generation_model": generation.model if generation.configured else None,
                "reasoning_effort": getattr(generation, "reasoning", None) if generation.configured else None}

    @app.get("/works")
    def works():
        path = data / "processed/works.json"
        if not path.exists():
            raise HTTPException(503, "Corpus is not processed. Run python -m vedai process.")
        rows = json.loads(path.read_text(encoding="utf-8"))
        return [{"id": Path(r["file"]).stem, "title": r["title"], "segments": r["segments"],
                 "source_url": r["source_url"], "languages": r["languages"], "license_urls": r["license_urls"]} for r in rows]

    def execute_ask(body):
        started = time.perf_counter()
        try:
            if state["retriever"] is None:
                state["retriever"] = Retriever(data, mode)
            if state["passages"] is None:
                state["passages"] = PassageStore(data)
            conversation = [turn.model_dump() for turn in body.conversation]
            plan = enhance_query(body.question, generation, enabled=body.enhance and body.generate, conversation=conversation)
            planned = time.perf_counter()
            hits, packet = retrieve_plan(body.question, plan, state["retriever"], state["passages"], body.limit, body.filters.model_dump())
            retrieval_seconds = time.perf_counter() - planned
            result = answer(body.question, hits, body.answer_language, generation, body.generate, packet, body.allow_general_knowledge, query_plan=plan, conversation=conversation)
            result["query_plan"] = plan
            for query in plan["queries"]:
                query["cited_passages"] = sum(query["topic"] in p.get("search_topics", []) for p in result["citations"]) if result["evidence_status"] == "supported" else 0
            if result["generation_status"] in {"disabled", "not_configured", "error", "rejected"}:
                result["citations"] = result["citations"][:body.limit]
            result["timing"] = {"planning_seconds": round(planned-started, 3), "retrieval_seconds": round(retrieval_seconds, 3), "total_seconds": round(time.perf_counter()-started, 3)}
            return result
        except (FileNotFoundError, ModelError, ValueError) as error:
            raise HTTPException(503, str(error)) from error
        finally:
            gate.release()

    def expire_jobs():
        # Call with jobs_lock held. Completed readings stay briefly for polling;
        # they are not written to disk or shared through an enumerable history.
        now = time.monotonic()
        for identity in list(jobs):
            if jobs[identity]['status'] != 'running' and now - jobs[identity]['created'] > 900:
                del jobs[identity]
        while len(jobs) >= 20:
            completed = next((key for key, job in jobs.items() if job['status'] != 'running'), None)
            if completed is None:
                break
            del jobs[completed]

    @app.post('/ask')
    def ask(body: AskRequest, request: Request):
        if not body.question.strip():
            raise HTTPException(422, 'Please enter a question')
        if body.filters.work and body.filters.work not in {w['id'] for w in works()}:
            raise HTTPException(422, 'Unknown work filter')
        if not gate.acquire(blocking=False):
            raise HTTPException(429, 'A query is already running. Please try again when it finishes.')
        if 'respond-async' not in request.headers.get('prefer', '').lower():
            return execute_ask(body)
        identity = secrets.token_hex(16)
        with jobs_lock:
            expire_jobs()
            jobs[identity] = {'status': 'running', 'created': time.monotonic()}

        def run():
            try:
                result = execute_ask(body)
                update = {'status': 'complete', 'result': result}
            except HTTPException as error:
                update = {'status': 'error', 'detail': str(error.detail)}
            except Exception:
                update = {'status': 'error', 'detail': 'The search could not finish. Please try again.'}
            with jobs_lock:
                jobs[identity].update(update)

        try:
            threading.Thread(target=run, name='vedai-search', daemon=True).start()
        except Exception:
            with jobs_lock:
                del jobs[identity]
            gate.release()
            raise HTTPException(503, 'The search could not start. Please try again.')
        return JSONResponse({'job_id': identity, 'status': 'running'}, status_code=202,
                            headers={'Location': '/jobs/' + identity, 'Retry-After': '2'})

    @app.get('/jobs/{identity}')
    def job_status(identity: str):
        with jobs_lock:
            expire_jobs()
            job = jobs.get(identity)
            if job is None:
                raise HTTPException(404, 'This reading has expired or the server restarted. Please search again.')
            return {k: v for k, v in job.items() if k != 'created'}

    @app.get("/sources/{chunk_id}")
    def source(chunk_id: str):
        if not re.fullmatch(r"[a-f0-9]{24}", chunk_id):
            raise HTTPException(404, "Passage not found")
        path = data / "index/lexical.sqlite3"
        if not path.exists():
            raise HTTPException(503, "Search index is missing")
        with closing(sqlite3.connect(path)) as db:
            row = db.execute("SELECT payload FROM chunks WHERE id = ?", (chunk_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Passage not found")
        return json.loads(row[0])

    @app.get("/passages/{passage_id}")
    def passage(passage_id: str):
        if not re.fullmatch(r"[a-f0-9]{24}", passage_id):
            raise HTTPException(404, "Passage not found")
        try:
            store = state["passages"] or PassageStore(data)
            result = store.get(passage_id)
        except (FileNotFoundError, ValueError) as error:
            raise HTTPException(503, str(error)) from error
        if result is None:
            raise HTTPException(404, "Passage not found")
        return with_devanagari(result)

    return app
