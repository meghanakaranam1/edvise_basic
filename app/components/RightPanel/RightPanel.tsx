'use client'
import NotesTab from './NotesTab'
import ActionPlanTab from './ActionPlanTab'
import AgendaTab from './AgendaTab'
import ReportTab from './ReportTab'
import type { Note, ArtifactType, Artifacts } from './types'

const TABS: { id: string; label: string }[] = [
  { id: 'notes',       label: 'Notes' },
  { id: 'action_plan', label: 'Action Plan' },
  { id: 'agenda',      label: 'Agenda' },
  { id: 'report',      label: 'Report' },
]

export default function RightPanel({
  open,
  expanded,
  onClose,
  onExpand,
  tab,
  onTabChange,
  notes,
  onDeleteNote,
  artifacts,
  generating,
  onGenerate,
}: {
  open: boolean
  expanded: boolean
  onClose: () => void
  onExpand: () => void
  tab: string
  onTabChange: (t: string) => void
  notes: Note[]
  onDeleteNote: (id: string) => void
  artifacts: Artifacts
  generating: string | null
  onGenerate: (type: ArtifactType) => void
}) {
  function handleGenerate(type: ArtifactType) {
    onTabChange(type)
    onGenerate(type)
  }

  return (
    <aside className={`right-panel${open ? ' open' : ''}${expanded ? ' expanded' : ''}`}>
      {/* Tab row */}
      <div className="rp-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`rp-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
            {t.id === 'notes' && notes.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, background: '#3E94A5', color: 'white', borderRadius: 10, padding: '1px 5px' }}>
                {notes.length}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, paddingRight: 6 }}>
          <button className="tbar-btn" onClick={onExpand} title={expanded ? 'Collapse' : 'Expand'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14">
              {expanded
                ? <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></>
                : <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
              }
            </svg>
          </button>
          <button className="tbar-btn" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="rp-body">
        {tab === 'notes' && (
          <NotesTab
            notes={notes}
            onDelete={onDeleteNote}
            onGenerate={handleGenerate}
            generating={generating}
          />
        )}
        {tab === 'action_plan' && (
          <ActionPlanTab
            data={artifacts.action_plan}
            generating={generating === 'action_plan'}
            onGenerate={() => handleGenerate('action_plan')}
          />
        )}
        {tab === 'agenda' && (
          <AgendaTab
            data={artifacts.agenda}
            generating={generating === 'agenda'}
            onGenerate={() => handleGenerate('agenda')}
          />
        )}
        {tab === 'report' && (
          <ReportTab
            data={artifacts.report}
            generating={generating === 'report'}
            onGenerate={() => handleGenerate('report')}
          />
        )}
      </div>
    </aside>
  )
}
