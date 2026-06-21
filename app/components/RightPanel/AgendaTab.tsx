'use client'
import { useState, useEffect } from 'react'
import type { Agenda } from './types'

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3E94A5', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7a89b8' }}>Generating agenda…</div>
    </div>
  )
}

export default function AgendaTab({
  data,
  generating,
  onGenerate,
}: {
  data?: Agenda
  generating: boolean
  onGenerate: () => void
}) {
  const [agenda, setAgenda] = useState<Agenda | undefined>(data)
  const [editing, setEditing] = useState(false)

  useEffect(() => { setAgenda(data); setEditing(false) }, [data])

  if (generating) return <Loading />

  if (!agenda) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: '#7a89b8', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
        <div style={{ fontWeight: 600, color: '#2A3B7C', marginBottom: 6 }}>No agenda yet</div>
        <div style={{ marginBottom: 16, fontSize: 12 }}>Generate a meeting agenda based on your analysis.</div>
        <button onClick={onGenerate} className="sc-btn primary" style={{ margin: '0 auto' }}>Generate agenda</button>
      </div>
    )
  }

  function field(key: keyof Agenda, value: string | number) {
    setAgenda(p => p ? { ...p, [key]: value } : p)
  }

  function updateItem(i: number, k: string, v: string | number) {
    setAgenda(p => {
      if (!p) return p
      const items = [...p.items]
      items[i] = { ...items[i], [k]: v }
      return { ...p, items }
    })
  }

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    border: '1px solid #e4e9f2', borderRadius: 6, padding: '4px 8px',
    fontSize: 12, fontFamily: 'inherit', outline: 'none', ...style,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => setEditing(e => !e)} style={{ padding: '4px 10px', border: '1px solid #e4e9f2', borderRadius: 7, background: editing ? '#edf6f8' : 'white', color: editing ? '#1b6070' : '#7a89b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="rp-label">Meeting</div>
      {editing
        ? <input value={agenda.title} onChange={e => field('title', e.target.value)} style={{ ...inp(), width: '100%', fontWeight: 600, fontSize: 14, marginBottom: 6 }} />
        : <div style={{ fontWeight: 600, color: '#2A3B7C', fontSize: 14, marginBottom: 4 }}>{agenda.title}</div>
      }
      <div style={{ fontSize: 11, color: '#7a89b8', marginBottom: 12 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={agenda.date_suggestion} onChange={e => field('date_suggestion', e.target.value)} placeholder="Date" style={inp({ width: 130 })} />
            <input value={agenda.duration_minutes} onChange={e => field('duration_minutes', Number(e.target.value))} placeholder="Min" style={inp({ width: 60 })} />
            <input value={agenda.location} onChange={e => field('location', e.target.value)} placeholder="Location" style={inp({ width: 140 })} />
          </div>
        ) : (
          [agenda.date_suggestion, agenda.duration_minutes && `${agenda.duration_minutes} min`, agenda.location].filter(Boolean).join(' · ')
        )}
      </div>

      {agenda.purpose && (
        <>
          <div className="rp-label">Purpose</div>
          {editing
            ? <textarea value={agenda.purpose} onChange={e => field('purpose', e.target.value)} rows={2} style={{ ...inp(), width: '100%', resize: 'vertical', marginBottom: 12, lineHeight: 1.5 }} />
            : <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 12 }}>{agenda.purpose}</div>
          }
        </>
      )}

      {agenda.attendees_placeholder?.length > 0 && (
        <>
          <div className="rp-label">Attendees</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {agenda.attendees_placeholder.map((a, i) => (
              <span key={i} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: '#edf6f8', color: '#1b6070', border: '1px solid #b8dde6' }}>{a}</span>
            ))}
          </div>
        </>
      )}

      {agenda.items?.length > 0 && (
        <>
          <div className="rp-label">Agenda Items</div>
          {agenda.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 36px', gap: 8, padding: '10px 0', borderBottom: '1px solid #f0f2f8' }}>
              {editing
                ? <input value={item.time} onChange={e => updateItem(i, 'time', e.target.value)} style={inp({ width: '100%', fontSize: 11 })} />
                : <div style={{ fontSize: 11, color: '#7a89b8', paddingTop: 1 }}>{item.time}</div>
              }
              <div>
                {editing ? (
                  <>
                    <input value={item.title} onChange={e => updateItem(i, 'title', e.target.value)} style={{ ...inp(), width: '100%', fontWeight: 600, marginBottom: 4 }} />
                    <input value={item.detail ?? ''} onChange={e => updateItem(i, 'detail', e.target.value)} placeholder="Detail" style={{ ...inp(), width: '100%', color: '#7a89b8', marginBottom: 4 }} />
                    <input value={item.lead ?? ''} onChange={e => updateItem(i, 'lead', e.target.value)} placeholder="Lead" style={{ ...inp(), width: '100%', fontSize: 11 }} />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C' }}>{item.title}</div>
                    {item.detail && <div style={{ fontSize: 11, color: '#7a89b8', marginTop: 2 }}>{item.detail}</div>}
                    {item.lead && <div style={{ fontSize: 11, color: '#7a89b8' }}>Lead: {item.lead}</div>}
                  </>
                )}
              </div>
              {editing
                ? <input value={item.duration_min} onChange={e => updateItem(i, 'duration_min', Number(e.target.value))} style={{ ...inp({ width: '100%', fontSize: 11, textAlign: 'center' }) }} />
                : <div style={{ fontSize: 11, color: '#7a89b8', textAlign: 'right' }}>{item.duration_min}m</div>
              }
            </div>
          ))}
        </>
      )}
    </div>
  )
}
