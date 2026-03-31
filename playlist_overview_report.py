#!/usr/bin/env python3
import argparse
import re
from collections import Counter
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt


STOPWORDS = {
    "the",
    "and",
    "or",
    "a",
    "an",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "from",
    "at",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "it",
    "this",
    "that",
    "these",
    "those",
    "as",
    "but",
    "if",
    "you",
    "your",
    "i",
    "we",
    "they",
    "them",
    "my",
    "our",
    "their",
    "me",
    "us",
    "not",
    "no",
    "yes",
    "so",
    "than",
    "too",
    "very",
}


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    # Keep letters/numbers and normalize separators.
    text = text.lower()
    tokens = re.split(r"[^a-z0-9]+", text)
    out = []
    for t in tokens:
        t = t.strip()
        if len(t) < 3:
            continue
        if t in STOPWORDS:
            continue
        out.append(t)
    return out


def ensure_out_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def save_barh(
    out_path: Path, title: str, items: list[tuple[str, int]], max_bars: int = 20
) -> None:
    items = items[:max_bars]
    if not items:
        return
    labels = [v for v, _ in items][::-1]
    values = [c for _, c in items][::-1]

    plt.figure(figsize=(10, 7))
    plt.barh(labels, values)
    plt.title(title)
    plt.xlabel("count")
    plt.tight_layout()
    plt.savefig(out_path, dpi=200)
    plt.close()


def save_hist(out_path: Path, title: str, data: pd.Series) -> None:
    if data.empty:
        return
    plt.figure(figsize=(10, 6))
    plt.hist(data, bins=40)
    plt.title(title)
    plt.xlabel("tracks per playlist")
    plt.ylabel("number of playlists")
    plt.tight_layout()
    plt.savefig(out_path, dpi=200)
    plt.close()


def parse_dt(s: str) -> pd.Timestamp:
    # Expect ISO-ish (e.g. 2026-03-01 or 2026-03-01T12:00:00)
    return pd.to_datetime(s, utc=True, errors="coerce")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build a playlist-level report from spotify_playlist_tracks.csv "
            "and keyword analysis from spotify_playlists_clean.csv."
        )
    )
    parser.add_argument(
        "--tracks-csv",
        default="spotify_playlist_tracks.csv",
        help="Input track-level CSV (default: spotify_playlist_tracks.csv)",
    )
    parser.add_argument(
        "--playlists-csv",
        default="spotify_playlists_clean.csv",
        help="Input playlist-level CSV (default: spotify_playlists_clean.csv)",
    )
    parser.add_argument(
        "--out-dir",
        default="analysis_outputs",
        help="Directory to write plots and optional outputs (default: analysis_outputs)",
    )
    parser.add_argument(
        "--top-n-songs",
        type=int,
        default=20,
        help="How many songs to show in 'most common songs' chart (default: 20)",
    )
    parser.add_argument(
        "--top-n-keywords",
        type=int,
        default=20,
        help="How many keywords to show in charts (default: 20)",
    )
    parser.add_argument(
        "--min-tracks",
        type=int,
        default=10,
        help="Playlist tracks lower bound for range counts (default: 10)",
    )
    parser.add_argument(
        "--max-tracks",
        type=int,
        default=50,
        help="Playlist tracks upper bound for range counts (default: 50)",
    )
    parser.add_argument(
        "--start-timestamp",
        default="",
        help=(
            "Optional ISO timestamp lower bound to filter by dataset 'timestamp' "
            "(this is scrape time, not Spotify playlist creation time)."
        ),
    )
    parser.add_argument(
        "--end-timestamp",
        default="",
        help="Optional ISO timestamp upper bound to filter by dataset timestamp.",
    )
    args = parser.parse_args()

    tracks_path = Path(args.tracks_csv)
    playlists_path = Path(args.playlists_csv)
    out_dir = Path(args.out_dir)
    ensure_out_dir(out_dir)

    # --- Load data ---
    if not tracks_path.exists():
        raise FileNotFoundError(f"Tracks CSV not found: {tracks_path}")
    if not playlists_path.exists():
        raise FileNotFoundError(f"Playlists CSV not found: {playlists_path}")

    df = pd.read_csv(tracks_path)
    # Types: playlistId/trackName/artist etc are strings.
    for c in ["playlistId", "trackName", "albumName", "trackArtists", "timestamp"]:
        if c in df.columns:
            df[c] = df[c].astype("string")

    # --- Playlist counts: #list, #tracks, tracks per playlist ---
    playlist_count = df["playlistId"].nunique()
    total_tracks_rows = len(df)  # equals scrapedTrackCount if dataset is clean

    tracks_per_playlist = df.groupby("playlistId").size().rename("tracks_per_playlist")

    print("=== Overview ===")
    print(f"# playlists (distinct playlistId): {playlist_count}")
    print(f"#tracks (rows in track CSV): {total_tracks_rows}")
    print(
        "tracks per playlist: "
        f"min={int(tracks_per_playlist.min())}, "
        f"p50={int(tracks_per_playlist.median())}, "
        f"avg={tracks_per_playlist.mean():.2f}, "
        f"max={int(tracks_per_playlist.max())}"
    )

    # --- Range from n to m songs ---
    min_t, max_t = args.min_tracks, args.max_tracks
    in_range_mask = (tracks_per_playlist >= min_t) & (tracks_per_playlist <= max_t)
    range_playlist_count = int(in_range_mask.sum())
    print(
        f"Range of playlists with tracks in [{min_t}, {max_t}]: {range_playlist_count} / {playlist_count}"
    )

    # Save histogram of tracks per playlist
    save_hist(
        out_dir / "tracks_per_playlist_hist.png",
        "Tracks per playlist (distribution)",
        tracks_per_playlist,
    )

    # Save some examples of the range
    top_in_range = (
        tracks_per_playlist[in_range_mask]
        .sort_values(ascending=False)
        .head(20)
        .reset_index()
    )
    top_in_range.to_csv(out_dir / "top_playlists_in_track_range.csv", index=False)

    # --- Range of creation date ---
    # IMPORTANT: your current CSVs do not include Spotify playlist creation date.
    # We can only use the dataset 'timestamp' column (scrape time).
    if "timestamp" in df.columns:
        df["timestamp_dt"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
        # Use first timestamp per playlist (same across its rows in this dataset).
        playlist_ts = df.groupby("playlistId")["timestamp_dt"].min()

        if args.start_timestamp.strip():
            start_dt = parse_dt(args.start_timestamp)
        else:
            start_dt = None
        if args.end_timestamp.strip():
            end_dt = parse_dt(args.end_timestamp)
        else:
            end_dt = None

        ts_filtered = playlist_ts.dropna()
        if start_dt is not None:
            ts_filtered = ts_filtered[ts_filtered >= start_dt]
        if end_dt is not None:
            ts_filtered = ts_filtered[ts_filtered <= end_dt]

        if not ts_filtered.empty:
            print("=== Timestamp range (scrape time) ===")
            print(
                f"timestamp (min)={ts_filtered.min().isoformat()}, "
                f"timestamp (max)={ts_filtered.max().isoformat()}"
            )
        else:
            print("Timestamp range (scrape time): no valid timestamps found.")

        # Plot timestamp vs tracks per playlist (scatter)
        merged = pd.DataFrame(
            {"tracks_per_playlist": tracks_per_playlist, "timestamp_dt": playlist_ts}
        ).dropna(subset=["timestamp_dt"])
        if not merged.empty:
            # Sort by time for nicer rendering
            merged = merged.sort_values("timestamp_dt")
            plt.figure(figsize=(10, 6))
            plt.scatter(
                merged["timestamp_dt"].dt.date,
                merged["tracks_per_playlist"],
                s=12,
                alpha=0.6,
            )
            plt.title("Tracks per playlist over time (dataset timestamp)")
            plt.xlabel("date")
            plt.ylabel("tracks per playlist")
            plt.tight_layout()
            plt.savefig(out_dir / "tracks_per_playlist_over_time.png", dpi=200)
            plt.close()
    else:
        print(
            "Creation date range: cannot compute because 'timestamp' column is missing from spotify_playlist_tracks.csv."
        )

    # --- Most common songs ---
    top_song_counts = df["trackName"].astype("string").str.strip()
    top_song_counts = top_song_counts[top_song_counts.notna() & (top_song_counts != "")]
    top_song_counts = top_song_counts.value_counts().head(args.top_n_songs)
    save_barh(
        out_dir / "top_songs_bar.png",
        f"Most common songs (top {args.top_n_songs} trackName by row count)",
        list(top_song_counts.items()),
        max_bars=args.top_n_songs,
    )

    # --- Most common keywords in playlist title + description ---
    pl = pd.read_csv(playlists_path)
    # Expected columns: name, description
    if "name" not in pl.columns or "description" not in pl.columns:
        print(
            "Keyword analysis: expected columns 'name' and 'description' not found in spotify_playlists_clean.csv."
        )
        return

    title_words = []
    desc_words = []
    for _, row in pl.iterrows():
        title_words.extend(tokenize(str(row.get("name", ""))))
        desc_words.extend(tokenize(str(row.get("description", ""))))

    title_kw = Counter(title_words).most_common(args.top_n_keywords)
    desc_kw = Counter(desc_words).most_common(args.top_n_keywords)

    save_barh(
        out_dir / "top_title_keywords_bar.png",
        f"Most common title keywords (top {args.top_n_keywords})",
        title_kw,
        max_bars=args.top_n_keywords,
    )
    save_barh(
        out_dir / "top_description_keywords_bar.png",
        f"Most common description keywords (top {args.top_n_keywords})",
        desc_kw,
        max_bars=args.top_n_keywords,
    )

    print("=== Outputs ===")
    print(f"Plots saved to: {out_dir.resolve()}")
    print("  - tracks_per_playlist_hist.png")
    print("  - tracks_per_playlist_over_time.png (if timestamps exist)")
    print("  - top_songs_bar.png")
    print("  - top_title_keywords_bar.png")
    print("  - top_description_keywords_bar.png")
    print("  - top_playlists_in_track_range.csv")


if __name__ == "__main__":
    main()

