'use client'
import { useState } from 'react'

export interface Thresholds {
  absencePct?: number    // rate-based: ≥X% days missed
  absenceDays?: number   // count-based: ≥X days absent
  suspensionMin?: number
  failingGrade?: number  // grade-based: below X
  failingCount?: number  // count-based: ≥X failed courses
}

interface Props {
  columnMapping?: Record<string, string>
  onConfirm: (t: Thresholds) => void
}

type AbsenceType = 'rate' | 'days' | null
type FailureType = 'grade' | 'count' | null

function detect(mapping: Record<string, string> = {}) {
  let absenceType: AbsenceType = null
  let suspensionFound = false
  let failureType: FailureType = null

  for (const label of Object.values(mapping)) {
    if (!absenceType) {
      if (/attendance rate/i.test(label)) absenceType = 'rate'
      else if (/days? absent|absent days?/i.test(label)) absenceType = 'days'
    }
    if (/suspension/i.test(label)) suspensionFound = true
    if (!failureType) {
      if (/\bfailures?\b/i.test(label)) failureType = 'count'
      else if (/\bgrade\b|\bgpa\b/i.test(label)) failureType = 'grade'
    }
  }

  // If no mapping provided at all, fall back to showing all three with defaults
  if (!Object.keys(mapping).length) {
    absenceType = 'rate'
    suspensionFound = true
    failureType = 'grade'
  }

  return { absenceType, suspensionFound, failureType }
}

export function describeThresholds(t: Thresholds): string {
  const parts: string[] = []
  if (t.absencePct != null) parts.push(`absent ≥${t.absencePct}% of days`)
  if (t.absenceDays != null) parts.push(`absent ≥${t.absenceDays} days`)
  if (t.suspensionMin != null) parts.push(`suspensions ≥${t.suspensionMin}`)
  if (t.failingGrade != null) parts.push(`grade below ${t.failingGrade}`)
  if (t.failingCount != null) parts.push(`≥${t.failingCount} failed course${t.failingCount > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

export function thresholdPrompt(t: Thresholds): string {
  const flags: string[] = []
  if (t.absencePct != null)
    flags.push(`Chronic absence flag: attendance rate < ${100 - t.absencePct}% (missed ≥${t.absencePct}% of days)`)
  if (t.absenceDays != null)
    flags.push(`Chronic absence flag: days absent ≥ ${t.absenceDays}`)
  if (t.suspensionMin != null)
    flags.push(`Suspension flag: suspension count ≥ ${t.suspensionMin}`)
  if (t.failingGrade != null)
    flags.push(`Academic failure flag: any course grade below ${t.failingGrade}`)
  if (t.failingCount != null)
    flags.push(`Academic failure flag: total failed courses ≥ ${t.failingCount}`)
  return flags.join('\n')
}

export default function CriteriaSettingCard({ columnMapping, onConfirm }: Props) {
  const { absenceType, suspensionFound, failureType } = detect(columnMapping ?? {})

  const [t, setT] = useState<Thresholds>(() => {
    const init: Thresholds = {}
    if (absenceType === 'rate') init.absencePct = 10
    else if (absenceType === 'days') init.absenceDays = 10
    if (suspensionFound) init.suspensionMin = 1
    if (failureType === 'grade') init.failingGrade = 60
    else if (failureType === 'count') init.failingCount = 1
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

  return (
    <div className="analysis-card" style={{ maxWidth: 500 }}>
      <div className="analysis-card-header">
        <span className="analysis-card-title">Set indicator criteria</span>
      </div>
      <div className="analysis-card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>

        {/* Absence */}
        {absenceType === 'rate' && (
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
        {absenceType === 'days' && (
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
        {suspensionFound && (
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

        {/* Academic failure */}
        {failureType === 'grade' && (
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
        {failureType === 'count' && (
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
