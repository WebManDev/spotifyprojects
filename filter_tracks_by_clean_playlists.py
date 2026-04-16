#!/usr/bin/env python3
"""Keep only track rows that belong to playlists in a clean playlists CSV."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create a filtered tracks CSV containing only rows whose playlistId exists "
            "in the provided clean playlists CSV."
        )
    )
    parser.add_argument(
        "--playlists-input",
        type=Path,
        default=Path("spotify_playlist_clean2.csv"),
        help="Input clean playlists CSV path",
    )
    parser.add_argument(
        "--tracks-input",
        type=Path,
        default=Path("spotify_playlist_tracks.csv"),
        help="Input tracks CSV path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("spotify_playlist_tracks_clean2.csv"),
        help="Output filtered tracks CSV path",
    )
    parser.add_argument(
        "--playlist-id-column",
        default="playlistId",
        help="Playlist ID column in tracks CSV",
    )
    return parser.parse_args()


def extract_playlist_id(row: dict[str, str]) -> str | None:
    """Extract playlist ID from uri or playlistUrl fields in playlist rows."""
    uri = (row.get("uri") or "").strip()
    if uri.startswith("spotify:playlist:"):
        return uri.rsplit(":", maxsplit=1)[-1]

    url = (row.get("playlistUrl") or "").strip().rstrip("/")
    if "/playlist/" in url:
        return url.split("/playlist/", maxsplit=1)[-1].split("?", maxsplit=1)[0]

    return None


def load_allowed_playlist_ids(playlists_path: Path) -> set[str]:
    allowed_ids: set[str] = set()
    with playlists_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            playlist_id = extract_playlist_id(row)
            if playlist_id:
                allowed_ids.add(playlist_id)
    return allowed_ids


def main() -> None:
    args = parse_args()
    allowed_ids = load_allowed_playlist_ids(args.playlists_input)

    kept = 0
    removed = 0
    with args.tracks_input.open("r", newline="", encoding="utf-8") as in_file:
        reader = csv.DictReader(in_file)
        if not reader.fieldnames:
            raise ValueError(f"No header found in {args.tracks_input}")
        fieldnames = reader.fieldnames

        with args.output.open("w", newline="", encoding="utf-8") as out_file:
            writer = csv.DictWriter(out_file, fieldnames=fieldnames)
            writer.writeheader()

            for row in reader:
                playlist_id = (row.get(args.playlist_id_column) or "").strip()
                if playlist_id in allowed_ids:
                    writer.writerow(row)
                    kept += 1
                else:
                    removed += 1

    print(
        f"Wrote {args.output} with {kept} rows from {len(allowed_ids)} playlists. "
        f"Removed {removed} rows not present in {args.playlists_input}."
    )


if __name__ == "__main__":
    main()
