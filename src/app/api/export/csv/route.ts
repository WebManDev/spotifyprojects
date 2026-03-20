import { NextResponse } from "next/server";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  fetchPlaylistWithAllTracks,
  parseSpotifyPlaylistId,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { getUserToken } from "@/lib/getUserToken";

export const runtime = "nodejs";

const CSV_HEADER = [
  "playlist_name",
  "playlist_id",
  "playlist_url",
  "added_at",
  "is_local",
  "track_name",
  "track_id",
  "track_url",
  "preview_url",
  "popularity",
  "explicit",
  "duration_ms",
  "album_name",
  "album_id",
  "artist_names",
  "artist_ids",
];

function trackToRow(
  playlistName: string,
  playlistId: string,
  playlistUrl: string | null,
  t: SpotifyPlaylistTrack,
): Array<string | number | boolean | null> {
  return [
    playlistName,
    playlistId,
    playlistUrl ?? "",
    t.addedAt ?? "",
    t.isLocal,
    t.trackName ?? "",
    t.trackId ?? "",
    t.trackUrl ?? "",
    t.previewUrl ?? "",
    t.popularity ?? "",
    t.explicit ?? "",
    t.durationMs ?? "",
    t.albumName ?? "",
    t.albumId ?? "",
    t.artistNames.join("; "),
    t.artistIds.join("; "),
  ];
}

function escapeCsvCell(value: string | number | boolean | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Array<string | number | boolean | null>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

type ReqBody = { playlistUrls: string[] };

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const playlistUrls = Array.isArray(body.playlistUrls)
    ? body.playlistUrls.map((s) => String(s))
    : [];

  if (playlistUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide playlistUrls as a non-empty array." },
      { status: 400 },
    );
  }

  const ids = playlistUrls
    .map((u) => parseSpotifyPlaylistId(u))
    .filter((x): x is string => Boolean(x));
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return NextResponse.json(
      { error: "No valid Spotify playlist URLs/IDs found." },
      { status: 400 },
    );
  }

  const userToken = await getUserToken();
  if (!userToken) {
    return NextResponse.json(
      { error: "You must log in with Spotify first to export playlist data." },
      { status: 401 },
    );
  }

  const allRows: Array<Array<string | number | boolean | null>> = [];

  for (const playlistId of uniqueIds) {
    try {
      const { playlist, tracks } = await fetchPlaylistWithAllTracks(
        playlistId,
        userToken,
      );
      console.log(
        `[export/csv] playlist "${playlist.name}" (${playlistId}): ${tracks.length} tracks`,
      );
      for (const t of tracks) {
        allRows.push(
          trackToRow(playlist.name, playlist.id, playlist.externalUrl, t),
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[export/csv] playlist", playlistId, message);
      return NextResponse.json(
        { error: `Failed to fetch playlist ${playlistId}: ${message}` },
        { status: 500 },
      );
    }
  }

  const csv = toCsv([CSV_HEADER, ...allRows]);

  const csvPath = join(process.cwd(), "spotifyData.csv");
  try {
    writeFileSync(csvPath, csv, "utf-8");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[export/csv] failed to write file:", message);
    return NextResponse.json(
      { error: `Failed to write spotifyData.csv: ${message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    path: "spotifyData.csv",
    playlists: uniqueIds.length,
    tracks: allRows.length,
  });
}
