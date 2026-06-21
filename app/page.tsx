'use client'
import { useRef, useState, useEffect } from 'react'
import './globals.css'
import MessageList, { type Message } from './components/MessageList'
import MessageInput from './components/MessageInput'
import { uploadFile, streamChat, generateArtifact } from './lib/api'
import RightPanel from './components/RightPanel/RightPanel'
import Sidebar, { type MainView } from './components/Sidebar/Sidebar'
import LoginPage from './components/Auth/LoginPage'
import SavedView from './components/SavedView'
import AdminKB from './components/AdminKB'
import type { Note, ArtifactType, Artifacts } from './components/RightPanel/types'
import { parseCsv } from './lib/csvUtils'
import type { Thresholds } from './components/Cards/CriteriaSettingCard'
import { describeThresholds, thresholdPrompt } from './components/Cards/CriteriaSettingCard'
import { supabase } from './lib/supabase'
import type { SupabaseSession } from './lib/supabase'
import {
  createConversation,
  getConversationMessages,
  saveMessage,
  saveArtifact,
  listArtifacts,
} from './lib/db'

type Phase = 'idle' | 'confirming' | 'criteria' | 'chatting'

const LIBRARY_VIEWS = new Set(['library-all', 'library-strategy', 'library-reports', 'library-pending'])
const ACTIONS_VIEWS = new Set(['actions-plans', 'actions-agendas', 'actions-reports'])
const SETTINGS_VIEWS = new Set(['settings', 'kb'])

export default function Page() {
  // Auth
  const [session, setSession] = useState<SupabaseSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Chat
  const [messages, setMessages] = useState<Message[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [isStreaming, setIsStreaming] = useState(false)
  const [fileLabel, setFileLabel] = useState<string | undefined>()
  const [thresholds, setThresholds] = useState<Thresholds | undefined>()
  const [columnMapping, setColumnMapping] = useState<Record<string, string> | undefined>()
  const fileIdRef = useRef<string | undefined>(undefined)
  const apiMessages = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const conversationIdRef = useRef<string | undefined>(undefined)

  // Sidebar
  const [mainView, setMainView] = useState<MainView>('chat')
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const [savedCounts, setSavedCounts] = useState({ action_plan: 0, agenda: 0, report: 0 })

  // Right panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [panelTab, setPanelTab] = useState('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [artifacts, setArtifacts] = useState<Artifacts>({})
  const [generating, setGenerating] = useState<string | null>(null)

  // Load auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Reset all chat state when the logged-in user changes
  useEffect(() => {
    setMessages([])
    apiMessages.current = []
    setPhase('idle')
    fileIdRef.current = undefined
    conversationIdRef.current = undefined
    setActiveConversationId(undefined)
    setThresholds(undefined)
    setColumnMapping(undefined)
    setFileLabel(undefined)
    setNotes([])
    setArtifacts({})

    // Ensure a profile row exists for this user (handles accounts created outside normal signup)
    if (session?.user) {
      supabase.from('profiles').upsert(
        {
          id: session.user.id,
          email: session.user.email,
          role: 'teacher',
          name: session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? 'Teacher',
          school_name: session.user.user_metadata?.school_name ?? '',
        },
        { onConflict: 'id', ignoreDuplicates: true }
      ).then(({ error }) => { if (error) console.error('profile upsert failed:', error) })
    }
  }, [session?.user?.id])

  // Load saved artifact counts for sidebar badges
  useEffect(() => {
    if (!session) return
    Promise.all([
      listArtifacts('action_plans').then(r => r.length).catch(() => 0),
      listArtifacts('meeting_agendas').then(r => r.length).catch(() => 0),
      listArtifacts('reports').then(r => r.length).catch(() => 0),
    ]).then(([action_plan, agenda, report]) => setSavedCounts({ action_plan, agenda, report }))
  }, [session?.user?.id, sidebarRefreshKey])

  function addMessage(msg: Message) {
    setMessages(prev => [...prev, msg])
  }

  function replaceLastAssistant(
    updater: (prev: string) => string,
    newImages?: string[],
    newCsvs?: { filename: string; data: string }[],
    newTableCsvs?: { filename: string; csv: string }[],
  ) {
    setMessages(prev => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i]
        if (m.role === 'assistant' && !('isLoading' in m)) {
          next[i] = {
            ...m,
            content: updater(m.content),
            images: newImages ? [...(m.images ?? []), ...newImages] : m.images,
            csvs: newCsvs ? [...(m.csvs ?? []), ...newCsvs] : m.csvs,
            tableCsvs: newTableCsvs ? [...(m.tableCsvs ?? []), ...newTableCsvs] : m.tableCsvs,
          }
          return next
        }
      }
      return next
    })
  }

  async function doSend(userText: string, kbScope = 'student_success,general', thresholdsOverride?: Thresholds) {
    if (isStreaming) return
    setMainView('chat')

    // Create Supabase conversation on first real message
    if (session && !conversationIdRef.current) {
      try {
        const title = userText.slice(0, 60)
        const convo = await createConversation(title)
        conversationIdRef.current = convo.id
        setActiveConversationId(convo.id)
        setSidebarRefreshKey(k => k + 1)
      } catch (err) { console.error('createConversation failed:', err) }
    }

    addMessage({ role: 'user', content: userText })
    apiMessages.current.push({ role: 'user', content: userText })
    addMessage({ role: 'assistant', content: '' })
    setIsStreaming(true)

    // Persist user message
    if (session && conversationIdRef.current) {
      saveMessage(conversationIdRef.current, 'user', userText).catch(() => {})
    }

    let accumulated = ''
    const activeThresholds = thresholdsOverride ?? thresholds

    try {
      await streamChat({
        messages: apiMessages.current,
        fileId: fileIdRef.current,
        thresholdPrompt: activeThresholds ? thresholdPrompt(activeThresholds) : undefined,
        columnMapping: columnMapping ?? undefined,
        kbScope,
        onChunk(text) {
          accumulated += text
          replaceLastAssistant(() => accumulated)
        },
        onImage(data) { replaceLastAssistant(c => c, [data]) },
        onCsv(filename, data) { replaceLastAssistant(c => c, undefined, [{ filename, data }]) },
        onTableCsv(filename, csv) { replaceLastAssistant(c => c, undefined, undefined, [{ filename, csv }]) },
        onSources(sources) {
          setMessages(prev => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i]
              if (m.role === 'assistant' && !('isLoading' in m)) {
                next[i] = { ...m, sources }
                return next
              }
            }
            return next
          })
        },
      })
      apiMessages.current.push({ role: 'assistant', content: accumulated })

      // Persist assistant message
      if (session && conversationIdRef.current) {
        saveMessage(conversationIdRef.current, 'assistant', accumulated).catch(() => {})
      }
    } catch (err) {
      replaceLastAssistant(() => `Error: ${String(err)}`)
    } finally {
      setIsStreaming(false)
    }
  }

  async function handleFileSelect(file: File) {
    setMessages([])
    apiMessages.current = []
    setPhase('idle')
    fileIdRef.current = undefined
    conversationIdRef.current = undefined
    setActiveConversationId(undefined)
    setThresholds(undefined)
    setColumnMapping(undefined)
    setFileLabel(`Reading ${file.name}…`)
    addMessage({ role: 'assistant', isLoading: true })

    try {
      const [meta, { fileId: id }] = await Promise.all([parseCsv(file), uploadFile(file)])
      fileIdRef.current = id
      setFileLabel(meta.filename)

      // Ask Claude to suggest human-readable labels for all columns
      let suggestedLabels: Record<string, string> = {}
      try {
        const res = await fetch('/api/suggest-columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: meta.columns }),
        })
        if (res.ok) suggestedLabels = await res.json()
      } catch { /* non-fatal — card falls back to title-case */ }

      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      setPhase('confirming')
      addMessage({ role: 'card', type: 'data_confirm', data: { ...meta, suggestedLabels }, onConfirm: handleColumnsConfirmed })
    } catch (err) {
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      setFileLabel(undefined)
      addMessage({ role: 'assistant', content: `Could not read file: ${String(err)}` })
    }
  }

  function handleColumnsConfirmed(mapping: Record<string, string>) {
    setColumnMapping(mapping)
    setPhase('criteria')
    addMessage({ role: 'card', type: 'criteria', columnMapping: mapping, onConfirm: handleCriteriaConfirmed })
  }

  function handleCriteriaConfirmed(t: Thresholds) {
    setThresholds(t)
    setPhase('chatting')
    doSend(
      `Run a school-wide risk overview of the uploaded gradebook. ` +
      `Thresholds: ${describeThresholds(t)}. ` +
      `Compute: total students, count and % for each indicator, count and % for students with 2+ indicators, count and % for all 3. ` +
      `Output the risk_overview card, then write 2 sentences of key insight. Do not run grade breakdown or subgroup analysis yet.`,
      'student_success,general',
      t
    )
  }

  function handleChangeCriteria(t: Thresholds) {
    setThresholds(t)
    doSend(
      `Criteria updated to: ${describeThresholds(t)}. ` +
      `Re-run the school-wide risk overview from scratch using ONLY these thresholds — ignore any threshold values mentioned earlier in this conversation. ` +
      `Recompute all counts and percentages with the new criteria and output a fresh risk_overview card.`,
      'student_success,general',
      t
    )
  }

  async function handleSelectConversation(id: string) {
    if (isStreaming) return
    setActiveConversationId(id)
    conversationIdRef.current = id
    setMainView('chat')

    // Load messages from Supabase
    try {
      const dbMsgs = await getConversationMessages(id)
      const loaded: Message[] = dbMsgs.map(m => {
        if (m.role === 'user') return { role: 'user' as const, content: m.content, id: m.id }
        return { role: 'assistant' as const, content: m.content, id: m.id }
      })
      setMessages(loaded)
      apiMessages.current = dbMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      setPhase('chatting')
    } catch {
      addMessage({ role: 'assistant', content: 'Could not load conversation.' })
    }
  }

  function handleNewChat() {
    setMessages([])
    apiMessages.current = []
    setPhase('idle')
    fileIdRef.current = undefined
    conversationIdRef.current = undefined
    setActiveConversationId(undefined)
    setThresholds(undefined)
    setFileLabel(undefined)
    setMainView('chat')
  }

  function handleSend(text: string, kbScope?: string) {
    if (phase === 'confirming' || phase === 'criteria') return
    doSend(text, kbScope)
  }

  function handleRemoveFile() {
    fileIdRef.current = undefined
    setFileLabel(undefined)
    setThresholds(undefined)
    setPhase('idle')
    setMessages([])
    apiMessages.current = []
  }

  function addNote(content: string) {
    setNotes(prev => [...prev, { id: Date.now().toString(), content }])
    setPanelOpen(true)
    setPanelTab('notes')
  }

  function deleteNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function handleGenerate(type: ArtifactType) {
    setGenerating(type)
    try {
      const result = await generateArtifact(type, apiMessages.current)
      setArtifacts(prev => ({ ...prev, [type]: result }))

      // Auto-save to Supabase
      if (session) {
        const tableMap: Record<ArtifactType, 'action_plans' | 'meeting_agendas' | 'reports'> = {
          action_plan: 'action_plans',
          agenda: 'meeting_agendas',
          report: 'reports',
        }
        const title = type === 'action_plan' ? 'Action Plan' : type === 'agenda' ? 'Meeting Agenda' : 'Report'
        await saveArtifact(tableMap[type], title, result).catch(() => {})
        setSidebarRefreshKey(k => k + 1)
      }
    } catch (err) {
      console.error('Artifact generation failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  const inputDisabled = isStreaming || phase === 'confirming' || phase === 'criteria'
  const isNonChatView = LIBRARY_VIEWS.has(mainView) || ACTIONS_VIEWS.has(mainView) || SETTINGS_VIEWS.has(mainView)

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading EdVise…</span>
        </div>
      </div>
    )
  }

  if (!session) return <LoginPage />

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        session={session}
        mainView={mainView}
        setMainView={setMainView}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        activeConversationId={activeConversationId}
        refreshKey={sidebarRefreshKey}
        savedCounts={savedCounts}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isNonChatView ? (
          /* Library / Actions / Settings views */
          mainView === 'settings' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Settings coming soon
            </div>
          ) : mainView === 'kb' ? (
            <AdminKB session={session} />
          ) : mainView === 'library-pending' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Pending approval coming soon
            </div>
          ) : (
            <SavedView view={mainView} />
          )
        ) : (
          /* Chat view */
          <>
            <div className="chat-topbar">
              <div className="ev-av">Ev</div>
              <span className="tbar-title" style={{ marginLeft: 8 }}>
                {activeConversationId ? 'Edvise' : 'Edvise'}
              </span>
              <button
                className="tbar-btn"
                onClick={() => setPanelOpen(o => !o)}
                title="Notes & artifacts"
                style={{ marginLeft: 'auto', position: 'relative' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                {notes.length > 0 && (
                  <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, background: '#3E94A5', borderRadius: '50%', display: 'block' }} />
                )}
              </button>
            </div>

            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              onStarterClick={handleSend}
              onSuggestionClick={handleSend}
              onAddNote={addNote}
            />

            <MessageInput
              onSend={handleSend}
              onFileSelect={handleFileSelect}
              disabled={inputDisabled}
              fileLabel={fileLabel}
              onRemoveFile={fileLabel ? handleRemoveFile : undefined}
              thresholds={thresholds}
              onChangeCriteria={handleChangeCriteria}
            />
          </>
        )}
      </div>

      <RightPanel
        open={panelOpen}
        expanded={panelExpanded}
        onClose={() => setPanelOpen(false)}
        onExpand={() => setPanelExpanded(e => !e)}
        tab={panelTab}
        onTabChange={setPanelTab}
        notes={notes}
        onDeleteNote={deleteNote}
        artifacts={artifacts}
        generating={generating}
        onGenerate={handleGenerate}
      />
    </div>
  )
}
