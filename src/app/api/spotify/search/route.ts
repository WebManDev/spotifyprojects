import { NextResponse } from "next/server";
import { searchPlaylistsByQuery } from "@/lib/spotify";

export const runtime = "nodejs";

type ReqBody = {
  query: string;
  /** Max number of playlists to return (1–1000). Spotify returns 10 per page; we paginate. */
  maxResults?: number;
  limit?: number; // backward compat, maps to maxResults
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

  const query = String(body.query ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { error: "Provide a non-empty query." },
      { status: 400 },
    );
  }

  try {
    const maxResults = body.maxResults ?? body.limit ?? 10;
    const { items, total } = await searchPlaylistsByQuery(query, {
      maxResults: typeof maxResults === "number" && Number.isFinite(maxResults)
        ? Math.min(1000, Math.max(1, Math.round(maxResults)))
        : 10,
    });
    return NextResponse.json({ query, items, total });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/spotify/search]", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

