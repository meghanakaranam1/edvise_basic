'use client'
import { useRef, useState } from 'react'
import NotesTab from './NotesTab'
import ActionPlanTab from './ActionPlanTab'
import AgendaTab from './AgendaTab'
import ReportTab from './ReportTab'
import SharedAnalysisTab from './SharedAnalysisTab'
import type { Message } from '../MessageList'
import type { Note, ArtifactType, Artifacts, ArtifactHistory, ActiveArtifactIds } from './types'

const TABS: { id: string; label: string }[] = [
  { id: 'notes',       label: 'Notes' },
  { id: 'action_plan', label: 'Action plan' },
  { id: 'agenda',      label: 'Agenda' },
  { id: 'report',      label: 'Reports' },
]

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

const MIN_WIDTH = 320
const MAX_WIDTH = 900

export default function RightPanel({
  open,
  width,
  onWidthChange,
  onClose,
  tab,
  onTabChange,
  notes,
  onDeleteNote,
  artifacts,
  artifactHistory,
  activeArtifactId,
  onSelectArtifactVersion,
  generating,
  onRequestGenerate,
  onSave,
  onDiscard,
  onComment,
  onArtifactChange,
  messages,
  showSharedAnalysis,
}: {
  open: boolean
  width: number
  onWidthChange: (w: number) => void
  onClose: () => void
  tab: string
  onTabChange: (t: string) => void
  notes: Note[]
  onDeleteNote: (id: string) => void
  artifacts: Artifacts
  // Every past generated version per type, and which one is currently
  // displayed — drives the document-history dropdown in GeneratedDocTab so
  // generating a new report doesn't bury the previous one. Session-only,
  // same lifespan as `artifacts`.
  artifactHistory: ArtifactHistory
  activeArtifactId: ActiveArtifactIds
  onSelectArtifactVersion: (type: ArtifactType, id: string) => void
  generating: string | null
  // ALL three types route through the real chat clarifying-question flow —
  // none of them have a fixed template anymore, so Claude always needs to
  // ask what the teacher wants (focus + format) before generating. See
  // requestGenerateFromNotes in page.tsx.
  onRequestGenerate: (type: ArtifactType, noteIds: string[]) => void
  onSave: (type: ArtifactType) => void
  onDiscard: (type: ArtifactType) => void
  // Reply to an anchored inline comment on an already-generated document —
  // triggers a real, scoped regeneration round trip, not a local edit. See
  // AnchoredComments for the full explanation. Resolves with a short summary
  // of what changed, shown in the open thread.
  onComment?: (type: ArtifactType, quotedText: string, comment: string) => Promise<string>
  // Click-to-edit (see EditableText) fires this on every change so the
  // parent's copy of the document stays in sync — without it, Save would
  // persist the stale pre-edit version.
  onArtifactChange?: (type: ArtifactType, updated: import('./types').GeneratedDocument) => void
  messages?: Message[]
  showSharedAnalysis?: boolean
}) {
  const allTabs = showSharedAnalysis ? [...TABS, { id: 'shared_analysis', label: 'Shared Analysis' }] : TABS
  const [picking, setPicking] = useState<ArtifactType | null>(null)
  // Notes (and Shared Analysis, when present) are always there. An Action
  // plan/Agenda/Reports tab only shows up once that type actually has
  // something in it — generated, currently generating, or the tab you're
  // already on (so switching to it right as generation kicks off, via
  // onTabChange in confirmGenerate below, doesn't flicker away before the
  // content/generating state catches up). Nothing sits there empty by
  // default. While picking notes for a specific document, this collapses
  // further to just Notes — no tab to wander off to mid-selection — and
  // reopens once you confirm or cancel.
  const tabs = picking
    ? allTabs.filter(t => t.id === 'notes')
    : allTabs.filter(t =>
        t.id === 'notes' ||
        t.id === 'shared_analysis' ||
        !!artifacts[t.id as ArtifactType] ||
        generating === t.id ||
        tab === t.id
      )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function handleGenerate(type: ArtifactType) {
    setSelectedIds(new Set(notes.map(n => n.id)))
    setPicking(type)
  }

  function confirmGenerate() {
    if (!picking) return
    onTabChange(picking)
    // All three types route through the real chat clarifying-question flow
    // now, not direct generation — none of them have a fixed template
    // anymore, so Claude always needs to ask what the teacher actually
    // wants (focus, and how it should be formatted/organized) first. See
    // requestGenerateFromNotes in page.tsx.
    onRequestGenerate(picking, [...selectedIds])
    // (handleGenerate below is RightPanel's own local picker-opening
    // function — a different, same-named thing from the old onGenerate
    // prop, which has been removed now that nothing generates directly.)
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

  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    draggingRef.current = true
    setDragging(true)
    const startX = e.clientX
    const startWidth = width

    function onMove(ev: MouseEvent) {
      if (!draggingRef.current) return
      // Panel is on the right edge, so dragging left (negative dx) grows it.
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)))
      onWidthChange(next)
    }
    function onUp() {
      draggingRef.current = false
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <aside className={`right-panel${open ? ' open' : ''}`} style={{ width: open ? width : 0, transition: dragging ? 'none' : undefined }}>
      {open && (
        <div
          className="rp-resize-handle"
          onMouseDown={startDrag}
          title="Drag to resize"
        />
      )}
      {/* Tab row */}
      <div className="rp-tabs">
        {tabs.map(t => (
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
                history={artifactHistory.action_plan}
                activeId={activeArtifactId.action_plan}
                onSelectVersion={id => onSelectArtifactVersion('action_plan', id)}
                generating={generating === 'action_plan'}
                onGenerate={() => handleGenerate('action_plan')}
                onSave={() => onSave('action_plan')}
                onDiscard={() => onDiscard('action_plan')}
                onComment={onComment ? (quotedText, comment) => onComment('action_plan', quotedText, comment) : undefined}
                onChange={onArtifactChange ? updated => onArtifactChange('action_plan', updated) : undefined}
              />
            )}
            {tab === 'agenda' && (
              <AgendaTab
                data={artifacts.agenda}
                history={artifactHistory.agenda}
                activeId={activeArtifactId.agenda}
                onSelectVersion={id => onSelectArtifactVersion('agenda', id)}
                generating={generating === 'agenda'}
                onGenerate={() => handleGenerate('agenda')}
                onSave={() => onSave('agenda')}
                onDiscard={() => onDiscard('agenda')}
                onComment={onComment ? (quotedText, comment) => onComment('agenda', quotedText, comment) : undefined}
                onChange={onArtifactChange ? updated => onArtifactChange('agenda', updated) : undefined}
              />
            )}
            {tab === 'report' && (
              <ReportTab
                data={artifacts.report}
                history={artifactHistory.report}
                activeId={activeArtifactId.report}
                onSelectVersion={id => onSelectArtifactVersion('report', id)}
                generating={generating === 'report'}
                onGenerate={() => handleGenerate('report')}
                onSave={() => onSave('report')}
                onDiscard={() => onDiscard('report')}
                onComment={onComment ? (quotedText, comment) => onComment('report', quotedText, comment) : undefined}
                onChange={onArtifactChange ? updated => onArtifactChange('report', updated) : undefined}
              />
            )}
            {tab === 'shared_analysis' && (
              <SharedAnalysisTab messages={messages ?? []} />
            )}
          </>
        )}
      </div>
    </aside>
  )
}
