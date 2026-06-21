'use client'
import { useEffect, useState } from 'react'
import { listArtifacts, deleteArtifact } from '../lib/db'
import type { ArtifactRow } from '../lib/db'

type Table = 'action_plans' | 'meeting_agendas' | 'reports'

const TABLE_MAP: Record<string, { table: Table; label: string }> = {
  'actions-plans':   { table: 'action_plans',   label: 'Action Plans' },
  'actions-agendas': { table: 'meeting_agendas', label: 'Meeting Agendas' },
  'actions-reports': { table: 'reports',         label: 'Reports' },
  'library-all':     { table: 'action_plans',    label: 'All Documents' },
  'library-strategy':{ table: 'action_plans',    label: 'Strategy & Plans' },
  'library-reports': { table: 'reports',         label: 'Reports & Data' },
}

export default function SavedView({ view }: { view: string }) {
  const cfg = TABLE_MAP[view]
  const [items, setItems] = useState<ArtifactRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!cfg) return
    setLoading(true)
    try { setItems(await listArtifacts(cfg.table)) } catch { setItems([]) }
    setLoading(false)
  }

  useEffect(() => { load() }, [view])

  async function handleDelete(id: string) {
    if (!cfg) return
    await deleteArtifact(cfg.table, id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (!cfg) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Coming soon
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{cfg.label}</h2>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No saved items yet. Generate them from a chat conversation.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                    {item.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
