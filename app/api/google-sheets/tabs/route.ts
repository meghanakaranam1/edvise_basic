import { NextRequest, NextResponse } from "next/server";
import { verifySupabaseUser } from "../../../lib/auth";
import { getValidGoogleAccessToken } from "../../../lib/googleOAuth";
import { summarizeSheet, type SheetTable } from "../../../lib/sheetMerge";
import { classifyColumns } from "../../../lib/columnClassifier";

// Lists every tab in a Google Sheet with a lightweight summary (row/col counts,
// detected student ID column) so the teacher can pick a primary + enrichment
// tabs before we fetch and merge the full data in /import.
export async function POST(req: NextRequest) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { spreadsheetId }: { spreadsheetId?: string } = await req.json();
  if (!spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetId is required" }, { status: 400 });
  }

  try {
    const token = await getValidGoogleAccessToken(user.id);
    if (!token) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 401 });
    }

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) {
      const detail = await metaRes.text();
      return NextResponse.json({ error: `Google Sheets API error: ${detail}` }, { status: metaRes.status });
    }
    const meta = await metaRes.json();
    const spreadsheetTitle: string = meta.properties?.title ?? "Google Sheet";
    const tabTitles: string[] = (meta.sheets ?? [])
      .map((s: { properties?: { title?: string } }) => s.properties?.title)
      .filter((t: string | undefined): t is string => Boolean(t));
    if (tabTitles.length === 0) {
      return NextResponse.json({ error: "No sheets found in that spreadsheet" }, { status: 400 });
    }

    if (tabTitles.length === 1) {
      return NextResponse.json({ spreadsheetTitle, single: true, tabs: [] });
    }

    const params = tabTitles.map(t => `ranges=${encodeURIComponent(t)}`).join("&");
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!batchRes.ok) {
      const detail = await batchRes.text();
      return NextResponse.json({ error: `Google Sheets API error: ${detail}` }, { status: batchRes.status });
    }
    const { valueRanges } = await batchRes.json() as { valueRanges?: { values?: string[][] }[] };

    const tables: SheetTable[] = tabTitles
      .map((title, i) => {
        const values = valueRanges?.[i]?.values ?? [];
        const headers = values[0] ?? [];
        const rows = values.slice(1).map(r => headers.map((_, ci) => r[ci] ?? ""));
        return { name: title, headers, rows };
      })
      .filter(t => t.headers.length && t.rows.length);

    if (tables.length === 0) {
      return NextResponse.json({ error: "None of the sheets have any data rows" }, { status: 400 });
    }

    // Ask Claude which column identifies a student in each tab before
    // summarizing — there's no fixed header spelling to regex-match against,
    // so this has to look at the actual headers/values per tab.
    await Promise.all(tables.map(async t => {
      const preview = t.rows.slice(0, 5).map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ""])));
      try {
        const { identityColumns } = await classifyColumns(t.headers, preview);
        t.identityHint = identityColumns;
      } catch (err) {
        console.error(`Identity classification failed for tab "${t.name}":`, err);
      }
    }));

    return NextResponse.json({ spreadsheetTitle, single: false, tabs: tables.map(summarizeSheet) });
  } catch (err) {
    console.error("Google Sheets tabs error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
