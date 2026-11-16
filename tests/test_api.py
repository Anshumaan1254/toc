"""Backend API tests (FastAPI TestClient - no server needed)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, store

client = TestClient(app)
needs_results = pytest.mark.skipif(not store.has_results, reason="run notebook 02 first (metrics/models missing)")


def test_health_and_languages() -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    langs = client.get("/api/languages").json()
    assert [l["id"] for l in langs] == [f"L{i}" for i in range(1, 11)]
    assert client.get("/api/languages/L99").status_code == 404


def test_ground_truth_automata_payloads() -> None:
    dfa = client.get("/api/automata/L7/dfa").json()
    assert dfa["automaton"]["kind"] == "dfa" and len(dfa["automaton"]["states"]) == 4
    nfa = client.get("/api/automata/L7/nfa").json()
    assert nfa["automaton"]["kind"] == "nfa" and nfa["subset_construction"]["steps"]
    l1 = client.get("/api/automata/L1/nfa").json()
    assert l1["automaton"]["epsilon"]  # Thompson ε-NFA exposes its ε-transitions
    minimal = client.get("/api/automata/L8/min_dfa").json()
    assert minimal["minimization"]["states_after"] == 6 and minimal["minimization"]["moore_rounds"]


def test_classify_dfa_trace() -> None:
    r = client.post("/api/classify", json={"language": "L7", "approach": "dfa", "string": "aabb"}).json()
    assert r["accepted"] is True and r["truth"] is True and r["correct"] is True
    assert [s["symbol"] for s in r["trace"]["steps"]] == list("aabb")
    assert r["trace"]["final"] == "q3"


def test_classify_empty_string_and_nfa_sets() -> None:
    r = client.post("/api/classify", json={"language": "L1", "approach": "dfa", "string": ""}).json()
    assert r["accepted"] is True and r["trace"]["steps"] == []
    n = client.post("/api/classify", json={"language": "L9", "approach": "nfa", "string": "100"}).json()
    assert n["accepted"] is True and n["trace"]["steps"][-1]["to"] == ["n0", "n3"]


def test_friendly_validation_errors() -> None:
    bad = client.post("/api/classify", json={"language": "L1", "approach": "dfa", "string": "012"})
    assert bad.status_code == 422 and "not in the alphabet" in bad.json()["detail"]["message"]
    assert bad.json()["detail"]["invalid_symbols"] == ["2"]
    too_long = client.post("/api/classify", json={"language": "L1", "approach": "dfa", "string": "0" * 500})
    assert too_long.status_code == 422 and too_long.json()["detail"]["message"]
    assert client.post("/api/classify", json={"language": "L1", "approach": "nope", "string": "0"}).status_code == 404


@needs_results
def test_classify_ml_and_learned_dfa() -> None:
    r = client.post("/api/classify", json={"language": "L3", "approach": "ml_rf", "string": "0101"}).json()
    assert 0 <= r["probability"] <= 1 and r["ml"]["drivers"]
    t = client.post("/api/classify", json={"language": "L3", "approach": "ml_dt", "string": "0101"}).json()
    assert t["ml"]["decision_path"]
    lstar = client.post("/api/classify", json={"language": "L1", "approach": "lstar_rf", "string": "0110"}).json()
    assert lstar["accepted"] is True and lstar["trace"]["steps"]


@needs_results
def test_compare_explains_disagreements() -> None:
    s = "1" * 23 + "0"  # long L6 string, value = (2^24 - 2) ≡ 2 (mod 3) -> rejected
    r = client.post("/api/compare", json={"language": "L6", "string": s}).json()
    assert r["truth"] is False and len(r["results"]) == 13 and r["longer_than_training"]
    for row in r["results"]:
        if row.get("available") and not row["correct"]:
            assert row["explanation"]
    truth_rows = [row for row in r["results"] if row["family"] == "truth"]
    assert all(row["correct"] for row in truth_rows)


@needs_results
def test_summary_and_model_detail() -> None:
    s = client.get("/api/summary").json()
    assert s["summary"]["insights"] and set(s["ml"]) == {f"L{i}" for i in range(1, 11)}
    d = client.get("/api/models/L6/dt").json()
    assert d["explanation"]["tree"] and d["metrics"]["test"]["accuracy"] > 0.5


def test_learn_from_samples_and_classify() -> None:
    samples = [{"string": s, "label": len(s) % 2 == 0} for s in ["", "a", "b", "ab", "ba", "aa", "bb", "aab", "abb", "abab", "babb", "aaaa", "abbab", "bbbbbb", "aaabbb"]]
    r = client.post("/api/learn", json={"samples": samples, "learner": "rpni"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fits_samples"] == body["samples"] and body["states"] >= 1
    sid = body["session_id"]
    c = client.post(f"/api/learn/{sid}/classify", json={"string": "abba"}).json()
    assert c["accepted"] is True and set(c["ml"]) == {"lr", "dt", "rf"}
    ml = client.post("/api/learn", json={"samples": samples, "learner": "ml_dt"})
    assert ml.status_code == 200 and ml.json()["automaton"]["kind"] == "dfa"


@pytest.mark.parametrize(
    "samples, fragment",
    [
        ([{"string": "ab", "label": True}, {"string": "ab", "label": False}], "Inconsistent"),
        ([{"string": "ab", "label": True}, {"string": "a", "label": True}], "at least one accepted and one rejected"),
        ([{"string": "a b", "label": True}, {"string": "a", "label": False}], "whitespace"),
        ([{"string": "abcde", "label": True}, {"string": "a", "label": False}], "at most 4"),
    ],
)
def test_learn_rejects_bad_samples(samples, fragment) -> None:
    r = client.post("/api/learn", json={"samples": samples, "learner": "rpni"})
    assert r.status_code == 422 and fragment in r.json()["detail"]["message"]


def test_expired_session_is_friendly() -> None:
    r = client.post("/api/learn/doesnotexist/classify", json={"string": "a"})
    assert r.status_code == 404 and "expired" in r.json()["detail"]["message"]


def test_openapi_documents_every_endpoint() -> None:
    paths = client.get("/openapi.json").json()["paths"]
    for p in ["/api/languages", "/api/approaches", "/api/automata/{language}/{approach}", "/api/metrics", "/api/classify", "/api/compare", "/api/learn"]:
        assert p in paths


def test_dataset_report_endpoint() -> None:
    r = client.get("/api/dataset")
    assert r.status_code == 200
    body = r.json()
    assert body["total_rows"] == sum(l["rows"] for l in body["languages"]) and len(body["languages"]) == 10
