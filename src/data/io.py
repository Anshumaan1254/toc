"""The single loader/saver for the dataset (avoids the classic CSV round-trip traps).

``read_csv`` would otherwise turn the empty string into NaN and parse digit-only values
such as the string ``"0011"`` or the alphabet ``"01"`` as integers.  Always load with
:func:`load_dataset`.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..paths import DATASET_CSV, DATASET_PARQUET

STR_COLUMNS = ["language_id", "alphabet", "string", "split_hint", "generation_strategy", "length_bucket"]
INT_COLUMNS = ["label", "length"]


def save_dataset(df: pd.DataFrame, csv_path: Path = DATASET_CSV, parquet_path: Path | None = DATASET_PARQUET) -> list[Path]:
    """Write the CSV (all text fields quoted) and, if pyarrow is available, a Parquet copy."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False, quoting=csv.QUOTE_NONNUMERIC, lineterminator="\n")
    written = [csv_path]
    if parquet_path is not None:
        try:
            import pyarrow  # noqa: F401

            df.to_parquet(parquet_path, index=False)
            written.append(parquet_path)
        except ImportError:
            pass
    return written


def load_dataset(path: Path = DATASET_CSV) -> pd.DataFrame:
    """Load a dataset/split CSV keeping every text column as ``str`` (empty string preserved)."""
    header = pd.read_csv(path, nrows=0).columns
    dtypes: dict[str, Any] = {c: str for c in STR_COLUMNS if c in header}
    dtypes.update({c: "int64" for c in INT_COLUMNS if c in header})
    if "split" in header:
        dtypes["split"] = str
    df = pd.read_csv(path, dtype=dtypes, keep_default_na=False, na_filter=False)
    if "string" in df.columns and "length" in df.columns:
        bad = df["string"].str.len() != df["length"]
        if bad.any():
            raise ValueError(f"{int(bad.sum())} rows have a length column that does not match the string")
    return df


def to_jsonable(obj: Any) -> Any:
    """Recursively convert numpy / pandas scalars to native types and NaN/inf to None."""
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return f if math.isfinite(f) else None
    if isinstance(obj, Path):
        return obj.as_posix()
    return obj


def write_json(obj: Any, path: Path, indent: int | None = 2) -> Path:
    """Strict JSON writer (``allow_nan=False``) so browsers and FastAPI can always parse it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(to_jsonable(obj), fh, indent=indent, ensure_ascii=False, allow_nan=False)
        fh.write("\n")
    return path


def read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
