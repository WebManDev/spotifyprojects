#!/usr/bin/env python3
"""Filter playlist CSV rows by owner name."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove playlist rows where owner_name matches a target value."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("spotify_playlists_clean.csv"),
        help="Input playlists CSV path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("spotify_playlist_clean2.csv"),
        help="Output playlists CSV path",
    )
    parser.add_argument(
        "--owner-column",
        default="owner_name",
        help="Owner column name to filter on",
    )
    parser.add_argument(
        "--remove-owner",
        default="spotify",
        help="Owner value to remove (case-insensitive)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    removed_owner = args.remove_owner.strip().lower()
    kept = 0
    removed = 0

    with args.input.open("r", newline="", encoding="utf-8") as in_file:
        reader = csv.DictReader(in_file)
        if not reader.fieldnames:
            raise ValueError(f"No header found in {args.input}")
        fieldnames = reader.fieldnames

        with args.output.open("w", newline="", encoding="utf-8") as out_file:
            writer = csv.DictWriter(out_file, fieldnames=fieldnames)
            writer.writeheader()

            for row in reader:
                owner_name = (row.get(args.owner_column) or "").strip().lower()
                if owner_name == removed_owner:
                    removed += 1
                    continue
                writer.writerow(row)
                kept += 1

    print(
        f"Wrote {args.output} with {kept} rows. "
        f"Removed {removed} rows where {args.owner_column}={args.remove_owner!r}."
    )


if __name__ == "__main__":
    main()
