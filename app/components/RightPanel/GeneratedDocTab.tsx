'use client'
import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { GeneratedDocument } from './types'
import { AnchoredComments } from './AnchoredComments'
import { EditableText } from './EditableText'
import { downloadPdf, type PdfBlock } from '../../lib/exportPdf'

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <div style={{ fontWeight: 700, fontSize: 13, color: '#2A3B7C', marginTop: 12, marginBottom: 4 }}>{children}</div>,
  h2: ({ children }: { children?: React.ReactNode }) => <div style={{ fontWeight: 700, fontSize: 12, color: '#2A3B7C', marginTop: 10, marginBottom: 4 }}>{children}</div>,
  h3: ({ children }: { children?: React.ReactNode }) => <div style={{ fontWeight: 600, fontSize: 12, color: '#2A3B7C', marginTop: 8, marginBottom: 4 }}>{children}</div>,
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ paddingLeft: 18, margin: '4px 0 8px 0' }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: 4, lineHeight: 1.65 }}>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ color: '#1f2937', fontWeight: 700 }}>{children}</strong>,
}

// Shared by Action Plan / Agenda / Report — all three are now the same open
// shape (title + sections + optional closing_actions). None of them have a
// fixed template: Claude always asks the teacher what they actually want
// (focus, and how it should be organized/formatted) before generating, so
// section count/titles/order are teacher-driven, not a preset structure
// this component assumes. The only differences between the three tabs are
// cosmetic (accent color, icon, copy) — passed in as props.
export default function GeneratedDocTab({
  data,
  generating,
  onGenerate,
  onSave,
  onDiscard,
  onComment,
  onChange,
  accentColor,
  savedColor,
  icon,
  breadcrumbLabel,
  emptyTitle,
  emptyDescription,
  generateLabel,
  loadingLabel,
  downloadFallbackName,
}: {
  data?: GeneratedDocument
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
  onComment?: (quotedText: string, comment: string) => Promise<string>
  // Fires on every inline edit so the parent's own copy stays in sync —
  // without this, edits would live only in local state and Save would
  // silently persist the stale pre-edit version.
  onChange?: (updated: GeneratedDocument) => void
  accentColor: string
  savedColor?: string
  icon: string
  breadcrumbLabel: string
  emptyTitle: string
  emptyDescription: string
  generateLabel: string
  loadingLabel: string
  downloadFallbackName: string
}) {
  const [doc, setDoc] = useState<GeneratedDocument | undefined>(data)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDoc(data); setSaved(false) }, [data])

  // Bumps only on a FULL regeneration (generating true -> false), not a
  // scoped anchored-comment edit — clears stale comment anchors.
  const [genVersion, setGenVersion] = useState(0)
  const prevGenerating = useRef(generating)
  useEffect(() => {
    if (prevGenerating.current && !generating) setGenVersion(v => v + 1)
    prevGenerating.current = generating
  }, [generating])

  if (generating) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#7a89b8' }}>{loadingLabel}</div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: '#7a89b8', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontWeight: 600, color: '#2A3B7C', marginBottom: 6 }}>{emptyTitle}</div>
        <div style={{ marginBottom: 16, fontSize: 12 }}>{emptyDescription}</div>
        <button onClick={onGenerate} className="sc-btn primary" style={{ margin: '0 auto' }}>{generateLabel}</button>
      </div>
    )
  }

  const dateCreated = doc.date_created ?? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  function update(next: GeneratedDocument) {
    setDoc(next)
    onChange?.(next)
  }
  function setTitle(title: string) { update({ ...doc!, title }) }
  function setSectionTitle(i: number, title: string) {
    const sections = [...doc!.sections]
    sections[i] = { ...sections[i], title }
    update({ ...doc!, sections })
  }
  function setSectionContent(i: number, content: string) {
    const sections = [...doc!.sections]
    sections[i] = { ...sections[i], content }
    update({ ...doc!, sections })
  }
  function setClosingAction(i: number, action: string) {
    const closing_actions = [...(doc!.closing_actions ?? [])]
    closing_actions[i] = action
    update({ ...doc!, closing_actions })
  }

  function downloadDoc() {
    if (!doc) return
    const blocks: PdfBlock[] = [
      { type: 'title', text: doc.title },
      { type: 'meta', text: `Generated ${dateCreated}` },
    ]
    for (const section of doc.sections ?? []) {
      blocks.push({ type: 'spacer' }, { type: 'heading', text: section.title }, { type: 'body', text: section.content })
    }
    if (doc.closing_actions?.length) {
      blocks.push({ type: 'spacer' }, { type: 'heading', text: 'Closing — Priority Actions' })
      for (const action of doc.closing_actions) blocks.push({ type: 'bullet', text: action })
    }
    downloadPdf(doc.title || downloadFallbackName, blocks)
  }

  return (
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
    <AnchoredComments onComment={onComment} resetKey={genVersion}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f0f2f8' }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Click any text to edit</span>
        <button
          onClick={downloadDoc}
          style={{ padding: '4px 10px', border: '1px solid #e4e9f2', borderRadius: 7, background: 'white', color: '#7a89b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ↓ Download
        </button>
      </div>

      {/* Breadcrumb */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Edvise · {breadcrumbLabel}
      </div>

      {/* Title */}
      <EditableText
        value={doc.title}
        onChange={setTitle}
        style={{ fontWeight: 700, fontSize: 15, color: '#2A3B7C', lineHeight: 1.4, marginBottom: 14 }}
      />

      {/* Meta */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f0f2f8' }}>
        Generated <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', textTransform: 'none', letterSpacing: 'normal' }}>{dateCreated}</span>
      </div>

      {/* Sections */}
      {doc.sections?.map((section, i) => (
        <div key={i} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f0f2f8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 18, background: accentColor, borderRadius: 2, flexShrink: 0 }} />
            <EditableText
              value={section.title}
              onChange={v => setSectionTitle(i, v)}
              style={{ fontSize: 10, fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}
            />
          </div>
          <EditableText
            value={section.content}
            onChange={v => setSectionContent(i, v)}
            multiline
            style={{ fontSize: 12, color: '#374151', lineHeight: 1.75 }}
            renderDisplay={content => (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            )}
          />
        </div>
      ))}

      {/* Closing Priority Actions */}
      {(doc.closing_actions?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 18, background: '#6c3fc5', borderRadius: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 10, fontWeight: 800, color: '#6c3fc5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Closing — Priority Actions
            </div>
          </div>
          <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doc.closing_actions!.map((action, i) => (
              <li key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.65 }}>
                <EditableText value={action} onChange={v => setClosingAction(i, v)} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </AnchoredComments>

      {/* Save bar */}
      {onSave && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f2f8' }}>
          {saved ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, fontWeight: 600, color: savedColor ?? accentColor }}>✓ Saved to My Actions</div>
          ) : (
            <>
              <button onClick={onDiscard} style={{ padding: '10px', border: '1px solid #e4e9f2', borderRadius: 10, background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
              <button onClick={() => { onSave(); setSaved(true) }} style={{ padding: '10px', border: 'none', borderRadius: 10, background: accentColor, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save to my actions</button>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingTop: 8, marginTop: onSave ? 0 : 16 }}>
        Generated by <strong style={{ color: '#2A3B7C' }}>Edvise</strong> · {dateCreated}
      </div>
    </div>
  )
}
