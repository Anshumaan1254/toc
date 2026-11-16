"""Environment guard executed in the first cell of every notebook.

A kernel silently running on the wrong interpreter (e.g. a user-level ``python3``
kernelspec pointing at another Python) would produce numbers and pickles that cannot be
reproduced.  This check fails loudly instead.
"""

from __future__ import annotations

import os
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from .paths import ROOT

STRICT = {"numpy", "pandas", "scikit-learn", "scipy", "joblib"}  # affect numbers or pickles


def pinned_versions(requirements: Path = ROOT / "requirements.txt") -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in requirements.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if "==" in line:
            name, ver = line.split("==", 1)
            pins[name.strip().lower()] = ver.strip()
    return pins


def check_environment(verbose: bool = True) -> dict[str, str]:
    """Assert the interpreter and the version pins; return the versions found."""
    expected = os.environ.get("TOC_EXPECTED_PYTHON")
    if expected:
        assert Path(expected).resolve() == Path(sys.executable).resolve(), (
            f"kernel runs {sys.executable} but the runner expected {expected}"
        )
    assert sys.version_info >= (3, 10), f"Python 3.10+ required, found {sys.version}"
    found: dict[str, str] = {}
    problems: list[str] = []
    for name, pin in pinned_versions().items():
        try:
            got = version(name)
        except PackageNotFoundError:
            got = "missing"
        found[name] = got
        if got != pin and name in STRICT:
            problems.append(f"{name}: pinned {pin}, found {got}")
    if problems:
        raise AssertionError("Environment does not match requirements.txt:\n  " + "\n  ".join(problems))
    if verbose:
        print(f"Python      {sys.version.split()[0]}  ({sys.executable})")
        for name in sorted(STRICT):
            print(f"{name:<11} {found.get(name)}")
    return found
