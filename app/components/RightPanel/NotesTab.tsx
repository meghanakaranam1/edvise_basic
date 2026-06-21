'use client'
import { useState } from 'react'
import type { Note, ArtifactType } from './types'

const ACTION_BTNS: { type: ArtifactType; icon: string; label: string; color: string; border: string; bg: string }[] = [
  { type: 'action_plan', icon: '📋', label: 'Action Plan', color: '#15803d', border: '#10B98133', bg: '#f0fdf4' },
  { type: 'agenda',      icon: '📅', label: 'Agenda',      color: '#1b6070', border: '#3E94A533', bg: '#f0f8fb' },
]

export default function NotesTab({
  notes,
  onDelete,
  onGenerate,
  generating,
}: {
  notes: Note[]
  onDelete: (id: string) => void
  onGenerate: (type: ArtifactType) => void
  generating: string | null
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setOpen(p => ({ ...p, [id]: !p[id] }))
  }

  return (
    <div>
      {/* Quick action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {ACTION_BTNS.map(btn => (
          <button
            key={btn.type}
            onClick={() => onGenerate(btn.type)}
            disabled={!!generating}
            style={{
              padding: '8px 10px', border: `1px solid ${btn.border}`, background: btn.bg,
              borderRadius: 8, cursor: generating ? 'default' : 'pointer', fontSize: 12,
              fontWeight: 500, color: btn.color, display: 'flex', alignItems: 'center',
              gap: 6, fontFamily: 'inherit', opacity: generating ? 0.6 : 1,
            }}
          >
            {generating === btn.type ? '…' : btn.icon} {btn.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => onGenerate('report')}
        disabled={!!generating}
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid #6c3fc533', background: '#faf5ff',
          borderRadius: 8, cursor: generating ? 'default' : 'pointer', fontSize: 12, fontWeight: 500,
          color: '#6c3fc5', display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', marginBottom: 16, opacity: generating ? 0.6 : 1,
        }}
      >
        {generating === 'report' ? '…' : '✨'} Generate Report
      </button>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#7a89b8', fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          No notes yet. Click &quot;Save to notes&quot; on any message.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#7a89b8', marginBottom: 8 }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''} — click to expand
          </div>
          {notes.map(note => (
            <div key={note.id} style={{ border: '1px solid #e4e9f2', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
              <div
                onClick={() => toggle(note.id)}
                style={{
                  padding: '8px 12px', background: '#f7f9fc', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 500, color: '#2A3B7C', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {note.content.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 55)}…
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(note.id) }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7a89b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                  >
                    ×
                  </button>
                  <span style={{ fontSize: 11, color: '#7a89b8' }}>{open[note.id] ? '∧' : '∨'}</span>
                </div>
              </div>
              {open[note.id] && (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#374151', lineHeight: 1.65, borderTop: '1px solid #e4e9f2', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {note.content.replace(/<!--[\s\S]*?-->/g, '').trim()}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
