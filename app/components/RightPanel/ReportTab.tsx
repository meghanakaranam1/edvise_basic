'use client'
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Report } from './types'
import { listArtifacts, deleteArtifact } from '../../lib/db'
import type { ArtifactRow } from '../../lib/db'

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6c3fc5', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7a89b8' }}>Generating report…</div>
    </div>
  )
}

const TEMPLATE_LABEL: Record<string, string> = {
  full_analysis: 'Full Analysis',
  family_letter: 'Family Letter',
}

function TemplateChip({ template }: { template?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, background: '#f0f2f8', color: '#2A3B7C', fontSize: 11, fontWeight: 600 }}>
      {TEMPLATE_LABEL[template ?? 'full_analysis'] ?? 'Full Analysis'}
    </span>
  )
}

export function ReportDetail({ report, date, onClose, onSave, onDiscard }: {
  report: Report; date: string; onClose: () => void
  onSave?: () => void; onDiscard?: () => void
}) {
  const [saved, setSaved] = useState(false)
  function downloadPdf() {
    const sections = report.sections?.map(s => `${s.title}\n\n${s.content}`).join('\n\n---\n\n') ?? ''
    const closing = report.closing_actions?.length
      ? `CLOSING — PRIORITY ACTIONS\n\n${report.closing_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : ''
    const text = [report.title, '', sections, closing].filter(Boolean).join('\n\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    Object.assign(document.createElement('a'), { href: url, download: `${report.title || 'report'}.txt` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Edvise · Student Support Report
        </div>

        {/* Title */}
        <div style={{ fontWeight: 700, fontSize: 15, color: '#2A3B7C', lineHeight: 1.4, marginBottom: 12 }}>
          {report.title}
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f2f8' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Generated</div>
            <div style={{ fontSize: 12, color: '#374151' }}>{date}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Template</div>
            <TemplateChip template={report.template} />
          </div>
        </div>

        {/* Sections */}
        {report.sections?.map((section, i) => (
          <div key={i} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f0f2f8' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
            }}>
              <div style={{ width: 3, height: 18, background: '#2A3B7C', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 10, fontWeight: 800, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {section.title}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.75 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <div style={{ fontWeight: 700, fontSize: 13, color: '#2A3B7C', marginTop: 12, marginBottom: 4 }}>{children}</div>,
                  h2: ({ children }) => <div style={{ fontWeight: 700, fontSize: 12, color: '#2A3B7C', marginTop: 10, marginBottom: 4 }}>{children}</div>,
                  h3: ({ children }) => <div style={{ fontWeight: 600, fontSize: 12, color: '#2A3B7C', marginTop: 8, marginBottom: 4 }}>{children}</div>,
                  p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.65 }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ color: '#1f2937', fontWeight: 700 }}>{children}</strong>,
                }}
              >
                {section.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Closing Priority Actions */}
        {report.closing_actions?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 18, background: '#6c3fc5', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 10, fontWeight: 800, color: '#6c3fc5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Closing — Priority Actions
              </div>
            </div>
            <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.closing_actions.map((action, i) => (
                <li key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.65 }}>{action}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f2f8', fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
          Generated by <strong style={{ color: '#2A3B7C' }}>Edvise</strong>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ paddingTop: 12, borderTop: '1px solid #f0f2f8', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {onSave && (
          saved ? (
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6c3fc5' }}>✓ Saved to My Actions</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <button onClick={() => { onDiscard?.(); onClose() }} style={{ padding: '10px', border: '1px solid #e4e9f2', borderRadius: 10, background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
              <button onClick={() => { onSave(); setSaved(true) }} style={{ padding: '10px', border: 'none', borderRadius: 10, background: '#6c3fc5', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save to my actions</button>
            </div>
          )
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={downloadPdf} style={{ padding: '9px', border: '1px solid #e4e9f2', borderRadius: 8, background: 'white', color: '#2A3B7C', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </button>
          <button onClick={onClose} style={{ padding: '9px', border: 'none', borderRadius: 8, background: '#f0f2f8', color: '#2A3B7C', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function ReportTab({
  data,
  generating,
  onGenerate,
  onSave,
  onDiscard,
  onOpenModal,
}: {
  data?: Report
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
  onOpenModal?: (report: Report, date: string, isNew: boolean) => void
}) {
  const [rows, setRows] = useState<ArtifactRow[]>([])
  const [loading, setLoading] = useState(true)

  function refreshList() {
    listArtifacts('reports').then(r => setRows(r)).catch(() => {})
  }

  useEffect(() => {
    setLoading(true)
    listArtifacts('reports')
      .then(r => setRows(r))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  // When a new report is generated, open modal immediately
  useEffect(() => {
    if (data) {
      const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      if (onOpenModal) {
        onOpenModal(data, date, true)
      }
    }
  }, [data])

  if (generating) return <Loading />

  // List view
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#7a89b8' }}>
          {loading ? 'Loading…' : `${rows.length} report${rows.length !== 1 ? 's' : ''} — click to view`}
        </span>
        <button
          onClick={onGenerate}
          style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: '#2A3B7C', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
            <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          New report
        </button>
      </div>

      {rows.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#7a89b8', fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600, color: '#2A3B7C', marginBottom: 6 }}>No reports yet</div>
          <div style={{ marginBottom: 16, fontSize: 12 }}>Generate a data report from your analysis conversation.</div>
          <button onClick={onGenerate} className="sc-btn primary" style={{ margin: '0 auto' }}>Generate report</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(row => {
            const report = row.data as Report
            const date = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div
                key={row.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #e4e9f2', borderRadius: 10, padding: '12px 14px', background: 'white' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f0f2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#7a89b8" strokeWidth="1.5" width="18" height="18">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2A3B7C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                    {row.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TemplateChip template={report?.template} />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{date}</span>
                  </div>
                </div>
                <button
                  onClick={() => onOpenModal?.(report, new Date(row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), false)}
                  style={{ border: 'none', background: 'none', color: '#2A3B7C', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  View →
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
