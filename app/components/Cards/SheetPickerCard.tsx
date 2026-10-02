'use client'
import { useState } from 'react'
import type { SheetSummary } from '../../lib/sheetMerge'

interface Props {
  filename: string
  sheets: SheetSummary[]
  onConfirm: (idxs: number[]) => void
}

function defaultChecked(sheets: SheetSummary[]): Record<number, boolean> {
  let best = 0
  let bestCols = -1
  sheets.forEach((s, i) => {
    if (!s.isEventLevel && s.colCount > bestCols) { bestCols = s.colCount; best = i }
  })
  return { [best]: true }
}

export default function SheetPickerCard({ filename, sheets, onConfirm }: Props) {
  const [checked, setChecked] = useState<Record<number, boolean>>(() => defaultChecked(sheets))
  const [confirmed, setConfirmed] = useState(false)

  function toggle(i: number) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const checkedIdxs = sheets.map((_, i) => i).filter(i => checked[i])

  function handleConfirm() {
    if (!checkedIdxs.length) return
    setConfirmed(true)
    onConfirm(checkedIdxs)
  }

  if (confirmed) {
    return (
      <div style={{ border: '1px solid #e4e9f2', borderRadius: 10, padding: '10px 14px', background: '#f7f9fc', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: '#2A3B7C', fontSize: 11 }}>
          ✓ Including {checkedIdxs.length} sheet{checkedIdxs.length > 1 ? 's' : ''}: {checkedIdxs.map(i => sheets[i].name).join(', ')}
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
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640,
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2A3B7C' }}>{filename}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {sheets.length} sheets detected. Check which ones to include — Edvise can reference all of them directly, nothing gets merged.
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 24px' }}>
          {sheets.map((s, i) => (
            <div
              key={s.name}
              onClick={() => toggle(i)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px',
                borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: checked[i] ? '#e8f4f6' : 'transparent',
                border: checked[i] ? '1px solid #7ac4d0' : '1px solid transparent',
              }}
            >
              <input
                type="checkbox"
                checked={!!checked[i]}
                onChange={() => toggle(i)}
                onClick={e => e.stopPropagation()}
                style={{ marginTop: 3, flexShrink: 0, width: 15, height: 15, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: checked[i] ? '#3E94A5' : '#2A3B7C' }}>{s.name}</span>
                  {s.isEventLevel && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#fdf4e3', color: '#9a6b10', border: '1px solid #f0c060' }}>
                      Event log
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#8a9bb8' }}>{s.rowCount.toLocaleString()} rows / {s.colCount} cols</span>
                </div>
                <div style={{ fontSize: 11, color: '#8a9bb8', marginTop: 2 }}>
                  {s.idColumn
                    ? s.keyKind === 'id' ? `ID column: ${s.idColumn}` : `Matched by name: ${s.idColumn}`
                    : 'No student ID or name column detected'}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {checkedIdxs.length === 0
              ? 'Select at least one sheet to continue.'
              : `${checkedIdxs.length} of ${sheets.length} sheets selected`}
          </div>
          <button type="button" className="sc-btn primary" onClick={handleConfirm} disabled={checkedIdxs.length === 0}>
            Confirm and continue →
          </button>
        </div>
      </div>
    </div>
  )
}
