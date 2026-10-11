'use client'
import { useEffect, useRef, useState } from 'react'

// Click-directly-into-the-text editing, like claude.ai's own Docs or
// ChatGPT's canvas — no separate "Edit" mode/toggle button. Click (or tab
// into) the text, it becomes an editable field in place, blur or Enter
// commits it. renderDisplay lets the read view show something richer than
// plain text (e.g. rendered markdown) while still editing the raw value.
export function EditableText({
  value,
  onChange,
  multiline,
  renderDisplay,
  placeholder,
  style,
}: {
  value: string
  onChange: (next: string) => void
  multiline?: boolean
  renderDisplay?: (value: string) => React.ReactNode
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => {
    if (editing && multiline && ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [draft, editing, multiline])

  function commit() {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  if (editing) {
    const shared = {
      ref,
      value: draft,
      autoFocus: true,
      onBlur: commit,
      style: {
        width: '100%', border: '1px solid #c5cce0', borderRadius: 6, padding: '3px 6px',
        margin: '-3px -6px', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
        lineHeight: 'inherit', color: 'inherit', background: '#fffdf5', outline: 'none',
        ...style,
      } as React.CSSProperties,
    }
    return multiline ? (
      <textarea
        {...shared}
        rows={1}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        style={{ ...shared.style, resize: 'none', overflow: 'hidden' }}
      />
    ) : (
      <input
        {...shared}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          if (e.key === 'Enter') commit()
        }}
      />
    )
  }

  return (
    <div
      onClick={() => {
        // A click that follows a drag-to-select (for an anchored comment —
        // see AnchoredComments) still fires a click event in most browsers.
        // Don't steal that gesture into edit mode — only a plain click with
        // nothing selected should start editing.
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed && sel.toString().trim()) return
        setEditing(true)
      }}
      style={{ cursor: 'text', borderRadius: 6, padding: '3px 6px', margin: '-3px -6px', transition: 'background .12s ease', ...style }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f7f9fc' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {value?.trim()
        ? (renderDisplay ? renderDisplay(value) : value)
        : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>{placeholder ?? 'Click to add…'}</span>}
    </div>
  )
}
