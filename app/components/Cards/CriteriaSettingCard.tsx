'use client'
import { useState } from 'react'
import type { Indicators } from '../../api/suggest-columns/route'

export interface Thresholds {
  absencePct?: number       // rate-based: missed ≥X% of days
  absenceDays?: number      // count-based: ≥X days absent
  suspensionMin?: number
  failingGrade?: number     // numeric grade: below X
  failingGradeLetter?: string  // letter grade: 'D' or 'F'
  failingCount?: number     // count-based: ≥X failed courses
}

interface Props {
  columnMapping?: Record<string, string>
  columnUniques?: Record<string, string[]>
  indicators?: Indicators
  onConfirm: (t: Thresholds) => void
}

export function describeThresholds(t: Thresholds): string {
  const parts: string[] = []
  if (t.absencePct != null) parts.push(`absent ≥${t.absencePct}% of days`)
  if (t.absenceDays != null) parts.push(`absent ≥${t.absenceDays} days`)
  if (t.suspensionMin != null) parts.push(`suspensions ≥${t.suspensionMin}`)
  if (t.failingGrade != null) parts.push(`grade below ${t.failingGrade}`)
  if (t.failingGradeLetter != null) parts.push(`grade ${t.failingGradeLetter} or below`)
  if (t.failingCount != null) parts.push(`≥${t.failingCount} failed course${t.failingCount > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

export function thresholdPrompt(t: Thresholds, ind?: Indicators): string {
  const col = (key: string) => ind ? ` (column: \`${key}\`)` : ''
  const absCol = ind?.absence?.column ?? ''
  const susCol = ind?.suspension?.column ?? ''
  const failCol = ind?.academicFailure?.column ?? ''

  const flags: string[] = []
  if (t.absencePct != null) {
    if (ind?.absence?.type === 'rate') {
      flags.push(`Chronic absence flag${col(absCol)}: attendance rate stored as decimal 0–1. Flag where \`${absCol || 'attendance_rate'}\` < ${(100 - t.absencePct) / 100} (i.e. missed ≥${t.absencePct}% of days).`)
    } else if (ind?.absence?.type === 'days') {
      flags.push(`Chronic absence flag${col(absCol)}: flag where \`${absCol || 'days_absent'}\` ≥ ${Math.round(t.absencePct / 100 * 180)} days.`)
    } else {
      flags.push(`Chronic absence flag: student missed ≥${t.absencePct}% of days. Check whether the column stores a decimal (0–1) or percentage (0–100) and compare accordingly.`)
    }
  }
  if (t.absenceDays != null)
    flags.push(`Chronic absence flag${col(absCol)}: flag where \`${absCol || 'days_absent'}\` ≥ ${t.absenceDays}`)
  if (t.suspensionMin != null)
    flags.push(`Suspension flag${col(susCol)}: flag where \`${susCol || 'suspensions'}\` ≥ ${t.suspensionMin}`)
  if (t.failingGrade != null)
    flags.push(`Academic failure flag${col(failCol)}: flag where \`${failCol || 'grade'}\` < ${t.failingGrade}`)
  if (t.failingGradeLetter != null)
    flags.push(`Academic failure flag${col(failCol)}: flag where \`${failCol || 'grade'}\` is ${t.failingGradeLetter === 'D' ? '"D" or "F"' : '"F"'}`)
  if (t.failingCount != null)
    flags.push(`Academic failure flag${col(failCol)}: flag where \`${failCol || 'failures'}\` ≥ ${t.failingCount}`)
  return flags.join('\n')
}

export default function CriteriaSettingCard({ indicators, onConfirm }: Props) {
  const absence = indicators?.absence
  const suspension = indicators?.suspension
  const failure = indicators?.academicFailure

  const [t, setT] = useState<Thresholds>(() => {
    const init: Thresholds = {}
    if (absence?.type === 'rate') init.absencePct = 10
    else if (absence?.type === 'days') init.absenceDays = 10
    if (suspension) init.suspensionMin = 1
    if (failure?.type === 'grade-numeric') init.failingGrade = 60
    else if (failure?.type === 'grade-letter') init.failingGradeLetter = 'D'
    else if (failure?.type === 'count') init.failingCount = 1
    return init
  })
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

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #eef2f8' }
  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#2A3B7C', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }
  const dot = (color: string) => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 } as React.CSSProperties)
  const sel: React.CSSProperties = { border: '1px solid #d4dff7', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#2A3B7C', background: '#fff', minWidth: 200 }

  const hasAny = absence || suspension || failure

  return (
    <div className="analysis-card" style={{ maxWidth: 500 }}>
      <div className="analysis-card-header">
        <span className="analysis-card-title">Set indicator criteria</span>
      </div>
      <div className="analysis-card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>

        {/* Chronic absence */}
        {absence?.type === 'rate' && (
          <div style={rowStyle}>
            <div style={labelStyle}>
              <span style={dot('#3E94A5')} />
              Chronic absence — flag students with
            </div>
            <select style={sel} value={t.absencePct} onChange={e => setT(p => ({ ...p, absencePct: Number(e.target.value) }))}>
              {[5, 10, 15, 20].map(v => <option key={v} value={v}>≥{v}% days missed</option>)}
            </select>
          </div>
        )}
        {absence?.type === 'days' && (
          <div style={rowStyle}>
            <div style={labelStyle}>
              <span style={dot('#3E94A5')} />
              Chronic absence — flag students with
            </div>
            <select style={sel} value={t.absenceDays} onChange={e => setT(p => ({ ...p, absenceDays: Number(e.target.value) }))}>
              {[5, 10, 15, 20, 25].map(v => <option key={v} value={v}>≥{v} days absent</option>)}
            </select>
          </div>
        )}

        {/* Suspension */}
        {suspension && (
          <div style={rowStyle}>
            <div style={labelStyle}>
              <span style={dot('#B45309')} />
              Suspension — flag students with
            </div>
            <select style={sel} value={t.suspensionMin} onChange={e => setT(p => ({ ...p, suspensionMin: Number(e.target.value) }))}>
              {[1, 2, 3].map(v => <option key={v} value={v}>≥{v} suspension{v > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        )}

        {/* Academic failure — numeric grade */}
        {failure?.type === 'grade-numeric' && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <div style={labelStyle}>
              <span style={dot('#c53030')} />
              Academic failure — grade below
            </div>
            <select style={sel} value={t.failingGrade} onChange={e => setT(p => ({ ...p, failingGrade: Number(e.target.value) }))}>
              {[50, 60, 65, 70].map(v => <option key={v} value={v}>Below {v}</option>)}
            </select>
          </div>
        )}

        {/* Academic failure — letter grade */}
        {failure?.type === 'grade-letter' && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <div style={labelStyle}>
              <span style={dot('#c53030')} />
              Academic failure — flag students with
            </div>
            <select style={sel} value={t.failingGradeLetter} onChange={e => setT(p => ({ ...p, failingGradeLetter: e.target.value }))}>
              <option value="D">D or below (D, F)</option>
              <option value="F">F only</option>
            </select>
          </div>
        )}

        {/* Academic failure — count of failed courses */}
        {failure?.type === 'count' && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <div style={labelStyle}>
              <span style={dot('#c53030')} />
              Academic failure — flag students with
            </div>
            <select style={sel} value={t.failingCount} onChange={e => setT(p => ({ ...p, failingCount: Number(e.target.value) }))}>
              {[1, 2, 3].map(v => <option key={v} value={v}>≥{v} failed course{v > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        )}

        {!hasAny && (
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
