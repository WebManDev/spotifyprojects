import { NextResponse } from "next/server";
import {
  fetchPlaylistWithAllTracks,
  parseSpotifyPlaylistId,
} from "@/lib/spotify";
import { getUserToken } from "@/lib/getUserToken";

export const runtime = "nodejs";

type ReqBody = {
  playlistUrls: string[];
};

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

  const parsed = playlistUrls
    .map((u) => ({ input: u, id: parseSpotifyPlaylistId(u) }))
    .filter((x) => x.id);

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "No valid Spotify playlist URLs/IDs found." },
      { status: 400 },
    );
  }

  const uniqueIds = Array.from(new Set(parsed.map((p) => p.id as string)));
  const userToken = await getUserToken();

  if (!userToken) {
    return NextResponse.json(
      { error: "You must log in with Spotify to fetch playlist tracks. Click 'Log in with Spotify' at the top of the page." },
      { status: 401 },
    );
  }

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const data = await fetchPlaylistWithAllTracks(id, userToken);
        return { ok: true as const, id, ...data };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false as const, id, error: message };
      }
    }),
  );

  return NextResponse.json({
    requested: playlistUrls.length,
    parsed: uniqueIds.length,
    results,
  });
}
