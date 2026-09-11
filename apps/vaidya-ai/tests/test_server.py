import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import threading
import time
from unittest.mock import patch

AVAILABLE = all(importlib.util.find_spec(m) is not None for m in ("fastapi", "httpx", "numpy"))
if AVAILABLE:
    from fastapi.testclient import TestClient
    from vedai.server import create_app
    from vedai.answers import OpenRouter
    from vedai.corpus import dump, write_jsonl
    from vedai.search import build_index
    from vedai.passages import build_passages


@unittest.skipUnless(AVAILABLE, "Install vedai[rag,test] for API tests")
class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        self.hit = {"id": "a" * 24, "work": "test", "title": "Test", "text": "health evidence", "kind": "base-text",
                    "language": "sa-Latn", "layer": "base-text", "sections": [], "references": [], "source_url": "https://example.org"}
        self.hit["references"] = [{"segment_id": "seg1"}]
        segment = {**self.hit, "id": "seg1", "xpath": "/TEI/text[1]/body[1]/p[1]", "xml_ids": ["test.1"], "labels": [], "page": None}
        write_jsonl(self.data / "processed/segments.jsonl", [segment])
        build_passages(self.data)
        write_jsonl(self.data / "processed/chunks.jsonl", [self.hit])
        build_index(self.data)
        dump(self.data / "processed/works.json", [{"file": "test.xml", "title": "Test", "segments": 1,
             "source_url": "https://example.org", "languages": {"sa-Latn": 1}, "license_urls": []}])
        self.client = TestClient(create_app(self.data, mode="lexical", provider=OpenRouter(key="", model="")))

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def test_retrieval_without_key_and_source_route(self):
        response = self.client.post("/ask", json={"question": "health", "filters": {"work": "test"}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["generation_status"], "not_configured")
        self.assertEqual(response.json()["citations"][0]["chunk_id"], self.hit["id"])
        self.assertEqual(self.client.get("/sources/" + self.hit["id"]).json()["text"], "health evidence")
        self.assertEqual(self.client.get("/sources/" + "b" * 24).status_code, 404)
        self.assertEqual(self.client.get("/sources/invalid").status_code, 404)
        citation = response.json()["citations"][0]
        full = self.client.get("/passages/" + citation["passage_id"])
        self.assertEqual(full.status_code, 200)
        self.assertEqual(full.json()["sanskrit"], citation["sanskrit"])
        self.assertEqual(full.json()["references"], citation["references"])
        self.assertEqual(self.client.get("/passages/" + "b" * 24).status_code, 404)
        self.assertEqual(self.client.get("/passages/invalid").status_code, 404)

    def test_request_validation_and_empty_result(self):
        self.assertEqual(self.client.post("/ask", json={"question": " "}).status_code, 422)
        self.assertEqual(self.client.post("/ask", json={"question": "x" * 2001}).status_code, 422)
        self.assertEqual(self.client.post("/ask", json={"question": "health", "filters": {"work": "missing"}}).status_code, 422)
        result = self.client.post("/ask", json={"question": "health", "filters": {"kind": "commentary"}}).json()
        self.assertEqual(result["evidence_status"], "insufficient_evidence")

    def test_static_ui_health_and_host_guard(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Content-Security-Policy", response.headers)
        self.assertEqual(self.client.get("/static/app.js").status_code, 200)
        self.assertEqual(self.client.get("/health").json()["status"], "ready")
        self.assertFalse(self.client.get("/health").json()["generation_configured"])
        self.assertEqual(self.client.get("/", headers={"Host": "unexpected.example"}).status_code, 400)

    def test_session_context_is_bounded_and_forwarded_without_server_history(self):
        history = [{'question': 'What are the doshas?', 'answer': 'Three are named.'}]
        with patch('vedai.server.enhance_query', return_value={'queries': []}) as planner, \
             patch('vedai.server.retrieve_plan', return_value=([], [])), \
             patch('vedai.server.answer', return_value={'citations': [], 'generation_status': 'complete', 'evidence_status': 'insufficient_evidence'}) as generator:
            response = self.client.post('/ask', json={'question': 'Explain the first one', 'conversation': history})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(planner.call_args.kwargs['conversation'], history)
            self.assertEqual(generator.call_args.kwargs['conversation'], history)
            self.client.post('/ask', json={'question': 'A new session'})
            self.assertEqual(planner.call_args.kwargs['conversation'], [])
            self.assertEqual(generator.call_args.kwargs['conversation'], [])
        for invalid in [history * 5, [{'question': 'x' * 2001}], [{'question': 'x', 'answer': 'y' * 2001}],
                        [{'question': 'x', 'citations': ['S1']}]]:
            self.assertEqual(self.client.post('/ask', json={'question': 'follow-up', 'conversation': invalid}).status_code, 422)

    def test_hosted_password_protects_readings_and_paid_requests(self):
        with patch.dict('os.environ', {'VEDAI_ACCESS_PASSWORD': 'test-password', 'VEDAI_REQUIRE_AUTH': '1',
                                      'VEDAI_ALLOWED_HOSTS': 'demo.trycloudflare.com'}):
            client = TestClient(create_app(self.data, mode='lexical', provider=OpenRouter(key='', model='')))
        with client:
            for path in ['/', '/health', '/jobs/unknown', '/static/app.js']:
                response = client.get(path)
                self.assertEqual(response.status_code, 401)
                self.assertIn('WWW-Authenticate', response.headers)
                self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertEqual(client.post('/ask', json={'question': 'health'}).status_code, 401)
            self.assertEqual(client.get('/', auth=('vedai', 'wrong')).status_code, 401)
            self.assertEqual(client.get('/', headers={'Authorization': 'Basic malformed'}).status_code, 401)
            self.assertEqual(client.get('/', auth=('vedai', 'test-password'), headers={'Host': 'demo.trycloudflare.com'}).status_code, 200)
        with patch.dict('os.environ', {'VEDAI_REQUIRE_AUTH': '1', 'VEDAI_ACCESS_PASSWORD': ''}):
            with self.assertRaises(ValueError):
                create_app(self.data)

    def test_async_reading_returns_immediately_and_reserves_single_query_slot(self):
        started, release = threading.Event(), threading.Event()
        hit = self.hit
        class BlockingRetriever:
            def search(self, *args, **kwargs):
                started.set()
                release.wait(5)
                return [hit]
        client = TestClient(create_app(self.data, mode='lexical', retriever=BlockingRetriever(), provider=OpenRouter(key='', model='')))
        with client:
            try:
                response = client.post('/ask', json={'question': 'health', 'generate': False}, headers={'Prefer': 'respond-async'})
                self.assertEqual(response.status_code, 202)
                location = response.headers['location']
                self.assertTrue(started.wait(2))
                self.assertEqual(client.get(location).json()['status'], 'running')
                self.assertEqual(client.post('/ask', json={'question': 'health'}).status_code, 429)
            finally:
                release.set()
            for _ in range(100):
                result = client.get(location).json()
                if result['status'] != 'running':
                    break
                time.sleep(.01)
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['result']['citations'][0]['sanskrit'], hit['text'])
            self.assertEqual(client.get('/jobs/missing').status_code, 404)
            self.assertEqual(client.post('/ask', json={'question': 'health', 'generate': False}).status_code, 200)
