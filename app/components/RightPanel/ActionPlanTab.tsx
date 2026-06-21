'use client'
import { useState, useEffect } from 'react'
import type { ActionPlan } from './types'

const STATUS_OPTS = ['not_started', 'in_progress', 'completed', 'blocked'] as const
const STATUS_LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', blocked: 'Blocked' }
const STATUS_BG: Record<string, string>    = { not_started: '#f0f2f8', in_progress: '#fdf3e1', completed: '#edf6f8', blocked: '#fff0f0' }
const STATUS_COLOR: Record<string, string> = { not_started: '#7a89b8', in_progress: '#7a5c10', completed: '#1b6070', blocked: '#a32d2d' }

const CHIP_COLORS = [
  { bg: '#fff0f0', color: '#a32d2d', border: '#f7c1c1' },
  { bg: '#fdf3e1', color: '#7a5c10', border: '#f5dfa0' },
  { bg: '#f0f2f8', color: '#2A3B7C', border: '#d4d9ee' },
  { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
]

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3E94A5', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7a89b8' }}>Generating action plan…</div>
    </div>
  )
}

export default function ActionPlanTab({
  data,
  generating,
  onGenerate,
}: {
  data?: ActionPlan
  generating: boolean
  onGenerate: () => void
}) {
  const [plan, setPlan] = useState<ActionPlan | undefined>(data)

  useEffect(() => { setPlan(data) }, [data])

  if (generating) return <Loading />

  if (!plan) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: '#7a89b8', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 600, color: '#2A3B7C', marginBottom: 6 }}>No action plan yet</div>
        <div style={{ marginBottom: 16, fontSize: 12 }}>Generate one from the Notes tab, or click below.</div>
        <button onClick={onGenerate} className="sc-btn primary" style={{ margin: '0 auto' }}>Generate action plan</button>
      </div>
    )
  }

  const allActions = plan.weeks.flatMap(w => w.actions)
  const completed = allActions.filter(a => a.done || a.status === 'completed').length
  const pct = allActions.length ? Math.round((completed / allActions.length) * 100) : 0

  function updateAction(wi: number, ai: number, field: string, value: unknown) {
    setPlan(prev => {
      if (!prev) return prev
      const next = JSON.parse(JSON.stringify(prev)) as ActionPlan
      Object.assign(next.weeks[wi].actions[ai], { [field]: value })
      return next
    })
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a89b8', marginBottom: 4 }}>
          <span>Progress</span>
          <span>{completed}/{allActions.length} · {pct}%</span>
        </div>
        <div style={{ height: 5, background: '#e4e9f2', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#3E94A5', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Goal */}
      <div style={{ marginBottom: 14 }}>
        <div className="rp-label">Goal</div>
        <textarea
          value={plan.goal}
          onChange={e => setPlan(p => p ? { ...p, goal: e.target.value } : p)}
          rows={2}
          style={{ width: '100%', fontSize: 13, color: '#2A3B7C', border: 'none', resize: 'none', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, outline: 'none', background: 'transparent' }}
        />
      </div>

      {/* Focus group */}
      {plan.focus_group?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="rp-label">Focus Group</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {plan.focus_group.map((chip, i) => {
              const c = CHIP_COLORS[i % CHIP_COLORS.length]
              return (
                <span key={i} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                  {chip}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Weeks */}
      {plan.weeks.map((week, wi) => (
        <div key={wi} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', marginBottom: 2 }}>{week.week_label}</div>
          {week.theme && <div style={{ fontSize: 11, color: '#7a89b8', marginBottom: 8 }}>{week.theme}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e4e9f2' }}>
                {['Action', 'Owner', 'Status', '✓'].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10, fontWeight: 600, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: i === 0 ? '40%' : i === 3 ? '8%' : '24%' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.actions.map((act, ai) => (
                <tr key={act.id ?? ai} style={{ borderBottom: '1px solid #f5f5f5', opacity: act.done ? 0.5 : 1 }}>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                    <div
                      contentEditable suppressContentEditableWarning
                      style={{ fontWeight: 600, color: '#2A3B7C', outline: 'none', minHeight: 14 }}
                      onBlur={e => updateAction(wi, ai, 'action', e.currentTarget.innerText)}
                    >{act.action}</div>
                    {act.detail && <div style={{ color: '#7a89b8', marginTop: 2, lineHeight: 1.4 }}>{act.detail}</div>}
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                    <div
                      contentEditable suppressContentEditableWarning
                      style={{ color: '#2A3B7C', outline: 'none', minHeight: 14 }}
                      onBlur={e => updateAction(wi, ai, 'owner', e.currentTarget.innerText)}
                    >{act.owner}</div>
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                    <select
                      value={act.status ?? 'not_started'}
                      onChange={e => updateAction(wi, ai, 'status', e.target.value)}
                      style={{ fontSize: 10, padding: '2px 4px', borderRadius: 10, border: 'none', fontFamily: 'Inter, sans-serif', cursor: 'pointer', background: STATUS_BG[act.status ?? 'not_started'], color: STATUS_COLOR[act.status ?? 'not_started'], outline: 'none', width: '100%' }}
                    >
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <input
                      type="checkbox"
                      checked={act.done || act.status === 'completed'}
                      onChange={e => updateAction(wi, ai, 'done', e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#3E94A5', cursor: 'pointer' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
