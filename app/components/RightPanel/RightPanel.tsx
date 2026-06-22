'use client'
import { useState } from 'react'
import NotesTab from './NotesTab'
import ActionPlanTab from './ActionPlanTab'
import AgendaTab from './AgendaTab'
import ReportTab from './ReportTab'
import type { Note, ArtifactType, Artifacts } from './types'

const TABS: { id: string; label: string }[] = [
  { id: 'notes',       label: 'Notes' },
  { id: 'action_plan', label: 'Action plan' },
  { id: 'agenda',      label: 'Agenda' },
  { id: 'report',      label: 'Reports' },
]

type ReportTemplate = 'full_analysis' | 'family_letter'

const TYPE_COLOR: Record<ArtifactType, { accent: string; border: string; bg: string; check: string }> = {
  action_plan: { accent: '#15803d', border: '#86efac', bg: '#f0fdf4', check: '#16a34a' },
  agenda:      { accent: '#1b6070', border: '#7dd3e4', bg: '#f0f8fb', check: '#3E94A5' },
  report:      { accent: '#6c3fc5', border: '#c4b5fd', bg: '#faf5ff', check: '#7c3aed' },
}

const TYPE_LABEL: Record<ArtifactType, string> = {
  action_plan: 'Action Plan',
  agenda: 'Agenda',
  report: 'Report',
}

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
  onSave,
  onDiscard,
  onOpenReportModal,
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
  onGenerate: (type: ArtifactType, noteIds: string[], reportTemplate?: ReportTemplate) => void
  onSave: (type: ArtifactType) => void
  onDiscard: (type: ArtifactType) => void
  onOpenReportModal: (report: import('./types').Report, date: string, isNew: boolean) => void
}) {
  const [picking, setPicking] = useState<ArtifactType | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>('full_analysis')

  function handleGenerate(type: ArtifactType) {
    setSelectedIds(new Set(notes.map(n => n.id)))
    setPicking(type)
  }

  function confirmGenerate() {
    if (!picking) return
    onTabChange(picking)
    onGenerate(picking, [...selectedIds], picking === 'report' ? reportTemplate : undefined)
    setPicking(null)
  }

  function toggleNote(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const colors = picking ? TYPE_COLOR[picking] : TYPE_COLOR.action_plan

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
        {/* Note picker overlay */}
        {picking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Control panel */}
            <div style={{ border: '1px dashed #d4dff7', borderRadius: 10, padding: '14px 16px', marginBottom: 14, background: '#fafbff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#2A3B7C' }}>
                  Select notes for {TYPE_LABEL[picking]}
                </span>
                <button
                  onClick={() => setPicking(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7a89b8', fontSize: 16, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                  <button
                    onClick={() => setSelectedIds(new Set(notes.map(n => n.id)))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.accent, fontSize: 12, fontWeight: 600, padding: 0 }}
                  >
                    Select all
                  </button>
                  <span style={{ color: '#c5cce0', margin: '0 6px', fontSize: 12 }}>·</span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.accent, fontSize: 12, fontWeight: 600, padding: 0 }}
                  >
                    Clear
                  </button>
                </div>
                <span style={{ fontSize: 11, color: '#7a89b8' }}>{selectedIds.size} of {notes.length} selected</span>
              </div>

              {/* Report template selector */}
              {picking === 'report' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#7a89b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Report Template</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { key: 'full_analysis', icon: '⊞', label: 'Full Analysis' },
                      { key: 'family_letter', icon: '👤', label: 'Family Letter' },
                    ] as const).map(t => (
                      <button
                        key={t.key}
                        onClick={() => setReportTemplate(t.key)}
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: `1px solid ${reportTemplate === t.key ? '#7c3aed' : '#e4e9f2'}`,
                          background: reportTemplate === t.key ? '#ede9fe' : 'white',
                          color: reportTemplate === t.key ? '#6c3fc5' : '#7a89b8',
                          fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={() => setPicking(null)}
                  style={{ padding: '9px', border: '1px solid #e4e9f2', borderRadius: 8, background: 'white', color: '#2A3B7C', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmGenerate}
                  disabled={selectedIds.size === 0}
                  style={{ padding: '9px', border: 'none', borderRadius: 8, background: selectedIds.size === 0 ? '#c5cce0' : colors.check, color: 'white', fontSize: 13, fontWeight: 600, cursor: selectedIds.size === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
                >
                  {picking === 'report' ? 'Generate Report' : 'Generate'}
                </button>
              </div>
            </div>

            {/* Notes as checkboxes */}
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#7a89b8', fontSize: 12 }}>No notes to select.</div>
            ) : (
              notes.map(note => {
                const checked = selectedIds.has(note.id)
                const preview = note.content
                  .replace(/<!--[\s\S]*?-->/g, '')
                  .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
                  .replace(/^#{1,6}\s+/gm, '').replace(/\n+/g, ' ')
                  .trim().slice(0, 60)
                return (
                  <div
                    key={note.id}
                    onClick={() => toggleNote(note.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      border: `1px solid ${checked ? colors.border : '#e4e9f2'}`,
                      borderRadius: 10, marginBottom: 8, cursor: 'pointer',
                      background: checked ? colors.bg : 'white',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${checked ? colors.check : '#c5cce0'}`,
                      background: checked ? colors.check : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && (
                        <svg viewBox="0 0 12 12" fill="none" width="10" height="10">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: '#2A3B7C', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Normal tab content */}
        {!picking && (
          <>
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
                onSave={() => onSave('action_plan')}
                onDiscard={() => onDiscard('action_plan')}
              />
            )}
            {tab === 'agenda' && (
              <AgendaTab
                data={artifacts.agenda}
                generating={generating === 'agenda'}
                onGenerate={() => handleGenerate('agenda')}
                onSave={() => onSave('agenda')}
                onDiscard={() => onDiscard('agenda')}
              />
            )}
            {tab === 'report' && (
              <ReportTab
                data={artifacts.report}
                generating={generating === 'report'}
                onGenerate={() => handleGenerate('report')}
                onSave={() => onSave('report')}
                onDiscard={() => onDiscard('report')}
                onOpenModal={onOpenReportModal}
              />
            )}
          </>
        )}
      </div>
    </aside>
  )
}
