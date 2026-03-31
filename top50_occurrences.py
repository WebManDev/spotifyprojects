#!/usr/bin/env python3
import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Get top-N value occurrences per column from a CSV file."
    )
    parser.add_argument(
        "--input",
        default="spotify_playlist_tracks.csv",
        help="Path to input CSV file (default: spotify_playlist_tracks.csv)",
    )
    parser.add_argument(
        "--output",
        default="top50_occurrences_by_column.csv",
        help="Path to output CSV file (default: top50_occurrences_by_column.csv)",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=50,
        help="Number of top values per column (default: 50)",
    )
    parser.add_argument(
        "--columns",
        default="",
        help="Comma-separated list of columns to analyze. If omitted, analyzes all columns.",
    )
    parser.add_argument(
        "--skip-empty",
        action="store_true",
        help="Skip empty values when counting occurrences.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    counters: dict[str, Counter] = defaultdict(Counter)

    with input_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no headers.")

        if args.columns.strip():
            selected_columns = [c.strip() for c in args.columns.split(",") if c.strip()]
            missing = [c for c in selected_columns if c not in reader.fieldnames]
            if missing:
                raise ValueError(
                    "Columns not found in CSV: " + ", ".join(missing)
                )
        else:
            selected_columns = reader.fieldnames

        for row in reader:
            for col in selected_columns:
                value = (row.get(col) or "").strip()
                if args.skip_empty and value == "":
                    continue
                counters[col][value] += 1

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["column", "rank", "value", "count"])

        for col in selected_columns:
            most_common = counters[col].most_common(args.top_n)
            for rank, (value, count) in enumerate(most_common, start=1):
                writer.writerow([col, rank, value, count])

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Columns analyzed: {len(selected_columns)}")
    print(f"Top N: {args.top_n}")


if __name__ == "__main__":
    main()
