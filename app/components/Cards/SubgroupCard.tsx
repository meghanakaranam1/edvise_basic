'use client'
import { useState } from 'react'

type Indicator = { name: string; count: number; pct: number; color: string }
type Combination = { label: string; count: number; pct: number }
type Group = {
  name: string
  n: number
  any_flag_pct: number
  indicators: Indicator[]
  combinations: Combination[]
  all_three: { count: number; pct: number }
}
type Category = { tab: string; equity_note?: string; groups: Group[] }
export type SubgroupData = { total: number; categories: Category[] }

// Pill badge colors keyed by short abbreviation
const BADGE: Record<string, { bg: string; color: string }> = {
  'Abs':  { bg: '#DBEAFE', color: '#1E40AF' },
  'Fail': { bg: '#FEE2E2', color: '#991B1B' },
  'Sus':  { bg: '#FEF3C7', color: '#92400E' },
}

function pillsFromLabel(label: string) {
  return label.split('+').map((s) => s.trim())
}

function Pill({ abbrev }: { abbrev: string }) {
  const s = BADGE[abbrev] ?? { bg: '#f0f3fa', color: '#2A3B7C' }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {abbrev}
    </span>
  )
}

function GroupRow({ group, initOpen }: { group: Group; initOpen: boolean }) {
  const [open, setOpen] = useState(initOpen)
  const maxIndPct = Math.max(...group.indicators.map((i) => i.pct), 1)
  const maxCombCount = Math.max(...group.combinations.map((c) => c.count), group.all_three?.count ?? 0, 1)
  const isHighRisk = group.any_flag_pct > 30

  return (
    <div style={{ border: `1px solid ${open ? '#3E94A5' : '#e4e9f2'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
      {/* Collapsed header */}
      <div
        onClick={() => setOpen(!open)}
        role="button"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          background: open ? '#f0f8fa' : 'white',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: '#2A3B7C', minWidth: 110 }}>{group.name}</div>
        <div style={{ fontSize: 11, color: '#7a89b8', minWidth: 56 }}>n = {group.n.toLocaleString()}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, maxWidth: 160, background: '#f0f3fa', borderRadius: 3, height: 7, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, group.any_flag_pct)}%`, height: '100%', borderRadius: 3, background: isHighRisk ? '#DC2626' : '#3E94A5' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: isHighRisk ? '#DC2626' : '#2A3B7C', whiteSpace: 'nowrap' }}>
            {group.any_flag_pct}% flagged
          </span>
        </div>
        <span style={{ fontSize: 10, color: '#7a89b8' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid #e4e9f2' }}>
          {/* Risk indicators */}
          <div style={{ marginTop: 10, border: '1px solid #e4e9f2', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px', background: '#f7f9fc', borderBottom: '1px solid #e4e9f2' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C' }}>Risk indicators (any students with each flag)</div>
            </div>
            {group.indicators.map((ind) => {
              const barPct = maxIndPct > 0 ? (ind.pct / maxIndPct) * 100 : 0
              return (
                <div key={ind.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #f9fafc' }}>
                  <div style={{ width: 130, fontSize: 12, color: '#2A3B7C', fontWeight: 600, flexShrink: 0 }}>{ind.name}</div>
                  <div style={{ flex: 1, background: '#f0f3fa', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: ind.color, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#2A3B7C', fontFamily: 'monospace', width: 80, textAlign: 'right' }}>
                    {ind.count} · {ind.pct}%
                  </div>
                </div>
              )
            })}
          </div>

          {/* Combinations */}
          <div style={{ marginTop: 6, border: '1px solid #e4e9f2', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f7f9fc', borderBottom: '1px solid #e4e9f2' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C' }}>Combinations (2 flags)</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center' }}>Count · %</div>
            </div>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 3px', borderBottom: '1px solid #f0f3fa' }}>
              <div style={{ width: 110, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 9, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>% of group</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', width: 80, textAlign: 'right' }}>Count · %</div>
            </div>
            {group.combinations.map((combo, i) => {
              const pills = pillsFromLabel(combo.label)
              const barPct = group.n > 0 ? (combo.count / group.n) * 100 : 0
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderBottom: '1px solid #f9fafc' }}>
                  <div style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {pills.map((p) => <Pill key={p} abbrev={p} />)}
                  </div>
                  <div style={{ flex: 1, background: '#f0f3fa', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: '#3E94A5', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#2A3B7C', fontFamily: 'monospace', width: 80, textAlign: 'right' }}>
                    {combo.count} · {combo.pct}%
                  </div>
                </div>
              )
            })}
            {/* All 3 flags row */}
            {group.all_three?.count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#FEF2F2' }}>
                <div style={{ width: 110, flexShrink: 0, fontSize: 12, color: '#7a89b8' }}>All 3 flags</div>
                <div style={{ flex: 1, background: '#FECACA', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${group.n > 0 ? (group.all_three.count / group.n) * 100 : 0}%`, height: '100%', background: '#DC2626', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', fontFamily: 'monospace', width: 80, textAlign: 'right' }}>
                  {group.all_three.count} · {group.all_three.pct}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function findHighest(categories: Category[], field: 'any_flag_pct' | 'pct', indName?: string) {
  let best: { name: string; tab: string; val: number } | null = null
  for (const cat of categories) {
    for (const g of cat.groups) {
      const val = indName
        ? (g.indicators.find((i) => i.name === indName)?.pct ?? 0)
        : g.any_flag_pct
      if (!best || val > best.val) best = { name: g.name, tab: cat.tab, val }
    }
  }
  return best
}

export default function SubgroupCard({ data }: { data: SubgroupData }) {
  const categories = data?.categories ?? []
  const [activeTab, setActiveTab] = useState(0)
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({ 0: true })

  if (!categories.length) return null

  const cat = categories[activeTab]
  const groups = cat?.groups ?? []

  const highestFail = findHighest(categories, 'pct', 'Academic Failure')
  const highestAbsent = findHighest(categories, 'pct', 'Chronic Absence')

  return (
    <div style={{ border: '1px solid #e4e9f2', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e4e9f2', background: '#f7f9fc' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Subgroup analysis — {data.total.toLocaleString()} students
        </div>
      </div>

      {/* School-wide summary */}
      {(highestFail || highestAbsent) && (
        <div style={{ margin: '10px 14px 0', padding: '8px 12px', background: '#eef8fb', border: '1px solid #b8dde6', borderRadius: 8, fontSize: 12, color: '#1b6070', lineHeight: 1.55 }}>
          <strong>School-wide (all tabs) — </strong>
          {highestFail && <span>Highest Academic failure: {highestFail.name} ({highestFail.tab}, {highestFail.val}%)</span>}
          {highestAbsent && <span> · Highest Chronic absence: {highestAbsent.name} ({highestAbsent.tab}, {highestAbsent.val}%)</span>}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e4e9f2', overflowX: 'auto' }}>
        {categories.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setActiveTab(i); setOpenGroups({ 0: true }) }}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: 'none', borderBottom: `2px solid ${activeTab === i ? '#3E94A5' : 'transparent'}`,
              color: activeTab === i ? '#3E94A5' : '#7a89b8',
              background: 'white', whiteSpace: 'nowrap',
            }}
          >
            {c.tab}
          </button>
        ))}
      </div>

      {/* Equity note */}
      {cat?.equity_note && (
        <div style={{ margin: '8px 14px 0', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, display: 'flex', gap: 8 }}>
          <span style={{ color: '#DC2626', fontSize: 12, flexShrink: 0 }}>●</span>
          <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.5 }}>
            <strong>Equity flag: </strong>{cat.equity_note}
          </div>
        </div>
      )}

      {/* Group rows */}
      <div style={{ padding: '12px 14px' }}>
        {groups.map((group, i) => (
          <GroupRow
            key={i}
            group={group}
            initOpen={!!openGroups[i]}
          />
        ))}
      </div>
    </div>
  )
}
