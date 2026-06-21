'use client'
import { useState } from 'react'

function titleCase(s: string) {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface Props {
  data: { columns: string[]; filename: string; rows: number; preview: Record<string, string>[]; suggestedLabels?: Record<string, string> }
  onConfirm: (mapping: Record<string, string>) => void
}

export default function DataConfirmCard({ data, onConfirm }: Props) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(data.columns.map((c) => [c, true]))
  )
  const [labels, setLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(data.columns.map((c) => [c, data.suggestedLabels?.[c] ?? titleCase(c)]))
  )
  const [confirmed, setConfirmed] = useState(false)

  function toggle(col: string) {
    setEnabled((prev) => ({ ...prev, [col]: !prev[col] }))
  }

  function handleConfirm() {
    setConfirmed(true)
    const mapping: Record<string, string> = {}
    data.columns.filter((c) => enabled[c]).forEach((c) => { mapping[c] = labels[c] || c })
    onConfirm(mapping)
  }

  if (confirmed) {
    const included = data.columns.filter((c) => enabled[c])
    return (
      <div style={{ border: '1px solid #e4e9f2', borderRadius: 10, padding: '10px 14px', background: '#f7f9fc', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: '#2A3B7C', fontSize: 11 }}>
          ✓ {data.filename} confirmed — {data.rows} students, {included.length} columns mapped
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {included.map((c) => (
            <span key={c} style={{ fontSize: 10, background: '#edf6f8', color: '#1b6070', border: '1px solid #b8dde6', borderRadius: 4, padding: '1px 6px' }}>
              {labels[c] || c}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(20, 28, 58, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680,
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A3B7C' }}>
            {data.filename}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {data.rows} students · {data.columns.length} columns detected — edit labels or toggle off columns to exclude
          </div>
        </div>

        {/* Column header */}
        <div style={{
          padding: '8px 24px', display: 'grid', gridTemplateColumns: '140px 1fr 52px',
          gap: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span>Raw column</span>
          <span>Label (editable)</span>
          <span style={{ textAlign: 'center' }}>Include</span>
        </div>

        {/* Scrollable column list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 24px' }}>
          {data.columns.map((col) => (
            <div
              key={col}
              style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 52px',
                alignItems: 'center', gap: 10, padding: '6px 0',
                borderBottom: '1px solid #f5f7fc',
                opacity: enabled[col] ? 1 : 0.38,
              }}
            >
              <span style={{
                fontFamily: 'monospace', fontSize: 11, color: 'var(--text)',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 7px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {col}
              </span>
              <input
                type="text"
                value={labels[col] ?? ''}
                onChange={(e) => setLabels((prev) => ({ ...prev, [col]: e.target.value }))}
                disabled={!enabled[col]}
                style={{
                  fontSize: 12, padding: '4px 9px',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'inherit', color: 'var(--text)',
                  background: enabled[col] ? 'var(--surface)' : 'var(--bg)',
                  outline: 'none', width: '100%',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => toggle(col)}
                  style={{
                    width: 32, height: 18, borderRadius: 9, border: 'none',
                    background: enabled[col] ? '#3E94A5' : '#d0d5e8',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: enabled[col] ? 16 : 2,
                    width: 14, height: 14, borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button type="button" className="sc-btn primary" onClick={handleConfirm}>
            Confirm & continue →
          </button>
        </div>
      </div>
    </div>
  )
}
