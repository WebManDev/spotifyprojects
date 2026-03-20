import { NextResponse } from "next/server";
import {
  fetchPlaylistWithAllTracks,
  parseSpotifyPlaylistId,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { writeToFirstSheet, friendlySheetsError } from "@/lib/sheets";
import { getUserToken } from "@/lib/getUserToken";

export const runtime = "nodejs";

type ReqBody = {
  spreadsheetId: string;
  playlistUrls: string[];
};

const SHEET_HEADER = [
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
    t.artistNames.join(", "),
    t.artistIds.join(", "),
  ];
}

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

  const spreadsheetId = String(body.spreadsheetId ?? "").trim();
  const playlistUrls = Array.isArray(body.playlistUrls)
    ? body.playlistUrls.map((s) => String(s))
    : [];

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "Provide spreadsheetId." },
      { status: 400 },
    );
  }
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
  const exported: Array<{
    playlistId: string;
    playlistName?: string;
    trackCount?: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const playlistId of uniqueIds) {
    try {
      const { playlist, tracks } = await fetchPlaylistWithAllTracks(playlistId, userToken);
      if (tracks.length === 0) {
        console.warn("[sheets/export] playlist", playlistId, playlist.name, "returned 0 tracks (try setting SPOTIFY_MARKET in .env.local, e.g. US)");
      }
      for (const t of tracks) {
        allRows.push(
          trackToRow(playlist.name, playlist.id, playlist.externalUrl, t),
        );
      }
      exported.push({
        ok: true,
        playlistId: playlist.id,
        playlistName: playlist.name,
        trackCount: tracks.length,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const friendly = friendlySheetsError(message);
      console.error("[sheets/export] playlist", playlistId, friendly);
      exported.push({ ok: false, playlistId, error: friendly });
    }
  }

  const allFailed = exported.length > 0 && exported.every((x) => !x.ok);
  if (allFailed && exported[0]) {
    return NextResponse.json(
      { error: exported[0].error ?? "Export failed for all playlists." },
      { status: 500 },
    );
  }

  let sheetId: number | undefined;
  let sheetTitle: string | undefined;
  let rowsWritten = 0;

  const values = [SHEET_HEADER, ...allRows];
  if (values.length > 0) {
    const res = await writeToFirstSheet({
      spreadsheetId,
      values,
    });
    sheetId = res.sheetId;
    sheetTitle = res.sheetTitle;
    rowsWritten = res.rowsWritten;
  }

  const gid = sheetId != null ? `#gid=${sheetId}` : "";
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit${gid}`;

  return NextResponse.json({
    spreadsheetId,
    exported,
    sheetTitle,
    rowsWritten,
    spreadsheetUrl,
  });
}

