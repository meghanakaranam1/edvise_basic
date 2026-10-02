// Merges multiple spreadsheet tabs/sheets into a single student-level table.
// Each sheet is matched to the primary sheet using whichever identity key both
// sides actually support — a raw ID column, or (when ID data is missing on
// one or both sides, e.g. stripped during de-identification) a composite of
// Last+First name, falling back further to Last+First+Grade if plain names
// collide too often to be trusted. A sheet where the matched key repeats
// (e.g. one row per tardy event, one row per class period) is treated as
// "event-level" and aggregated to a per-student count instead of joined row-for-row.
//
// Which column plays which role is identified by Claude (see identityHint
// below, populated from /api/suggest-columns) rather than a hardcoded list of
// header spellings — there's no fixed set of names a district might use for
// "student ID" or "last name" across every export format and language. The
// regex checks in this file exist only as a fallback for when no hint is
// available (API failure, or a caller that hasn't fetched one), and every
// hinted or guessed column is still verified against the actual data (fill
// rate, uniqueness) before being trusted as a join key.

import type { IdentityColumns } from './columnClassifier'

export interface SheetTable {
  name: string
  headers: string[]
  rows: string[][]
  identityHint?: IdentityColumns
}

export type KeyKind = 'id' | 'name_grade' | 'name'

export interface SheetSummary {
  name: string
  rowCount: number
  colCount: number
  headers: string[]
  idColumn: string | null
  keyKind: KeyKind | null
  isEventLevel: boolean
  preview: Record<string, string>[]
}

export interface MergeResult {
  headers: string[]
  rows: string[][]
  warnings: string[]
}

interface KeyExtractor {
  kind: KeyKind
  label: string
  columns: number[]
  fillRate: number
  uniqueRatio: number
  extract: (row: string[]) => string | null
}

const MIN_FILL_RATE = 0.5
const MIN_FALLBACK_UNIQUE_RATIO = 0.9
const MIN_NAME_UNIQUE_RATIO = 0.8
const DUPLICATE_AGREEMENT_THRESHOLD = 0.9

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Bilingual/Google-Forms exports often cram a translation into the same cell
// on a second line (e.g. "Lunch ID # \nNúmero de identificación del almuerzo") —
// match against the first line only so the translation doesn't break the check.
function firstLineNorm(h: string): string {
  return normalizeHeader(h.split(/\r?\n/)[0])
}

// Last-resort fallback only, used when Claude's identity hint is unavailable
// or doesn't validate against the actual data — see the module comment above.
function isIdHeader(h: string): boolean {
  const norm = firstLineNorm(h)
  return /^(student|lunch|local|district|sis|pupil)?id$/.test(norm) || norm === 'studentnumber' || norm === 'studentno'
}

function isLastNameHeader(h: string): boolean {
  const norm = firstLineNorm(h)
  return norm === 'lastname' || norm === 'last'
}

function isFirstNameHeader(h: string): boolean {
  const norm = firstLineNorm(h)
  return norm === 'firstname' || norm === 'first'
}

function isGradeHeader(h: string): boolean {
  return firstLineNorm(h) === 'grade'
}

function normalizeNamePart(v: string | undefined): string {
  return (v ?? '').toLowerCase().trim().replace(/[.'’`]/g, '').replace(/\s+/g, ' ')
}

function columnStats(rows: string[][], idx: number): { fillRate: number; uniqueRatio: number } {
  const filled = rows.map(r => (r[idx] ?? '').trim()).filter(Boolean)
  const fillRate = rows.length ? filled.length / rows.length : 0
  const uniqueRatio = filled.length ? new Set(filled).size / filled.length : 0
  return { fillRate, uniqueRatio }
}

function keyStats(rows: string[][], extract: (row: string[]) => string | null): { fillRate: number; uniqueRatio: number } {
  const keys = rows.map(extract)
  const filled = keys.filter((k): k is string => k !== null)
  const fillRate = rows.length ? filled.length / rows.length : 0
  const uniqueRatio = filled.length ? new Set(filled).size / filled.length : 0
  return { fillRate, uniqueRatio }
}

// Resolves the single-column student ID, preferring Claude's hint (already
// validated server-side to be a real column name) but requiring it to
// actually be well-filled in this data before trusting it — a hint pointing
// at a column that turned out blank isn't usable, hint or not.
function resolveIdColumnIndex(headers: string[], rows: string[][], hint?: IdentityColumns): number | null {
  if (hint?.idColumn) {
    const idx = headers.indexOf(hint.idColumn)
    if (idx >= 0 && columnStats(rows, idx).fillRate >= MIN_FILL_RATE) return idx
  }
  const named = headers.findIndex(isIdHeader)
  if (named >= 0 && columnStats(rows, named).fillRate >= MIN_FILL_RATE) return named
  return null
}

function resolveNameColumns(headers: string[], hint?: IdentityColumns): { lastIdx: number; firstIdx: number; gradeIdx: number } | null {
  let lastIdx = hint?.lastNameColumn ? headers.indexOf(hint.lastNameColumn) : -1
  let firstIdx = hint?.firstNameColumn ? headers.indexOf(hint.firstNameColumn) : -1
  if (lastIdx < 0 || firstIdx < 0) {
    lastIdx = headers.findIndex(isLastNameHeader)
    firstIdx = headers.findIndex(isFirstNameHeader)
  }
  if (lastIdx < 0 || firstIdx < 0) return null
  let gradeIdx = hint?.gradeColumn ? headers.indexOf(hint.gradeColumn) : -1
  if (gradeIdx < 0) gradeIdx = headers.findIndex(isGradeHeader)
  return { lastIdx, firstIdx, gradeIdx }
}

// Finds every identity key this table could plausibly support, most reliable
// first. There can be more than one (e.g. a sheet might have both a real ID
// column and usable Last/First columns) — mergeSheets picks whichever kind is
// shared with the specific sheet it's matching against, since two sheets can
// each have "a good key" that isn't the same kind of key.
function buildKeyExtractors(headers: string[], rows: string[][], hint?: IdentityColumns): KeyExtractor[] {
  const extractors: KeyExtractor[] = []
  const nameCols = resolveNameColumns(headers, hint)
  const nameColIndices = new Set(nameCols ? [nameCols.lastIdx, nameCols.firstIdx, nameCols.gradeIdx].filter(i => i >= 0) : [])

  // 1. A single-column student ID, as long as it's actually filled.
  // Duplication within it is fine and expected for event logs — that's
  // handled later via isEventLevel, not a reason to reject the column here.
  const idIdx = resolveIdColumnIndex(headers, rows, hint)
  if (idIdx !== null) {
    const { fillRate, uniqueRatio } = columnStats(rows, idIdx)
    extractors.push({ kind: 'id', label: headers[idIdx], columns: [idIdx], fillRate, uniqueRatio, extract: row => (row[idIdx] ?? '').trim() || null })
  } else {
    // No named/hinted ID column — fall back to whichever column behaves like
    // one (well filled, near-total uniqueness among its values). Name-part
    // columns are excluded even if they look unique by chance in a small
    // sample — a first name is never a reliable identifier on its own, and it
    // would steal priority from the deliberate Last+First composite below.
    let best = -1
    let bestRatio = 0
    headers.forEach((_, i) => {
      if (nameColIndices.has(i)) return
      const { fillRate, uniqueRatio } = columnStats(rows, i)
      if (fillRate >= MIN_FILL_RATE && uniqueRatio > MIN_FALLBACK_UNIQUE_RATIO && uniqueRatio > bestRatio) {
        bestRatio = uniqueRatio
        best = i
      }
    })
    if (best >= 0) {
      const { fillRate, uniqueRatio } = columnStats(rows, best)
      extractors.push({ kind: 'id', label: headers[best], columns: [best], fillRate, uniqueRatio, extract: row => (row[best] ?? '').trim() || null })
    }
  }

  // 2. Composite name key — covers files where the ID itself was stripped
  // (or one sheet never had one) but names survive. Last+First alone first;
  // if that's not unique enough on its own (common names, siblings), add
  // Grade as a tiebreaker.
  if (nameCols) {
    const { lastIdx, firstIdx, gradeIdx } = nameCols
    const nameExtract = (row: string[]): string | null => {
      const l = normalizeNamePart(row[lastIdx])
      const f = normalizeNamePart(row[firstIdx])
      return l && f ? `${l}|${f}` : null
    }
    const nameStats = keyStats(rows, nameExtract)
    if (nameStats.fillRate >= MIN_FILL_RATE && nameStats.uniqueRatio >= MIN_NAME_UNIQUE_RATIO) {
      extractors.push({
        kind: 'name', label: `${headers[lastIdx]} + ${headers[firstIdx]}`, columns: [lastIdx, firstIdx],
        ...nameStats, extract: nameExtract,
      })
    }

    if (gradeIdx >= 0) {
      const nameGradeExtract = (row: string[]): string | null => {
        const base = nameExtract(row)
        const g = (row[gradeIdx] ?? '').trim().toLowerCase()
        return base && g ? `${base}|${g}` : null
      }
      const nameGradeStats = keyStats(rows, nameGradeExtract)
      if (nameGradeStats.fillRate >= MIN_FILL_RATE && nameGradeStats.uniqueRatio >= MIN_NAME_UNIQUE_RATIO) {
        extractors.push({
          kind: 'name_grade', label: `${headers[lastIdx]} + ${headers[firstIdx]} + ${headers[gradeIdx]}`,
          columns: [lastIdx, firstIdx, gradeIdx], ...nameGradeStats, extract: nameGradeExtract,
        })
      }
    }
  }

  return extractors
}

const KIND_PRIORITY: KeyKind[] = ['id', 'name_grade', 'name']

function bestExtractor(extractors: KeyExtractor[]): KeyExtractor | null {
  for (const kind of KIND_PRIORITY) {
    const found = extractors.find(e => e.kind === kind)
    if (found) return found
  }
  return null
}

// The primary and a given enrichment sheet only merge if they share the SAME
// kind of key (a "Last+First" key from one sheet is meaningless matched
// against a raw ID from another) — so this picks the most reliable kind both
// sides actually have, not just each side's individual best.
function sharedExtractor(a: KeyExtractor[], b: KeyExtractor[]): { primary: KeyExtractor; enrich: KeyExtractor } | null {
  for (const kind of KIND_PRIORITY) {
    const ea = a.find(e => e.kind === kind)
    const eb = b.find(e => e.kind === kind)
    if (ea && eb) return { primary: ea, enrich: eb }
  }
  return null
}

export function summarizeSheet(t: SheetTable): SheetSummary {
  const best = bestExtractor(buildKeyExtractors(t.headers, t.rows, t.identityHint))
  const preview = t.rows.slice(0, 5).map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ''])))
  return {
    name: t.name,
    rowCount: t.rows.length,
    colCount: t.headers.length,
    headers: t.headers,
    idColumn: best ? best.label : null,
    keyKind: best ? best.kind : null,
    isEventLevel: !!best && best.uniqueRatio < 0.9,
    preview,
  }
}

// Sheet names routinely carry the school year ("all student data 23-24",
// "Tardy data 24-25") — pulling that out gives a disambiguating suffix that
// actually means something ("Grade (2023-2024)") instead of an opaque
// counter ("Grade (2)"). Falls back to the raw sheet name when no year-like
// pattern is found, which is still more informative than a bare number.
function sourceLabelFor(sheetName: string): string {
  const m = sheetName.match(/(\d{2})-(\d{2})\b/)
  return m ? `20${m[1]}-20${m[2]}` : sheetName
}

// Like sourceLabelFor, but returns both the short ("23-24") and long
// ("2023-2024") forms, and null when the sheet name has no year in it —
// used to decide whether a column needs tagging at all, not just as a
// disambiguating fallback on collision.
function yearLabelFor(sheetName: string): { short: string; long: string } | null {
  const m = sheetName.match(/(\d{2})-(\d{2})\b/)
  return m ? { short: `${m[1]}-${m[2]}`, long: `20${m[1]}-20${m[2]}` } : null
}

// Different sheets exported from different systems routinely spell the same
// column differently in whitespace/casing only ("Last Name" vs "Last  Name" vs
// "last name") — comparing on normalizeHeader (not raw equality) catches those
// as the same column instead of silently emitting two identically-labeled ones.
function uniqueHeader(existing: string[], candidate: string, sourceLabel?: string): string {
  const existingNorm = existing.map(normalizeHeader)
  if (!existingNorm.includes(normalizeHeader(candidate))) return candidate
  if (sourceLabel) {
    const withSource = `${candidate} (${sourceLabel})`
    if (!existingNorm.includes(normalizeHeader(withSource))) return withSource
  }
  let i = 2
  while (existingNorm.includes(normalizeHeader(`${candidate} (${i})`))) i++
  return `${candidate} (${i})`
}

// Picks which of the checked sheets drives column confirmation and the
// absence/academic-failure parts of criteria setup — normally the roster,
// since that's the one sheet that's naturally one-row-per-student and where
// the ABC columns live. Internal plumbing only, never shown to the teacher:
// sheets are NOT merged together (see presentImportedSheets in page.tsx —
// every selected sheet stays its own separate, untouched file), this just
// decides which one sheet's own columns populate the confirmation screen.
export function chooseSetupSheet(summaries: SheetSummary[], idxs: number[]): number {
  const nonEvent = idxs.filter(i => !summaries[i].isEventLevel)
  const pool = nonEvent.length ? nonEvent : idxs
  return pool.reduce((best, i) => (summaries[i].colCount > summaries[best].colCount ? i : best))
}

export function mergeSheets(primary: SheetTable, enrichments: SheetTable[]): MergeResult {
  const warnings: string[] = []
  const headers = [...primary.headers]
  const rows = primary.rows.map(r => [...r])
  const primaryExtractors = buildKeyExtractors(primary.headers, primary.rows, primary.identityHint)

  if (!primaryExtractors.length && enrichments.length) {
    warnings.push(`Could not find a usable student ID or name column in "${primary.name}", so no other sheets could be merged in.`)
    return { headers, rows, warnings }
  }

  for (const sheet of enrichments) {
    const enrichExtractors = buildKeyExtractors(sheet.headers, sheet.rows, sheet.identityHint)
    const shared = sharedExtractor(primaryExtractors, enrichExtractors)
    if (!shared) {
      warnings.push(`"${sheet.name}" has no student ID or name column in common with "${primary.name}", so it was skipped.`)
      continue
    }
    const { primary: primaryKey, enrich: enrichKey } = shared
    const byName = primaryKey.kind !== 'id'

    const keyToRowIdx = new Map<string, number>()
    rows.forEach((r, i) => {
      const key = primaryKey.extract(r)
      if (key) keyToRowIdx.set(key, i)
    })

    const isEventLevel = enrichKey.uniqueRatio < 0.9
    let matched = 0
    let unmatched = 0

    if (isEventLevel) {
      const counts = new Map<string, number>()
      for (const r of sheet.rows) {
        const key = enrichKey.extract(r)
        if (!key) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (keyToRowIdx.has(key)) matched++
        else unmatched++
      }
      const colName = uniqueHeader(headers, `${sheet.name} count`)
      headers.push(colName)
      const colIdx = headers.length - 1
      rows.forEach(r => { r[colIdx] = '0' })
      for (const [key, count] of counts) {
        const rowIdx = keyToRowIdx.get(key)
        if (rowIdx !== undefined) rows[rowIdx][colIdx] = String(count)
      }
      warnings.push(`"${sheet.name}" has ${sheet.rows.length.toLocaleString()} rows (one per event) — aggregated to a "${colName}" column, matched by ${primaryKey.label}.`)
      if (unmatched > 0) warnings.push(`${unmatched} event(s) in "${sheet.name}" referenced a student not found in "${primary.name}" and were ignored.`)
    } else {
      // Resolve matches first (deduped by key) so column decisions below can be
      // verified against the actual matched values, rather than allocating
      // every column up front and filling them in blind.
      const seen = new Set<string>()
      const matches: { rowIdx: number; sheetRow: string[] }[] = []
      for (const r of sheet.rows) {
        const key = enrichKey.extract(r)
        if (!key || seen.has(key)) continue
        seen.add(key)
        const rowIdx = keyToRowIdx.get(key)
        if (rowIdx === undefined) { unmatched++; continue }
        matched++
        matches.push({ rowIdx, sheetRow: r })
      }

      // A same-student historical sheet (e.g. last year's roster) often
      // repeats static facts — name, gender, birthdate — that don't actually
      // change between snapshots. Rather than trust the header name to say
      // whether a column is "new information" vs. "the same fact restated,"
      // check the real matched values: if a column that collides by name
      // agrees with the existing column for the students it was matched
      // against, it's a verified duplicate and gets skipped instead of
      // cluttering the merge with a redundant "(2)" column.
      const otherIdxs = sheet.headers.map((_, i) => i).filter(i => !enrichKey.columns.includes(i))
      const colsToAdd: number[] = []
      let skippedDuplicates = 0
      otherIdxs.forEach(srcIdx => {
        const collisionIdx = headers.findIndex(h => normalizeHeader(h) === normalizeHeader(sheet.headers[srcIdx]))
        if (collisionIdx < 0) { colsToAdd.push(srcIdx); return }
        let agree = 0
        let compared = 0
        for (const { rowIdx, sheetRow } of matches) {
          const existingVal = (rows[rowIdx][collisionIdx] ?? '').trim().toLowerCase()
          const incomingVal = (sheetRow[srcIdx] ?? '').trim().toLowerCase()
          if (!existingVal || !incomingVal) continue
          compared++
          if (existingVal === incomingVal) agree++
        }
        if (compared >= 3 && agree / compared >= DUPLICATE_AGREEMENT_THRESHOLD) { skippedDuplicates++; return }
        colsToAdd.push(srcIdx)
      })

      // A column from a dated historical sheet (e.g. "all student data 23-24")
      // represents a past snapshot regardless of whether its name happens to
      // collide with an existing column — tag every one of them with the
      // source year up front, not just the ones collision-detection catches,
      // so two columns describing the same kind of historical fact don't end
      // up with inconsistent labels purely by naming coincidence (skip
      // columns that already spell the year out themselves, e.g. "CMAS Math
      // SS 23-24", to avoid a redundant double-tag).
      const yearInfo = yearLabelFor(sheet.name)
      const newColIdxs: number[] = []
      colsToAdd.forEach(srcIdx => {
        const rawName = sheet.headers[srcIdx]
        const alreadyTagged = yearInfo && normalizeHeader(rawName).includes(normalizeHeader(yearInfo.short))
        const candidate = (yearInfo && !alreadyTagged) ? `${rawName} (${yearInfo.long})` : rawName
        const colName = uniqueHeader(headers, candidate, sourceLabelFor(sheet.name))
        headers.push(colName)
        const colIdx = headers.length - 1
        newColIdxs.push(colIdx)
        rows.forEach(r => { r[colIdx] = '' })
      })
      for (const { rowIdx, sheetRow } of matches) {
        colsToAdd.forEach((srcIdx, j) => { rows[rowIdx][newColIdxs[j]] = sheetRow[srcIdx] ?? '' })
      }

      if (skippedDuplicates > 0) warnings.push(`Skipped ${skippedDuplicates} column(s) from "${sheet.name}" that exactly duplicated data already in "${primary.name}".`)
      if (unmatched > 0) warnings.push(`${unmatched} student(s) in "${sheet.name}" had a ${byName ? 'name' : 'ID'} not found in "${primary.name}" and were ignored.`)
    }

    if (matched === 0 && unmatched > 0) {
      warnings.push(`None of "${sheet.name}"'s rows matched a student in "${primary.name}" — it may use a different ${byName ? 'naming convention' : 'ID scheme'}.`)
    } else if (matched > 0 && unmatched > matched * 4) {
      warnings.push(`Most of "${sheet.name}"'s rows (${unmatched} of ${unmatched + matched}) didn't match a student in "${primary.name}" — double check both sheets use the same ${byName ? 'names' : 'ID scheme'}.`)
    }
  }

  return { headers, rows, warnings }
}

export function sheetsToCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)
  return [headers, ...rows].map(r => r.map(c => escape(c ?? '')).join(',')).join('\n')
}
