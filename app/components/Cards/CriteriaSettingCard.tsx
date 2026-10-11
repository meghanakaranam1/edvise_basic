'use client'
import { useState } from 'react'
import type { Indicators, Signal, IndicatorCategory } from '../../api/suggest-columns/route'

// One threshold per signal (see Signal in columnClassifier.ts) — a category
// can have more than one signal (e.g. behavior from both a tardy log and a
// separate suspension log), each configured independently and combined with
// OR: tripping any one signal's threshold flags the whole category.
export interface SignalThreshold {
  category: IndicatorCategory
  column: string
  sourceFile?: string
  pct?: number        // rate/days: missed >= X% of days
  min?: number         // count, or category: >= N matching rows
  values?: string[]    // category: which raw values count as a hit
  grade?: number       // grade-numeric: below X
  gradeLetter?: string // grade-letter: 'D' or 'F'
}
export type Thresholds = SignalThreshold[]

interface Props {
  columnMapping?: Record<string, string>
  columnUniques?: Record<string, string[]>
  indicators?: Indicators
  onConfirm: (t: Thresholds) => void
}

export const CATEGORY_META: Record<IndicatorCategory, { label: string; dot: string }> = {
  attendance: { label: 'Attendance', dot: '#3E94A5' },
  behavior: { label: 'Behavior', dot: '#B45309' },
  courseFailure: { label: 'Course failure', dot: '#c53030' },
}

export function signalKey(s: { column: string; sourceFile?: string }): string {
  return `${s.sourceFile ?? ''}::${s.column}`
}

export function groupByCategory(indicators: Indicators): Record<IndicatorCategory, Signal[]> {
  const groups: Record<IndicatorCategory, Signal[]> = { attendance: [], behavior: [], courseFailure: [] }
  for (const s of indicators) groups[s.category].push(s)
  return groups
}

export function defaultThreshold(s: Signal): SignalThreshold {
  const base = { category: s.category, column: s.column, sourceFile: s.sourceFile }
  if (s.type === 'rate' || s.type === 'days') return { ...base, pct: 10 }
  if (s.type === 'count') return { ...base, min: 1 }
  if (s.type === 'category') return { ...base, values: s.values, min: 1 }
  if (s.type === 'grade-numeric') return { ...base, grade: 60 }
  return { ...base, gradeLetter: 'D' } // grade-letter
}

export function initThresholds(indicators?: Indicators): Thresholds {
  return (indicators ?? []).map(defaultThreshold)
}

export function describeThresholds(t: Thresholds): string {
  const byCategory = { attendance: [] as SignalThreshold[], behavior: [] as SignalThreshold[], courseFailure: [] as SignalThreshold[] }
  for (const s of t) byCategory[s.category].push(s)
  const describeOne = (s: SignalThreshold) => {
    if (s.values?.length) return `${s.values.join('/')} ≥${s.min ?? 1}`
    if (s.min != null) return `≥${s.min}`
    if (s.pct != null) return `≥${s.pct}%`
    if (s.grade != null) return `below ${s.grade}`
    if (s.gradeLetter != null) return `${s.gradeLetter} or below`
    return ''
  }
  const parts: string[] = []
  for (const cat of ['attendance', 'behavior', 'courseFailure'] as const) {
    const sigs = byCategory[cat]
    if (!sigs.length) continue
    parts.push(`${CATEGORY_META[cat].label.toLowerCase()}: ${sigs.map(describeOne).join(' or ')}`)
  }
  return parts.join(' · ')
}

// Builds the instructions Claude uses to apply thresholds consistently. Each
// category's flag is true if ANY of its signals trip — this is spelled out
// explicitly since risk tiers below are counted per CATEGORY (max 3), not per
// signal, and a category with two signals must not silently count as two.
export function thresholdPrompt(t: Thresholds, ind?: Indicators): string {
  const byCategory = { attendance: [] as SignalThreshold[], behavior: [] as SignalThreshold[], courseFailure: [] as SignalThreshold[] }
  for (const s of t) byCategory[s.category].push(s)
  const indByKey = new Map((ind ?? []).map(s => [signalKey(s), s]))

  const describeSignal = (s: SignalThreshold): string => {
    const sig = indByKey.get(signalKey(s))
    const file = s.sourceFile ? ` in \`${s.sourceFile}\`` : ''
    const colRef = `\`${s.column}\`${file}`
    if (sig?.type === 'category' && s.values?.length) {
      return `count rows per student where ${colRef} is exactly one of: ${s.values.map(v => `"${v}"`).join(', ')} (match the string exactly — do not treat any other value as a hit). Flag where that count ≥ ${s.min ?? 1}.${s.sourceFile ? ` This file may use a different student-identifying column than the main roster — find the shared key yourself (ID, or Last+First name) rather than assuming it matches by name.` : ''}`
    }
    if (sig?.type === 'rate') return `attendance rate in ${colRef} — this can be stored as either a decimal (0–1) or a percentage (0–100), so check the actual values first. Flag where it is below ${(100 - (s.pct ?? 10)) / 100} if stored as a decimal, or below ${100 - (s.pct ?? 10)} if stored as a percentage (both mean the same thing: missed ≥${s.pct ?? 10}% of days).`
    if (sig?.type === 'days') return `flag where ${colRef} ≥ ${Math.round((s.pct ?? 10) / 100 * 180)} days (${s.pct ?? 10}% of a ~180-day school year — not a flat day count, so it means the same thing regardless of school year length).`
    if (sig?.type === 'count') return `flag where ${colRef} ≥ ${s.min ?? 1}`
    if (sig?.type === 'grade-numeric') return `flag where ${colRef} < ${s.grade ?? 60}`
    if (sig?.type === 'grade-letter') return `flag where ${colRef} is ${s.gradeLetter === 'D' ? '"D" or "F"' : '"F"'}`
    return `flag where ${colRef} meets the configured threshold`
  }

  const blocks: string[] = []
  for (const cat of ['attendance', 'behavior', 'courseFailure'] as const) {
    const sigs = byCategory[cat]
    if (!sigs.length) continue
    const label = CATEGORY_META[cat].label
    if (sigs.length === 1) {
      blocks.push(`${label} flag: ${describeSignal(sigs[0])}`)
    } else {
      blocks.push(`${label} flag (TRUE if ANY of the following are true — these are independent signals, not all required):\n` + sigs.map((s, i) => `  ${i + 1}. ${describeSignal(s)}`).join('\n'))
    }
  }
  return blocks.join('\n')
}

// A dropdown of common preset values with an "Other…" option that swaps in a
// free-text number input — lets a teacher pick a value outside the presets
// (e.g. ≥12% instead of jumping from 10% to 15%) without losing the quick
// one-click presets for the common case.
function PresetOrOther({
  value, presets, format, onChange, sel, min = 0, suffix,
}: {
  value: number
  presets: number[]
  format: (v: number) => string
  onChange: (v: number) => void
  sel: React.CSSProperties
  min?: number
  // Keeps the unit visible next to the custom input once the dropdown's own
  // formatted option text ("≥10% days missed") is no longer on screen.
  suffix?: string
}) {
  const [customMode, setCustomMode] = useState(!presets.includes(value))
  if (customMode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          style={{ ...sel, minWidth: 70, width: 70 }}
          value={value}
          min={min}
          onChange={e => onChange(Number(e.target.value))}
        />
        {suffix && <span style={{ fontSize: 12, color: '#2A3B7C' }}>{suffix}</span>}
        <button
          type="button"
          onClick={() => { setCustomMode(false); onChange(presets[0]) }}
          style={{ fontSize: 11, color: '#7a89b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          Use preset
        </button>
      </div>
    )
  }
  return (
    <select
      style={sel}
      value={value}
      onChange={e => {
        if (e.target.value === 'other') { setCustomMode(true); return }
        onChange(Number(e.target.value))
      }}
    >
      {presets.map(v => <option key={v} value={v}>{format(v)}</option>)}
      <option value="other">Other…</option>
    </select>
  )
}

function SignalRow({
  signal, threshold, columnUniques, columnMapping, onChange, onToggleValue,
}: {
  signal: Signal
  threshold: SignalThreshold
  columnUniques?: Record<string, string[]>
  // Raw CSV header -> human-readable label (e.g. "attrate" -> "Attendance
  // Rate"). Falls back to the raw column name when no mapping exists for it.
  columnMapping?: Record<string, string>
  onChange: (patch: Partial<SignalThreshold>) => void
  onToggleValue: (v: string) => void
}) {
  const sel: React.CSSProperties = { border: '1px solid #d4dff7', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#2A3B7C', background: '#fff', minWidth: 180 }
  const rowSt: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
  const label = columnMapping?.[signal.column] ?? signal.column

  if (signal.type === 'rate' || signal.type === 'days') {
    return (
      <div style={rowSt}>
        <span style={{ fontSize: 12, color: '#2A3B7C' }}>{label}</span>
        <PresetOrOther
          value={threshold.pct ?? 10}
          presets={[5, 10, 15, 20]}
          format={v => `≥${v}% days missed`}
          onChange={v => onChange({ pct: v })}
          sel={sel}
          min={1}
          suffix="% days missed"
        />
      </div>
    )
  }
  if (signal.type === 'count') {
    return (
      <div style={rowSt}>
        <span style={{ fontSize: 12, color: '#2A3B7C' }}>{label}</span>
        <PresetOrOther
          value={threshold.min ?? 1}
          presets={[1, 2, 3]}
          format={v => `≥${v}`}
          onChange={v => onChange({ min: v })}
          sel={sel}
          min={1}
        />
      </div>
    )
  }
  if (signal.type === 'category') {
    // Prefer the sourceFile-scoped lookup — two sheets in a multi-tab upload
    // can share a column name (e.g. both have a "Status" column), so the
    // bare-name lookup alone can return the wrong sheet's values. Bare name
    // stays as a fallback for older single-sheet flows where uniques were
    // never scoped.
    const options = columnUniques?.[signalKey(signal)] ?? columnUniques?.[signal.column] ?? signal.values ?? []
    return (
      <div>
        <div style={{ fontSize: 11, color: '#8a9bb8', marginBottom: 4 }}>{label} — which values count?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {options.map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#2A3B7C', cursor: 'pointer' }}>
              <input type="checkbox" checked={threshold.values?.includes(v) ?? false} onChange={() => onToggleValue(v)} />
              {v}
            </label>
          ))}
        </div>
        <div style={{ ...rowSt }}>
          <span style={{ fontSize: 12, color: '#2A3B7C' }}>Flag with</span>
          <PresetOrOther
            value={threshold.min ?? 1}
            presets={[1, 2, 3]}
            format={v => `≥${v} of these`}
            onChange={v => onChange({ min: v })}
            sel={sel}
            min={1}
          />
        </div>
      </div>
    )
  }
  if (signal.type === 'grade-numeric') {
    return (
      <div style={rowSt}>
        <span style={{ fontSize: 12, color: '#2A3B7C' }}>{label} — below</span>
        <PresetOrOther
          value={threshold.grade ?? 60}
          presets={[50, 60, 65, 70]}
          format={v => `${v}`}
          onChange={v => onChange({ grade: v })}
          sel={sel}
          min={0}
        />
      </div>
    )
  }
  // grade-letter
  return (
    <div style={rowSt}>
      <span style={{ fontSize: 12, color: '#2A3B7C' }}>{label}</span>
      <select style={sel} value={threshold.gradeLetter} onChange={e => onChange({ gradeLetter: e.target.value })}>
        <option value="D">D or below (D, F)</option>
        <option value="F">F only</option>
      </select>
    </div>
  )
}

// Shared by CriteriaSettingCard (initial setup) and MessageInput's "Adjust
// risk criteria" popover (mid-conversation edits) — one category can now
// have several independent signals, so both need the same grouped rendering
// rather than duplicating it.
export function CriteriaFields({
  indicators, columnUniques, columnMapping, value, onChange,
}: {
  indicators?: Indicators
  columnUniques?: Record<string, string[]>
  columnMapping?: Record<string, string>
  value: Thresholds
  onChange: (t: Thresholds) => void
}) {
  const groups = groupByCategory(indicators ?? [])
  const dot = (color: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 })

  function updateSignal(key: string, patch: Partial<SignalThreshold>) {
    onChange(value.map(t => signalKey(t) === key ? { ...t, ...patch } : t))
  }
  function toggleValue(key: string, v: string) {
    onChange(value.map(t => {
      if (signalKey(t) !== key) return t
      const cur = t.values ?? []
      return { ...t, values: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
    }))
  }

  return (
    <>
      {(['attendance', 'behavior', 'courseFailure'] as const).map(cat => {
        const signals = groups[cat]
        if (!signals.length) return null
        const meta = CATEGORY_META[cat]
        return (
          <div key={cat} style={{ padding: '10px 0', borderBottom: '1px solid #eef2f8' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={dot(meta.dot)} /> {meta.label}
            </div>
            {signals.length > 1 && (
              <div style={{ fontSize: 10, color: '#8a9bb8', marginBottom: 8, paddingLeft: 16 }}>
                Flagged if ANY of the following are met:
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 16 }}>
              {signals.map(sig => {
                const key = signalKey(sig)
                const threshold = value.find(t => signalKey(t) === key)
                if (!threshold) return null
                return (
                  <SignalRow
                    key={key}
                    signal={sig}
                    threshold={threshold}
                    columnUniques={columnUniques}
                    columnMapping={columnMapping}
                    onChange={patch => updateSignal(key, patch)}
                    onToggleValue={v => toggleValue(key, v)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default function CriteriaSettingCard({ indicators, columnUniques, columnMapping, onConfirm }: Props) {
  const [t, setT] = useState<Thresholds>(() => initThresholds(indicators))
  const [confirmed, setConfirmed] = useState(false)

  function handleConfirm() {
    setConfirmed(true)
    onConfirm(t)
  }

  if (confirmed) {
    return (
      <div style={{ border: '1px solid #e4e9f2', borderRadius: 10, padding: '10px 14px', background: '#f7f9fc', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: '#2A3B7C', fontSize: 11 }}>
          ✓ Criteria set — {describeThresholds(t)}
        </div>
      </div>
    )
  }

  const hasAny = (indicators ?? []).length > 0

  return (
    <div className="analysis-card" style={{ maxWidth: 500 }}>
      <div className="analysis-card-header">
        <span className="analysis-card-title">Set indicator criteria</span>
      </div>
      <div className="analysis-card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>
        {hasAny
          ? <CriteriaFields indicators={indicators} columnUniques={columnUniques} columnMapping={columnMapping} value={t} onChange={setT} />
          : (
            <p style={{ fontSize: 13, color: '#6b7280', margin: '8px 0' }}>
              Could not automatically detect risk indicator columns. Ask Ev to run the analysis and describe your column names.
            </p>
          )}

        <button
          type="button"
          onClick={handleConfirm}
          style={{ marginTop: 12, background: 'none', border: 'none', color: '#3E94A5', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          Run analysis with these criteria →
        </button>
      </div>
    </div>
  )
}
