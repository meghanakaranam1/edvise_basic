import type { Signal, IndicatorCategory } from '../api/suggest-columns/route'

// Groups signals that classifyColumns itself already tagged as period-
// variants of the same metric (via Signal.period / periodGroupKey) — see
// the classification prompt in columnClassifier.ts for why this lives
// there instead of a regex over raw column names: naming conventions for
// "which quarter" vary enormously district to district, and Claude already
// has the full semantic picture from the same classification call we're
// making anyway (no extra API round trip), where a fixed pattern would
// miss anything it wasn't specifically written to recognize.
export type PeriodGroup = {
  category: IndicatorCategory
  baseLabel: string
  // period label (as Claude wrote it, e.g. "Q1") -> the signal for that period
  periods: Record<string, Signal>
}

export type PeriodDetectionResult = {
  groups: PeriodGroup[]
  // Every distinct period label seen across all groups, in encountered
  // order — what the "choose specific periods" checkbox list is built from.
  allPeriods: string[]
}

function titleCase(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

// Returns null if nothing period-tagged was found — the common case, and
// the signal to skip the picker card entirely and go straight to criteria
// setting as before.
export function detectPeriods(indicators: Signal[]): PeriodDetectionResult | null {
  const byKey = new Map<string, { category: IndicatorCategory; baseLabel: string; periods: Map<string, Signal> }>()
  const allPeriodsOrder: string[] = []

  for (const sig of indicators) {
    if (!sig.period || !sig.periodGroupKey) continue
    const key = `${sig.category}::${sig.periodGroupKey}`
    if (!byKey.has(key)) {
      byKey.set(key, { category: sig.category, baseLabel: titleCase(sig.periodGroupKey), periods: new Map() })
    }
    const entry = byKey.get(key)!
    if (!entry.periods.has(sig.period)) entry.periods.set(sig.period, sig)
    if (!allPeriodsOrder.includes(sig.period)) allPeriodsOrder.push(sig.period)
  }

  const groups: PeriodGroup[] = []
  for (const { category, baseLabel, periods } of byKey.values()) {
    if (periods.size < 2) continue // only one period actually present under this key — nothing to pick between
    groups.push({ category, baseLabel, periods: Object.fromEntries(periods) })
  }

  if (!groups.length) return null
  return { groups, allPeriods: allPeriodsOrder.filter(p => groups.some(g => p in g.periods)) }
}

// Given the teacher's choice from PeriodPickerCard, filters the full
// indicator list down to just what should feed into criteria-setting and
// every subsequent analysis stage (grade breakdown, subgroup, SEL, etc. —
// they all read from the same filtered indicator list via thresholdPrompt,
// so filtering once here covers all of them). Signals that were never
// period-tagged pass through unchanged — this only touches the ambiguous
// ones.
export function filterIndicatorsByPeriods(
  indicators: Signal[],
  selection: 'all' | string[]
): Signal[] {
  if (selection === 'all') return indicators
  const selected = new Set(selection)
  return indicators.filter(sig => {
    if (!sig.period || !sig.periodGroupKey) return true
    return selected.has(sig.period)
  })
}
