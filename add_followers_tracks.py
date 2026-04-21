"""Add `followers` and `totalTracks` columns to spotify_playlist_clean2.csv
by joining against the latest Apify playlist dump.

- Source of truth: dataset_spotify-playlists_2026-04-21_03-54-31-517.json
- Join key: playlistId (derived from the `uri` column: spotify:playlist:<id>)
- We do NOT add or remove rows from the CSV; only enrich.
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
PLAYLISTS_CSV = ROOT / "spotify_playlist_clean2.csv"
DATASET_JSON = ROOT / "dataset_spotify-playlists_2026-03-20_02-42-41-264.json"
OUTPUT_CSV = PLAYLISTS_CSV  # overwrite in place


def load_counts(json_path: Path) -> dict[str, dict[str, int]]:
    """Return {playlistId: {"followers": int, "totalTracks": int}}.

    If a playlistId appears more than once we keep the entry with the
    most recent `timestamp` (falling back to the highest follower count).
    """
    print(f"Loading {json_path.name} ...")
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    counts: dict[str, dict] = {}
    for entry in data:
        pid = entry.get("playlistId")
        if not pid:
            continue
        record = {
            "followers": entry.get("followers"),
            "totalTracks": entry.get("totalTracks"),
            "timestamp": entry.get("timestamp", ""),
        }
        prev = counts.get(pid)
        if prev is None or record["timestamp"] > prev["timestamp"]:
            counts[pid] = record

    print(f"  {len(data)} playlist entries -> {len(counts)} unique playlistIds")
    return counts


def main() -> None:
    counts = load_counts(DATASET_JSON)

    df = pd.read_csv(PLAYLISTS_CSV)
    print(f"Loaded {len(df)} rows from {PLAYLISTS_CSV.name}")

    pids = df["uri"].str.replace("spotify:playlist:", "", regex=False)

    df["followers"] = pids.map(lambda p: counts.get(p, {}).get("followers"))
    df["totalTracks"] = pids.map(lambda p: counts.get(p, {}).get("totalTracks"))

    df["followers"] = pd.to_numeric(df["followers"], errors="coerce").astype("Int64")
    df["totalTracks"] = pd.to_numeric(df["totalTracks"], errors="coerce").astype("Int64")

    matched = df["followers"].notna().sum()
    missing = len(df) - matched
    print(f"Matched followers/totalTracks for {matched}/{len(df)} playlists "
          f"(missing: {missing})")

    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Wrote {OUTPUT_CSV.name}")


if __name__ == "__main__":
    main()
