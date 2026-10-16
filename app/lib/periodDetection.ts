import type { Signal, IndicatorCategory } from '../api/suggest-columns/route'

// Recognizes a trailing time-period token on a column name — e.g. "attq1" ->
// base "att", period "q1"; "suspensions_q4" -> base "suspensions", period
// "q4". Deliberately narrow (quarters/terms/semesters only, the actual
// pattern districts use) rather than trying to catch every possible
// naming scheme — a false negative here just means the teacher doesn't get
// asked and gets today's (all-periods-combined) behavior, which is safe;
// a false positive would wrongly split up genuinely separate signals.
const PERIOD_SUFFIX = /^(.*?)[_\-]?(q[1-4]|quarter[1-4]|term[1-3]|sem(?:ester)?[1-2]|s[1-2])$/i

export type PeriodGroup = {
  category: IndicatorCategory
  // A human-ish label for the group, built from the base column name — the
  // teacher also sees the real mapped labels per-period in the UI, this is
  // just for the group heading.
  baseLabel: string
  // period token (normalized, e.g. "q1") -> the signal for that period
  periods: Record<string, Signal>
}

export type PeriodDetectionResult = {
  groups: PeriodGroup[]
  // Every distinct period token seen across all groups, in a sensible
  // display order (q1..q4, term1..term3, etc. as encountered) — what the
  // "choose specific periods" checkbox list is built from.
  allPeriods: string[]
}

function normalizePeriod(raw: string): string {
  const s = raw.toLowerCase()
  if (/^s[1-2]$/.test(s)) return `sem${s.slice(1)}`
  if (/^sem\d$/.test(s)) return `sem${s.slice(3)}`
  return s.replace(/semester/, 'sem').replace(/quarter/, 'q').replace(/term/, 'term')
}

// Returns null if nothing period-like was found — the common case, and the
// signal to skip the new picker card entirely and go straight to criteria
// setting as before.
export function detectPeriods(indicators: Signal[]): PeriodDetectionResult | null {
  const byKey = new Map<string, { category: IndicatorCategory; baseLabel: string; periods: Map<string, Signal> }>()

  for (const sig of indicators) {
    const match = sig.column.match(PERIOD_SUFFIX)
    if (!match) continue
    const base = match[1].trim().replace(/[_\-]+$/, '')
    if (!base) continue // the whole column name was just the period token — nothing to group on
    const period = normalizePeriod(match[2])
    const key = `${sig.category}::${base.toLowerCase()}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        category: sig.category,
        baseLabel: base.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        periods: new Map(),
      })
    }
    // If two columns somehow normalize to the same (base, period), keep the
    // first — not expected in practice, not worth surfacing as an error.
    const entry = byKey.get(key)!
    if (!entry.periods.has(period)) entry.periods.set(period, sig)
  }

  const groups: PeriodGroup[] = []
  const allPeriodsSet = new Set<string>()
  const allPeriodsOrder: string[] = []
  for (const { category, baseLabel, periods } of byKey.values()) {
    if (periods.size < 2) continue // only one period found under this base — nothing to pick between
    const periodsObj: Record<string, Signal> = {}
    for (const [period, sig] of periods) {
      periodsObj[period] = sig
      if (!allPeriodsSet.has(period)) {
        allPeriodsSet.add(period)
        allPeriodsOrder.push(period)
      }
    }
    groups.push({ category, baseLabel, periods: periodsObj })
  }

  if (!groups.length) return null

  // Sort periods in a natural reading order (q1 < q2 < ... < term1 < ... )
  // rather than whatever order they happened to be encountered in.
  const rank = (p: string): number => {
    const m = p.match(/^(q|term|sem)(\d+)$/)
    if (!m) return 999
    const base = m[1] === 'q' ? 0 : m[1] === 'term' ? 100 : 200
    return base + Number(m[2])
  }
  allPeriodsOrder.sort((a, b) => rank(a) - rank(b))

  return { groups, allPeriods: allPeriodsOrder }
}

// Given the teacher's choice from PeriodPickerCard, filters the full
// indicator list down to just what should feed into criteria-setting /
// analysis. Signals that were never part of a detected period group pass
// through unchanged — this only touches the ambiguous ones.
export function filterIndicatorsByPeriods(
  indicators: Signal[],
  detection: PeriodDetectionResult,
  selection: 'all' | string[]
): Signal[] {
  if (selection === 'all') return indicators
  const selected = new Set(selection)
  return indicators.filter(sig => {
    // Find if this signal belongs to any detected group, and under which period.
    for (const g of detection.groups) {
      for (const [period, s] of Object.entries(g.periods)) {
        if (s.column === sig.column) return selected.has(period)
      }
    }
    return true // not part of any period group — keep as-is
  })
}
