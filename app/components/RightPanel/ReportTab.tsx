'use client'
import { useState, useEffect } from 'react'
import type { Report } from './types'

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3E94A5', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7a89b8' }}>Generating report…</div>
    </div>
  )
}

function BulletList({ items, editing, onChange }: { items: string[]; editing: boolean; onChange: (v: string[]) => void }) {
  if (!editing) {
    return (
      <ul style={{ paddingLeft: 16, margin: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, marginBottom: 4 }}>{item}</li>
        ))}
      </ul>
    )
  }
  return (
    <textarea
      value={items.join('\n')}
      onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
      rows={items.length + 1}
      style={{ width: '100%', fontSize: 12, border: '1px solid #e4e9f2', borderRadius: 7, padding: '8px 10px', fontFamily: 'Inter, sans-serif', resize: 'vertical', lineHeight: 1.6, outline: 'none' }}
    />
  )
}

export default function ReportTab({
  data,
  generating,
  onGenerate,
}: {
  data?: Report
  generating: boolean
  onGenerate: () => void
}) {
  const [report, setReport] = useState<Report | undefined>(data)
  const [editing, setEditing] = useState(false)

  useEffect(() => { setReport(data); setEditing(false) }, [data])

  if (generating) return <Loading />

  if (!report) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: '#7a89b8', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontWeight: 600, color: '#2A3B7C', marginBottom: 6 }}>No report yet</div>
        <div style={{ marginBottom: 16, fontSize: 12 }}>Generate a data report from your analysis conversation.</div>
        <button onClick={onGenerate} className="sc-btn primary" style={{ margin: '0 auto' }}>Generate report</button>
      </div>
    )
  }

  function field<K extends keyof Report>(key: K, value: Report[K]) {
    setReport(p => p ? { ...p, [key]: value } : p)
  }

  function downloadReport() {
    const text = [
      report!.title,
      '',
      'SUMMARY',
      report!.summary,
      '',
      'KEY FINDINGS',
      ...(report!.key_findings ?? []).map(f => `• ${f}`),
      '',
      'RECOMMENDATIONS',
      ...(report!.recommendations ?? []).map(r => `• ${r}`),
      '',
      'NEXT STEPS',
      ...(report!.next_steps ?? []).map(s => `• ${s}`),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    Object.assign(document.createElement('a'), { href: url, download: `${report!.title || 'report'}.txt` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => setEditing(e => !e)} style={{ padding: '4px 10px', border: '1px solid #e4e9f2', borderRadius: 7, background: editing ? '#edf6f8' : 'white', color: editing ? '#1b6070' : '#7a89b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button onClick={downloadReport} style={{ padding: '4px 10px', border: '1px solid #e4e9f2', borderRadius: 7, background: 'white', color: '#7a89b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </button>
      </div>

      {/* Title */}
      {editing
        ? <input value={report.title} onChange={e => field('title', e.target.value)} style={{ width: '100%', fontWeight: 600, fontSize: 14, color: '#2A3B7C', border: '1px solid #e4e9f2', borderRadius: 7, padding: '6px 10px', fontFamily: 'inherit', marginBottom: 12, outline: 'none' }} />
        : <div style={{ fontWeight: 700, color: '#2A3B7C', fontSize: 14, marginBottom: 12 }}>{report.title}</div>
      }

      {/* Summary */}
      <div className="rp-label">Summary</div>
      {editing
        ? <textarea value={report.summary} onChange={e => field('summary', e.target.value)} rows={3} style={{ width: '100%', fontSize: 12, border: '1px solid #e4e9f2', borderRadius: 7, padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, marginBottom: 12, outline: 'none' }} />
        : <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, marginBottom: 12 }}>{report.summary}</div>
      }

      {/* Key Findings */}
      {(report.key_findings?.length > 0 || editing) && (
        <>
          <div className="rp-label">Key Findings</div>
          <div style={{ marginBottom: 12 }}>
            <BulletList items={report.key_findings ?? []} editing={editing} onChange={v => field('key_findings', v)} />
          </div>
        </>
      )}

      {/* Recommendations */}
      {(report.recommendations?.length > 0 || editing) && (
        <>
          <div className="rp-label">Recommendations</div>
          <div style={{ marginBottom: 12 }}>
            <BulletList items={report.recommendations ?? []} editing={editing} onChange={v => field('recommendations', v)} />
          </div>
        </>
      )}

      {/* Next Steps */}
      {(report.next_steps?.length > 0 || editing) && (
        <>
          <div className="rp-label">Next Steps</div>
          <div style={{ marginBottom: 12 }}>
            <BulletList items={report.next_steps ?? []} editing={editing} onChange={v => field('next_steps', v)} />
          </div>
        </>
      )}
    </div>
  )
}
