'use client'
import { useState } from 'react'

type Quarter = { label: string; date?: string }
type GroupSeries = { key: string; label: string; color: string; values: number[]; counts: number[] }
type TrackedVariable = { name: string; unit: string; groups: GroupSeries[] }
type StaticVariable = { name: string; pct: number; count: number }

export type LongitudinalData = {
  total: number
  quarters: Quarter[]
  variables: TrackedVariable[]
  static: StaticVariable[]
}

// Grouped bar chart — one cluster per quarter, one bar per group within the
// cluster (Whole School always first). The active quarter's bars are
// full-opacity; the rest stay visible but dimmed, so the whole time range is
// still readable while the selected point stands out.
function TrendBars({ v, quarters, activeIdx }: { v: TrackedVariable; quarters: Quarter[]; activeIdx: number }) {
  const n = quarters.length
  const g = v.groups.length
  const chartW = 260, baseline = 46, top = 4
  const allVals = v.groups.flatMap(gr => gr.values)
  const chartMax = Math.max(...allVals) * 1.15 || 1
  const clusterW = chartW / n
  const barGap = 2
  const barW = Math.min(16, (clusterW - 8 - barGap * (g - 1)) / g)
  const clusterInnerW = barW * g + barGap * (g - 1)

  return (
    <svg viewBox="0 0 260 50" preserveAspectRatio="none" style={{ width: '100%', height: 50, display: 'block' }}>
      {quarters.map((_, qi) => {
        const clusterX = qi * clusterW + (clusterW - clusterInnerW) / 2
        const active = qi === activeIdx
        return v.groups.map((gr, gi) => {
          const val = gr.values[qi]
          const h = (val / chartMax) * (baseline - top)
          const x = clusterX + gi * (barW + barGap)
          const y = baseline - h
          return (
            <rect key={gr.key + qi} x={x} y={y} width={barW} height={h} fill={gr.color} opacity={active ? 1 : 0.3} rx={1.5} />
          )
        })
      })}
    </svg>
  )
}

function VariableBlock({ v, quarters, activeIdx }: { v: TrackedVariable; quarters: Quarter[]; activeIdx: number }) {
  const whole = v.groups.find(g => g.key === 'whole') ?? v.groups[0]
  return (
    <div style={{ border: '1px solid #f0f3fa', borderRadius: 10, padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {v.name} trend
      </div>
      <TrendBars v={v} quarters={quarters} activeIdx={activeIdx} />

      {v.groups.length > 1 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: '#7a89b8', margin: '8px 0' }}>
          {v.groups.map(gr => (
            <span key={gr.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: gr.color, display: 'inline-block' }} />
              {gr.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
        {v.groups.map(gr => {
          const val = gr.values[activeIdx]
          const diff = gr.key === 'whole' ? null : val - whole.values[activeIdx]
          return (
            <div key={gr.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: gr.color, display: 'inline-block' }} />
                {gr.label}
              </span>
              <span style={{ color: '#2A3B7C' }}>
                {gr.counts[activeIdx]} ({val}{v.unit})
                {diff != null && (
                  <span style={{ color: diff > 0 ? '#c53030' : '#276749', marginLeft: 6 }}>
                    ({diff > 0 ? '+' : ''}{diff.toFixed(1)} pts vs. school)
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LongitudinalCard({ data }: { data: LongitudinalData }) {
  const [activeIdx, setActiveIdx] = useState(data.quarters.length - 1)

  return (
    <div style={{ border: '1px solid #e4e9f2', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e4e9f2', background: '#f7f9fc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Longitudinal — {data.total.toLocaleString()} students
        </span>
        <span style={{ fontSize: 11, color: '#7a89b8' }}>
          {data.quarters[0]?.label} → {data.quarters[data.quarters.length - 1]?.label}
        </span>
      </div>

      {/* Quarter tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e4e9f2', overflowX: 'auto' }}>
        {data.quarters.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIdx(i)}
            style={{
              padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: 'none', borderBottom: `2px solid ${activeIdx === i ? '#3E94A5' : 'transparent'}`,
              color: activeIdx === i ? '#3E94A5' : '#7a89b8',
              background: 'white', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            }}
          >
            {q.label}
            {q.date && <span style={{ fontSize: 9.5, fontWeight: 400, color: '#7a89b8' }}>{q.date}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: 12 }}>
        {data.variables.map(v => (
          <VariableBlock key={v.name} v={v} quarters={data.quarters} activeIdx={activeIdx} />
        ))}

        {data.static.length > 0 && (
          <div style={{ border: '1px solid #f0f3fa', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Also flagged (not tracked over time)
            </div>
            {data.static.map((s, i) => (
              <div key={s.name} style={{ marginBottom: i === data.static.length - 1 ? 0 : 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#7a89b8' }}>{s.name}</span>
                  <span style={{ color: '#2A3B7C' }}>{s.count.toLocaleString()} ({s.pct}%)</span>
                </div>
                <div style={{ height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', borderRadius: 999, background: '#9aa1b5' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
