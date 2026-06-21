'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { listConversations } from '../../lib/db'
import type { Conversation } from '../../lib/db'
import type { SupabaseSession } from '../../lib/supabase'

type MainView = 'chat' | 'library-all' | 'library-strategy' | 'library-reports' | 'library-pending'
  | 'actions-plans' | 'actions-agendas' | 'actions-reports' | 'settings' | 'kb'

export type { MainView }

export default function Sidebar({
  session,
  mainView,
  setMainView,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  refreshKey = 0,
  savedCounts = { action_plan: 0, agenda: 0, report: 0 },
}: {
  session: SupabaseSession
  mainView: MainView
  setMainView: (v: MainView) => void
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  activeConversationId?: string
  refreshKey?: number
  savedCounts?: { action_plan: number; agenda: number; report: number }
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [signingOut, setSigningOut] = useState(false)

  const userEmail = session?.user?.email ?? 'Teacher'
  const userInitial = userEmail[0]?.toUpperCase() ?? 'T'
  const isAdmin = userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL

  useEffect(() => {
    if (!session?.user) { setConversations([]); return }
    listConversations().then(setConversations).catch(() => setConversations([]))
  }, [session?.user?.id, refreshKey])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  function nav(view: MainView, active: boolean, icon: React.ReactNode, label: string, badge?: number) {
    return (
      <div className={`nav-item${active ? ' active' : ''}`} onClick={() => setMainView(view)}>
        {icon}
        {label}
        {badge ? <span className="nav-badge">{badge}</span> : null}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="logo">
          <div className="logo-mark">Ev</div>
          <span className="logo-name">EdVise</span>
        </div>
        <button type="button" className="new-chat-btn" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="sb-label">My Library</div>
        {nav('library-all', mainView === 'library-all',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
          'All documents')}
        {nav('library-strategy', mainView === 'library-strategy',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
          'Strategy & plans')}
        {nav('library-reports', mainView === 'library-reports',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
          'Reports & data')}
        {nav('library-pending', mainView === 'library-pending',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
          'Pending approval')}

        <div className="sb-label" style={{ marginTop: 8 }}>My Actions</div>
        {nav('actions-plans', mainView === 'actions-plans',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
          'Action plans', savedCounts.action_plan || undefined)}
        {nav('actions-agendas', mainView === 'actions-agendas',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
          'Meeting agendas', savedCounts.agenda || undefined)}
        {nav('actions-reports', mainView === 'actions-reports',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
          'Reports', savedCounts.report || undefined)}

        <div className="sb-label" style={{ marginTop: 8 }}>Account</div>
        {isAdmin && nav('kb', mainView === 'kb',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
          'Knowledge base')}
        {nav('settings', mainView === 'settings',
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
          'Settings')}

        <div className="sb-label" style={{ marginTop: 16 }}>Recent</div>
        {conversations.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px' }}>No conversations yet</div>
        ) : (
          conversations.map(c => (
            <div
              key={c.id}
              className={`history-item${activeConversationId === c.id ? ' active' : ''}`}
              onClick={() => onSelectConversation(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectConversation(c.id) }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13" style={{ flexShrink: 0 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title || 'Untitled'}
              </span>
            </div>
          ))
        )}
        <div style={{ height: 12 }} />
      </div>

      <div className="sidebar-footer">
        <div className="user-row" onClick={handleSignOut} title="Sign out">
          <div className="avatar">{userInitial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
            <div className="user-role">{signingOut ? 'Signing out…' : 'Teacher · Sign out →'}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
