"""API-level tests with the model swapped for a stub — no GGUF needed."""

from fastapi.testclient import TestClient

from app import generate, main


class StubGenerator:
    ready = True

    def load(self):
        pass

    def candidates(self, prompt, n):
        assert prompt.endswith("<|im_start|>assistant\n")
        return ["Sure ! What time ?", "sure , what time ?", "Sorry , I ' m busy ."]


def make_client(monkeypatch):
    stub = StubGenerator()
    monkeypatch.setattr(generate, "generator", stub)
    monkeypatch.setattr(main, "generator", stub)
    return TestClient(main.app)


def test_suggest_replies_returns_cleaned_deduped_replies(monkeypatch):
    client = make_client(monkeypatch)
    res = client.post("/suggest-replies", json={"turns": [{"role": "other", "text": "Coffee?"}], "n": 3})
    assert res.status_code == 200
    body = res.json()
    assert body["replies"] == ["Sure! What time?", "Sorry, I'm busy."]
    assert isinstance(body["latencyMs"], int)


def test_suggest_replies_empty_when_last_turn_is_mine(monkeypatch):
    client = make_client(monkeypatch)
    res = client.post("/suggest-replies", json={"turns": [{"role": "other", "text": "hi"}, {"role": "me", "text": "hey"}]})
    assert res.status_code == 200
    assert res.json()["replies"] == []


def test_validation_rejects_bad_role_and_too_many_turns(monkeypatch):
    client = make_client(monkeypatch)
    assert client.post("/suggest-replies", json={"turns": [{"role": "bot", "text": "x"}]}).status_code == 422
    assert client.post("/suggest-replies", json={"turns": [{"role": "other", "text": "x"}] * 9}).status_code == 422


def test_health(monkeypatch):
    client = make_client(monkeypatch)
    assert client.get("/health").json()["ok"] is True
