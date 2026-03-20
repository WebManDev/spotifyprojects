export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  ownerDisplayName: string | null;
  ownerId: string | null;
  followersTotal: number | null;
  images: Array<{ url: string; width: number | null; height: number | null }>;
  externalUrl: string | null;
  tracksTotal: number;
};

export type SpotifyPlaylistTrack = {
  playlistId: string;
  addedAt: string | null;
  isLocal: boolean;
  trackId: string | null;
  trackName: string | null;
  trackUrl: string | null;
  previewUrl: string | null;
  popularity: number | null;
  explicit: boolean | null;
  durationMs: number | null;
  albumName: string | null;
  albumId: string | null;
  artistNames: string[];
  artistIds: string[];
};

type SpotifyTokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __spotifyTokenCache: SpotifyTokenCache | undefined;
}

function getSpotifyClientCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Spotify credentials. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

let tokenPromise: Promise<string> | null = null;

async function getSpotifyAppAccessToken(): Promise<string> {
  const cached = globalThis.__spotifyTokenCache;
  const now = Date.now();
  if (cached && cached.expiresAtMs - now > 30_000) return cached.accessToken;

  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const { clientId, clientSecret } = getSpotifyClientCredentials();
      const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
        "base64",
      );

      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Spotify token request failed (${res.status}). ${text || "No body"}`,
        );
      }

      const json = (await res.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
      };

      globalThis.__spotifyTokenCache = {
        accessToken: json.access_token,
        expiresAtMs: Date.now() + json.expires_in * 1000,
      };

      return json.access_token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

export function parseSpotifyPlaylistId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const uriMatch = raw.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1] ?? null;

  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "playlist");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!;
  } catch {
    // fall through
  }

  const loose = raw.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (loose) return loose[1] ?? null;

  if (/^[a-zA-Z0-9]+$/.test(raw) && raw.length >= 10) return raw;

  return null;
}

const SPOTIFY_RETRY_MAX = 2;
const SPOTIFY_RETRY_DELAY_MS = 1000;

async function spotifyFetch<T>(
  url: string,
  token: string,
  attempt = 0,
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 429 && attempt < SPOTIFY_RETRY_MAX) {
    const delay =
      Number(res.headers.get("Retry-After")) * 1000 || SPOTIFY_RETRY_DELAY_MS;
    await new Promise((r) => setTimeout(r, delay));
    return spotifyFetch<T>(url, token, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Spotify API failed (${res.status}). ${text || "No body"}`,
    );
  }
  return (await res.json()) as T;
}

async function spotifyGet<T>(url: string, attempt = 0): Promise<T> {
  const token = await getSpotifyAppAccessToken();
  return spotifyFetch<T>(url, token, attempt);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SpotifySearchPlaylistItem = {
  id: string;
  name: string;
  description: string | null;
  ownerDisplayName: string | null;
  ownerId: string | null;
  followersTotal: number | null;
  images: Array<{ url: string; width: number | null; height: number | null }>;
  externalUrl: string | null;
  tracksTotal: number | null;
};

const SEARCH_PAGE_SIZE = 10;
const SEARCH_MAX_OFFSET = 1000;

type SearchPlaylistItemRaw = {
  id?: string;
  name?: string;
  description?: string | null;
  owner?: { display_name?: string | null; id?: string | null } | null;
  followers?: { total?: number | null } | null;
  images?: Array<{
    url: string;
    width: number | null;
    height: number | null;
  }>;
  external_urls?: { spotify?: string } | null;
  tracks?: { total?: number | null } | null;
};

type SearchResp = {
  playlists?: {
    total?: number;
    items?: Array<SearchPlaylistItemRaw | null>;
  };
};

function mapSearchItem(
  p: SearchPlaylistItemRaw & { id: string; name: string },
): SpotifySearchPlaylistItem {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    ownerDisplayName: p.owner?.display_name ?? null,
    ownerId: p.owner?.id ?? null,
    followersTotal: p.followers?.total ?? null,
    images: p.images ?? [],
    externalUrl: p.external_urls?.spotify ?? null,
    tracksTotal: p.tracks?.total ?? null,
  };
}

export type SearchPlaylistsResult = {
  items: SpotifySearchPlaylistItem[];
  total: number | null;
};

export async function searchPlaylistsByQuery(
  query: string,
  options?: { limit?: number; maxResults?: number },
): Promise<SearchPlaylistsResult> {
  const q = query.trim();
  if (!q) return { items: [], total: null };
  let maxResults = options?.maxResults ?? options?.limit ?? 10;
  if (typeof maxResults !== "number" || !Number.isFinite(maxResults)) {
    maxResults = 10;
  }
  maxResults = Math.round(maxResults);
  if (maxResults < 1) maxResults = 1;
  if (maxResults > 1000) maxResults = 1000;

  const encodedQ = encodeURIComponent(q);
  const allItems: SpotifySearchPlaylistItem[] = [];
  let offset = 0;
  let totalAvailable: number | null = null;

  while (allItems.length < maxResults && offset <= SEARCH_MAX_OFFSET) {
    const url = `https://api.spotify.com/v1/search?type=playlist&q=${encodedQ}&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`;
    const json = await spotifyGet<SearchResp>(url);
    const playlists = json.playlists;
    if (totalAvailable === null && typeof playlists?.total === "number") {
      totalAvailable = playlists.total;
    }
    const rawItems = (playlists?.items ?? []) as Array<
      SearchPlaylistItemRaw | null | undefined
    >;
    for (const p of rawItems) {
      if (allItems.length >= maxResults) break;
      if (p && typeof p.id === "string" && p.id && p.name) {
        allItems.push(
          mapSearchItem(
            p as SearchPlaylistItemRaw & { id: string; name: string },
          ),
        );
      }
    }
    if (rawItems.length < SEARCH_PAGE_SIZE) break;
    if (totalAvailable != null && offset + rawItems.length >= totalAvailable)
      break;
    offset += SEARCH_PAGE_SIZE;
  }

  return { items: allItems, total: totalAvailable };
}

// ---------------------------------------------------------------------------
// Fetch playlist + tracks (requires user access token for dev-mode apps)
// ---------------------------------------------------------------------------

/**
 * Feb 2026 Spotify API changes:
 * - `tracks` field renamed to `items` in playlist response
 * - `items.items[].track` renamed to `items.items[].item`
 * - `/playlists/{id}/tracks` renamed to `/playlists/{id}/items`
 * - Playlist contents only returned for playlists the user owns/collaborates on
 * - `popularity` removed from track objects
 *
 * `userAccessToken` is required to fetch playlist items. Without it, only
 * playlist metadata is returned.
 */
export async function fetchPlaylistWithAllTracks(
  playlistId: string,
  userAccessToken?: string,
): Promise<{
  playlist: SpotifyPlaylistSummary;
  tracks: SpotifyPlaylistTrack[];
}> {
  type PlaylistItemEntry = {
    added_at?: string | null;
    is_local?: boolean;
    item?: null | {
      id?: string | null;
      name?: string | null;
      duration_ms?: number | null;
      explicit?: boolean | null;
      popularity?: number | null;
      preview_url?: string | null;
      external_urls?: { spotify?: string } | null;
      album?: { id?: string | null; name?: string | null } | null;
      artists?: Array<{ id?: string | null; name?: string | null }>;
    };
    // Legacy field name (pre-Feb 2026)
    track?: null | {
      id?: string | null;
      name?: string | null;
      duration_ms?: number | null;
      explicit?: boolean | null;
      popularity?: number | null;
      preview_url?: string | null;
      external_urls?: { spotify?: string } | null;
      album?: { id?: string | null; name?: string | null } | null;
      artists?: Array<{ id?: string | null; name?: string | null }>;
    };
  };

  type PlaylistResp = {
    id: string;
    name: string;
    description: string | null;
    public: boolean | null;
    collaborative: boolean;
    owner: { display_name: string | null; id: string | null } | null;
    followers?: { total: number } | null;
    images: Array<{ url: string; width: number | null; height: number | null }>;
    external_urls?: { spotify?: string } | null;
    // New field name (Feb 2026)
    items?: {
      total?: number;
      items?: PlaylistItemEntry[];
      next?: string | null;
    };
    // Legacy field name
    tracks?: {
      total?: number;
      items?: PlaylistItemEntry[];
      next?: string | null;
    };
  };

  type ItemsPage = {
    items?: PlaylistItemEntry[];
    next?: string | null;
    total?: number;
  };

  const market = process.env.SPOTIFY_MARKET ?? "US";
  const token = userAccessToken ?? (await getSpotifyAppAccessToken());

  const first = await spotifyFetch<PlaylistResp>(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?market=${encodeURIComponent(market)}`,
    token,
  );

  const inlineItems = first.items ?? first.tracks;
  const totalFromInline = inlineItems?.total;

  const playlist: SpotifyPlaylistSummary = {
    id: first.id,
    name: first.name,
    description: first.description,
    public: first.public,
    collaborative: first.collaborative,
    ownerDisplayName: first.owner?.display_name ?? null,
    ownerId: first.owner?.id ?? null,
    followersTotal: first.followers?.total ?? null,
    images: first.images ?? [],
    externalUrl: first.external_urls?.spotify ?? null,
    tracksTotal: totalFromInline ?? 0,
  };

  const outTracks: SpotifyPlaylistTrack[] = [];
  const pushEntries = (entries: PlaylistItemEntry[] | undefined) => {
    for (const entry of entries ?? []) {
      const t = entry.item ?? entry.track;
      if (!t) continue;
      outTracks.push({
        playlistId: first.id,
        addedAt: entry.added_at ?? null,
        isLocal: Boolean(entry.is_local),
        trackId: t.id ?? null,
        trackName: t.name ?? null,
        trackUrl: t.external_urls?.spotify ?? null,
        previewUrl: t.preview_url ?? null,
        popularity: typeof t.popularity === "number" ? t.popularity : null,
        explicit: typeof t.explicit === "boolean" ? t.explicit : null,
        durationMs: typeof t.duration_ms === "number" ? t.duration_ms : null,
        albumName: t.album?.name ?? null,
        albumId: t.album?.id ?? null,
        artistNames: (t.artists ?? [])
          .map((a) => a.name)
          .filter((x): x is string => Boolean(x)),
        artistIds: (t.artists ?? [])
          .map((a) => a.id)
          .filter((x): x is string => Boolean(x)),
      });
    }
  };

  if (inlineItems?.items?.length) {
    pushEntries(inlineItems.items);
    let next = inlineItems.next ?? null;
    while (next) {
      const page = await spotifyFetch<ItemsPage>(next, token);
      pushEntries(page?.items);
      next = page?.next ?? null;
    }
  } else if (userAccessToken) {
    // Use the new /items endpoint (Feb 2026 rename from /tracks)
    let itemsUrl: string | null =
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?market=${encodeURIComponent(market)}&limit=100`;
    while (itemsUrl) {
      const page = await spotifyFetch<ItemsPage>(itemsUrl, userAccessToken);
      pushEntries(page?.items);
      itemsUrl = page?.next ?? null;
    }
  }

  console.log(
    `[spotify] ${playlistId} "${first.name}": ${outTracks.length} tracks`,
  );

  return { playlist, tracks: outTracks };
}

// ---------------------------------------------------------------------------
// Refresh user token
// ---------------------------------------------------------------------------

export async function refreshUserToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = getSpotifyClientCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
    "base64",
  );

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}). ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresIn: json.expires_in,
  };
}
