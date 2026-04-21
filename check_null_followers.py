"""List the Spotify-owned playlists in the dump that have a missing
followers field.
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
DUMP = ROOT / "dataset_spotify-playlists_2026-03-20_02-42-41-264.json"
CLEAN = ROOT / "spotify_playlist_clean2.csv"


def main() -> None:
    with DUMP.open() as f:
        data = json.load(f)

    clean_ids = set(
        pd.read_csv(CLEAN)["uri"]
        .str.replace("spotify:playlist:", "", regex=False)
    )

    spotify_null = [
        e for e in data
        if e.get("ownerId") == "spotify" and e.get("followers") is None
    ]

    print(f"Spotify-owned playlists with null followers: {len(spotify_null)}\n")

    rows = []
    for e in spotify_null:
        pid = e["playlistId"]
        rows.append({
            "playlistId": pid,
            "name": e.get("playlistName"),
            "totalTracks": e.get("totalTracks"),
            "in_clean_csv": pid in clean_ids,
            "url": f"https://open.spotify.com/playlist/{pid}",
        })

    df = pd.DataFrame(rows).sort_values("name")
    print(df.to_string(index=False))

    print(f"\nOf those, {df['in_clean_csv'].sum()} are in spotify_playlist_clean2.csv")


if __name__ == "__main__":
    main()
