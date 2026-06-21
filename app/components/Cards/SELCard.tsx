'use client'
import { useState } from 'react'

export interface SELData {
  n_total: number
  scale_min: number
  scale_max: number
  scales: string[]
  school_avg: Record<string, number>
  groups: Array<{
    label: string
    n: number
    avg_score: number
    scores: Record<string, number>
  }>
}

const SCHOOL_COLOR = '#22a559'
const GROUP_COLOR = '#f97316'

export default function SELCard({ data }: { data: SELData }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const groups = data?.groups ?? []
  const scales = data?.scales ?? []
  const group = groups[activeIdx]
  const range = (data?.scale_max - data?.scale_min) || 1
  const barPct = (val: number) => Math.max(0, Math.min(100, ((val - (data?.scale_min ?? 0)) / range) * 100))

  if (!groups.length || !scales.length) return null

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff', margin: '12px 0' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2A3B7C' }}>
          SEL Factor Analysis
        </div>
      </div>

      {/* Group pills */}
      <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid var(--border)' }}>
        {groups.map((g, i) => {
          const active = activeIdx === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                border: `1.5px solid ${active ? '#3E94A5' : '#e4e9f2'}`,
                background: active ? '#eef8fb' : '#f7f9fc',
                color: active ? '#1b6070' : '#7a89b8',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#3E94A5' : '#c8d0e7', flexShrink: 0 }} />
              {g.label}
              <span style={{ fontWeight: 700, color: active ? '#1b6070' : '#4a5a8a' }}>{g.avg_score.toFixed(1)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>n={g.n.toLocaleString()}</span>
            </button>
          )
        })}
      </div>

      {/* Factor breakdown */}
      <div style={{ padding: '12px 16px' }}>
        {/* Sub-header */}
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7a89b8', marginBottom: 10 }}>
          By Factor — {group?.label}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 14, height: 4, background: SCHOOL_COLOR, borderRadius: 2, display: 'inline-block' }} />
            School average ({data.scale_min}–{data.scale_max})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 14, height: 4, background: GROUP_COLOR, borderRadius: 2, display: 'inline-block' }} />
            {group?.label} ({group?.n.toLocaleString()})
          </div>
        </div>

        {/* Rows */}
        {scales.map((scale) => {
          const schoolVal = data.school_avg[scale] ?? 0
          const groupVal = group?.scores[scale] ?? 0
          return (
            <div key={scale} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 150, fontSize: 12, color: 'var(--text)', fontWeight: 500, flexShrink: 0, lineHeight: 1.3 }}>
                {scale}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ height: 8, background: '#eef0f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${barPct(schoolVal)}%`, height: '100%', background: SCHOOL_COLOR, borderRadius: 3 }} />
                </div>
                <div style={{ height: 8, background: '#eef0f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${barPct(groupVal)}%`, height: '100%', background: GROUP_COLOR, borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 28, textAlign: 'right' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: SCHOOL_COLOR }}>{schoolVal.toFixed(1)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: GROUP_COLOR }}>{groupVal.toFixed(1)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
