import { readFileSync } from "fs";
import { resolve } from "path";
import { google } from "googleapis";

export type SheetExportResult = {
  sheetTitle: string;
  updatedRange: string;
  rowsWritten: number;
  /** Google's internal sheet ID; use in URL as #gid= for deep link */
  sheetId: number;
};

function loadServiceAccountCredentials(): Record<string, unknown> {
  const pathVar = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

  let jsonStr: string;
  if (pathVar) {
    const absPath = resolve(process.cwd(), pathVar);
    jsonStr = readFileSync(absPath, "utf8");
  } else if (raw) {
    jsonStr = raw;
  } else if (b64) {
    jsonStr = Buffer.from(b64, "base64").toString("utf8");
  } else {
    throw new Error(
      "Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON_PATH (path to JSON file), GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON), or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
    );
  }

  let creds = JSON.parse(jsonStr) as Record<string, unknown>;
  const pk = creds["private_key"];
  if (typeof pk === "string") {
    creds = { ...creds, private_key: pk.replace(/\\n/g, "\n") };
  }
  return creds;
}

function clampSheetTitle(title: string) {
  // Google Sheets constraints: <= 100 chars, cannot contain : \ / ? * [ ]
  const cleaned = title.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 100) || "Export";
}

export async function exportRowsToNewSheetTab(args: {
  spreadsheetId: string;
  desiredTitle: string;
  values: Array<Array<string | number | boolean | null>>;
}): Promise<SheetExportResult> {
  const credentials = loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const sheetTitle = clampSheetTitle(args.desiredTitle);

  // Create new tab (retry with suffix if name exists); use API response title for range so we match exactly
  let finalTitle = sheetTitle;
  let sheetId = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const batchRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: finalTitle } } }],
        },
      });
      const reply = batchRes.data.replies?.[0] as { addSheet?: { properties?: { sheetId?: number; title?: string } } } | undefined;
      const props = reply?.addSheet?.properties;
      if (props?.sheetId != null) sheetId = props.sheetId;
      if (props?.title) finalTitle = props.title;
      break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const alreadyExists =
        msg.includes("already exists") || msg.includes("duplicate");
      if (!alreadyExists) throw e;
      finalTitle = clampSheetTitle(`${sheetTitle} (${attempt + 2})`);
    }
  }

  const range = `'${finalTitle.replace(/'/g, "''")}'!A1`;
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: args.spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: args.values },
  });

  const updatedRange = res.data.updatedRange ?? range;
  const rowsWritten = args.values.length;
  return { sheetTitle: finalTitle, updatedRange, rowsWritten, sheetId };
}

export type WriteToFirstSheetResult = {
  sheetTitle: string;
  sheetId: number;
  updatedRange: string;
  rowsWritten: number;
};

/** Write values to the first (leftmost) sheet in the workbook (e.g. "Sheet1" or "Original Sheet"). */
export async function writeToFirstSheet(args: {
  spreadsheetId: string;
  values: Array<Array<string | number | boolean | null>>;
}): Promise<WriteToFirstSheetResult> {
  const credentials = loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: args.spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const firstSheet = meta.data.sheets?.[0]?.properties;
  if (!firstSheet?.title) {
    throw new Error("Spreadsheet has no sheets.");
  }
  const sheetTitle = firstSheet.title;
  const sheetId = firstSheet.sheetId ?? 0;

  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1`;
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: args.spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: args.values },
  });

  const updatedRange = res.data.updatedRange ?? range;
  const rowsWritten = args.values.length;
  return { sheetTitle, sheetId, updatedRange, rowsWritten };
}

/** Turn Google API errors into a user-friendly message (e.g. share sheet with service account). */
export function friendlySheetsError(message: string): string {
  if (message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("Forbidden")) {
    return "Permission denied. Share the Google Sheet with your service account email (in the JSON key) as Editor.";
  }
  if (message.includes("404") || message.includes("NOT_FOUND")) {
    return "Spreadsheet not found. Check the Spreadsheet ID (from the sheet URL).";
  }
  if (message.includes("invalid") && message.toLowerCase().includes("credential")) {
    return "Invalid Google credentials. Check GOOGLE_SERVICE_ACCOUNT_JSON_PATH or env vars.";
  }
  if (message.includes("ENOENT") || message.includes("no such file")) {
    return "Google key file not found. Check GOOGLE_SERVICE_ACCOUNT_JSON_PATH in .env.local.";
  }
  return message;
}

