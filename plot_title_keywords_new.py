#!/usr/bin/env python3
"""Title keyword bar charts (filtered) with a denser x-axis.

- new:  keep rank 1, drop ranks 2–5, then next 49 → top_50_title_keywordsnew.png
- new2: drop ranks 1–5 (incl. funeral + generic head), next 50 → top_50_title_keywordsnew2.png
"""

from collections import Counter
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd

from generate_overall_summary import tokenize

OUT_DIR = Path(__file__).parent / "newTruncatedData"
OUT_PATH = OUT_DIR / "top_50_title_keywordsnew.png"
OUT_PATH2 = OUT_DIR / "top_50_title_keywordsnew2.png"
DEFAULT_PLAYLISTS = Path(__file__).parent / "spotify_playlist_clean2.csv"


def title_keyword_series_filtered(
    names: list[str], *, variant: str, top_n: int
) -> tuple[list[str], list[int]]:
    title_words: list[str] = []
    for name in names:
        title_words.extend(tokenize(name if isinstance(name, str) else ""))

    # Need enough ranks after skipping the head
    ordered = Counter(title_words).most_common(max(top_n + 15, 60))
    if not ordered:
        return [], []

    if variant == "new":
        # rank 1 + ranks 6…(drop 2–5)
        if len(ordered) > 5:
            picked = [ordered[0]] + ordered[5 : 5 + (top_n - 1)]
        else:
            picked = ordered[:top_n]
    elif variant == "new2":
        # drop ranks 1–5 (funeral + songs, play, playlist, music on typical data)
        if len(ordered) > 5:
            picked = ordered[5 : 5 + top_n]
        else:
            picked = []
    else:
        raise ValueError(f"unknown variant: {variant!r}")

    labels = [k for k, _ in picked]
    values = [v for _, v in picked]
    return labels, values


def save_barh_dense_x(
    out_path: Path,
    title: str,
    labels: list[str],
    values: list[int],
) -> None:
    labels = labels[::-1]
    values = values[::-1]
    truncated_labels = [lbl if len(lbl) <= 60 else lbl[:57] + "..." for lbl in labels]

    fig, ax = plt.subplots(figsize=(14, 10))
    ax.barh(truncated_labels, values)
    ax.set_title(title)
    ax.set_xlabel("Count")

    vmax = max(values) if values else 1
    # Major ticks: ~every 20–25 for readability; minor every 5 for "more exact"
    major_step = 25 if vmax > 150 else 10 if vmax > 50 else 5
    ax.xaxis.set_major_locator(mticker.MultipleLocator(major_step))
    ax.xaxis.set_minor_locator(mticker.MultipleLocator(5))
    ax.xaxis.set_major_formatter(mticker.StrMethodFormatter("{x:.0f}"))
    ax.set_xlim(0, vmax * 1.06)
    ax.grid(axis="x", which="major", linestyle="-", alpha=0.35)
    ax.grid(axis="x", which="minor", linestyle=":", alpha=0.2)
    ax.tick_params(axis="x", which="minor", bottom=True)

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200)
    plt.close(fig)


def main() -> None:
    df = pd.read_csv(DEFAULT_PLAYLISTS, dtype=str)
    names = df["name"].tolist()

    labels, values = title_keyword_series_filtered(names, variant="new", top_n=50)
    save_barh_dense_x(
        OUT_PATH,
        "Top title keywords (ranks 2–5 omitted)",
        labels,
        values,
    )
    print(f"Wrote {OUT_PATH} ({len(labels)} bars)")

    labels2, values2 = title_keyword_series_filtered(names, variant="new2", top_n=50)
    save_barh_dense_x(
        OUT_PATH2,
        "Top title keywords (funeral + ranks 2–5 omitted)",
        labels2,
        values2,
    )
    print(f"Wrote {OUT_PATH2} ({len(labels2)} bars)")


if __name__ == "__main__":
    main()
