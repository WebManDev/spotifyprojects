import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { refreshUserToken } from "@/lib/spotify";

/**
 * Returns the user's Spotify access token from the session, refreshing if
 * expired. Returns null if the user is not logged in.
 */
export async function getUserToken(): Promise<string | null> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions,
  );

  if (!session.accessToken || !session.refreshToken) {
    return null;
  }

  if (session.expiresAt && Date.now() > session.expiresAt - 60_000) {
    try {
      const refreshed = await refreshUserToken(session.refreshToken);
      session.accessToken = refreshed.accessToken;
      session.refreshToken = refreshed.refreshToken;
      session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
      await session.save();
    } catch (e) {
      console.error("[getUserToken] refresh failed:", e);
      session.destroy();
      return null;
    }
  }

  return session.accessToken;
}
