'use client'
import { useRef, useState, useEffect } from 'react'
import './globals.css'
import MessageList, { type Message } from './components/MessageList'
import MessageInput, { type SourceKey } from './components/MessageInput'
import { uploadFile, streamChat, generateArtifact } from './lib/api'
import RightPanel from './components/RightPanel/RightPanel'
import Sidebar, { type MainView } from './components/Sidebar/Sidebar'
import LoginPage from './components/Auth/LoginPage'
import SavedView from './components/SavedView'
import ConversationsView from './components/ConversationsView'
import AdminKB from './components/AdminKB'
import type { Note, ArtifactType, Artifacts, Report } from './components/RightPanel/types'
import { ReportDetail } from './components/RightPanel/ReportTab'
import { parseCsv } from './lib/csvUtils'
import type { Thresholds } from './components/Cards/CriteriaSettingCard'
import { thresholdPrompt } from './components/Cards/CriteriaSettingCard'
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

const LIBRARY_VIEWS = new Set(['library-kb', 'library-all', 'library-strategy', 'library-reports', 'library-pending'])
const ACTIONS_VIEWS = new Set(['actions-plans', 'actions-agendas', 'actions-reports'])
const SETTINGS_VIEWS = new Set(['settings', 'kb'])
const CONVERSATIONS_VIEW = 'conversations'

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
  const [csvPreview, setCsvPreview] = useState<{ columns: string[]; rows: Record<string, string>[] } | undefined>()
  const [columnUniques, setColumnUniques] = useState<Record<string, string[]> | undefined>()
  const indicatorsRef = useRef<import('./api/suggest-columns/route').Indicators>({})
  const fileIdRef = useRef<string | undefined>(undefined)
  const apiMessages = useRef<{ role: 'user' | 'assistant'; content: string | unknown[] }[]>([])
  const conversationIdRef = useRef<string | undefined>(undefined)
  const pendingQuestionRef = useRef('')
  const clarifyToolCallRef = useRef<{ id: string; input: { question: string; choices: string[] } } | null>(null)

  // Sidebar
  const [mainView, setMainView] = useState<MainView>('chat')
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const [savedCounts, setSavedCounts] = useState({ action_plan: 0, agenda: 0, report: 0 })

  // Teacher-uploaded PDFs (in-memory for this session only)
  const [pdfFiles, setPdfFiles] = useState<{ name: string; fileId: string }[]>([])
  const [pdfUploading, setPdfUploading] = useState(false)

  // Lets the welcome page's "I have my own questions" card focus the textarea
  const [inputFocusTrigger, setInputFocusTrigger] = useState(0)

  // KB chip state — lifted here so suggestion clicks use the same chips as typed messages
  const [activeKB, setActiveKB] = useState<SourceKey[]>(['student_success', 'general'])

  function getKbScope(): string {
    const order: SourceKey[] = ['student_success', 'school', 'general', 'web']
    return order.filter(k => activeKB.includes(k)).join(',')
  }

  // Right panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [panelTab, setPanelTab] = useState('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [artifacts, setArtifacts] = useState<Artifacts>({})
  const [reportModal, setReportModal] = useState<{ report: Report; date: string; isNew: boolean } | null>(null)
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
    setCsvPreview(undefined)
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

  async function doSend(userText: string, kbScope = '', thresholdsOverride?: Thresholds, hidden = false, clarifyToolCallId?: string) {
    if (isStreaming) return
    setMainView('chat')

    // Create Supabase conversation on first message that has a file attached
    if (session && !conversationIdRef.current && fileIdRef.current) {
      try {
        const title = userText.slice(0, 60)
        const convo = await createConversation(title)
        conversationIdRef.current = convo.id
        setActiveConversationId(convo.id)
        setSidebarRefreshKey(k => k + 1)
      } catch (err) { console.error('createConversation failed:', err) }
    }

    if (!hidden) addMessage({ role: 'user', content: userText })
    if (clarifyToolCallId) {
      // Push proper tool_result content block so the model knows it already asked
      apiMessages.current.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: clarifyToolCallId, content: userText }],
      })
    } else {
      apiMessages.current.push({ role: 'user', content: userText })
    }
    addMessage({ role: 'assistant', content: '' })
    setIsStreaming(true)

    // Persist user message
    if (session && conversationIdRef.current) {
      saveMessage(conversationIdRef.current, 'user', userText).catch(() => {})
    }

    let accumulated = ''
    const activeThresholds = thresholdsOverride ?? thresholds
    // Tracks any ask_clarifying_question tool call that fires mid-stream
    let pendingToolCall: { id: string; input: { question: string; choices: string[] } } | null = null
    // Artifact type to auto-generate (set by update_plan tool SSE event)
    let pendingGenerate: ArtifactType | null = null

    try {
      await streamChat({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: apiMessages.current as any,
        fileId: fileIdRef.current,
        pdfFiles: pdfFiles.length ? pdfFiles : undefined,
        thresholdPrompt: activeThresholds ? thresholdPrompt(activeThresholds, indicatorsRef.current) : undefined,
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
        onUpdatePlan(artifactType) {
          pendingGenerate = artifactType
        },
        onAskChoices(toolCallId, question, choices, allowMultiple) {
          // Store so we can push proper tool_use block after stream ends
          pendingToolCall = { id: toolCallId, input: { question, choices } }
          clarifyToolCallRef.current = pendingToolCall
          const card: Message = {
            role: 'card',
            type: 'brainstorm_q',
            data: {
              questions: [{ id: 'clarify', label: question, options: choices }],
              submitLabel: allowMultiple ? 'Continue' : 'Continue',
            },
            onSubmit: handleClarifySubmit,
            id: Date.now().toString(),
          }
          // Replace the empty streaming placeholder with the card so only one Ev bubble shows
          setMessages(prev => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i]
              if (m.role === 'assistant' && !('isLoading' in m) && !(m as { content: string }).content?.trim()) {
                next[i] = card
                return next
              }
            }
            return [...next, card]
          })
        },
      })

      if (pendingToolCall) {
        // Push proper tool_use block — model will see [tool_use → tool_result] on next turn
        const tc = pendingToolCall as { id: string; input: { question: string; choices: string[] } }
        apiMessages.current.push({
          role: 'assistant',
          content: [{ type: 'tool_use', id: tc.id, name: 'ask_clarifying_question', input: tc.input }],
        })
      } else {
        apiMessages.current.push({ role: 'assistant', content: accumulated })
      }

      // Auto-generate artifact in the right panel if the model emitted a <!--GENERATE:--> marker
      if (pendingGenerate) {
        setPanelOpen(true)
        setPanelTab(pendingGenerate === 'agenda' ? 'agenda' : 'action_plan')
        handleGenerate(pendingGenerate)
      }

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

  async function handlePdfSelect(file: File) {
    setPdfUploading(true)
    try {
      const { fileId: id } = await uploadFile(file)
      setPdfFiles(prev => [...prev, { name: file.name, fileId: id }])
    } catch (err) {
      console.error('PDF upload failed:', err)
    } finally {
      setPdfUploading(false)
    }
  }

  function handleRemovePdf(fileId: string) {
    setPdfFiles(prev => prev.filter(f => f.fileId !== fileId))
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
    setCsvPreview(undefined)
    setColumnUniques(undefined)
    indicatorsRef.current = {}
    setFileLabel(`Reading ${file.name}…`)
    addMessage({ role: 'assistant', isLoading: true })

    try {
      const [meta, { fileId: id }] = await Promise.all([parseCsv(file), uploadFile(file)])
      fileIdRef.current = id
      setFileLabel(meta.filename)
      setCsvPreview({ columns: meta.columns, rows: meta.preview })
      setColumnUniques(meta.columnUniques)

      // Ask Claude to suggest human-readable labels and classify risk indicator columns
      let suggestedLabels: Record<string, string> = {}
      let detectedIndicators: import('./api/suggest-columns/route').Indicators = {}
      try {
        const res = await fetch('/api/suggest-columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: meta.columns, preview: meta.preview }),
        })
        if (res.ok) {
          const body = await res.json()
          suggestedLabels = body.labels ?? body  // backward-compat if labels is missing
          detectedIndicators = body.indicators ?? {}
        }
      } catch { /* non-fatal — card falls back to title-case */ }

      indicatorsRef.current = detectedIndicators
      console.log('📊 Detected indicators:', detectedIndicators)
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
    addMessage({ role: 'card', type: 'criteria', columnMapping: mapping, columnUniques: columnUniques ?? {}, indicators: indicatorsRef.current, onConfirm: handleCriteriaConfirmed })
  }

  function handleCriteriaConfirmed(t: Thresholds) {
    setThresholds(t)
    setPhase('chatting')
    doSend('Run the school-wide risk overview.', '', t)
  }

  function handleChangeCriteria(t: Thresholds) {
    setThresholds(t)
    doSend('Re-run the school-wide risk overview with the updated criteria.', '', t)
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
    setCsvPreview(undefined)
    setColumnUniques(undefined)
    setFileLabel(undefined)
    setPdfFiles([])
    setMainView('chat')
  }

  function handleSend(text: string, kbScope?: string) {
    if (phase === 'confirming' || phase === 'criteria') return
    if (text === 'Brainstorm interventions') {
      showBrainstormCard()
      return
    }
    if (text === 'Run foundational analysis') {
      if (!fileIdRef.current) {
        addMessage({
          role: 'assistant',
          content: `The foundational analysis walks through **4 stages**:\n\n1. **Risk Overview** — school-wide picture of how many students carry risk flags\n2. **Grade Breakdown** — where risk is most concentrated by grade level\n3. **Subgroup Analysis** — equity patterns across race/ethnicity, ELL status, and gender\n4. **SEL Analysis** — how at-risk students experience school through engagement, connectedness, and wellbeing\n\nUpload your gradebook CSV below to begin.`,
        })
        setInputFocusTrigger(n => n + 1)
        return
      }
      addMessage({
        role: 'assistant',
        content: `The foundational analysis walks through **4 stages**:\n\n1. **Risk Overview** — school-wide picture of how many students carry risk flags\n2. **Grade Breakdown** — where risk is most concentrated by grade level\n3. **Subgroup Analysis** — equity patterns across race/ethnicity, ELL status, and gender\n4. **SEL Analysis** — how at-risk students experience school through engagement, connectedness, and wellbeing\n\nStarting with Stage 1 now.`,
      })
      doSend('Run the school-wide risk overview.', '')
      return
    }
    if (text === 'I have my own questions') {
      addMessage({ role: 'assistant', content: "Go ahead — ask anything. You can upload a CSV, a PDF, or just type your question." })
      setInputFocusTrigger(n => n + 1)
      return
    }
    doSend(text, kbScope ?? getKbScope())
  }

  function handleClarifySubmit(answers: string) {
    const toolCallId = clarifyToolCallRef.current?.id
    clarifyToolCallRef.current = null
    doSend(answers, getKbScope(), undefined, true, toolCallId)
  }

  function showBrainstormCard() {
    // Grade levels: read from actual data via the column whose label contains "grade"
    const gradeOptions: string[] = (() => {
      if (!columnUniques || !columnMapping) return ['All grades']
      const gradeKey = Object.entries(columnMapping).find(([, label]) =>
        /\bgrade\b/i.test(label)
      )?.[0]
      if (!gradeKey) return ['All grades']
      const vals = (columnUniques[gradeKey] ?? [])
        .filter(Boolean)
        .sort((a, b) => {
          const na = parseFloat(a), nb = parseFloat(b)
          return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
        })
      return vals.length ? [...vals, 'All grades'] : ['All grades']
    })()

    // Subgroups: only show options for demographic columns that actually exist
    const subgroupOptions: string[] = (() => {
      const opts: string[] = []
      if (!columnMapping) {
        return ['ELL students', 'Hispanic students', 'Special Education students', 'Black students', 'Male students', 'All flagged students']
      }
      const labels = Object.values(columnMapping).map(l => l.toLowerCase())
      if (labels.some(l => /race|ethnicity/i.test(l))) opts.push('Hispanic students', 'Black students', 'White students')
      if (labels.some(l => /gender|sex\b/i.test(l))) opts.push('Male students', 'Female students')
      if (labels.some(l => /special.ed|sped|\biep\b/i.test(l))) opts.push('Special Education students')
      if (labels.some(l => /\bell\b|english.learn|esl/i.test(l))) opts.push('ELL students')
      opts.push('All flagged students')
      return opts.length > 1 ? opts : ['ELL students', 'Hispanic students', 'Special Education students', 'Black students', 'Male students', 'All flagged students']
    })()

    // Indicators: only show the ones configured in thresholds
    const indicatorOptions: string[] = (() => {
      const opts: string[] = []
      if (!thresholds) return ['Academic Failure', 'Chronic Absence', 'Suspensions / Behavior', 'All risk indicators']
      if (thresholds.absencePct != null || thresholds.absenceDays != null) opts.push('Chronic Absence')
      if (thresholds.suspensionMin != null) opts.push('Suspensions / Behavior')
      if (thresholds.failingGrade != null || thresholds.failingCount != null) opts.push('Academic Failure')
      if (opts.length > 1) opts.push('All risk indicators')
      return opts.length ? opts : ['Academic Failure', 'Chronic Absence', 'Suspensions / Behavior', 'All risk indicators']
    })()

    addMessage({
      role: 'card',
      type: 'brainstorm_q',
      data: {
        promptPrefix: 'Please brainstorm targeted, evidence-based interventions based on these priorities:',
        submitLabel: 'Generate interventions',
        questions: [
          { id: 'subgroup', label: 'Which subgroup(s) would you like to focus on?', options: subgroupOptions },
          { id: 'indicator', label: 'Which risk indicator(s) are your priority?', options: indicatorOptions },
          { id: 'grade', label: 'Which grade levels?', options: gradeOptions },
          { id: 'resources', label: 'What resources or constraints should I keep in mind?', options: ['Limited counselor capacity', 'Budget constraints', 'Existing programs in place', 'Community partnerships available', 'No constraints'] },
        ],
      },
      onSubmit: handleBrainstormSubmit,
    })
  }

  function handleSuggestionClick(text: string, needsKB: boolean) {
    if (phase === 'confirming' || phase === 'criteria') return
    if (text === 'Brainstorm interventions') {
      showBrainstormCard()
      return
    }
    doSend(text, needsKB ? getKbScope() : '')
  }

  function handleBrainstormSubmit(text: string) {
    doSend(text, getKbScope(), undefined, true)
  }

  function handleRemoveFile() {
    fileIdRef.current = undefined
    setFileLabel(undefined)
    setThresholds(undefined)
    setCsvPreview(undefined)
    setColumnUniques(undefined)
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

  async function handleGenerate(type: ArtifactType, noteIds?: string[], reportTemplate?: string) {
    setGenerating(type)
    try {
      const selectedNotes = noteIds
        ? notes.filter(n => noteIds.includes(n.id))
        : notes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateArtifact(type, apiMessages.current as any, selectedNotes, reportTemplate)
      setArtifacts(prev => ({ ...prev, [type]: result }))
    } catch (err) {
      console.error('Artifact generation failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  async function handleSaveArtifact(type: ArtifactType) {
    if (!session || !artifacts[type]) return
    const tableMap: Record<ArtifactType, 'action_plans' | 'meeting_agendas' | 'reports'> = {
      action_plan: 'action_plans', agenda: 'meeting_agendas', report: 'reports',
    }
    const art = artifacts[type] as { title?: string }
    const title = art.title ?? (type === 'action_plan' ? 'Action Plan' : type === 'agenda' ? 'Meeting Agenda' : 'Report')
    await saveArtifact(tableMap[type], title, artifacts[type]).catch(() => {})
    setSidebarRefreshKey(k => k + 1)
  }

  function handleDiscardArtifact(type: ArtifactType) {
    setArtifacts(prev => ({ ...prev, [type]: undefined }))
  }

  const inputDisabled = isStreaming || phase === 'confirming' || phase === 'criteria'
  const isNonChatView = LIBRARY_VIEWS.has(mainView) || ACTIONS_VIEWS.has(mainView) || SETTINGS_VIEWS.has(mainView) || mainView === CONVERSATIONS_VIEW

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
        notesCount={notes.length}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isNonChatView ? (
          /* Library / Actions / Settings views */
          mainView === CONVERSATIONS_VIEW ? (
            <ConversationsView
              onSelect={id => { handleSelectConversation(id); setMainView('chat') }}
              onNewChat={() => { handleNewChat(); setMainView('chat') }}
            />
          ) : mainView === 'settings' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Settings coming soon
            </div>
          ) : mainView === 'kb' || mainView === 'library-kb' ? (
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
              onSuggestionClick={handleSuggestionClick}
              onFocusInput={() => setInputFocusTrigger(n => n + 1)}
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
              csvPreview={csvPreview}
              activeKB={activeKB}
              onToggleSource={k => setActiveKB(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
              pdfFiles={pdfFiles}
              pdfUploading={pdfUploading}
              onPdfSelect={handlePdfSelect}
              onRemovePdf={handleRemovePdf}
              focusTrigger={inputFocusTrigger}
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
        onSave={handleSaveArtifact}
        onDiscard={handleDiscardArtifact}
        onOpenReportModal={(report, date, isNew) => setReportModal({ report, date, isNew })}
      />

      {/* Report modal */}
      {reportModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setReportModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 720, height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', borderBottom: '1px solid #f0f2f8', flexShrink: 0 }}>
              <button
                onClick={() => setReportModal(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
              >
                ×
              </button>
            </div>
            {/* Report content */}
            <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px' }}>
              <ReportDetail
                report={reportModal.report}
                date={reportModal.date}
                onClose={() => setReportModal(null)}
                onSave={reportModal.isNew ? () => handleSaveArtifact('report') : undefined}
                onDiscard={reportModal.isNew ? () => { handleDiscardArtifact('report'); setReportModal(null) } : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
