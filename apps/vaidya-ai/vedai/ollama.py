"""Small local Ollama client. No hosted credentials or implicit model pulls."""
import json
import os
import urllib.error
import urllib.request


class ModelError(RuntimeError):
    pass


class Ollama:
    def __init__(self, base_url=None, timeout=180):
        self.base_url = (base_url or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")).rstrip("/")
        self.timeout = timeout

    def request(self, route, payload=None):
        request = urllib.request.Request(self.base_url + route,
                  data=json.dumps(payload).encode() if payload is not None else None,
                  headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise ModelError(f"Ollama HTTP {error.code}: {detail}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ModelError("Ollama is unavailable or timed out. Start Ollama and check the configured models.") from error

    def model_digest(self, model):
        for item in self.request("/api/tags")["models"]:
            if item["name"] == model or item["name"] == model + ":latest":
                return item["digest"]
        raise ModelError(f"Model {model!r} is not installed. Run: ollama pull {model}")

    def embed(self, texts, model="embeddinggemma"):
        # Fail rather than silently discarding source text past the token limit.
        return self.request("/api/embed", {"model": model, "input": texts, "truncate": False,
                                          "keep_alive": "15m"})["embeddings"]

    def chat(self, messages, schema, model="gemma3:4b"):
        return self.request("/api/chat", {"model": model, "messages": messages, "stream": False,
                                           "format": schema, "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 1200}})["message"]["content"]
