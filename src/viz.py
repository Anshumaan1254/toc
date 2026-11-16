"""Shared matplotlib styling for the notebooks.

Palette: the validated categorical order from the project's data-viz reference
(adjacent pairs pass CVD and normal-vision separation in light and dark modes).
Colours follow the *entity*, never its rank: each pipeline / learner keeps one hue
everywhere.  Chrome is recessive (hairline grid, muted ticks) and every chart in the
notebooks is accompanied by a table view.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
from cycler import cycler
from matplotlib.colors import LinearSegmentedColormap

from .paths import FIGURES_DIR

CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_SECONDARY = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
NEUTRAL = "#898781"  # reference / ground truth (not a categorical identity)

SEQUENTIAL_BLUE = [
    "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
    "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
]
SEQUENTIAL_CMAP = LinearSegmentedColormap.from_list("toc_blue", SEQUENTIAL_BLUE)
# Diverging: blue pole <-> neutral gray midpoint <-> red pole.
DIVERGING_CMAP = LinearSegmentedColormap.from_list(
    "toc_diverging", ["#184f95", "#6da7ec", "#f0efec", "#ef8f8e", "#b8302f"]
)

PIPELINE_COLORS = {
    "lr": CATEGORICAL[0],
    "dt": CATEGORICAL[1],
    "rf": CATEGORICAL[2],
    "stack": CATEGORICAL[3],
    "rpni": CATEGORICAL[4],
    "edsm": CATEGORICAL[5],
}
CLASS_COLORS = {1: CATEGORICAL[0], 0: CATEGORICAL[1]}  # accepted / rejected
POOL_COLORS = {"main": CATEGORICAL[0], "long": CATEGORICAL[1]}


def apply_style() -> None:
    mpl.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": AXIS,
            "axes.linewidth": 0.8,
            "axes.labelcolor": INK_SECONDARY,
            "axes.titlecolor": INK,
            "axes.titlesize": 12,
            "axes.titleweight": "semibold",
            "axes.titlelocation": "left",
            "axes.labelsize": 10,
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 0.6,
            "grid.linestyle": "-",
            "axes.axisbelow": True,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "xtick.color": AXIS,
            "ytick.color": AXIS,
            "xtick.labelcolor": INK_SECONDARY,
            "ytick.labelcolor": INK_SECONDARY,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
            "font.family": "sans-serif",
            "font.sans-serif": ["Segoe UI", "DejaVu Sans", "Arial", "sans-serif"],
            "legend.frameon": False,
            "legend.fontsize": 9,
            "figure.dpi": 100,
            "savefig.dpi": 150,
            "savefig.bbox": "tight",
            "axes.prop_cycle": cycler(color=CATEGORICAL),
            "patch.linewidth": 0,
        }
    )


def savefig(fig, name: str) -> Path:
    """Save to ``artifacts/figures/<name>.png`` and return the path."""
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    path = FIGURES_DIR / f"{name}.png"
    fig.savefig(path)
    return path


def heatmap(ax, frame, cmap=None, vmin=None, vmax=None, fmt="{:.2f}", text_dark_below=0.6, annotate=True):
    """Annotated heatmap of a DataFrame (rows x columns) on ``ax``; returns the image."""
    import numpy as np

    values = frame.to_numpy(dtype=float)
    im = ax.imshow(values, cmap=cmap or SEQUENTIAL_CMAP, vmin=vmin, vmax=vmax, aspect="auto")
    ax.set_xticks(range(frame.shape[1]), [str(c) for c in frame.columns])
    ax.set_yticks(range(frame.shape[0]), [str(i) for i in frame.index])
    ax.grid(False)
    for spine in ax.spines.values():
        spine.set_visible(False)
    if annotate:
        lo = np.nanmin(values) if vmin is None else vmin
        hi = np.nanmax(values) if vmax is None else vmax
        span = (hi - lo) or 1.0
        for i in range(values.shape[0]):
            for j in range(values.shape[1]):
                v = values[i, j]
                if np.isnan(v):
                    continue
                norm = (v - lo) / span
                dark_bg = norm > text_dark_below if cmap in (None, SEQUENTIAL_CMAP) else abs(norm - 0.5) > 0.3
                ax.text(j, i, fmt.format(v), ha="center", va="center", fontsize=8, color="white" if dark_bg else INK)
    return im


def legend_below(ax, ncol=4, offset=-0.16):
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, offset), ncol=ncol)
