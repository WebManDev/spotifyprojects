import { SessionOptions } from "iron-session";

export interface SessionData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  displayName?: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: "spotify_session",
  password:
    process.env.SESSION_SECRET ??
    "this-is-a-dev-secret-change-in-production-32c",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};
