'use client'
import { useRef, useState, useEffect } from 'react'
import type { Thresholds } from './Cards/CriteriaSettingCard'
import { describeThresholds } from './Cards/CriteriaSettingCard'

interface Props {
  onSend: (text: string, kbScope: string) => void
  onFileSelect: (file: File) => void
  disabled: boolean
  fileLabel?: string
  onRemoveFile?: () => void
  thresholds?: Thresholds
  onChangeCriteria?: (t: Thresholds) => void
}

type SourceKey = 'student_success' | 'school' | 'general' | 'web'

const SOURCES: { key: SourceKey; label: string; activeStyle: React.CSSProperties; inactiveStyle: React.CSSProperties }[] = [
  {
    key: 'student_success',
    label: '● Student success KB',
    activeStyle: { background: '#edf6f8', color: '#1b6070', borderColor: '#b8dde6' },
    inactiveStyle: { background: '#f4f4f4', color: '#999', borderColor: '#ddd' },
  },
  {
    key: 'school',
    label: '🏫 School-based',
    activeStyle: { background: '#eef0f9', color: '#2A3B7C', borderColor: '#d4d9ee' },
    inactiveStyle: { background: '#f4f4f4', color: '#999', borderColor: '#ddd' },
  },
  {
    key: 'general',
    label: '◎ General knowledge',
    activeStyle: { background: '#f0f3fa', color: '#2A3B7C', borderColor: '#c9d2ea' },
    inactiveStyle: { background: '#f4f4f4', color: '#999', borderColor: '#ddd' },
  },
  {
    key: 'web',
    label: '🌐 Web search',
    activeStyle: { background: '#fdf3e1', color: '#7a5c10', borderColor: '#f0d898' },
    inactiveStyle: { background: '#f4f4f4', color: '#999', borderColor: '#ddd' },
  },
]

const chipBase: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 20, border: '1px solid',
  fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.12s',
}

const sel: React.CSSProperties = {
  border: '1px solid #d4dff7', borderRadius: 8, padding: '5px 8px',
  fontSize: 12, color: '#2A3B7C', background: '#fff', fontFamily: 'inherit',
}

const rowSt: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '9px 0', borderBottom: '1px solid #eef2f8',
}

function dot(color: string): React.CSSProperties {
  return { width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }
}

export default function MessageInput({
  onSend, onFileSelect, disabled, fileLabel, onRemoveFile,
  thresholds, onChangeCriteria,
}: Props) {
  const [text, setText] = useState('')
  const [activeKB, setActiveKB] = useState<SourceKey[]>(['student_success', 'general'])
  const [showCriteria, setShowCriteria] = useState(false)
  const [editT, setEditT] = useState<Thresholds>({})
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sync edit state when popover opens
  function openCriteria() {
    setEditT(thresholds ? { ...thresholds } : {})
    setShowCriteria(true)
  }

  // Close popover on outside click
  useEffect(() => {
    if (!showCriteria) return
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowCriteria(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showCriteria])

  function toggleSource(key: SourceKey) {
    setActiveKB(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function getKbScope(): string {
    const order: SourceKey[] = ['student_success', 'school', 'general', 'web']
    const selected = order.filter(k => activeKB.includes(k))
    return selected.join(',') || 'general'
  }

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, getKbScope())
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  function applyChanges() {
    if (onChangeCriteria) onChangeCriteria(editT)
    setShowCriteria(false)
  }

  // Infer which rows to show from current thresholds
  const hasAbsencePct = editT.absencePct != null
  const hasAbsenceDays = editT.absenceDays != null
  const hasSuspension = editT.suspensionMin != null
  const hasFailGrade = editT.failingGrade != null
  const hasFailCount = editT.failingCount != null

  return (
    <div className="input-wrap" style={{ position: 'relative' }}>

      {/* Criteria popover */}
      {showCriteria && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            background: '#fff', border: '1px solid #d4dff7', borderRadius: 12,
            boxShadow: '0 4px 20px rgba(42,59,124,0.12)', padding: '14px 16px',
            zIndex: 200, minWidth: 340, maxWidth: 440,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C', marginBottom: 10 }}>
            Adjust risk criteria
          </div>

          {hasAbsencePct && (
            <div style={rowSt}>
              <div style={{ fontSize: 12, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={dot('#3E94A5')} /> Chronic absence
              </div>
              <select style={sel} value={editT.absencePct} onChange={e => setEditT(p => ({ ...p, absencePct: Number(e.target.value) }))}>
                {[5, 10, 15, 20].map(v => <option key={v} value={v}>≥{v}% days missed</option>)}
              </select>
            </div>
          )}

          {hasAbsenceDays && (
            <div style={rowSt}>
              <div style={{ fontSize: 12, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={dot('#3E94A5')} /> Chronic absence
              </div>
              <select style={sel} value={editT.absenceDays} onChange={e => setEditT(p => ({ ...p, absenceDays: Number(e.target.value) }))}>
                {[5, 10, 15, 20, 25].map(v => <option key={v} value={v}>≥{v} days absent</option>)}
              </select>
            </div>
          )}

          {hasSuspension && (
            <div style={rowSt}>
              <div style={{ fontSize: 12, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={dot('#B45309')} /> Suspension
              </div>
              <select style={sel} value={editT.suspensionMin} onChange={e => setEditT(p => ({ ...p, suspensionMin: Number(e.target.value) }))}>
                {[1, 2, 3].map(v => <option key={v} value={v}>≥{v} suspension{v > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          )}

          {hasFailGrade && (
            <div style={{ ...rowSt, borderBottom: 'none' }}>
              <div style={{ fontSize: 12, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={dot('#c53030')} /> Academic failure
              </div>
              <select style={sel} value={editT.failingGrade} onChange={e => setEditT(p => ({ ...p, failingGrade: Number(e.target.value) }))}>
                {[50, 60, 65, 70].map(v => <option key={v} value={v}>grade below {v}</option>)}
              </select>
            </div>
          )}

          {hasFailCount && (
            <div style={{ ...rowSt, borderBottom: 'none' }}>
              <div style={{ fontSize: 12, color: '#2A3B7C', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={dot('#c53030')} /> Academic failure
              </div>
              <select style={sel} value={editT.failingCount} onChange={e => setEditT(p => ({ ...p, failingCount: Number(e.target.value) }))}>
                {[1, 2, 3].map(v => <option key={v} value={v}>≥{v} failed course{v > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setShowCriteria(false)} style={{ fontSize: 12, color: '#7a89b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              Cancel
            </button>
            <button type="button" onClick={applyChanges} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#3E94A5', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '6px 14px' }}>
              Apply
            </button>
          </div>
        </div>
      )}

      {/* File chip + criteria chip row */}
      {fileLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <div className="file-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="#3E94A5" strokeWidth="2" width="13" height="13">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {fileLabel}
            {onRemoveFile && (
              <button type="button" onClick={onRemoveFile} title="Remove file">✕</button>
            )}
          </div>

          {thresholds && onChangeCriteria && (
            <button
              type="button"
              onClick={openCriteria}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: '#3E94A5', background: '#edf6f8',
                border: '1px solid #b8dde6', borderRadius: 20,
                padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {describeThresholds(thresholds)}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Source chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#7a89b8' }}>Searching</span>
        {SOURCES.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggleSource(s.key)}
            style={{ ...chipBase, ...(activeKB.includes(s.key) ? s.activeStyle : s.inactiveStyle) }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="input-box">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={fileLabel ? 'Ask about your students…' : 'Upload a CSV or ask a question…'}
          rows={1}
        />
        <div className="input-actions">
          <button
            type="button"
            className="icon-btn"
            title="Upload gradebook CSV"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
          <button
            type="button"
            className="send-btn"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="input-hint">EdVise supports educators — always apply your professional judgment.</div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) onFileSelect(e.target.files[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
