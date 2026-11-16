"""FastAPI backend: serves the trained models, the automata and live learning.

Run from the repository root::

    python -m uvicorn backend.app.main:app --port 8000

OpenAPI docs: http://localhost:8000/docs  ·  the built website (frontend/dist) is served at /.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:  # one import root for models pickled as ``src.*``
    sys.path.insert(0, str(ROOT))

from typing import Any  # noqa: E402

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from src.automata.languages import LANGUAGES  # noqa: E402

from . import services  # noqa: E402
from .schemas import ClassifyRequest, CompareRequest, LearnClassifyRequest, LearnRequest  # noqa: E402
from .store import ArtifactStore, MissingArtifact  # noqa: E402

DIST = ROOT / "frontend" / "dist"

app = FastAPI(
    title="TOC · Automata Learning & Regular Language Classification",
    version="1.0.0",
    description=(
        "Ground-truth DFAs/NFAs, Hopcroft minimization, automata learned with L* (from four ML pipelines) "
        "and RPNI/EDSM, and the ML pipelines themselves. Classify strings with step-by-step traces, compare "
        "every approach on one string, or learn a DFA from your own labelled samples."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
store = ArtifactStore()


@app.exception_handler(MissingArtifact)
async def missing_artifact(_: Request, exc: MissingArtifact) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": {"message": str(exc)}})


@app.exception_handler(RequestValidationError)
async def friendly_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    message = first.get("msg", "Invalid request")
    if first.get("type") == "string_too_long":
        message = f"That input is too long ({field})."
    return JSONResponse(status_code=422, content={"detail": {"message": message, "field": field, "errors": exc.errors()}})


# ----------------------------------------------------------------------------- meta
@app.get("/api/health", tags=["meta"])
def health() -> dict[str, Any]:
    return {"status": "ok", "languages": len(LANGUAGES), **store.status()}


@app.post("/api/reload", tags=["meta"])
def reload_artifacts() -> dict[str, Any]:
    store.reload()
    return {"reloaded": True, **store.status()}


# ----------------------------------------------------------------------------- catalogue
@app.get("/api/languages", tags=["catalogue"])
def list_languages() -> list[dict[str, Any]]:
    """The target regular languages L1-L10 (description, alphabet, regex, minimal states, best pipeline)."""
    return services.language_list(store)


@app.get("/api/languages/{language}", tags=["catalogue"])
def get_language(language: str) -> dict[str, Any]:
    lang = services.require_language(language)
    out = lang.summary()
    out["approaches"] = services.approach_list(store, language)
    return out


@app.get("/api/approaches", tags=["catalogue"])
def list_approaches(language: str = "L1") -> list[dict[str, Any]]:
    """All approaches for one language with live stats (states, accuracy, ...)."""
    return services.approach_list(store, language)


@app.get("/api/automata/{language}/{approach}", tags=["automata"])
def get_automaton(language: str, approach: str) -> dict[str, Any]:
    """Automaton JSON (states, alphabet, start, accepting, transitions; ε-moves for NFAs) + construction details."""
    services.require_language(language)
    services.require_approach(approach)
    if approach.startswith("ml_"):
        raise services.bad_request(f"'{approach}' is an ML pipeline; use /api/models/{language}/{approach[3:]}", status=400)
    record = store.automaton_record(language, approach)
    metrics = store.automaton_metrics(language, approach)
    return {**record, "metrics": metrics}


@app.get("/api/models/{language}/{pipeline}", tags=["ml"])
def get_model(language: str, pipeline: str) -> dict[str, Any]:
    """Metrics, tuning, complexity, explanation (coefficients / tree / importances) and the extracted DFA."""
    return services.pipeline_detail(store, language, pipeline)


@app.get("/api/metrics", tags=["results"])
def get_metrics() -> dict[str, Any]:
    if not store.metrics:
        raise MissingArtifact("metrics.json not found. Run notebook 02 first.")
    return store.metrics


@app.get("/api/summary", tags=["results"])
def get_summary() -> dict[str, Any]:
    """Headline numbers for the landing page (no per-grid-point tuning records)."""
    if not store.metrics:
        raise MissingArtifact("metrics.json not found. Run notebook 02 first.")
    m = store.metrics
    ml_slim = {
        lid: {
            pid: {k: r[k] for k in ("val", "test", "long", "generalization_drop", "train_time_s", "inference_time_per_string_s", "complexity", "best_params")}
            for pid, r in per.items()
        }
        for lid, per in m["ml"].items()
    }
    auto_slim = {
        lid: {a: {k: r.get(k) for k in ("states", "transitions", "equivalent_to_truth", "converged", "stop_reason", "membership_queries", "learning_time_s", "inference_time_per_string_s")} | {"test_accuracy": r["test"]["accuracy"], "long_accuracy": r["long"]["accuracy"], "fidelity_test": r["test"].get("fidelity"), "fidelity_long": r["long"].get("fidelity")} for a, r in per.items()}
        for lid, per in m["automata"].items()
    }
    return {
        "meta": m["meta"],
        "languages": m["languages"],
        "pipelines": m["pipelines"],
        "approaches": m["approaches"],
        "summary": m["summary"],
        "ml": ml_slim,
        "automata": auto_slim,
        "sample_efficiency": m.get("sample_efficiency", []),
    }


# ----------------------------------------------------------------------------- actions
@app.post("/api/classify", tags=["actions"])
def classify(req: ClassifyRequest) -> dict[str, Any]:
    """Classify one string with one approach; returns the verdict, the ground truth and a step-by-step trace."""
    return services.classify(store, req.language, req.approach, req.string)


@app.post("/api/compare", tags=["actions"])
def compare(req: CompareRequest) -> dict[str, Any]:
    """Run every approach on one string; disagreements with the ground truth come with an explanation."""
    return services.compare(store, req.language, req.string)


@app.post("/api/learn", tags=["learn"])
def learn(req: LearnRequest) -> dict[str, Any]:
    """Learn a DFA live from labelled samples (RPNI / EDSM, or an ML model + L*), minimized."""
    return services.learn(req)


@app.post("/api/learn/{session_id}/classify", tags=["learn"])
def learn_classify(session_id: str, req: LearnClassifyRequest) -> dict[str, Any]:
    """Classify a new string with a learned DFA and with the ML models trained on the same samples."""
    return services.learn_classify(session_id, req.string)


# ----------------------------------------------------------------------------- website
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str) -> Any:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail={"message": f"No API route /{full_path}"})
    if not DIST.exists():
        return JSONResponse(
            {"message": "Frontend not built yet. Run `npm run build` in frontend/ (python run_all.py does it), or use the Vite dev server on :5173.", "docs": "/docs"}
        )
    candidate = (DIST / full_path).resolve()
    if full_path and candidate.is_file() and DIST.resolve() in candidate.parents:
        return FileResponse(candidate)
    return FileResponse(DIST / "index.html")
