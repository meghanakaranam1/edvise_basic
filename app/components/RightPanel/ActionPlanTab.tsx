'use client'
import { useState, useEffect } from 'react'
import type { ActionPlan, ActionPlanStep, ActionPlanScheduleRow } from './types'

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Behavior:   { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  Academic:   { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  Attendance: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  Engagement: { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  SEL:        { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
}
function tagColor(tag: string) {
  return TAG_COLORS[tag] ?? { bg: '#f0f2f8', color: '#2A3B7C', border: '#c5cce0' }
}

const STATUS_OPTS = ['Upcoming', 'In Progress', 'Completed', 'Blocked']
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  'Upcoming':    { bg: '#f0f2f8', color: '#7a89b8' },
  'In Progress': { bg: '#fdf3e1', color: '#7a5c10' },
  'Completed':   { bg: '#edf6f8', color: '#1b6070' },
  'Blocked':     { bg: '#fff0f0', color: '#a32d2d' },
}

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
  onSave,
  onDiscard,
}: {
  data?: ActionPlan
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
}) {
  const [plan, setPlan] = useState<ActionPlan | undefined>(data)
  const [editing, setEditing] = useState(false)
  const [editingStudents, setEditingStudents] = useState(false)
  const [studentsText, setStudentsText] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setPlan(data); setEditing(false); setSaved(false) }, [data])

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

  function setField<K extends keyof ActionPlan>(key: K, value: ActionPlan[K]) {
    setPlan(p => p ? { ...p, [key]: value } : p)
  }

  function updateStep(idx: number, field: keyof ActionPlanStep, value: string | string[]) {
    setPlan(p => {
      if (!p) return p
      const steps = [...p.steps]
      steps[idx] = { ...steps[idx], [field]: value }
      return { ...p, steps }
    })
  }

  function updateBullet(si: number, bi: number, value: string) {
    setPlan(p => {
      if (!p) return p
      const steps = [...p.steps]
      const bullets = [...steps[si].bullets]
      bullets[bi] = value
      steps[si] = { ...steps[si], bullets }
      return { ...p, steps }
    })
  }

  function addStep() {
    setPlan(p => {
      if (!p) return p
      const steps = p.steps ?? []
      const id = `step_${steps.length + 1}`
      return { ...p, steps: [...steps, { id, title: 'New step', bullets: [''] }] }
    })
  }

  function updateSchedule(idx: number, field: keyof ActionPlanScheduleRow, value: string) {
    setPlan(p => {
      if (!p) return p
      const schedule = [...p.schedule]
      schedule[idx] = { ...schedule[idx], [field]: value }
      return { ...p, schedule }
    })
  }

  const dateCreated = plan.date_created ?? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }
  const section: React.CSSProperties = { marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f0f2f8' }
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ border: '1px solid #e4e9f2', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', ...extra })

  return (
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f0f2f8' }}>
        <div style={{ display: 'flex', gap: 10, color: '#9ca3af' }}>
          {['B', 'I', '≡', '⊞', '↓'].map(c => (
            <span key={c} style={{ cursor: 'pointer', fontSize: c === 'B' ? 14 : 13, fontWeight: c === 'B' ? 700 : 400 }}>{c}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Auto-filled · edit freely</span>
          <button
            onClick={() => setEditing(e => !e)}
            style={{ padding: '3px 10px', border: '1px solid #e4e9f2', borderRadius: 6, background: editing ? '#edf6f8' : 'white', color: editing ? '#1b6070' : '#7a89b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Edvise · Action Plan
      </div>

      {/* Title */}
      {editing
        ? <input value={plan.title} onChange={e => setField('title', e.target.value)} style={{ ...inp(), fontWeight: 700, fontSize: 15, color: '#2A3B7C', marginBottom: 14 }} />
        : <div style={{ fontWeight: 700, fontSize: 15, color: '#2A3B7C', marginBottom: 14, lineHeight: 1.4 }}>{plan.title}</div>
      }

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 18 }}>
        <div>
          <div style={label}>Date created</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{dateCreated}</div>
        </div>
        <div>
          <div style={label}>Steps</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{plan.steps?.length ?? 0}</div>
        </div>
      </div>

      {/* Students in plan */}
      <div style={section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={label}>Students in plan</div>
          <button
            onClick={() => {
              if (editingStudents) {
                setField('students', studentsText.split('\n').map(s => s.trim()).filter(Boolean))
                setEditingStudents(false)
              } else {
                setStudentsText((plan.students ?? []).join('\n'))
                setEditingStudents(true)
              }
            }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3E94A5', fontSize: 11, fontWeight: 600, padding: 0 }}
          >
            {editingStudents ? 'Save' : 'edit'}
          </button>
        </div>
        {editingStudents
          ? <textarea value={studentsText} onChange={e => setStudentsText(e.target.value)} rows={3} placeholder="One student name or ID per line" style={{ ...inp(), resize: 'vertical', fontSize: 12, lineHeight: 1.6 }} />
          : plan.students?.length > 0
            ? <div style={{ fontSize: 12, color: '#374151' }}>{plan.students.join(', ')}</div>
            : <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No students identified — click edit to add names or IDs</div>
        }
      </div>

      {/* Summary */}
      <div style={section}>
        <div style={label}>Summary</div>
        {plan.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {plan.tags.map((tag, i) => {
              const c = tagColor(tag)
              return <span key={i} style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{tag}</span>
            })}
          </div>
        )}
        {editing
          ? <textarea value={plan.summary} onChange={e => setField('summary', e.target.value)} rows={4} style={{ ...inp(), resize: 'vertical', lineHeight: 1.65 }} />
          : <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.65 }}>{plan.summary}</div>
        }
      </div>

      {/* Goal */}
      <div style={section}>
        <div style={label}>Goal</div>
        <div style={{ background: '#f7f9fc', border: '1px solid #e4e9f2', borderRadius: 8, padding: '12px 14px' }}>
          {editing
            ? <textarea value={plan.goal} onChange={e => setField('goal', e.target.value)} rows={3} style={{ ...inp({ border: 'none', background: 'transparent', padding: 0, resize: 'vertical', lineHeight: 1.65 }) }} />
            : <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.65 }}>{plan.goal}</div>
          }
          <div style={{ marginTop: 10, fontSize: 11, color: '#7a89b8' }}>
            Target date:{' '}
            {editing
              ? <input value={plan.target_date} onChange={e => setField('target_date', e.target.value)} style={{ border: 'none', borderBottom: '1px solid #e4e9f2', outline: 'none', fontSize: 11, fontFamily: 'inherit', color: '#374151', background: 'transparent', width: 180 }} />
              : <span style={{ color: '#374151', fontWeight: 500 }}>{plan.target_date}</span>
            }
          </div>
        </div>
      </div>

      {/* Intervention Steps */}
      <div style={section}>
        <div style={label}>Intervention Steps</div>
        {(plan.steps ?? []).map((step, si) => (
          <div key={step.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: '#2A3B7C', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {si + 1}
              </div>
              <div style={{ flex: 1, background: '#f7f9fc', border: '1px solid #e4e9f2', borderRadius: 8, padding: '10px 12px' }}>
                {editing
                  ? <input value={step.title} onChange={e => updateStep(si, 'title', e.target.value)} style={{ ...inp({ marginBottom: 8, fontWeight: 600, fontSize: 12, color: '#2A3B7C' }) }} />
                  : <div style={{ fontWeight: 600, fontSize: 12, color: '#2A3B7C', marginBottom: 8 }}>{step.title}</div>
                }
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {step.bullets.map((bullet, bi) => (
                    <li key={bi} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                      {editing
                        ? <input value={bullet} onChange={e => updateBullet(si, bi, e.target.value)} style={{ ...inp({ width: '100%' }) }} />
                        : bullet
                      }
                    </li>
                  ))}
                </ul>
                {editing && (
                  <button
                    onClick={() => updateStep(si, 'bullets', [...step.bullets, ''])}
                    style={{ marginTop: 8, border: 'none', background: 'none', color: '#3E94A5', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    + Add bullet
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addStep}
          style={{ width: '100%', marginTop: 4, padding: '10px', border: '1px dashed #c5cce0', borderRadius: 8, background: 'none', color: '#7a89b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Add step
        </button>
      </div>

      {/* Check-in Schedule */}
      {plan.schedule?.length > 0 && (
        <div style={section}>
          <div style={label}>Check-in Schedule</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e4e9f2' }}>
                {['Date / Week', 'Focus', 'Lead', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10, fontWeight: 700, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(plan.schedule ?? []).map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top', fontWeight: 600, color: '#2A3B7C', whiteSpace: 'nowrap' }}>
                    {editing
                      ? <input value={row.date_week} onChange={e => updateSchedule(ri, 'date_week', e.target.value)} style={{ ...inp({ width: 110, fontSize: 11 }) }} />
                      : row.date_week
                    }
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top', color: '#374151' }}>
                    {editing
                      ? <input value={row.focus} onChange={e => updateSchedule(ri, 'focus', e.target.value)} style={{ ...inp({ fontSize: 11 }) }} />
                      : row.focus
                    }
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top', color: '#374151', whiteSpace: 'nowrap' }}>
                    {editing
                      ? <input value={row.lead} onChange={e => updateSchedule(ri, 'lead', e.target.value)} style={{ ...inp({ width: 110, fontSize: 11 }) }} />
                      : row.lead
                    }
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                    {editing
                      ? (
                        <select value={row.status} onChange={e => updateSchedule(ri, 'status', e.target.value)}
                          style={{ fontSize: 10, padding: '2px 4px', borderRadius: 10, border: 'none', fontFamily: 'inherit', cursor: 'pointer', background: (STATUS_STYLE[row.status] ?? STATUS_STYLE['Upcoming']).bg, color: (STATUS_STYLE[row.status] ?? STATUS_STYLE['Upcoming']).color, outline: 'none' }}>
                          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )
                      : (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: (STATUS_STYLE[row.status] ?? STATUS_STYLE['Upcoming']).bg, color: (STATUS_STYLE[row.status] ?? STATUS_STYLE['Upcoming']).color }}>
                          {row.status}
                        </span>
                      )
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes & Updates */}
      <div style={{ marginBottom: 24 }}>
        <div style={label}>Notes &amp; Updates</div>
        <textarea
          value={plan.notes ?? ''}
          onChange={e => setField('notes', e.target.value)}
          rows={4}
          placeholder="Space for notes and updates…"
          style={{ width: '100%', fontSize: 12, border: '1px solid #e4e9f2', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, outline: 'none', color: '#374151', background: '#fafafa' }}
        />
      </div>

      {/* Save bar */}
      {onSave && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 8, paddingTop: 14, borderTop: '1px solid #f0f2f8' }}>
          {saved ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#15803d' }}>✓ Saved to My Actions</div>
          ) : (
            <>
              <button onClick={onDiscard} style={{ padding: '10px', border: '1px solid #e4e9f2', borderRadius: 10, background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
              <button onClick={() => { onSave(); setSaved(true) }} style={{ padding: '10px', border: 'none', borderRadius: 10, background: '#15803d', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save to my actions</button>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingTop: 8 }}>
        Generated by <strong style={{ color: '#2A3B7C' }}>Edvise</strong> · {dateCreated}
      </div>
    </div>
  )
}
