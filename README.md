## Spotify Playlist Collector

Collect Spotify playlist metadata + tracks and export them to Google Sheets.

### What you need

- **Spotify**: a Spotify Developer app (Client ID + Client Secret)
- **Google Sheets**: a Google Cloud service account JSON key, and a spreadsheet to export into
- **Vercel**: free hosting works (the app uses serverless functions)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`)

### Spotify setup

1. Create an app in the Spotify dashboard: `https://developer.spotify.com/dashboard`
2. Copy your **Client ID** and **Client Secret** into `.env.local`.

This app uses **Client Credentials** (app-only) auth, which can fetch **public playlists**.
Private playlists require Spotify user OAuth (not implemented yet).

### Google Sheets setup (service account)

1. Create a Google Cloud project, enable **Google Sheets API**.
2. Create a **Service Account**, then create a **JSON key**.
3. Put the JSON into `GOOGLE_SERVICE_ACCOUNT_JSON` (or base64 it into `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`).
4. Create a Google Sheet and **share it with the service account email** (the `client_email` inside the JSON) with Editor access.
5. Paste the spreadsheet ID into the UI (it’s the long id in the Sheet URL).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Deploy notes (this project)

In Vercel Project Settings → Environment Variables, add:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`)
