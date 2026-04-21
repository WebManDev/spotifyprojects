"""Write playlists from spotify_playlist_clean2.csv where followers is missing
to spotify_playlist_clean2_missing_followers.csv (same columns + playlist_id).
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
IN_CSV = ROOT / "spotify_playlist_clean2.csv"
OUT_CSV = ROOT / "spotify_playlist_clean2_missing_followers.csv"
OUT_URLS_CSV = ROOT / "spotify_playlist_clean2_missing_followers_urls.csv"


def main() -> None:
    df = pd.read_csv(IN_CSV)
    followers = pd.to_numeric(df["followers"], errors="coerce")
    missing = df[followers.isna()].copy()
    missing.insert(
        0,
        "playlist_id",
        missing["uri"].str.replace("spotify:playlist:", "", regex=False),
    )
    missing.to_csv(OUT_CSV, index=False)
    print(f"Wrote {len(missing)} rows to {OUT_CSV.name}")

    missing[["playlistUrl"]].to_csv(OUT_URLS_CSV, index=False)
    print(f"Wrote {len(missing)} URLs to {OUT_URLS_CSV.name}")


if __name__ == "__main__":
    main()
