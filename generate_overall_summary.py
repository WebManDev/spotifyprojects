import pandas as pd
import re
from collections import Counter
import csv
from pathlib import Path

STOPWORDS = {
    "the", "and", "or", "a", "an", "of", "to", "in", "on", "for", "with", "from",
    "at", "by", "is", "are", "was", "were", "be", "been", "being", "it", "this",
    "that", "these", "those", "as", "but", "if", "you", "your", "i", "we", "they",
    "them", "my", "our", "their", "me", "us", "not", "no", "yes", "so", "than",
    "too", "very"
}

def tokenize(text: str) -> list[str]:
    if not isinstance(text, str) or not text:
        return []
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

def main():
    tracks_path = "spotify_playlist_tracks.csv"
    playlists_path = "spotify_playlists_clean.csv"
    
    print("Loading tracks data...")
    df_tracks = pd.read_csv(tracks_path, dtype=str)
    print("Loading playlists data...")
    df_playlists = pd.read_csv(playlists_path, dtype=str)

    # Calculate basic stats
    playlist_count = df_tracks["playlistId"].nunique()
    total_tracks_count = len(df_tracks)
    
    tracks_per_playlist = df_tracks.groupby("playlistId").size()
    tpp_mean = tracks_per_playlist.mean()
    tpp_median = tracks_per_playlist.median()
    tpp_max = tracks_per_playlist.max()
    tpp_min = tracks_per_playlist.min()
    
    # Range of tracks (e.g. 10 to 50)
    range_10_50 = ((tracks_per_playlist >= 10) & (tracks_per_playlist <= 50)).sum()

    # Add playlist length and weight to tracks
    df_tracks["playlist_length"] = df_tracks["playlistId"].map(tracks_per_playlist)
    df_tracks["weight"] = 1.0 / df_tracks["playlist_length"]

    # Top 50 tracks with ID and artist
    print("Calculating top tracks...")
    track_grouped = df_tracks.groupby(["trackId", "trackName", "trackArtists"])
    track_counts = track_grouped.agg(
        count=("playlistId", "size"),
        playlist_count=("playlistId", "nunique"),
        weighted_score=("weight", "sum")
    ).reset_index()
    top_50_tracks = track_counts.sort_values("count", ascending=False).head(50)

    # Top 50 artists
    print("Calculating top artists...")
    artist_df = df_tracks[["playlistId", "trackArtists", "weight"]].copy()
    artist_df["trackArtists"] = artist_df["trackArtists"].str.split(" \\| ")
    artist_df = artist_df.explode("trackArtists").dropna(subset=["trackArtists"])
    
    artist_grouped = artist_df.groupby("trackArtists")
    artist_counts = artist_grouped.agg(
        count=("playlistId", "size"),
        playlist_count=("playlistId", "nunique"),
        weighted_score=("weight", "sum")
    ).reset_index()
    top_50_artists = artist_counts.sort_values("count", ascending=False).head(50)

    # Top 50 keywords in title and description
    print("Calculating keywords...")
    title_words = []
    desc_words = []
    for _, row in df_playlists.iterrows():
        title_words.extend(tokenize(row.get("name", "")))
        desc_words.extend(tokenize(row.get("description", "")))
        
    top_50_title_kw = Counter(title_words).most_common(50)
    top_50_desc_kw = Counter(desc_words).most_common(50)

    # Write to single CSV
    out_csv = "playlist_overall_summary.csv"
    print(f"Writing results to {out_csv}...")
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        
        # Block 1: Stats
        writer.writerow(["Metric", "Value", "", ""])
        writer.writerow(["Number of Playlists", playlist_count, "", ""])
        writer.writerow(["Number of Tracks (Total rows)", total_tracks_count, "", ""])
        writer.writerow(["Tracks per playlist (Mean)", f"{tpp_mean:.2f}", "", ""])
        writer.writerow(["Tracks per playlist (Median)", int(tpp_median), "", ""])
        writer.writerow(["Tracks per playlist (Max)", int(tpp_max), "", ""])
        writer.writerow(["Tracks per playlist (Min)", int(tpp_min), "", ""])
        writer.writerow(["Playlists with 10 to 50 songs", range_10_50, "", ""])
        writer.writerow([])
        
        # Block 2: Top Tracks
        writer.writerow(["Top 50 Tracks (TrackName)", "Track ID", "Artist(s)", "Count", "Playlists Count", "Weighted Score"])
        for _, row in top_50_tracks.iterrows():
            writer.writerow([row["trackName"], row["trackId"], row["trackArtists"], row["count"], row["playlist_count"], f'{row["weighted_score"]:.4f}'])
        writer.writerow([])
        
        # Block 3: Top Artists
        writer.writerow(["Top 50 Artists", "Count", "Playlists Count", "Weighted Score", "", ""])
        for _, row in top_50_artists.iterrows():
            writer.writerow([row["trackArtists"], row["count"], row["playlist_count"], f'{row["weighted_score"]:.4f}', "", ""])
        writer.writerow([])
        
        # Block 4: Title Keywords
        writer.writerow(["Top 50 Playlist Title Keywords", "Count", "", ""])
        for kw, cnt in top_50_title_kw:
            writer.writerow([kw, cnt, "", ""])
        writer.writerow([])
        
        # Block 5: Desc Keywords
        writer.writerow(["Top 50 Playlist Description Keywords", "Count", "", ""])
        for kw, cnt in top_50_desc_kw:
            writer.writerow([kw, cnt, "", ""])
            
    print("Done!")

if __name__ == "__main__":
    main()
