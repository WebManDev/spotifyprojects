#!/usr/bin/env python3
import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Top-N by playlist presence and total occurrences "
            "for trackName, albumName, artistName, and trackName+artistName pairs."
        )
    )
    parser.add_argument(
        "--input",
        default="spotify_playlist_tracks.csv",
        help="Input CSV path (default: spotify_playlist_tracks.csv)",
    )
    parser.add_argument(
        "--output",
        default="top50_presence_and_occurrences.csv",
        help="Output CSV path (default: top50_presence_and_occurrences.csv)",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=50,
        help="Top N per category (default: 50)",
    )
    return parser.parse_args()


def split_artists(raw: str) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split("|") if part.strip()]


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    # Metric 1: total row-level occurrences
    occ_track: Counter[str] = Counter()
    occ_album: Counter[str] = Counter()
    occ_artist: Counter[str] = Counter()
    occ_track_artist: Counter[str] = Counter()

    # Metric 2: distinct playlist presence
    playlists_per_track: dict[str, set[str]] = defaultdict(set)
    playlists_per_album: dict[str, set[str]] = defaultdict(set)
    playlists_per_artist: dict[str, set[str]] = defaultdict(set)
    playlists_per_track_artist: dict[str, set[str]] = defaultdict(set)
    all_playlists: set[str] = set()

    with input_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            playlist_id = (row.get("playlistId") or "").strip()
            if playlist_id:
                all_playlists.add(playlist_id)

            track_name = (row.get("trackName") or "").strip()
            album_name = (row.get("albumName") or "").strip()
            artists = split_artists((row.get("trackArtists") or "").strip())

            if track_name:
                occ_track[track_name] += 1
                if playlist_id:
                    playlists_per_track[track_name].add(playlist_id)

            if album_name:
                occ_album[album_name] += 1
                if playlist_id:
                    playlists_per_album[album_name].add(playlist_id)

            for artist in artists:
                occ_artist[artist] += 1
                if playlist_id:
                    playlists_per_artist[artist].add(playlist_id)
                if track_name:
                    pair_value = f"{track_name} | {artist}"
                    occ_track_artist[pair_value] += 1
                    if playlist_id:
                        playlists_per_track_artist[pair_value].add(playlist_id)

    total_playlists = len(all_playlists)

    def rows_for_category(
        category: str,
        occ: Counter[str],
        presence: dict[str, set[str]],
    ) -> list[list[object]]:
        values = list(occ.keys())
        # Sort by metric #1 (playlist_count), then metric #2 (total_occurrences), then value
        values.sort(
            key=lambda v: (-len(presence.get(v, set())), -occ[v], v.lower())
        )
        top_values = values[: args.top_n]

        out = []
        for rank, value in enumerate(top_values, start=1):
            playlist_count = len(presence.get(value, set()))
            playlist_rate = (playlist_count / total_playlists) if total_playlists else 0.0
            out.append(
                [
                    category,
                    rank,
                    value,
                    playlist_count,         # metric 1
                    f"{playlist_rate:.6f}",
                    occ[value],             # metric 2
                ]
            )
        return out

    rows = []
    rows.extend(rows_for_category("trackName", occ_track, playlists_per_track))
    rows.extend(rows_for_category("albumName", occ_album, playlists_per_album))
    rows.extend(rows_for_category("artistName", occ_artist, playlists_per_artist))
    rows.extend(
        rows_for_category(
            "trackName+artistName",
            occ_track_artist,
            playlists_per_track_artist,
        )
    )

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "category",
                "rank",
                "value",
                "playlist_count",
                "playlist_rate",
                "total_occurrences",
            ]
        )
        writer.writerows(rows)

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Distinct playlists: {total_playlists}")
    print(f"Top N per category: {args.top_n}")


if __name__ == "__main__":
    main()
