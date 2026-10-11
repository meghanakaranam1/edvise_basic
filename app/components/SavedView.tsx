'use client'
import { useEffect, useState } from 'react'
import { listArtifacts, deleteArtifact, listAllUploadedFiles } from '../lib/db'
import type { ArtifactRow, ConversationFile } from '../lib/db'
import ActionPlanTab from './RightPanel/ActionPlanTab'
import AgendaTab from './RightPanel/AgendaTab'
import ReportTab from './RightPanel/ReportTab'
import type { ActionPlan, Agenda, Report } from './RightPanel/types'

type Table = 'action_plans' | 'meeting_agendas' | 'reports'

const TABLE_MAP: Record<string, { table: Table; label: string; kind: 'action_plan' | 'agenda' | 'report' }> = {
  'library-strategy': { table: 'action_plans',    label: 'Strategy & Plans',kind: 'action_plan' },
  'library-reports':  { table: 'reports',         label: 'Reports & Data',  kind: 'report' },
}

function UploadedFilesView() {
  const [files, setFiles] = useState<(ConversationFile & { conversationTitle: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listAllUploadedFiles().then(setFiles).catch(() => setFiles([])).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>All Documents</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Every file you've uploaded to your own conversations.</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No uploaded files yet. Upload a gradebook or PDF from a chat conversation.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {files.map(f => (
              <div
                key={f.id}
                style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {f.file_type.toUpperCase()} · from "{f.conversationTitle}" · {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <a
                  href={`/api/files/download?id=${encodeURIComponent(f.file_id)}&filename=${encodeURIComponent(f.filename)}&type=${encodeURIComponent(f.file_type)}`}
                  download
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', padding: '2px 6px' }}
                >
                  ↓ Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type ActionKind = 'action_plan' | 'agenda' | 'report'
type CombinedAction = ArtifactRow & { kind: ActionKind }

const KIND_META: Record<ActionKind, { label: string; table: Table; bg: string; color: string }> = {
  action_plan: { label: 'Plan',   table: 'action_plans',    bg: '#eef0f8', color: '#2A3B7C' },
  report:      { label: 'Report', table: 'reports',         bg: '#eef8fb', color: '#1b6070' },
  agenda:      { label: 'Agenda', table: 'meeting_agendas', bg: '#fdf3e1', color: '#7a5c10' },
}
const FILTER_PILLS: { key: ActionKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'action_plan', label: 'Plans' },
  { key: 'agenda', label: 'Agendas' },
  { key: 'report', label: 'Reports' },
]

// One combined "My Materials" view instead of three separate sub-tabs —
// plans, agendas, and reports render together in one chronological list,
// each tagged with a small colored badge, with filter pills in place of
// needing a separate sidebar entry per type.
function ActionsView() {
  const [items, setItems] = useState<CombinedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActionKind | 'all'>('all')
  const [viewing, setViewing] = useState<CombinedAction | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [plans, agendas, reports] = await Promise.all([
        listArtifacts('action_plans'),
        listArtifacts('meeting_agendas'),
        listArtifacts('reports'),
      ])
      const combined: CombinedAction[] = [
        ...plans.map(p => ({ ...p, kind: 'action_plan' as const })),
        ...agendas.map(a => ({ ...a, kind: 'agenda' as const })),
        ...reports.map(r => ({ ...r, kind: 'report' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setItems(combined)
    } catch { setItems([]) }
    setLoading(false)
  }

  useEffect(() => { setViewing(null); load() }, [])

  async function handleDelete(item: CombinedAction) {
    await deleteArtifact(KIND_META[item.kind].table, item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (viewing?.id === item.id) setViewing(null)
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.kind === filter)

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
          {viewing.kind === 'action_plan' && <ActionPlanTab data={viewing.data as ActionPlan} generating={false} onGenerate={() => {}} />}
          {viewing.kind === 'agenda' && <AgendaTab data={viewing.data as Agenda} generating={false} onGenerate={() => {}} />}
          {viewing.kind === 'report' && <ReportTab data={viewing.data as Report} generating={false} onGenerate={() => {}} />}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>My Materials</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Action plans, meeting agendas, and reports — all in one place.</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {FILTER_PILLS.map(p => (
            <button
              key={p.key}
              onClick={() => setFilter(p.key)}
              style={{
                padding: '4px 12px', borderRadius: 14, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${filter === p.key ? 'var(--primary)' : 'var(--border)'}`,
                background: filter === p.key ? 'var(--row-bg, #eef8fb)' : 'var(--surface)',
                color: filter === p.key ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No saved items yet. Generate them from a chat conversation.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(item => {
              const meta = KIND_META[item.kind]
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 10, background: meta.bg, color: meta.color, marginBottom: 5 }}>
                      {meta.label}
                    </span>
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
                      onClick={() => handleDelete(item)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
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

  if (view === 'library-all') return <UploadedFilesView />
  if (view === 'actions') return <ActionsView />

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
