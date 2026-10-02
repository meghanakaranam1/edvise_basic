import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type IndicatorCategory = 'attendance' | 'behavior' | 'courseFailure'

// A single risk-indicator signal found in one sheet's columns. sourceFile is
// set by the caller (page.tsx), not by classifyColumns itself — classifyColumns
// only ever looks at one sheet at a time (see presentImportedSheets), so it
// has no idea which uploaded file its own columns live in.
//
// Indicators is a LIST, not one fixed slot per category, because the same
// category is routinely evidenced by more than one signal — often on
// different sheets entirely (e.g. "behavior" from both a tardy log and a
// separate suspension/incident log). A sheet may contribute zero, one, or
// several signals, and the same category can appear more than once across
// the selected sheets; a teacher-set threshold on ANY one signal is enough to
// trip that category, they're combined with OR, not required all at once.
export type Signal = {
  category: IndicatorCategory
  column: string
  sourceFile?: string
} & (
  | { type: 'rate' | 'days' } // attendance
  | { type: 'count' } // behavior or courseFailure: already a per-student number
  // A raw event/incident log (behavior) or a named performance scale
  // (courseFailure) — e.g. "Parent Conference" / "In School Suspension", or
  // "Did not yet meet expectations" / "Met Expectations". "values" are the
  // exact raw value(s) that count as a hit, identified from the real data
  // rather than a hardcoded list, since there's no fixed vocabulary a
  // district might use.
  | { type: 'category'; values: string[] }
  | { type: 'grade-numeric' | 'grade-letter' } // courseFailure only
)

export type Indicators = Signal[]

// Which raw column (if any) identifies a student, for cross-referencing this
// sheet with others. There's no fixed set of header spellings to match
// against — a district's export might call it "Pupil Number," "SIS ID,"
// "Apellido," or something invented locally — so Claude reads the actual
// headers and sample values rather than us maintaining a growing regex list.
// lastName/firstName/grade are a fallback composite key for sheets where the
// ID itself is missing or blank (e.g. stripped during de-identification) but
// names survive.
export type IdentityColumns = {
  idColumn?: string
  lastNameColumn?: string
  firstNameColumn?: string
  gradeColumn?: string
}

export interface ColumnClassification {
  labels: Record<string, string>
  indicators: Indicators
  identityColumns: IdentityColumns
}

// Finds a balanced JSON value (object or array) starting at "key": in text,
// tracking string/escape state so braces inside quoted values don't throw off
// the count. Used both to recover a value from a response Claude cut short,
// and as the primary extraction path for "indicators" (now an array, which a
// naive single-level regex can't safely capture once objects nest inside it).
function extractBalancedJson(text: string, key: string): string | null {
  const marker = `"${key}"`
  const markerIdx = text.indexOf(marker)
  if (markerIdx < 0) return null
  const colonIdx = text.indexOf(':', markerIdx + marker.length)
  if (colonIdx < 0) return null
  let i = colonIdx + 1
  while (i < text.length && /\s/.test(text[i])) i++
  const openChar = text[i]
  const closeChar = openChar === '[' ? ']' : openChar === '{' ? '}' : null
  if (!closeChar) return null
  let depth = 0
  let inStr = false
  let escaped = false
  for (let j = i; j < text.length; j++) {
    const ch = text[j]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return text.slice(i, j + 1)
    }
  }
  return null // truly truncated mid-structure — give up
}

// Shared by /api/suggest-columns (called from the client once per selected
// sheet — see presentImportedSheets in page.tsx) and /api/google-sheets/tabs
// (called server-side per tab, before any merging happens, to power the sheet
// picker).
export async function classifyColumns(
  columns: string[],
  preview: Record<string, string>[],
  columnUniques?: Record<string, string[]>
): Promise<ColumnClassification> {
  const sampleRows = preview.slice(0, 5)
  const sampleText = columns.map(col => {
    // Prefer the fuller set of real distinct values when available — a 5-row
    // preview can easily miss a whole category (e.g. the rarest of 5 CMAS
    // proficiency tiers in a 250-row file), which matters a lot for spotting
    // categorical scales correctly, not just for the values check below.
    const vals = (columnUniques?.[col]?.length ? columnUniques[col] : sampleRows.map(r => r[col]).filter(Boolean)).slice(0, 8).join(', ')
    return `  "${col}": [${vals}]`
  }).join('\n')

  // Scale the budget to the column count, uncapped — a wide sheet can easily
  // have 50-250+ columns, and a fixed 1024-token budget silently truncated
  // the JSON mid-"labels" before "indicators" was ever emitted.
  const maxTokens = 1024 + columns.length * 24

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: `You are a school data analyst. Given raw CSV column names and sample values from ONE sheet of student data, return a JSON object with exactly three fields, in this order — "identityColumns", then "indicators", then "labels" (each is more truncatable than the last: if you have to cut the response short, labels can be incomplete, but identityColumns and indicators must always be complete):

"identityColumns": which column (if any) uniquely identifies a student, for cross-referencing this sheet with others. There is no fixed naming convention — recognize it from context (e.g. "Pupil Number", "SIS ID", "Local ID", a district-specific field name, or a translated/bilingual header). Return:
- "idColumn": the raw column name of a single-column student identifier, only if one clearly exists and has real (non-blank) values in the sample.
- If no such column exists, instead return "lastNameColumn" and "firstNameColumn": the raw column names for a student's last and first name, if both exist and have real values. Optionally also "gradeColumn" (grade level) if present, to help disambiguate students who share a name.
- Omit any of these you can't confidently identify. Never guess a column that's mostly blank in the sample.

"indicators": an ARRAY of student risk-indicator signals found in THESE columns. A single sheet may contain zero, one, or several — e.g. a behavior/incident log might have both a tardy column and a separate suspension/outcome column, and both should be reported as separate items, since those are genuinely different things a teacher may care about independently. Each item is an object with:
- "category": one of "attendance", "behavior", "courseFailure".
  - "attendance": chronic absence or attendance rate.
  - "behavior": tardies, suspensions, detentions, office referrals, disciplinary incidents — anything conduct-related.
  - "courseFailure": failing grades, low proficiency/test scores, failed courses.
- "column": the raw column name.
- "type":
  - "rate" — decimal 0–1 or percentage 0–100 (attendance only).
  - "days" — integer day count (attendance only).
  - "count" — already a per-student numeric count (behavior or courseFailure).
  - "grade-numeric" — a 0–100 numeric grade/GPA (courseFailure only).
  - "grade-letter" — actual letter grades A/B/C/D/F only (courseFailure only) — not any other kind of category.
  - "category" — a named outcome/resolution/tier column, typically one row per event or a named performance scale (behavior or courseFailure). Prefer this over "count" whenever the raw column is a category/text value, not an actual number. Also include "values": the exact raw value(s) from the sample, copied character-for-character, that represent a genuine hit — for behavior, actual suspensions/major incidents only (never a minor thing like a hallway pass, positive note, or parent conference); for courseFailure, the failing/lowest performance tier(s) only. Never invent a value that doesn't appear in the sample.

IMPORTANT — don't report the same underlying fact twice as separate signals:
- If several columns describe attendance for the exact SAME reporting date/period (e.g. an attendance-rate column alongside a breakdown into excused/unexcused/total days for that same date), report only ONE of them — prefer a "rate" column over a raw day-count breakdown, and if only day-counts exist, prefer a "total" days-absent column over an excused/unexcused split (those are components of the total, not independent facts). DO report separate signals for genuinely different reporting periods — different quarters/terms, or last year vs. this year — since those really are independent facts a teacher may want to check separately.
- If an incident-log sheet has more than one categorical column describing the same incident (e.g. both a "type of incident" column and a separate "resolution/outcome" column for the same row), report only the one most directly indicative of severity — usually the resolution/consequence column, since the type of incident alone doesn't reliably say whether it was serious enough to count. Don't report both.
If nothing in these columns matches any category, return an empty array.

"labels": map every raw column name to a clear human-readable label a teacher would recognize.

Return ONLY valid JSON, no explanation, no markdown.`,
    messages: [{
      role: 'user',
      content: `Column names and sample values:\n{\n${sampleText}\n}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: { labels?: Record<string, string>; indicators?: Indicators; identityColumns?: IdentityColumns } = {}
  try { parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch { parsed = {} }

  const labels: Record<string, string> = parsed.labels ?? {}
  let indicators: Indicators = parsed.indicators ?? []
  let identityColumns: IdentityColumns = parsed.identityColumns ?? {}

  // A very wide sheet, or several signals in "indicators", can still overrun
  // the budget above and cut the response off mid-"labels". Since
  // "identityColumns" and "indicators" are written first, they're usually
  // intact even when the outer object never closes — recover them directly
  // with a balanced scan rather than losing them to the failed full parse.
  if (Object.keys(identityColumns).length === 0) {
    const raw = extractBalancedJson(text, 'identityColumns')
    if (raw) { try { identityColumns = JSON.parse(raw) } catch { /* give up */ } }
  }
  if (indicators.length === 0) {
    const raw = extractBalancedJson(text, 'indicators')
    if (raw) { try { indicators = JSON.parse(raw) } catch { /* give up */ } }
  }

  // Never trust a hallucinated column name — drop anything Claude names that
  // isn't actually one of the raw columns we sent it.
  const columnSet = new Set(columns)
  for (const key of Object.keys(identityColumns) as (keyof IdentityColumns)[]) {
    if (!columnSet.has(identityColumns[key] ?? '')) delete identityColumns[key]
  }
  indicators = indicators.filter(s => columnSet.has(s.column))

  // Same guard for "category" signal values: only keep ones that actually
  // appear in the real data for that column. Validate against columnUniques
  // (the full distinct-value set) when available, not just the 5-row
  // preview — a small preview can easily miss a real, legitimate value Claude
  // correctly identified, which would otherwise get silently dropped here as
  // if it were a hallucination. Drop the signal entirely if none survive.
  indicators = indicators.filter(s => {
    if (s.type !== 'category') return true
    const realValues = new Set([
      ...(columnUniques?.[s.column] ?? []),
      ...sampleRows.map(r => r[s.column]).filter(Boolean),
    ])
    const kept = (s.values ?? []).filter(v => realValues.has(v))
    if (kept.length) { s.values = kept; return true }
    return false
  })

  // Fill any missing labels with title-case fallback
  for (const col of columns) {
    if (!labels[col]) {
      labels[col] = col.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  return { labels, indicators, identityColumns }
}
