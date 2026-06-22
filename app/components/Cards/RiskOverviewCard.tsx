'use client'

type Indicator = { name: string; count: number; pct: number; color: string }
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

function StatBox({ label, value, sub, accent }: {
  label: string; value: number; sub: string; accent?: 'amber' | 'red' | 'green'
}) {
  const s = accent === 'amber'
    ? { bg: '#fffbeb', border: '#fbd38d', num: '#b7791f', sub: '#b7791f' }
    : accent === 'red'
    ? { bg: '#fff5f5', border: '#fed7d7', num: '#c53030', sub: '#c53030' }
    : accent === 'green'
    ? { bg: '#f0fff4', border: '#9ae6b4', num: '#276749', sub: '#276749' }
    : { bg: '#f7f9fc', border: '#e4e9f2', num: '#2A3B7C', sub: '#7a89b8' }

  return (
    <div style={{ flex: 1, padding: '8px 10px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: s.num }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10, color: s.sub, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function IndicatorRow({ ind }: { ind: Indicator }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: ind.color }}>{ind.name}</span>
        <span style={{ color: '#2A3B7C' }}>{ind.count.toLocaleString()} ({ind.pct}%)</span>
      </div>
      <div style={{ height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${ind.pct}%`, height: '100%', borderRadius: 999, background: ind.color, opacity: 0.85 }} />
      </div>
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

export function RiskBody({ data, scope = 'school' }: { data: RiskOverviewData; scope?: string }) {
  const two = data.two_or_more
  const three = data.all_three

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <StatBox label="Students" value={data.total} sub="enrolled" />
        <StatBox label="Any flag" value={data.any_flag.count} sub={`${data.any_flag.pct}% of ${scope}`} accent="amber" />
        <StatBox label="All 3 flags" value={three.count} sub={`${three.pct}% of ${scope}`} accent="red" />
        <StatBox label="No flags" value={data.no_flag.count} sub={`${data.no_flag.pct}% of ${scope}`} accent="green" />
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

export default function RiskOverviewCard({ data }: { data: RiskOverviewData }) {
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
        <RiskBody data={data} scope="school" />
      </div>
    </div>
  )
}
