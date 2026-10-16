'use client'
import { useState } from 'react'
import type { PeriodDetectionResult } from '../../lib/periodDetection'

const CATEGORY_LABEL: Record<string, string> = {
  attendance: 'Attendance',
  behavior: 'Behavior',
  courseFailure: 'Course failure',
}

export default function PeriodPickerCard({
  detection, onConfirm,
}: {
  detection: PeriodDetectionResult
  onConfirm: (selection: 'all' | string[]) => void
}) {
  const [choice, setChoice] = useState<'all' | 'custom'>('all')
  const [customPeriods, setCustomPeriods] = useState<Set<string>>(new Set(detection.allPeriods))
  const [submitted, setSubmitted] = useState<string | null>(null)

  function toggle(p: string) {
    setCustomPeriods(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function handleConfirm() {
    const selection: 'all' | string[] = choice === 'all' ? 'all' : [...customPeriods]
    const summary = choice === 'all'
      ? 'All periods combined (flagged if tripped in any period)'
      : `${[...customPeriods].length === 1 ? '' : 'Periods: '}${[...customPeriods].join(', ') || 'none'}`
    setSubmitted(summary)
    onConfirm(selection)
  }

  if (submitted) {
    return (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', maxWidth: 480, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: '#3E94A5', fontSize: 11, flexShrink: 0 }}>✓</span>
          <span style={{ fontSize: 12, color: '#374151' }}>
            <span style={{ fontWeight: 600, color: '#2A3B7C' }}>Time period:</span> {submitted}
          </span>
        </div>
      </div>
    )
  }

  const radioRow = (value: 'all' | 'custom', label: string, sub?: string) => (
    <label
      onClick={() => setChoice(value)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 8,
        border: `1px solid ${choice === value ? '#3E94A5' : '#e5e7eb'}`,
        background: choice === value ? '#eef7f9' : '#f9fafb',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        border: `2px solid ${choice === value ? '#3E94A5' : '#d1d5db'}`,
        background: choice === value ? '#3E94A5' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {choice === value && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
      </span>
      <span>
        <div style={{ fontSize: 13, color: choice === value ? '#1b6070' : '#374151', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </span>
    </label>
  )

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', maxWidth: 480, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '14px 16px 10px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>
          This data has multiple time periods
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          {detection.groups.map(g => `${CATEGORY_LABEL[g.category] ?? g.category} (${Object.keys(g.periods).join(', ')})`).join(' · ')}
        </p>
      </div>

      <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {radioRow('all', 'All periods combined', 'Flag a student if they tripped the threshold in any period — the broadest view across the full year.')}
        {radioRow('custom', 'Choose specific periods', 'Pick exactly which period(s) to include — e.g. just the most recent one, to see who’s still at-risk right now.')}

        {choice === 'custom' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 4px 2px 34px' }}>
            {detection.allPeriods.map(p => {
              const checked = customPeriods.has(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(p)}
                  style={{
                    padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${checked ? '#3E94A5' : '#e4e9f2'}`,
                    background: checked ? '#eef8fb' : '#f7f9fc',
                    color: checked ? '#1b6070' : '#7a89b8',
                  }}
                >
                  {p}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid #f3f4f6', background: '#f9fafb', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={choice === 'custom' && customPeriods.size === 0}
          style={{
            padding: '7px 16px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            cursor: (choice === 'custom' && customPeriods.size === 0) ? 'not-allowed' : 'pointer',
            background: (choice === 'custom' && customPeriods.size === 0) ? '#e5e7eb' : '#2A3B7C',
            color: (choice === 'custom' && customPeriods.size === 0) ? '#9ca3af' : '#fff',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
