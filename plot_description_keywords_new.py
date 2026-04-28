#!/usr/bin/env python3
"""Description keyword bar charts with explicit junk/generic filters.

- new:  tokenize descriptions, drop an explicit word set, top 50 → top_50_description_keywordsnew.png
- new2: same + drop the token "funeral" → top_50_description_keywordsnew2.png

No rank-based omission (unlike title charts); only explicit tokens are removed.
"""

from collections import Counter
from pathlib import Path

import pandas as pd

from generate_overall_summary import tokenize
from plot_title_keywords_new import save_barh_dense_x

OUT_DIR = Path(__file__).parent / "newTruncatedData"
OUT_NEW = OUT_DIR / "top_50_description_keywordsnew.png"
OUT_NEW2 = OUT_DIR / "top_50_description_keywordsnew2.png"
DEFAULT_PLAYLISTS = Path(__file__).parent / "spotify_playlist_clean2.csv"

# User-specified description noise / generics (explicit removal only; no rank drops)
DESCRIPTION_EXTRA_SKIP = frozenset(
    {
        "some",
        "about",
        "what",
        "have",
        "just",
        "can",
        "x2f",
        "x27",
        "quot",
        "play",
        "playlist",
        "songs",
    }
)


def description_keyword_top(
    descriptions: list[str],
    *,
    also_drop_funeral: bool,
    top_n: int,
) -> tuple[list[str], list[int]]:
    skip = set(DESCRIPTION_EXTRA_SKIP)
    if also_drop_funeral:
        skip.add("funeral")

    words: list[str] = []
    for d in descriptions:
        for w in tokenize(d if isinstance(d, str) else ""):
            if w in skip:
                continue
            words.append(w)

    ordered = Counter(words).most_common(top_n)
    labels = [k for k, _ in ordered]
    values = [v for _, v in ordered]
    return labels, values


def main() -> None:
    df = pd.read_csv(DEFAULT_PLAYLISTS, dtype=str)
    desc_col = df["description"] if "description" in df.columns else pd.Series([], dtype=str)
    descriptions = desc_col.fillna("").tolist()

    labels, values = description_keyword_top(
        descriptions, also_drop_funeral=False, top_n=50
    )
    save_barh_dense_x(
        OUT_NEW,
        "Top description keywords (explicit word filter)",
        labels,
        values,
    )
    print(f"Wrote {OUT_NEW} ({len(labels)} bars)")

    labels2, values2 = description_keyword_top(
        descriptions, also_drop_funeral=True, top_n=50
    )
    save_barh_dense_x(
        OUT_NEW2,
        "Top description keywords (same filter + funeral omitted)",
        labels2,
        values2,
    )
    print(f"Wrote {OUT_NEW2} ({len(labels2)} bars)")


if __name__ == "__main__":
    main()
