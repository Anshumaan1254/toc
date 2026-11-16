"""Repository-root discovery and canonical project paths.

Every notebook, script, test and the backend resolve files through this module,
so nothing depends on the current working directory of the process or kernel.
"""

from __future__ import annotations

from pathlib import Path


def find_repo_root(start: Path | None = None) -> Path:
    """Walk upwards from ``start`` until the directory holding ``pyproject.toml`` and ``src/``."""
    here = (start or Path(__file__)).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "src").is_dir():
            return candidate
    raise FileNotFoundError(f"Could not locate the repository root above {here}")


ROOT: Path = find_repo_root()
DATA_DIR: Path = ROOT / "data"
SPLITS_DIR: Path = DATA_DIR / "splits"
DATASET_CSV: Path = DATA_DIR / "dataset.csv"
DATASET_PARQUET: Path = DATA_DIR / "dataset.parquet"
ARTIFACTS_DIR: Path = ROOT / "artifacts"
MODELS_DIR: Path = ARTIFACTS_DIR / "models"
AUTOMATA_DIR: Path = ARTIFACTS_DIR / "automata"
FIGURES_DIR: Path = ARTIFACTS_DIR / "figures"
METRICS_JSON: Path = ARTIFACTS_DIR / "metrics.json"


def ensure_dirs() -> None:
    """Create every output directory (idempotent)."""
    for d in (DATA_DIR, SPLITS_DIR, ARTIFACTS_DIR, MODELS_DIR, AUTOMATA_DIR, FIGURES_DIR):
        d.mkdir(parents=True, exist_ok=True)
