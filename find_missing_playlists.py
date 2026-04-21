"""Diagnose why some playlists in spotify_playlist_clean2.csv ended up
with blank followers/totalTracks after joining with the Apify dump.
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
PLAYLISTS_CSV = ROOT / "spotify_playlist_clean2.csv"
DUMP = ROOT / "dataset_spotify-playlists_2026-03-20_02-42-41-264.json"
OUT_CSV = ROOT / "missing_playlists.csv"


def main() -> None:
    df = pd.read_csv(PLAYLISTS_CSV)
    df["playlistId"] = df["uri"].str.replace("spotify:playlist:", "", regex=False)

    print(f"Loading {DUMP.name} ...")
    with DUMP.open("r", encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[str, dict] = {}
    for e in data:
        pid = e.get("playlistId")
        if pid:
            by_id[pid] = e
    print(f"  {len(by_id)} unique playlistIds in the dump")

    not_in_dump = []
    null_followers = []
    null_total = []
    for _, row in df.iterrows():
        pid = row["playlistId"]
        entry = by_id.get(pid)
        if entry is None:
            not_in_dump.append(row)
            continue
        if entry.get("followers") is None:
            null_followers.append((row, entry))
        if entry.get("totalTracks") is None:
            null_total.append((row, entry))

    print(f"\nClean playlists: {len(df)}")
    print(f"  Not present in dump:                 {len(not_in_dump)}")
    print(f"  Present but followers is null:       {len(null_followers)}")
    print(f"  Present but totalTracks is null:     {len(null_total)}")

    rows = []
    for row, entry in null_followers:
        rows.append({
            "playlistId": row["playlistId"],
            "name": row["name"],
            "owner_name": row["owner_name"],
            "playlistUrl": row["playlistUrl"],
            "followers_in_json": entry.get("followers"),
            "totalTracks_in_json": entry.get("totalTracks"),
            "tracks_array_len": len(entry.get("tracks") or []),
            "ownerId_in_json": entry.get("ownerId"),
        })
    for row in not_in_dump:
        rows.append({
            "playlistId": row["playlistId"],
            "name": row["name"],
            "owner_name": row["owner_name"],
            "playlistUrl": row["playlistUrl"],
            "followers_in_json": "MISSING_FROM_DUMP",
            "totalTracks_in_json": "MISSING_FROM_DUMP",
            "tracks_array_len": None,
            "ownerId_in_json": None,
        })

    out = pd.DataFrame(rows).sort_values("name", na_position="last")
    out.to_csv(OUT_CSV, index=False)
    print(f"\nWrote {OUT_CSV.name} with {len(out)} rows")
    print("\nFirst 20:")
    print(out.head(20).to_string(index=False))


if __name__ == "__main__":
    main()
