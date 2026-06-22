'use client'
import { useEffect, useState } from 'react'
import { listArtifacts, deleteArtifact } from '../lib/db'
import type { ArtifactRow } from '../lib/db'
import ActionPlanTab from './RightPanel/ActionPlanTab'
import AgendaTab from './RightPanel/AgendaTab'
import ReportTab from './RightPanel/ReportTab'
import type { ActionPlan, Agenda, Report } from './RightPanel/types'

type Table = 'action_plans' | 'meeting_agendas' | 'reports'

const TABLE_MAP: Record<string, { table: Table; label: string; kind: 'action_plan' | 'agenda' | 'report' }> = {
  'actions-plans':    { table: 'action_plans',   label: 'Action Plans',    kind: 'action_plan' },
  'actions-agendas':  { table: 'meeting_agendas', label: 'Meeting Agendas', kind: 'agenda' },
  'actions-reports':  { table: 'reports',         label: 'Reports',         kind: 'report' },
  'library-all':      { table: 'action_plans',    label: 'All Documents',   kind: 'action_plan' },
  'library-strategy': { table: 'action_plans',    label: 'Strategy & Plans',kind: 'action_plan' },
  'library-reports':  { table: 'reports',         label: 'Reports & Data',  kind: 'report' },
}

export default function SavedView({ view }: { view: string }) {
  const cfg = TABLE_MAP[view]
  const [items, setItems] = useState<ArtifactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<ArtifactRow | null>(null)

  async function load() {
    if (!cfg) return
    setLoading(true)
    try { setItems(await listArtifacts(cfg.table)) } catch { setItems([]) }
    setLoading(false)
  }

  useEffect(() => { setViewing(null); load() }, [view])

  async function handleDelete(id: string) {
    if (!cfg) return
    await deleteArtifact(cfg.table, id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (viewing?.id === id) setViewing(null)
  }

  if (!cfg) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Coming soon
    </div>
  )

  // Detail view
  if (viewing) {
    const date = new Date(viewing.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setViewing(null)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', padding: 0 }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewing.title}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {cfg.kind === 'action_plan' && (
            <ActionPlanTab
              data={viewing.data as ActionPlan}
              generating={false}
              onGenerate={() => {}}
            />
          )}
          {cfg.kind === 'agenda' && (
            <AgendaTab
              data={viewing.data as Agenda}
              generating={false}
              onGenerate={() => {}}
            />
          )}
          {cfg.kind === 'report' && (
            <ReportTab
              data={viewing.data as Report}
              generating={false}
              onGenerate={() => {}}
            />
          )}
        </div>
      </div>
    )
  }

  // List view
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
              <div
                key={item.id}
                style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
                    {item.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => setViewing(item)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: '2px 6px', fontFamily: 'inherit' }}
                  >
                    View →
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
