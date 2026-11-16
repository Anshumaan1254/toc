"""Leakage-free train / validation / test split (+ the untouched long pool)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split

from ..paths import SPLITS_DIR
from .io import load_dataset, save_dataset, write_json

SPLITS_CSV = SPLITS_DIR / "splits.csv"


def _strata(frame: pd.DataFrame, min_count: int) -> pd.Series:
    """language|label|length-bucket strata; rare strata fall back to language|label."""
    fine = frame.language_id + "|" + frame.label.astype(str) + "|" + frame.length_bucket
    coarse = frame.language_id + "|" + frame.label.astype(str)
    counts = fine.map(fine.value_counts())
    return fine.where(counts >= min_count, coarse)


def make_splits(
    df: pd.DataFrame, seed: int = 42, val_frac: float = 0.15, test_frac: float = 0.15, min_stratum: int = 10
) -> pd.DataFrame:
    """Stratified 70/15/15 split of the ``main`` pool; the ``long`` pool becomes split ``long``.

    Stratification is by language x label x length bucket (falling back to language x label
    for strata with fewer than ``min_stratum`` rows), so every split has the same class and
    length profile.  Rows are unique per (language_id, string), hence the splits are disjoint.
    """
    main = df[df.split_hint == "main"]
    long = df[df.split_hint == "long"]
    holdout = val_frac + test_frac
    train, temp = train_test_split(main, test_size=holdout, stratify=_strata(main, min_stratum), random_state=seed)
    val, test = train_test_split(
        temp, test_size=test_frac / holdout, stratify=_strata(temp, max(2, min_stratum // 3)), random_state=seed
    )
    parts = [train.assign(split="train"), val.assign(split="val"), test.assign(split="test"), long.assign(split="long")]
    out = pd.concat(parts).sort_index()
    out["split"] = out["split"].astype(str)
    return out


def check_no_leakage(splits: pd.DataFrame) -> dict[str, Any]:
    """Assert that no (language, string) pair occurs in two splits; return overlap counts (all 0)."""
    assert not splits.duplicated(["language_id", "string"]).any(), "a (language, string) pair appears twice"
    names = ["train", "val", "test", "long"]
    report: dict[str, Any] = {}
    for lid, g in splits.groupby("language_id", sort=False):
        sets = {n: set(g.loc[g.split == n, "string"]) for n in names}
        for i, a in enumerate(names):
            for b in names[i + 1 :]:
                overlap = len(sets[a] & sets[b])
                assert overlap == 0, f"{lid}: {overlap} strings shared by {a} and {b}"
                report[f"{lid}:{a}&{b}"] = overlap
    max_train_len = int(splits.loc[splits.split == "train", "length"].max())
    min_long_len = int(splits.loc[splits.split == "long", "length"].min())
    assert max_train_len < min_long_len, "long pool must be strictly longer than every training string"
    report["max_train_length"] = max_train_len
    report["min_long_length"] = min_long_len
    return report


def split_summary(splits: pd.DataFrame) -> pd.DataFrame:
    g = splits.groupby(["language_id", "split"], sort=False)
    out = g.agg(rows=("string", "size"), positives=("label", "sum"), min_len=("length", "min"), max_len=("length", "max"))
    out["positive_rate"] = (out["positives"] / out["rows"]).round(3)
    return out.reset_index()


def save_splits(splits: pd.DataFrame, path: Path = SPLITS_CSV) -> Path:
    save_dataset(splits, path, None)
    write_json(split_summary(splits).to_dict(orient="records"), path.with_name("split_summary.json"))
    return path


def load_splits(path: Path = SPLITS_CSV) -> pd.DataFrame:
    return load_dataset(path)
