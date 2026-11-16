"""Execute notebooks in place, using the *current* interpreter as the Jupyter kernel.

Equivalent to ``jupyter nbconvert --to notebook --execute --inplace`` (nbconvert uses
nbclient underneath), with two machine-specific problems avoided:

* a user-level ``python3`` kernelspec may point at a different Python than the project
  environment - here the kernel is pinned to ``sys.executable``;
* Windows Application Control can block the ``jupyter-*.exe`` launcher shims - nothing
  here goes through them.

Usage::

    python scripts/run_notebook.py notebooks/01_generate_dataset.ipynb [more.ipynb ...]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

import nbformat
from jupyter_client.kernelspec import KernelSpec, KernelSpecManager
from jupyter_client.manager import KernelManager
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError


class CurrentInterpreterKernelSpecs(KernelSpecManager):
    """Resolve every kernel name to an ipykernel running on ``sys.executable``."""

    def get_kernel_spec(self, kernel_name: str) -> KernelSpec:  # noqa: ARG002
        return KernelSpec(
            argv=[sys.executable, "-Xfrozen_modules=off", "-m", "ipykernel_launcher", "-f", "{connection_file}"],
            display_name="Python (AI)",
            language="python",
            resource_dir="",
        )

    def find_kernel_specs(self) -> dict[str, str]:
        return {"python3": ""}


def execute_notebook(path: Path, timeout: int | None = None) -> float:
    """Run every cell of ``path`` (cwd = the notebook's folder) and save outputs in place."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    os.environ["TOC_EXPECTED_PYTHON"] = sys.executable
    os.environ.setdefault("PYDEVD_DISABLE_FILE_VALIDATION", "1")
    os.environ.setdefault("MPLBACKEND", "module://matplotlib_inline.backend_inline")
    nb = nbformat.read(path, as_version=4)
    km = KernelManager(kernel_name="python3", kernel_spec_manager=CurrentInterpreterKernelSpecs())
    client = NotebookClient(
        nb,
        km=km,
        timeout=timeout,
        kernel_name="python3",
        allow_errors=False,
        resources={"metadata": {"path": str(path.parent)}},
    )
    started = time.time()
    try:
        client.execute()
    finally:
        nb.metadata["kernelspec"] = {"name": "ai", "display_name": "Python (AI)", "language": "python"}
        nbformat.write(nb, path)  # keep outputs (including a failing cell's traceback)
    return time.time() - started


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("notebooks", nargs="+", type=Path)
    parser.add_argument("--timeout", type=int, default=None, help="per-cell timeout in seconds (default: none)")
    args = parser.parse_args()
    for nb_path in args.notebooks:
        nb_path = nb_path.resolve()
        print(f"[run_notebook] executing {nb_path.name} with {sys.executable}", flush=True)
        try:
            seconds = execute_notebook(nb_path, args.timeout)
        except CellExecutionError as exc:
            print(f"[run_notebook] FAILED {nb_path.name}:\n{exc}", file=sys.stderr, flush=True)
            return 1
        print(f"[run_notebook] OK {nb_path.name} in {seconds:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
