#!/usr/bin/env python3
import argparse
import csv
from collections import Counter
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Get top-N counts for track name, album name, and artist name."
    )
    parser.add_argument(
        "--input",
        default="spotify_playlist_tracks.csv",
        help="Input CSV path (default: spotify_playlist_tracks.csv)",
    )
    parser.add_argument(
        "--output",
        default="top50_track_album_artist.csv",
        help="Output CSV path (default: top50_track_album_artist.csv)",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=50,
        help="Top N values per category (default: 50)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    track_counter: Counter[str] = Counter()
    album_counter: Counter[str] = Counter()
    artist_counter: Counter[str] = Counter()

    with input_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            track = (row.get("trackName") or "").strip()
            album = (row.get("albumName") or "").strip()
            artists_raw = (row.get("trackArtists") or "").strip()

            if track:
                track_counter[track] += 1
            if album:
                album_counter[album] += 1

            if artists_raw:
                # Input format is "Artist A | Artist B | Artist C"
                for artist in artists_raw.split("|"):
                    artist_name = artist.strip()
                    if artist_name:
                        artist_counter[artist_name] += 1

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["category", "rank", "value", "count"])

        for rank, (value, count) in enumerate(
            track_counter.most_common(args.top_n), start=1
        ):
            writer.writerow(["trackName", rank, value, count])

        for rank, (value, count) in enumerate(
            album_counter.most_common(args.top_n), start=1
        ):
            writer.writerow(["albumName", rank, value, count])

        for rank, (value, count) in enumerate(
            artist_counter.most_common(args.top_n), start=1
        ):
            writer.writerow(["artistName", rank, value, count])

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Top N per category: {args.top_n}")
    print(f"Unique track names: {len(track_counter)}")
    print(f"Unique album names: {len(album_counter)}")
    print(f"Unique artist names: {len(artist_counter)}")


if __name__ == "__main__":
    main()
