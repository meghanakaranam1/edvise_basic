'use client'
import { useState } from 'react'

type SubIndicator = { name: string; count: number; pct: number }
// sub is populated only when this category has more than one contributing
// threshold signal (e.g. Math Grade + English Grade both feeding "Academic
// Failure") — see CriteriaSettingCard's per-category signal grouping, which
// this mirrors. count/pct on the parent are the UNION of all sub signals
// (a student can trip more than one), so they will not equal the sum of the
// sub entries — that's expected, not an error.
type Indicator = { name: string; count: number; pct: number; color: string; sub?: SubIndicator[] }
type Combination = { label: string; count: number; pct: number }

export type RiskOverviewData = {
  total: number
  any_flag: { count: number; pct: number }
  no_flag: { count: number; pct: number }
  indicators: Indicator[]
  two_or_more: { count: number; pct: number }
  all_three: { count: number; pct: number }
  combinations: Combination[]
}

function StatBox({ label, value, sub, accent, onClick }: {
  label: string; value: number; sub: string; accent?: 'amber' | 'red' | 'green'; onClick?: () => void
}) {
  const s = accent === 'amber'
    ? { bg: '#fffbeb', border: '#fbd38d', num: '#b7791f', sub: '#b7791f' }
    : accent === 'red'
    ? { bg: '#fff5f5', border: '#fed7d7', num: '#c53030', sub: '#c53030' }
    : accent === 'green'
    ? { bg: '#f0fff4', border: '#9ae6b4', num: '#276749', sub: '#276749' }
    : { bg: '#f7f9fc', border: '#e4e9f2', num: '#2A3B7C', sub: '#7a89b8' }

  return (
    <div
      onClick={onClick}
      style={{ flex: 1, padding: '8px 10px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ fontSize: 10, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {onClick && <span style={{ fontSize: 8.5, opacity: 0.7 }}>view roster</span>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: s.num }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10, color: s.sub, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function IndicatorRow({ ind }: { ind: Indicator }) {
  const [open, setOpen] = useState(false)
  const expandable = (ind.sub?.length ?? 0) > 1

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        onClick={expandable ? () => setOpen(o => !o) : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4, cursor: expandable ? 'pointer' : 'default' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: ind.color }}>
          {expandable && (
            <span style={{ fontSize: 9, color: '#7a89b8', display: 'inline-block', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
          )}
          {ind.name}
          {expandable && <span style={{ fontWeight: 400, color: '#7a89b8' }}>(any flag)</span>}
        </span>
        <span style={{ color: '#2A3B7C' }}>{ind.count.toLocaleString()} ({ind.pct}%)</span>
      </div>
      <div style={{ height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${ind.pct}%`, height: '100%', borderRadius: 999, background: ind.color, opacity: 0.85 }} />
      </div>
      {expandable && open && (
        <div style={{ paddingLeft: 18, marginLeft: 4, marginTop: 6, borderLeft: '2px solid #f0f3fa' }}>
          {ind.sub!.map(s => (
            <div key={s.name} style={{ padding: '5px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                <span style={{ color: '#2A3B7C' }}>{s.name}</span>
                <span style={{ color: '#7a89b8' }}>{s.count.toLocaleString()} ({s.pct}%)</span>
              </div>
              <div style={{ height: 5, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${s.pct}%`, height: '100%', borderRadius: 999, background: ind.color, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ComboRow({ combo }: { combo: Combination }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: '#2A3B7C' }}>{combo.label}</span>
        <span style={{ color: '#2A3B7C' }}>{combo.count.toLocaleString()} ({combo.pct}%)</span>
      </div>
      <div style={{ height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${combo.pct}%`, height: '100%', borderRadius: 999, background: '#2A3B7C', opacity: 0.6 }} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
      {children}
    </div>
  )
}

// rosterScopeLabel narrows the generated prompt to e.g. "Grade 7" when this
// body is rendered inside Grade Breakdown — left blank, it just says
// "students" (whole school). onAskRoster is wired to the same send pathway
// as a typed question (see MessageList's renderCard), so clicking a tile
// produces a real new message + reply, not an invented inline table.
export function RiskBody({ data, scope = 'school', rosterScopeLabel = '', onAskRoster }: {
  data: RiskOverviewData
  scope?: string
  rosterScopeLabel?: string
  onAskRoster?: (prompt: string) => void
}) {
  const two = data.two_or_more
  const three = data.all_three
  const who = rosterScopeLabel ? `${rosterScopeLabel} students` : 'students'

  function rosterPrompt(which: 'all' | 'any' | 'all3' | 'none'): string {
    if (which === 'all') return `Show me the full roster of ${who}.`
    if (which === 'any') return `Show me the roster of ${who} with any risk flag (attendance, behavior, or course failure).`
    if (which === 'all3') return `Show me the roster of ${who} with all three risk flags (attendance, behavior, and course failure).`
    return `Show me the roster of ${who} with no risk flags.`
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <StatBox label="Students" value={data.total} sub="enrolled" onClick={onAskRoster ? () => onAskRoster(rosterPrompt('all')) : undefined} />
        <StatBox label="Any flag" value={data.any_flag.count} sub={`${data.any_flag.pct}% of ${scope}`} accent="amber" onClick={onAskRoster ? () => onAskRoster(rosterPrompt('any')) : undefined} />
        <StatBox label="All 3 flags" value={three.count} sub={`${three.pct}% of ${scope}`} accent="red" onClick={onAskRoster ? () => onAskRoster(rosterPrompt('all3')) : undefined} />
        <StatBox label="No flags" value={data.no_flag.count} sub={`${data.no_flag.pct}% of ${scope}`} accent="green" onClick={onAskRoster ? () => onAskRoster(rosterPrompt('none')) : undefined} />
      </div>

      <div style={{ border: '1px solid #f0f3fa', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <SectionLabel>Risk indicators</SectionLabel>
        {data.indicators.map((ind) => (
          <IndicatorRow key={ind.name} ind={ind} />
        ))}
      </div>

      <div style={{ border: '1px solid #f0f3fa', borderRadius: 10, padding: 10 }}>
        <SectionLabel>Flag combinations</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, color: '#b7791f', marginBottom: 3 }}>2 or more flags</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#b7791f' }}>{two.count.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#b7791f' }}>{two.pct}% of {scope}</div>
          </div>
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, color: '#c53030', marginBottom: 3 }}>All 3 flags</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#c53030' }}>{three.count.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#c53030' }}>{three.pct}% of {scope}</div>
          </div>
        </div>
        {data.combinations.map((c) => (
          <ComboRow key={c.label} combo={c} />
        ))}
      </div>
    </>
  )
}

export default function RiskOverviewCard({ data, onAskRoster }: { data: RiskOverviewData; onAskRoster?: (prompt: string) => void }) {
  return (
    <div style={{ border: '1px solid #e4e9f2', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e4e9f2', background: '#f7f9fc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          School overview — {data.total.toLocaleString()} students
        </span>
        <span style={{ fontSize: 11, color: '#7a89b8' }}>
          {data.any_flag.count.toLocaleString()} students · {data.any_flag.pct}% flagged
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <RiskBody data={data} scope="school" onAskRoster={onAskRoster} />
      </div>
    </div>
  )
}
