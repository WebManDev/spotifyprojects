"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApiPlaylistOk = {
  ok: true;
  id: string;
  playlist: {
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
  tracks: Array<{
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
    artistNames: string[];
  }>;
};

type ApiPlaylistErr = { ok: false; id: string; error: string };

const SEARCH_MAX_OPTIONS = [10, 50, 100, 500, 1000] as const;

export default function Home() {
  const [user, setUser] = useState<{
    loggedIn: boolean;
    displayName?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMaxResults, setSearchMaxResults] = useState(100);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      ownerDisplayName: string | null;
      followersTotal: number | null;
      externalUrl: string | null;
      tracksTotal: number | null;
    }>
  >([]);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [selectedFromSearch, setSelectedFromSearch] = useState<string[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvSaveResult, setCsvSaveResult] = useState<{
    tracks: number;
    playlists: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<ApiPlaylistOk | ApiPlaylistErr>>(
    [],
  );
  const [exportResult, setExportResult] = useState<{
    ok: number;
    failed: Array<{ playlistId: string; error: string }>;
    spreadsheetUrl?: string;
    rowsWritten?: number;
  } | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as {
        loggedIn: boolean;
        displayName?: string;
      };
      setUser(data);
    } catch {
      setUser({ loggedIn: false });
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const playlistUrls = useMemo(
    () =>
      selectedFromSearch.map(
        (id) => `https://open.spotify.com/playlist/${id}`,
      ),
    [selectedFromSearch],
  );

  const okPlaylists = useMemo(
    () => results.filter((r): r is ApiPlaylistOk => r.ok),
    [results],
  );

  const totalTracks = useMemo(
    () => okPlaylists.reduce((sum, p) => sum + p.tracks.length, 0),
    [okPlaylists],
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser({ loggedIn: false });
  }

  async function runSearch() {
    setError(null);
    setSearching(true);
    setSearchResults([]);
    setSearchTotal(null);
    setSelectedFromSearch([]);
    try {
      const res = await fetch("/api/spotify/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          maxResults: searchMaxResults,
        }),
      });
      const json = (await res.json()) as {
        items?: Array<{
          id: string;
          name: string;
          description: string | null;
          ownerDisplayName: string | null;
          followersTotal: number | null;
          externalUrl: string | null;
          tracksTotal: number | null;
        }>;
        total?: number | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Search failed (${res.status})`);
      }
      setSearchResults(json.items ?? []);
      setSearchTotal(json.total ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function toggleSelectedFromSearch(id: string) {
    setSelectedFromSearch((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const allSearchResultsSelected =
    searchResults.length > 0 &&
    selectedFromSearch.length === searchResults.length;

  function selectAllSearchResults() {
    if (allSearchResultsSelected) {
      setSelectedFromSearch([]);
    } else {
      setSelectedFromSearch(searchResults.map((p) => p.id));
    }
  }

  async function fetchPlaylists() {
    setError(null);
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch("/api/spotify/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrls }),
      });
      const json = (await res.json()) as {
        results?: Array<ApiPlaylistOk | ApiPlaylistErr>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      setResults(json.results ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function exportToSheets() {
    setError(null);
    setExportResult(null);
    setExporting(true);
    try {
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId, playlistUrls }),
      });
      const json = (await res.json()) as {
        error?: string;
        spreadsheetUrl?: string;
        rowsWritten?: number;
        exported?: Array<{
          ok: boolean;
          playlistId: string;
          playlistName?: string;
          sheetTitle?: string;
          rowsWritten?: number;
          error?: string;
        }>;
      };
      if (!res.ok) {
        throw new Error(json.error || `Export failed (${res.status})`);
      }
      const exported = json.exported ?? [];
      const ok = exported.filter((x) => x.ok).length;
      const failed = exported
        .filter((x) => !x.ok)
        .map((x) => ({
          playlistId: x.playlistId,
          error: x.error ?? "Unknown error",
        }));
      setExportResult({
        ok,
        failed,
        spreadsheetUrl: json.spreadsheetUrl,
        rowsWritten: json.rowsWritten,
      });
      if (ok > 0 && json.spreadsheetUrl) {
        window.open(json.spreadsheetUrl, "_blank");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function saveCsvToRepo() {
    setError(null);
    setCsvSaveResult(null);
    setExportingCsv(true);
    try {
      const res = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrls }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        tracks?: number;
        playlists?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setCsvSaveResult({
        tracks: json.tracks ?? 0,
        playlists: json.playlists ?? 0,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingCsv(false);
    }
  }

  const isLoggedIn = user?.loggedIn === true;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-5xl px-6 py-14">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Spotify Playlist Collector
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Search Spotify playlists, preview track lists, then export to CSV
              or Google Sheets.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {user === null ? (
              <span className="text-xs text-zinc-400">Loading…</span>
            ) : isLoggedIn ? (
              <>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {user.displayName}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Log out
                </button>
              </>
            ) : (
              <a
                href="/api/auth/login"
                className="inline-flex h-9 items-center rounded-xl bg-[#1DB954] px-4 text-sm font-medium text-white hover:bg-[#1ed760]"
              >
                Log in with Spotify
              </a>
            )}
          </div>
        </div>

        {!isLoggedIn && user !== null ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Spotify login required.</strong> Due to{" "}
            <a
              href="https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Spotify API changes (Feb 2026)
            </a>
            , fetching playlist tracks now requires you to log in with your
            Spotify account. You can only access tracks for playlists you own or
            collaborate on.
          </div>
        ) : null}

        <div className="mt-10 grid gap-6 lg:grid-cols-1">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-medium">Export</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Same data: row 1 = headers, then one row per track. CSV saves
              directly to{" "}
              <code className="font-mono">spotifyData.csv</code> in the
              project.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  exportingCsv || playlistUrls.length === 0 || !isLoggedIn
                }
                onClick={saveCsvToRepo}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
              >
                {exportingCsv ? "Saving…" : "Save to spotifyData.csv"}
              </button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                or
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="Spreadsheet ID (for Sheets)"
                  className="h-10 w-48 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  disabled={
                    exporting ||
                    playlistUrls.length === 0 ||
                    !spreadsheetId ||
                    !isLoggedIn
                  }
                  onClick={exportToSheets}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                >
                  {exporting ? "Exporting…" : "Export to Google Sheets"}
                </button>
              </div>
            </div>
            {csvSaveResult ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200">
                Saved {csvSaveResult.tracks} track
                {csvSaveResult.tracks === 1 ? "" : "s"} from{" "}
                {csvSaveResult.playlists} playlist
                {csvSaveResult.playlists === 1 ? "" : "s"} to{" "}
                <code className="font-mono">spotifyData.csv</code> in the
                project.
              </div>
            ) : null}
            {exportResult ? (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
                {exportResult.ok > 0 ? (
                  <p className="text-zinc-800 dark:text-zinc-200">
                    Exported {exportResult.ok} playlist
                    {exportResult.ok === 1 ? "" : "s"} to the first sheet
                    {exportResult.rowsWritten != null &&
                    exportResult.rowsWritten > 1
                      ? ` (${exportResult.rowsWritten} rows: 1 header + ${exportResult.rowsWritten - 1} tracks).`
                      : " (row 1 = headers, then one row per track)."}
                    {exportResult.spreadsheetUrl
                      ? " Sheet opened in a new tab."
                      : ""}
                  </p>
                ) : null}
                {exportResult.failed.length > 0 ? (
                  <div className="mt-2 text-red-700 dark:text-red-300">
                    <p className="font-medium">
                      {exportResult.failed.length} failed:
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {exportResult.failed.map((f) => (
                        <li key={f.playlistId}>{f.error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Search Spotify playlists
              </label>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='e.g. "Death playlist"'
                className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">
                Max results
              </label>
              <select
                value={searchMaxResults}
                onChange={(e) => setSearchMaxResults(Number(e.target.value))}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {SEARCH_MAX_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={searching || !searchQuery.trim()}
              onClick={runSearch}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
            >
              {searching ? "Searching…" : "Search playlists"}
            </button>
          </div>

          {searchResults.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/30">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {searchResults.length} playlist
                  {searchResults.length === 1 ? "" : "s"} found
                  {searchTotal != null &&
                  searchTotal !== searchResults.length
                    ? ` (Spotify has ${searchTotal} total for this query)`
                    : null}
                </span>
                <button
                  type="button"
                  onClick={selectAllSearchResults}
                  className="text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  {allSearchResultsSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              {searchResults.map((p) => {
                const checked = selectedFromSearch.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedFromSearch(p.id)}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium">{p.name}</span>
                        {p.ownerDisplayName ? (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            by {p.ownerDisplayName}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.tracksTotal != null ? (
                          <span>{p.tracksTotal} tracks</span>
                        ) : null}
                        {p.followersTotal != null ? (
                          <span>{p.followersTotal} followers</span>
                        ) : null}
                        {p.externalUrl ? (
                          <a
                            href={p.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            open
                          </a>
                        ) : null}
                      </div>
                      {p.description ? (
                        <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {p.description}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={
                    loading || playlistUrls.length === 0 || !isLoggedIn
                  }
                  onClick={fetchPlaylists}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
                >
                  {loading ? "Fetching…" : "Fetch playlist data"}
                </button>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {playlistUrls.length} selected
                  {!isLoggedIn ? " • Log in to fetch tracks" : ""}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Search for something like <code>&quot;Death playlist&quot;</code>,
              then tick the playlists you want and click Fetch playlist data.
            </p>
          )}
        </section>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-medium">Results</h2>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {okPlaylists.length} playlist
              {okPlaylists.length === 1 ? "" : "s"} •{" "}
              {totalTracks} track{totalTracks === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Fetch a playlist to see data here.
              </div>
            ) : null}

            {results.map((r) => {
              if (!r.ok) {
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="font-medium">{r.id}</div>
                    <div className="mt-2 text-zinc-600 dark:text-zinc-400">
                      {r.error}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={r.playlist.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <div className="text-sm font-medium">
                      {r.playlist.name}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {r.tracks.length} tracks
                      {r.playlist.externalUrl ? (
                        <>
                          {" "}
                          •{" "}
                          <a
                            className="underline underline-offset-2"
                            href={r.playlist.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            open in Spotify
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
                        <tr>
                          <th className="px-3 py-2">Track</th>
                          <th className="px-3 py-2">Artists</th>
                          <th className="px-3 py-2">Album</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.tracks.slice(0, 20).map((t, idx) => (
                          <tr
                            key={`${t.trackId ?? "x"}-${idx}`}
                            className="border-t border-zinc-200 dark:border-zinc-800"
                          >
                            <td className="px-3 py-2">
                              {t.trackUrl ? (
                                <a
                                  className="underline underline-offset-2"
                                  href={t.trackUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t.trackName ?? "(unknown)"}
                                </a>
                              ) : (
                                <span>{t.trackName ?? "(unknown)"}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {t.artistNames.join(", ")}
                            </td>
                            <td className="px-3 py-2">
                              {t.albumName ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {r.tracks.length > 20 ? (
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Showing first 20 tracks. Export writes the full playlist.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
