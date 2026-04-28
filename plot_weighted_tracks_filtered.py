#!/usr/bin/env python3
"""Top 50 tracks by weighted score, excluding Funeral Portrait (name/artist match).

Writes newTruncatedData/top_50_tracks_by_weighted_score_new.png
"""

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd

DEFAULT_TRACKS = Path(__file__).parent / "spotify_playlist_tracks_clean2.csv"
DEFAULT_PLAYLISTS = Path(__file__).parent / "spotify_playlist_clean2.csv"
OUT_PATH = Path(__file__).parent / "newTruncatedData" / "top_50_tracks_by_weighted_score_new.png"

# Case-insensitive substring on track name + artists
EXCLUDE_SUBSTRING = "funeral portrait"


def track_label(row) -> str:
    return f'{row["trackName"]} - {row["trackArtists"]}'


def is_excluded(row) -> bool:
    blob = f'{row["trackName"]} {row["trackArtists"]}'.lower()
    return EXCLUDE_SUBSTRING in blob


def weighted_track_table(df_tracks: pd.DataFrame) -> pd.DataFrame:
    tracks_per_playlist = df_tracks.groupby("playlistId").size()
    df = df_tracks.copy()
    df["playlist_length"] = df["playlistId"].map(tracks_per_playlist)
    df["weight"] = 1.0 / df["playlist_length"]
    grouped = df.groupby(["trackId", "trackName", "trackArtists"], dropna=False)
    return grouped.agg(
        count=("playlistId", "size"),
        playlist_count=("playlistId", "nunique"),
        weighted_score=("weight", "sum"),
    ).reset_index()


def save_barh_weighted(out_path: Path, title: str, labels: list[str], values: list[float]) -> None:
    labels = labels[::-1]
    values = values[::-1]
    truncated = [lbl if len(lbl) <= 60 else lbl[:57] + "..." for lbl in labels]

    fig, ax = plt.subplots(figsize=(14, 10))
    ax.barh(truncated, values)
    ax.set_title(title)
    ax.set_xlabel("Weighted score")

    vmax = max(values) if values else 1.0
    ax.set_xlim(0, vmax * 1.08)
    ax.xaxis.set_major_locator(mticker.MaxNLocator(nbins=14))
    ax.xaxis.set_minor_locator(mticker.AutoMinorLocator(2))
    ax.xaxis.set_major_formatter(mticker.FormatStrFormatter("%.3f"))
    ax.grid(axis="x", which="major", linestyle="-", alpha=0.35)
    ax.grid(axis="x", which="minor", linestyle=":", alpha=0.2)
    fig.subplots_adjust(left=0.35, right=0.95, top=0.95, bottom=0.08)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200)
    plt.close(fig)


def main() -> None:
    print(f"Loading {DEFAULT_TRACKS.name} ...")
    df_tracks = pd.read_csv(DEFAULT_TRACKS, dtype=str)
    print(f"Loading {DEFAULT_PLAYLISTS.name} ...")
    df_playlists = pd.read_csv(DEFAULT_PLAYLISTS, dtype=str)

    # Ensure weighted scores reflect only the current cleaned playlist set.
    allowed_playlist_ids = set(
        df_playlists["uri"]
        .fillna("")
        .str.replace("spotify:playlist:", "", regex=False)
    )
    df_tracks = df_tracks[df_tracks["playlistId"].isin(allowed_playlist_ids)]

    track_counts = weighted_track_table(df_tracks)
    track_counts = track_counts[~track_counts.apply(is_excluded, axis=1)]
    top50 = track_counts.sort_values("weighted_score", ascending=False).head(50)
    labels = top50.apply(track_label, axis=1).tolist()
    values = top50["weighted_score"].astype(float).tolist()

    save_barh_weighted(
        OUT_PATH,
        "Top 50 tracks by weighted score (Funeral Portrait excluded)",
        labels,
        values,
    )
    print(f"Wrote {OUT_PATH} ({len(labels)} bars)")


if __name__ == "__main__":
    main()
