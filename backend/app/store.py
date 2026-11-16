"""Loads the artifacts produced by the notebooks (metrics, automata, explanations, models).

Models are loaded lazily (first use) and cached.  Ground-truth automata (dfa / nfa / min_dfa)
are recomputed from ``src`` when their JSON files are missing, so the TOC part of the app
works even before notebook 02 has been run.
"""

from __future__ import annotations

import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from src.automata.dfa import DFA
from src.automata.export import truth_files
from src.automata.languages import LANGUAGES, get_language
from src.automata.nfa import NFA
from src.data.io import read_json
from src.paths import ARTIFACTS_DIR, AUTOMATA_DIR, METRICS_JSON, MODELS_DIR

EXPLAIN_DIR = ARTIFACTS_DIR / "explain"
PIPELINES = ("lr", "dt", "rf", "stack")
DFA_APPROACHES = ("dfa", "min_dfa", "lstar_lr", "lstar_dt", "lstar_rf", "lstar_stack", "rpni", "edsm")
ML_APPROACHES = tuple(f"ml_{p}" for p in PIPELINES)
ALL_APPROACHES = ("dfa", "nfa", "min_dfa", "lstar_lr", "lstar_dt", "lstar_rf", "lstar_stack", "rpni", "edsm", *ML_APPROACHES)


class MissingArtifact(RuntimeError):
    """Raised when an artifact produced by notebook 02 is not available."""


class ArtifactStore:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR) -> None:
        self.artifacts_dir = artifacts_dir
        self._lock = threading.Lock()
        self._models: dict[tuple[str, str], Any] = {}
        self.reload()

    def reload(self) -> None:
        self.metrics: dict[str, Any] | None = read_json(METRICS_JSON) if METRICS_JSON.exists() else None
        self.automata: dict[tuple[str, str], dict[str, Any]] = {}
        for path in sorted(AUTOMATA_DIR.glob("L*__*.json")):
            lid, approach = path.stem.split("__", 1)
            self.automata[(lid, approach)] = read_json(path)
        self.explanations: dict[tuple[str, str], dict[str, Any]] = {}
        for path in sorted(EXPLAIN_DIR.glob("L*__*.json")) if EXPLAIN_DIR.exists() else []:
            lid, pid = path.stem.split("__", 1)
            self.explanations[(lid, pid)] = read_json(path)
        self._dfa_cache: dict[tuple[str, str], DFA] = {}
        self._nfa_cache: dict[str, NFA] = {}
        with self._lock:
            self._models.clear()

    # ------------------------------------------------------------------ status
    @property
    def has_results(self) -> bool:
        return self.metrics is not None

    def status(self) -> dict[str, Any]:
        return {
            "metrics": self.has_results,
            "automata_files": len(self.automata),
            "explanations": len(self.explanations),
            "models_available": len(list(MODELS_DIR.glob("*.joblib"))) if MODELS_DIR.exists() else 0,
            "models_loaded": len(self._models),
        }

    # ------------------------------------------------------------------ automata
    def automaton_record(self, lid: str, approach: str) -> dict[str, Any]:
        get_language(lid)
        if approach.startswith("ml_"):
            raise KeyError(f"{approach} is an ML pipeline, not an automaton")
        record = self.automata.get((lid, approach))
        if record is None and approach in ("dfa", "nfa", "min_dfa"):
            record = _truth_records(lid)[approach]
        if record is None:
            raise MissingArtifact(f"No automaton for {lid}/{approach}. Run notebook 02 to create the learned automata.")
        return record

    def dfa(self, lid: str, approach: str) -> DFA:
        key = (lid, approach)
        if key not in self._dfa_cache:
            if approach == "dfa":
                self._dfa_cache[key] = LANGUAGES[lid].dfa
            else:
                payload = self.automaton_record(lid, approach)["automaton"]
                self._dfa_cache[key] = DFA.from_dict(payload)
        return self._dfa_cache[key]

    def nfa(self, lid: str) -> NFA:
        if lid not in self._nfa_cache:
            self._nfa_cache[lid] = LANGUAGES[lid].nfa
        return self._nfa_cache[lid]

    # ------------------------------------------------------------------ models
    def model(self, lid: str, pid: str) -> Any:
        key = (lid, pid)
        with self._lock:
            if key not in self._models:
                path = MODELS_DIR / f"{lid}__{pid}.joblib"
                if not path.exists():
                    raise MissingArtifact(f"Model {path.name} not found. Run notebook 02 to train the pipelines.")
                self._models[key] = joblib.load(path)
            return self._models[key]

    def ml_metrics(self, lid: str, pid: str) -> dict[str, Any] | None:
        if not self.metrics:
            return None
        return self.metrics.get("ml", {}).get(lid, {}).get(pid)

    def automaton_metrics(self, lid: str, approach: str) -> dict[str, Any] | None:
        if not self.metrics:
            return None
        return self.metrics.get("automata", {}).get(lid, {}).get(approach)


@lru_cache(maxsize=None)
def _truth_records(lid: str) -> dict[str, dict[str, Any]]:
    return truth_files(LANGUAGES[lid])
