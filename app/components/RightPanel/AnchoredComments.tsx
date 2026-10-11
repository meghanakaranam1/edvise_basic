'use client'
import { useEffect, useRef, useState } from 'react'

type ThreadMsg = { from: 'you' | 'claude'; text: string }
type Thread = {
  id: string
  quotedText: string
  messages: ThreadMsg[]
  resolved: boolean
  markEl: HTMLElement
  dotEl: HTMLElement
}

let threadCounter = 0

const MARK_DEFAULT = '#fde68a'
const MARK_ACTIVE = '#fcd34d'
const MARK_RESOLVED_BG = '#eef2f7'
const MARK_RESOLVED_COLOR = '#9aa5bb'

function styleMark(mark: HTMLElement, { active, resolved }: { active: boolean; resolved: boolean }) {
  mark.style.background = resolved ? MARK_RESOLVED_BG : active ? MARK_ACTIVE : MARK_DEFAULT
  mark.style.color = resolved ? MARK_RESOLVED_COLOR : ''
}

function styleDot(dot: HTMLElement, resolved: boolean) {
  dot.style.background = resolved ? '#c5cce0' : '#f0c75e'
}

// Claude.ai-style anchored inline comments: select text inside `children`,
// click the floating "Comment" button that appears, and a thread opens
// pinned to that exact passage — not a single global comment box. Sending
// triggers a SCOPED edit (see /api/artifact's editContext) that revises only
// the commented passage, so the document stays visible in place the whole
// time; onComment resolves with a short summary shown back in the thread.
//
// The highlighted <mark> wrapper and margin dots are plain DOM nodes
// inserted directly into the rendered content (React has no primitive for
// "wrap an arbitrary selected range"), separate from the thread popover
// itself, which IS fully React-rendered/controlled. If the exact passage a
// thread is anchored to gets rewritten by a later edit, that one mark can
// be lost on the next render — the open thread's own conversation still
// works fine since it's driven by React state, not the DOM mark surviving.
//
// resetKey: bump this when the document is freshly (fully) regenerated —
// NOT on every scoped-edit update to the doc, which should leave existing
// threads alone — to clear stale anchors pointing at a replaced document.
export function AnchoredComments({
  children,
  onComment,
  resetKey,
}: {
  children: React.ReactNode
  onComment?: (quotedText: string, comment: string) => Promise<string>
  resetKey?: string | number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const threadsRef = useRef<Map<string, Thread>>(new Map())
  const pendingRangeRef = useRef<Range | null>(null)

  const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openMsgs, setOpenMsgs] = useState<ThreadMsg[]>([])
  const [openResolved, setOpenResolved] = useState(false)
  const [openQuoted, setOpenQuoted] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null)

  // Clear all marks/threads when the document is freshly regenerated.
  useEffect(() => {
    threadsRef.current.clear()
    if (railRef.current) railRef.current.innerHTML = ''
    setOpenId(null)
    setBtnPos(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest?.('.ac-popover') || target.closest?.('.ac-float-btn')) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setBtnPos(null)
        return
      }
      const range = sel.getRangeAt(0)
      const anchor = range.commonAncestorContainer
      const node = anchor instanceof Element ? anchor : anchor.parentElement
      if (!containerRef.current || !node || !containerRef.current.contains(node)) {
        setBtnPos(null)
        return
      }
      pendingRangeRef.current = range.cloneRange()
      const rect = range.getBoundingClientRect()
      setBtnPos({
        top: rect.top - 42 + window.scrollY,
        left: Math.min(rect.left + rect.width / 2 - 55, window.innerWidth - 130),
      })
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest?.('.ac-float-btn') || target.closest?.('.ac-popover')) return
      setBtnPos(null)
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  function startThread() {
    const range = pendingRangeRef.current
    if (!range || !containerRef.current) return
    threadCounter++
    const id = `ac-thread-${threadCounter}`
    const quotedText = range.toString().trim()

    const mark = document.createElement('mark')
    mark.style.borderRadius = '3px'
    mark.style.padding = '1px 2px'
    mark.style.cursor = 'pointer'
    mark.style.transition = 'background .15s ease'
    try {
      range.surroundContents(mark)
    } catch {
      // Selection crosses element boundaries (e.g. spans two list items) —
      // best-effort fallback: extract and wrap, which still anchors the
      // comment even if it slightly reshapes the surrounding markup.
      const frag = range.extractContents()
      mark.appendChild(frag)
      range.insertNode(mark)
    }
    mark.addEventListener('click', () => openThread(id))
    styleMark(mark, { active: true, resolved: false })

    const dot = document.createElement('div')
    dot.style.position = 'absolute'
    dot.style.width = '10px'
    dot.style.height = '10px'
    dot.style.borderRadius = '50%'
    dot.style.border = '2px solid white'
    dot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)'
    dot.style.cursor = 'pointer'
    dot.style.pointerEvents = 'auto'
    dot.addEventListener('click', () => openThread(id))
    styleDot(dot, false)
    if (railRef.current && containerRef.current) {
      const relTop = mark.getBoundingClientRect().top - containerRef.current.getBoundingClientRect().top
      dot.style.top = relTop + 'px'
      railRef.current.appendChild(dot)
    }

    threadsRef.current.set(id, { id, quotedText, messages: [], resolved: false, markEl: mark, dotEl: dot })

    setBtnPos(null)
    window.getSelection()?.removeAllRanges()
    openThread(id)
  }

  function openThread(id: string) {
    const t = threadsRef.current.get(id)
    if (!t || !containerRef.current) return
    for (const other of threadsRef.current.values()) {
      if (other.id !== id && !other.resolved) styleMark(other.markEl, { active: false, resolved: false })
    }
    setOpenId(id)
    setOpenMsgs(t.messages)
    setOpenResolved(t.resolved)
    setOpenQuoted(t.quotedText)
    setDraft('')
    if (!t.resolved) styleMark(t.markEl, { active: true, resolved: false })

    const markRect = t.markEl.getBoundingClientRect()
    const panelRect = containerRef.current.getBoundingClientRect()
    setPopPos({
      top: markRect.bottom - panelRect.top + 8,
      left: Math.min(panelRect.width - 280, Math.max(0, markRect.left - panelRect.left)),
    })
  }

  function closeThread() {
    if (openId) {
      const t = threadsRef.current.get(openId)
      if (t && !t.resolved) styleMark(t.markEl, { active: false, resolved: false })
    }
    setOpenId(null)
  }

  async function send() {
    if (!draft.trim() || !openId || !onComment || sending) return
    const t = threadsRef.current.get(openId)
    if (!t) return
    const comment = draft.trim()
    t.messages = [...t.messages, { from: 'you', text: comment }]
    setOpenMsgs(t.messages)
    setDraft('')
    setSending(true)
    try {
      const summary = await onComment(t.quotedText, comment)
      t.messages = [...t.messages, { from: 'claude', text: summary }]
      setOpenMsgs(t.messages)
      t.markEl.style.transition = 'background .3s ease'
      t.markEl.style.background = '#bff2c9'
      setTimeout(() => { if (!t.resolved) styleMark(t.markEl, { active: true, resolved: false }) }, 900)
    } catch {
      t.messages = [...t.messages, { from: 'claude', text: 'Something went wrong — want to try again?' }]
      setOpenMsgs(t.messages)
    } finally {
      setSending(false)
    }
  }

  function toggleResolve() {
    if (!openId) return
    const t = threadsRef.current.get(openId)
    if (!t) return
    t.resolved = !t.resolved
    styleMark(t.markEl, { active: !t.resolved, resolved: t.resolved })
    styleDot(t.dotEl, t.resolved)
    setOpenResolved(t.resolved)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {children}
      <div ref={railRef} style={{ position: 'absolute', right: -22, top: 0, bottom: 0, width: 14, pointerEvents: 'none' }} />

      {btnPos && onComment && (
        <button
          className="ac-float-btn"
          onClick={startThread}
          style={{ position: 'fixed', top: btnPos.top, left: btnPos.left, display: 'flex', alignItems: 'center', gap: 5, background: '#2A3B7C', color: 'white', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(42,59,124,0.25)', zIndex: 50, fontFamily: 'inherit' }}
        >
          💬 Comment
        </button>
      )}

      {openId && popPos && (
        <div
          className="ac-popover"
          style={{ position: 'absolute', top: popPos.top, left: popPos.left, width: 270, background: 'white', border: '1px solid #e4e9f2', borderRadius: 12, boxShadow: '0 10px 30px rgba(20,30,70,0.14)', padding: '12px 13px', zIndex: 40, fontSize: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#7a89b8', background: '#fdf3e1', borderLeft: '3px solid #f0c75e', padding: '6px 8px', borderRadius: 4, marginBottom: 10, lineHeight: 1.5, maxHeight: 54, overflow: 'hidden', flex: 1 }}>
              &ldquo;{openQuoted}&rdquo;
            </div>
            <button onClick={closeThread} aria-label="Close" style={{ border: 'none', background: 'none', color: '#c5cce0', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </div>

          <div>
            {openMsgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.from === 'claude' ? '#2A3B7C' : '#3E94A5', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {m.from === 'claude' ? 'Ev' : 'T'}
                </div>
                <div style={{ lineHeight: 1.5, color: '#374151' }}>
                  <span style={{ fontWeight: 600, color: '#2A3B7C', fontSize: 11.5 }}>{m.from === 'claude' ? 'Edvise' : 'You'}</span><br />
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 7, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#2A3B7C', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>Ev</div>
                <div style={{ display: 'inline-flex', gap: 3, paddingTop: 6 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#7a89b8', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="text"
              placeholder={openMsgs.length ? 'Reply…' : 'Ask for a change or leave a note…'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              disabled={sending}
              autoFocus
              style={{ flex: 1, border: '1px solid #e4e9f2', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={send}
              disabled={sending}
              style={{ border: 'none', background: '#2A3B7C', color: 'white', borderRadius: 7, padding: '0 12px', fontSize: 12, fontWeight: 600, cursor: sending ? 'default' : 'pointer', fontFamily: 'inherit', opacity: sending ? 0.6 : 1 }}
            >
              Send
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e4e9f2' }}>
            <button onClick={toggleResolve} style={{ border: 'none', background: 'none', color: '#7a89b8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              {openResolved ? '↺ Reopen' : '✓ Resolve'}
            </button>
            <span style={{ fontSize: 10, color: '#c5cce0' }}>Anchored comment</span>
          </div>
        </div>
      )}
    </div>
  )
}
