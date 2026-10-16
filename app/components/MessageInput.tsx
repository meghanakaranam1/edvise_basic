'use client'
import { useRef, useState, useEffect } from 'react'
import type { Thresholds } from './Cards/CriteriaSettingCard'
import { describeThresholds, CriteriaFields } from './Cards/CriteriaSettingCard'
import type { Indicators } from '../lib/columnClassifier'
import type { PeriodDetectionResult } from '../lib/periodDetection'

export type SourceKey = 'student_success' | 'school' | 'general' | 'web'

interface Props {
  onSend: (text: string, kbScope: string) => void
  onFileSelect: (file: File) => void
  disabled: boolean
  fileLabel?: string
  onRemoveFile?: () => void
  thresholds?: Thresholds
  onChangeCriteria?: (t: Thresholds) => void
  indicators?: Indicators
  // Only set when the uploaded data had period-tagged columns (e.g.
  // attq1..attq4) — see lib/periodDetection.ts. When present, a "Time
  // period" chip appears next to the risk-criteria one, letting the
  // teacher change their earlier period_picker choice at any point —
  // every analysis stage re-derives from whichever signals are active, so
  // changing it here applies everywhere, not just the next message.
  periodDetection?: PeriodDetectionResult | null
  periodSelection?: 'all' | string[]
  onChangePeriods?: (selection: 'all' | string[]) => void
  columnUniques?: Record<string, string[]>
  columnMapping?: Record<string, string>
  csvPreview?: { columns: string[]; rows: Record<string, string>[] }
  activeKB: SourceKey[]
  onToggleSource: (key: SourceKey) => void
  pdfFiles?: { name: string; fileId: string }[]
  pdfUploading?: boolean
  onPdfSelect?: (file: File) => void
  onRemovePdf?: (fileId: string) => void
  focusTrigger?: number
  onGoogleSheetImport?: () => void
  sheetImporting?: boolean
  isShared?: boolean
  onSendPlain?: (text: string) => void
}

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

// Matches an "@Edvise" mention anywhere in the text (Slack-style addressing).
// Case-insensitive; requires a word boundary so "@Edviser" etc. doesn't match.
const EDVISE_MENTION = /@edvise\b/i

function parseEdviseMention(text: string): { mentionsEdvise: boolean; cleaned: string } {
  if (!EDVISE_MENTION.test(text)) return { mentionsEdvise: false, cleaned: text }
  return { mentionsEdvise: true, cleaned: text.replace(EDVISE_MENTION, '').replace(/\s+/g, ' ').trim() }
}

export default function MessageInput({
  onSend, onFileSelect, disabled, fileLabel, onRemoveFile,
  thresholds, onChangeCriteria, indicators, periodDetection, periodSelection, onChangePeriods, columnUniques, columnMapping, csvPreview,
  activeKB, onToggleSource,
  pdfFiles, pdfUploading, onPdfSelect, onRemovePdf,
  focusTrigger,
  onGoogleSheetImport, sheetImporting,
  isShared, onSendPlain,
}: Props) {
  const [text, setText] = useState('')
  const [showCriteria, setShowCriteria] = useState(false)
  const [showPeriods, setShowPeriods] = useState(false)
  const [showCsvPreview, setShowCsvPreview] = useState(false)
  const [editT, setEditT] = useState<Thresholds>([])
  const [editPeriods, setEditPeriods] = useState<'all' | string[]>('all')
  const addressedToEdvise = EDVISE_MENTION.test(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const periodPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusTrigger) textareaRef.current?.focus()
  }, [focusTrigger])

  // Sync edit state when popover opens
  function openCriteria() {
    setEditT(thresholds ? [...thresholds] : [])
    setShowCriteria(true)
  }

  function openPeriods() {
    setEditPeriods(periodSelection ?? 'all')
    setShowPeriods(true)
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

  useEffect(() => {
    if (!showPeriods) return
    function handle(e: MouseEvent) {
      if (periodPanelRef.current && !periodPanelRef.current.contains(e.target as Node)) {
        setShowPeriods(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showPeriods])

  function getKbScope(): string {
    const order: SourceKey[] = ['student_success', 'school', 'general', 'web']
    return order.filter(k => activeKB.includes(k)).join(',')
  }

  function clearInput() {
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    // In a shared conversation, an inline "@Edvise" mention is how you address
    // Edvise directly — anything else just posts to the team. Outside a shared
    // conversation there's no team to post to, so it always goes to Edvise.
    if (isShared && onSendPlain) {
      const { mentionsEdvise, cleaned } = parseEdviseMention(trimmed)
      if (!mentionsEdvise) {
        onSendPlain(trimmed)
        clearInput()
        return
      }
      onSend(cleaned || trimmed, getKbScope())
      clearInput()
      return
    }
    onSend(trimmed, getKbScope())
    clearInput()
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

  function applyPeriods() {
    if (onChangePeriods) onChangePeriods(editPeriods)
    setShowPeriods(false)
  }

  function togglePeriod(p: string) {
    setEditPeriods(prev => {
      const cur = prev === 'all' ? [] : prev
      const next = cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]
      return next
    })
  }

  function periodSummary(selection: 'all' | string[]): string {
    if (selection === 'all') return 'All periods'
    return selection.length ? selection.join(', ') : 'No periods selected'
  }

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

          <CriteriaFields indicators={indicators} columnUniques={columnUniques} columnMapping={columnMapping} value={editT} onChange={setEditT} />

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

      {/* Time period popover */}
      {showPeriods && periodDetection && (
        <div
          ref={periodPanelRef}
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            background: '#fff', border: '1px solid #d4dff7', borderRadius: 12,
            boxShadow: '0 4px 20px rgba(42,59,124,0.12)', padding: '14px 16px',
            zIndex: 200, minWidth: 300, maxWidth: 420,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C', marginBottom: 10 }}>
            Time period
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <label
              onClick={() => setEditPeriods('all')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${editPeriods === 'all' ? '#3E94A5' : '#e5e7eb'}`,
                background: editPeriods === 'all' ? '#eef7f9' : '#f9fafb',
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${editPeriods === 'all' ? '#3E94A5' : '#d1d5db'}`,
                background: editPeriods === 'all' ? '#3E94A5' : 'transparent',
              }} />
              <span style={{ fontSize: 12.5, color: editPeriods === 'all' ? '#1b6070' : '#374151' }}>All periods combined</span>
            </label>
            <label
              onClick={() => setEditPeriods(prev => prev === 'all' ? [] : prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${editPeriods !== 'all' ? '#3E94A5' : '#e5e7eb'}`,
                background: editPeriods !== 'all' ? '#eef7f9' : '#f9fafb',
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${editPeriods !== 'all' ? '#3E94A5' : '#d1d5db'}`,
                background: editPeriods !== 'all' ? '#3E94A5' : 'transparent',
              }} />
              <span style={{ fontSize: 12.5, color: editPeriods !== 'all' ? '#1b6070' : '#374151' }}>Choose specific periods</span>
            </label>
          </div>

          {editPeriods !== 'all' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 22, marginBottom: 10 }}>
              {periodDetection.allPeriods.map(p => {
                const checked = editPeriods.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePeriod(p)}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${checked ? '#3E94A5' : '#e4e9f2'}`,
                      background: checked ? '#eef8fb' : '#f7f9fc',
                      color: checked ? '#1b6070' : '#7a89b8',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setShowPeriods(false)} style={{ fontSize: 12, color: '#7a89b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={applyPeriods}
              disabled={editPeriods !== 'all' && editPeriods.length === 0}
              style={{
                fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px',
                cursor: (editPeriods !== 'all' && editPeriods.length === 0) ? 'not-allowed' : 'pointer',
                background: (editPeriods !== 'all' && editPeriods.length === 0) ? '#c5cce0' : '#3E94A5',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* CSV preview modal */}
      {showCsvPreview && csvPreview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowCsvPreview(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(42,59,124,0.18)', width: '100%', maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e4e9f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#3E94A5" strokeWidth="2" width="15" height="15">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2A3B7C' }}>{fileLabel}</span>
                <span style={{ fontSize: 11, color: '#7a89b8' }}>— first {csvPreview.rows.length} rows of {csvPreview.columns.length} columns</span>
              </div>
              <button type="button" onClick={() => setShowCsvPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a89b8', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', minWidth: 'max-content' }}>
                <thead>
                  <tr style={{ background: '#f7f9fc' }}>
                    {csvPreview.columns.map(col => (
                      <th key={col} style={{ padding: '8px 12px', textAlign: 'left', color: '#2A3B7C', fontWeight: 600, borderBottom: '1px solid #e4e9f2', whiteSpace: 'nowrap' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f3fa', background: i % 2 === 0 ? '#fff' : '#fafbfe' }}>
                      {csvPreview.columns.map(col => (
                        <td key={col} style={{ padding: '7px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{row[col] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* File chip + PDF chips + criteria chip row */}
      {(fileLabel || (pdfFiles && pdfFiles.length > 0) || pdfUploading) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {fileLabel && (
            <div className="file-chip" style={{ cursor: csvPreview ? 'pointer' : 'default' }} onClick={() => csvPreview && setShowCsvPreview(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#3E94A5" strokeWidth="2" width="13" height="13">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {fileLabel}
              {onRemoveFile && (
                <button type="button" onClick={e => { e.stopPropagation(); onRemoveFile() }} title="Remove file">✕</button>
              )}
            </div>
          )}

          {pdfFiles?.map(f => (
            <div key={f.fileId} className="file-chip" style={{ background: '#faf5ff', borderColor: '#d8b4fe' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" width="13" height="13">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span style={{ color: '#5b21b6', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {onRemovePdf && (
                <button type="button" onClick={() => onRemovePdf(f.fileId)} title="Remove PDF">✕</button>
              )}
            </div>
          ))}

          {pdfUploading && (
            <div className="file-chip" style={{ background: '#faf5ff', borderColor: '#d8b4fe', color: '#7c3aed' }}>
              <div style={{ width: 10, height: 10, border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              Uploading…
            </div>
          )}

          {fileLabel && thresholds && onChangeCriteria && (
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

          {fileLabel && periodDetection && onChangePeriods && (
            <button
              type="button"
              onClick={openPeriods}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: '#7c3aed', background: '#faf5ff',
                border: '1px solid #d8b4fe', borderRadius: 20,
                padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Time period: {periodSummary(periodSelection ?? 'all')}
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
            onClick={() => onToggleSource(s.key)}
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
          placeholder={fileLabel ? 'Ask about your students…' : 'Upload a CSV/Excel file or ask a question…'}
          rows={1}
        />
        <div className="input-actions">
          <button
            type="button"
            className="icon-btn"
            title="Upload gradebook (CSV or Excel)"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
          {onGoogleSheetImport && (
            <button
              type="button"
              className="icon-btn"
              title="Import from Google Sheets"
              onClick={onGoogleSheetImport}
              disabled={disabled || sheetImporting}
              style={{ color: '#0f9d58' }}
            >
              {sheetImporting ? (
                <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
              )}
            </button>
          )}
          {onPdfSelect && (
            <button
              type="button"
              className="icon-btn"
              title="Upload PDF document"
              onClick={() => pdfInputRef.current?.click()}
              disabled={disabled || pdfUploading}
              style={{ color: '#7c3aed' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </button>
          )}
          <button
            type="button"
            className="send-btn"
            title={isShared && onSendPlain ? (addressedToEdvise ? 'Ask Edvise' : 'Send to your team') : undefined}
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            style={isShared && onSendPlain && addressedToEdvise ? { background: '#3E94A5' } : undefined}
          >
            {isShared && onSendPlain && addressedToEdvise ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a4 4 0 0 1 4 4v1a5 5 0 0 1 3 4.58V15a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5v-3.42A5 5 0 0 1 8 7V6a4 4 0 0 1 4-4z"/>
                <circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>
      {isShared && onSendPlain && (
        <div className="input-hint" style={{ marginTop: -4 }}>
          {addressedToEdvise ? (
            <span style={{ color: '#3E94A5', fontWeight: 600 }}>→ Asking Edvise</span>
          ) : (
            <>Type <strong>@Edvise</strong> to ask Edvise directly · otherwise your message goes to your team</>
          )}
        </div>
      )}
      <div className="input-hint">EdVise supports educators — always apply your professional judgment.</div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) onFileSelect(e.target.files[0])
          e.target.value = ''
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach(f => onPdfSelect?.(f))
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
