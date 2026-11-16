"""Tiny helpers for writing notebooks programmatically with nbformat."""

from __future__ import annotations

import textwrap
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

KERNELSPEC = {"name": "ai", "display_name": "Python (AI)", "language": "python"}


def md(text: str):
    return new_markdown_cell(textwrap.dedent(text).strip("\n"))


def code(text: str):
    return new_code_cell(textwrap.dedent(text).strip("\n"))


def write_notebook(cells: list, path: Path) -> Path:
    nb = new_notebook(cells=cells, metadata={"kernelspec": KERNELSPEC, "language_info": {"name": "python"}})
    path.parent.mkdir(parents=True, exist_ok=True)
    nbformat.write(nb, path)
    return path
