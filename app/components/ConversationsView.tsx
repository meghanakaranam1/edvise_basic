'use client'
import { useEffect, useState } from 'react'
import { listConversations } from '../lib/db'
import type { Conversation } from '../lib/db'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (hours < 1) return `${mins}m ago`
  if (hours < 24) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ConversationsView({
  onSelect,
  onNewChat,
}: {
  onSelect: (id: string) => void
  onNewChat: () => void
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = query.trim()
    ? conversations.filter(c => (c.title || '').toLowerCase().includes(query.toLowerCase()))
    : conversations

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Your Conversations</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              View and manage your chat history. Click on any conversation to see the full message thread.
            </p>
          </div>
          <button
            onClick={onNewChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 9,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Start new chat
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '16px 32px 0', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#a0aab8" strokeWidth="2" width="14" height="14"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: '100%', padding: '10px 14px 10px 34px',
              border: '1px solid var(--border)', borderRadius: 10,
              fontSize: 13, fontFamily: 'inherit', color: 'var(--text)',
              background: 'var(--surface)', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 32px 24px' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
            {query ? 'No conversations match your search.' : 'No conversations yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map((c, i) => (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 0',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-light)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#a0aab8" strokeWidth="1.5" width="16" height="16" style={{ flexShrink: 0 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                  {c.title || 'Untitled'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {timeAgo(c.updated_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
