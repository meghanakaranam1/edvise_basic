import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { uploadTextAsAnthropicFile } from "../../../lib/anthropicFiles";
import { verifySupabaseUser } from "../../../lib/auth";
import { getValidGoogleAccessToken } from "../../../lib/googleOAuth";
import { mergeSheets, sheetsToCsv, type SheetTable } from "../../../lib/sheetMerge";
import { classifyColumns } from "../../../lib/columnClassifier";

function rowsToCsv(rows: string[][]): string {
  const escapeCell = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return rows.map(row => row.map(cell => escapeCell(cell ?? "")).join(",")).join("\n");
}

async function fetchTabValues(spreadsheetId: string, tabTitle: string, token: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabTitle)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Google Sheets API error: ${await res.text()}`);
  const { values } = await res.json() as { values?: string[][] };
  return values ?? [];
}

function valuesToTable(name: string, values: string[][]): SheetTable {
  const headers = values[0] ?? [];
  const rows = values.slice(1).map(r => headers.map((_, i) => r[i] ?? ""));
  return { name, headers, rows };
}

// Translates a calculated column's raw Sheets formula into a plain-English rule
// (e.g. "=B2*0.5+C2*2" -> "Risk Score = 0.5 × Absences + 2 × Failing Courses"),
// so it can be saved into the teacher's School Context instead of trying to
// execute arbitrary spreadsheet formula syntax at analysis time.
async function translateFormulasToRules(candidates: { header: string; formula: string }[]): Promise<string[]> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const listing = candidates.map(c => `- "${c.header}": ${c.formula}`).join("\n");
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `These are calculated columns from a teacher's gradebook spreadsheet, given as column name and its Google Sheets formula. For each one, write ONE short plain-English rule describing what it computes, referring to other columns by name — never by cell address like B2. Skip any formula too complex or ambiguous to describe confidently in one sentence. Output one rule per line, no numbering or extra commentary. Output nothing if none are describable.\n\n${listing}`,
      }],
    });
    const text = msg.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("\n");
    return text.split("\n").map(l => l.trim()).filter(Boolean);
  } catch (err) {
    console.error("Formula translation failed:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const user = await verifySupabaseUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { spreadsheetId, primaryTab, enrichTabs }: { spreadsheetId?: string; primaryTab?: string; enrichTabs?: string[] } = await req.json();
  if (!spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetId is required" }, { status: 400 });
  }

  try {
    const token = await getValidGoogleAccessToken(user.id);
    if (!token) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 401 });
    }

    // Look up tab titles; default to the first tab when the teacher hasn't picked one.
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
    const primaryTabTitle: string = primaryTab ?? meta.sheets?.[0]?.properties?.title ?? "Sheet1";

    const primaryValues = await fetchTabValues(spreadsheetId, primaryTabTitle, token);
    if (primaryValues.length < 2) {
      return NextResponse.json({ error: "That sheet has no data rows" }, { status: 400 });
    }

    let headers = primaryValues[0];
    let mergedRows = primaryValues.slice(1);
    let warnings: string[] = [];

    if (enrichTabs && enrichTabs.length) {
      const primaryTable = valuesToTable(primaryTabTitle, primaryValues);
      const enrichTables = await Promise.all(
        enrichTabs.map(async title => valuesToTable(title, await fetchTabValues(spreadsheetId, title, token)))
      );

      // Ask Claude which column identifies a student in each tab being merged —
      // /tabs already did this once for the picker preview, but that result never
      // reaches this request, so it's re-run here on the tabs actually being joined.
      await Promise.all([primaryTable, ...enrichTables].map(async t => {
        const preview = t.rows.slice(0, 5).map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ""])));
        try {
          const { identityColumns } = await classifyColumns(t.headers, preview);
          t.identityHint = identityColumns;
        } catch (err) {
          console.error(`Identity classification failed for tab "${t.name}":`, err);
        }
      }));

      const merged = mergeSheets(primaryTable, enrichTables);
      headers = merged.headers;
      mergedRows = merged.rows;
      warnings = merged.warnings;
    }

    const csv = rowsToCsv([headers, ...mergedRows]);
    const filename = `${spreadsheetTitle} — ${primaryTabTitle}.csv`;
    const fileId = await uploadTextAsAnthropicFile(csv, filename);

    // Best-effort: detect calculated columns from the primary tab's first data row's
    // raw formulas and translate them into plain-English rules. Never blocks the import.
    let formulaRules: string[] = [];
    try {
      const formulaRowRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(primaryTabTitle)}!2:2?valueRenderOption=FORMULA`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (formulaRowRes.ok) {
        const { values: formulaRow } = await formulaRowRes.json() as { values?: string[][] };
        const rawFormulas = formulaRow?.[0] ?? [];
        const candidates = primaryValues[0]
          .map((header, i) => ({ header, formula: rawFormulas[i] }))
          .filter((c): c is { header: string; formula: string } => typeof c.formula === "string" && c.formula.startsWith("="));
        if (candidates.length) formulaRules = await translateFormulasToRules(candidates);
      }
    } catch (err) {
      console.error("Formula detection failed:", err);
    }

    return NextResponse.json({ fileId, filename, csv, formulaRules, warnings });
  } catch (err) {
    console.error("Google Sheets import error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
