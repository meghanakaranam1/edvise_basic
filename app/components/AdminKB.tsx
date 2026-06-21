'use client'
import { useEffect, useRef, useState } from 'react'
import type { SupabaseSession } from '../lib/supabase'

type KbDoc = {
  id: string
  filename: string
  scope: string
  status: string
  tags: string[]
  file_type: string
  category: string | null
  created_at: string
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  approved: { background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' },
  pending:  { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  rejected: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' },
}

function statusBadge(status: string) {
  return (
    <span style={{ ...STATUS_STYLE[status] ?? {}, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10 }}>
      {status}
    </span>
  )
}

export default function AdminKB({ session }: { session: SupabaseSession }) {
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [scope, setScope] = useState<'global' | 'school'>('global')
  const fileRef = useRef<HTMLInputElement>(null)
  const token = session?.access_token ?? ''
  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/kb/documents', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setDocs(data.documents ?? [])
    } catch { setDocs([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('scope', scope)
      const res = await fetch('/api/kb/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err) {
      alert('Upload failed: ' + String(err))
    }
    setUploading(false)
  }

  async function handleApprove(id: string, status: 'approved' | 'rejected') {
    await fetch(`/api/kb/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return
    await fetch(`/api/kb/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    await load()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Knowledge Base</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Documents used to augment AI responses with research and school context</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={scope}
            onChange={e => setScope(e.target.value as 'global' | 'school')}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg)' }}
          >
            <option value="global">Student Success KB (global)</option>
            <option value="school">School-based</option>
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ padding: '6px 14px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1, fontFamily: 'inherit' }}
          >
            {uploading ? 'Uploading…' : '+ Upload'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.docx" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      </div>

      {/* Document list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No documents yet. Upload PDFs, CSVs, or text files to build the knowledge base.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Filename', 'Scope', 'Status', 'Tags', 'Uploaded', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)', maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{doc.file_type?.toUpperCase()}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {doc.scope === 'global' ? 'Student Success' : 'School'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{statusBadge(doc.status)}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(doc.tags ?? []).slice(0, 4).map((t, i) => (
                        <span key={i} style={{ fontSize: 10, background: '#f0f2f8', color: '#2A3B7C', borderRadius: 4, padding: '1px 6px' }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isAdmin && doc.status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(doc.id, 'approved')} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#065f46', cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                          <button onClick={() => handleApprove(doc.id, 'rejected')} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                        </>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(doc.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
