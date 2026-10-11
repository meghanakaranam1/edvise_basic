'use client'
import { useRef, useState, useEffect } from 'react'
import './globals.css'
import MessageList, { type Message } from './components/MessageList'
import MessageInput, { type SourceKey } from './components/MessageInput'
import { uploadFile, getGoogleToken, importGoogleSheet, getGoogleSheetTabs, fetchIdentityColumns, shareConversation, getConversationMembers, streamChat, generateArtifact } from './lib/api'
import { openGoogleSheetPicker } from './lib/googlePicker'
import RightPanel from './components/RightPanel/RightPanel'
import Sidebar, { type MainView } from './components/Sidebar/Sidebar'
import LoginPage from './components/Auth/LoginPage'
import SavedView from './components/SavedView'
import ConversationsView from './components/ConversationsView'
import AdminKB from './components/AdminKB'
import SchoolContextSettings from './components/Settings/SchoolContextSettings'
import type { Note, ArtifactType, Artifacts, Report } from './components/RightPanel/types'
import { parseCsv, parseCsvText, type CsvMeta } from './lib/csvUtils'
import { isSpreadsheetFile, parseWorkbook } from './lib/xlsxParse'
import { sheetsToCsv, summarizeSheet, chooseSetupSheet, type SheetTable } from './lib/sheetMerge'
import type { Thresholds } from './components/Cards/CriteriaSettingCard'
import { signalKey } from './components/Cards/CriteriaSettingCard'
import { thresholdPrompt } from './components/Cards/CriteriaSettingCard'
import { supabase } from './lib/supabase'
import type { SupabaseSession } from './lib/supabase'
import {
  createConversation,
  getConversationMessages,
  saveMessage,
  saveArtifact,
  listArtifacts,
  saveConversationFiles,
  getConversationFiles,
  listContextRules,
  addContextRule,
  updateConversationTitle,
} from './lib/db'

type Phase = 'idle' | 'confirming' | 'criteria' | 'chatting'

const LIBRARY_VIEWS = new Set(['library-kb', 'library-all', 'library-strategy', 'library-reports', 'library-pending'])
const ACTIONS_VIEWS = new Set(['actions'])
const SETTINGS_VIEWS = new Set(['settings', 'kb'])
const CONVERSATIONS_VIEW = 'conversations'

// Team Workspace (sharing a conversation + @Edvise mentions) is built and the
// DB migration is live, but not launched to teachers yet — gated behind this
// flag so the entry points (Share button, sidebar section) stay hidden in
// prod until it's ready to announce. Flip NEXT_PUBLIC_ENABLE_SHARING=true to
// turn it on; no further deploy needed on the code side.
const ENABLE_TEAM_SHARING = process.env.NEXT_PUBLIC_ENABLE_SHARING === 'true'

// Google Sheets import is built (OAuth flow, picker, tab merge) but not
// ready to ship yet — gated behind this flag so the "Import from Google
// Sheets" entry point in the chat input stays hidden in prod. Flip
// NEXT_PUBLIC_ENABLE_GOOGLE_SHEETS=true to turn it on.
const ENABLE_GOOGLE_SHEETS = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SHEETS === 'true'

export default function Page() {
  // Auth
  const [session, setSession] = useState<SupabaseSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Chat
  const [messages, setMessages] = useState<Message[]>([])
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const [phase, setPhase] = useState<Phase>('idle')
  const [isStreaming, setIsStreaming] = useState(false)
  const [fileLabel, setFileLabel] = useState<string | undefined>()
  const [thresholds, setThresholds] = useState<Thresholds | undefined>()
  const [columnMapping, setColumnMapping] = useState<Record<string, string> | undefined>()
  const [csvPreview, setCsvPreview] = useState<{ columns: string[]; rows: Record<string, string>[] } | undefined>()
  const [columnUniques, setColumnUniques] = useState<Record<string, string[]> | undefined>()
  // handleColumnsConfirmed is captured into the data_confirm card's onConfirm
  // closure at the moment presentImportedCsv calls addMessage — since that
  // happens in the same render generation as the setColumnUniques call just
  // above it, the closure would otherwise see columnUniques as it was BEFORE
  // this import (stale by one import, or empty on the very first one). A ref
  // sidesteps that: unlike state, ref.current is always the latest value
  // regardless of which render's closure is reading it (same reason
  // indicatorsRef exists below).
  const columnUniquesRef = useRef<Record<string, string[]> | undefined>(undefined)
  const indicatorsRef = useRef<import('./api/suggest-columns/route').Indicators>([])
  const fileIdRef = useRef<string | undefined>(undefined)
  // Extra files alongside fileIdRef, for multi-sheet uploads kept as separate
  // (unmerged) files — fileIdRef still points at the primary sheet for the
  // "is there an active dataset" checks and criteria/threshold detection;
  // this holds all of them (including the primary) for the chat call to
  // attach as multiple container_upload blocks.
  const fileIdsRef = useRef<{ fileId: string; filename: string }[]>([])
  const apiMessages = useRef<{ role: 'user' | 'assistant'; content: string | unknown[] }[]>([])
  const conversationIdRef = useRef<string | undefined>(undefined)
  const pendingQuestionRef = useRef('')
  // Note ids selected in the Notes-tab picker when manually requesting a
  // document — carried across the chat round trip (clarifying questions ->
  // update_plan) so the eventual generation still scopes to just those
  // notes instead of silently falling back to all of them. Cleared once
  // consumed by the update_plan handler below.
  const manualGenerateNoteIdsRef = useRef<string[] | null>(null)
  const clarifyToolCallRef = useRef<{ id: string; input: { question: string; choices: string[] } } | null>(null)

  // Sidebar
  const [mainView, setMainView] = useState<MainView>('chat')
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const [savedCounts, setSavedCounts] = useState({ action_plan: 0, agenda: 0, report: 0 })

  // Teacher-uploaded PDFs (in-memory for this session only)
  const [pdfFiles, setPdfFiles] = useState<{ name: string; fileId: string }[]>([])
  const [pdfUploading, setPdfUploading] = useState(false)
  const [sheetImporting, setSheetImporting] = useState(false)

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
  const [panelWidth, setPanelWidth] = useState(360)
  const [panelTab, setPanelTab] = useState('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const schoolContextRef = useRef<string>('')

  // Sharing a conversation into the Team Workspace
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareEmailsInput, setShareEmailsInput] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<{ added: string[]; notFound: string[] } | null>(null)
  const [members, setMembers] = useState<{ userId: string; role: string; name: string; email: string }[]>([])

  async function openShareModal() {
    setShareResult(null)
    setShareModalOpen(true)
    if (session && conversationIdRef.current) {
      const m = await getConversationMembers(conversationIdRef.current, session.access_token)
      setMembers(m)
    }
  }

  async function handleShare() {
    if (!session || !conversationIdRef.current) return
    const emails = shareEmailsInput.split(',').map(e => e.trim()).filter(Boolean)
    if (!emails.length) return
    setSharing(true)
    try {
      const result = await shareConversation(conversationIdRef.current, emails, session.access_token)
      setShareResult(result)
      setShareEmailsInput('')
      const m = await getConversationMembers(conversationIdRef.current, session.access_token)
      setMembers(m)
      setSidebarRefreshKey(k => k + 1)
    } catch (err) {
      setShareResult({ added: [], notFound: [] })
      console.error('Failed to share conversation:', err)
    } finally {
      setSharing(false)
    }
  }

  async function refreshSchoolContext(userId: string) {
    const rules = await listContextRules(userId)
    schoolContextRef.current = rules.filter(r => r.enabled).map(r => r.text).join('\n\n')
  }
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
    fileIdsRef.current = []
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
      ).then(({ error }) => {
        if (error) console.error('profile upsert failed:', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
      })
      refreshSchoolContext(session.user.id)
    } else {
      schoolContextRef.current = ''
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

  // Live sync for shared conversations: teammates' messages (and Edvise's replies to them)
  // appear without a refresh. Own messages are skipped since they're already added locally
  // when sent; dedup for others is by recent role+content match (DB row ids aren't tracked
  // on locally-added messages, so exact-id dedup isn't available here).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)
  const [remoteTyping, setRemoteTyping] = useState<string | null>(null)
  // True while this viewer is rendering someone else's Edvise answer as it streams
  // in live (via broadcast chunks), rather than one they triggered themselves.
  const remoteStreamingRef = useRef(false)

  useEffect(() => {
    if (!activeConversationId || !session) return
    const channel = supabase
      .channel(`messages-${activeConversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new as { role: 'user' | 'assistant'; content: string; user_id: string | null }
          if (row.role === 'user') {
            if (row.user_id === session.user.id) return
            const alreadyHave = messagesRef.current.slice(-3).some(m => 'content' in m && m.role === 'user' && m.content === row.content)
            if (!alreadyHave) {
              const sender = members.find(m => m.userId === row.user_id)
              addMessage({ role: 'user', content: row.content, senderName: sender?.name ?? 'Teammate' })
            }
          } else {
            setRemoteTyping(null)
            if (remoteStreamingRef.current) {
              // Reconcile with the authoritative saved text, in case a broadcast
              // chunk was dropped in transit (Realtime broadcast isn't guaranteed
              // delivery, unlike the row insert itself).
              remoteStreamingRef.current = false
              replaceLastAssistant(() => row.content)
            } else {
              const alreadyHave = messagesRef.current.slice(-3).some(m => 'content' in m && m.role === 'assistant' && m.content === row.content)
              if (!alreadyHave) addMessage({ role: 'assistant', content: row.content })
            }
          }
          apiMessages.current.push({ role: row.role, content: row.content })
        }
      )
      // Ephemeral "Edvise is answering…" signal — not persisted, just broadcast live
      // to whoever else has this conversation open while a request is in flight.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('broadcast', { event: 'edvise_typing' }, (msg: any) => {
        const { userId, name, status } = msg.payload ?? {}
        if (userId === session.user.id) return
        if (status === 'start') remoteStreamingRef.current = false
        setRemoteTyping(status === 'start' ? (name ?? 'Someone') : null)
      })
      // Relays the asker's own streamed tokens so teammates see the answer build
      // live, not just a typing indicator followed by the finished text.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('broadcast', { event: 'edvise_stream' }, (msg: any) => {
        const { userId, chunk } = msg.payload ?? {}
        if (userId === session.user.id || !chunk) return
        setRemoteTyping(null)
        if (!remoteStreamingRef.current) {
          remoteStreamingRef.current = true
          addMessage({ role: 'assistant', content: chunk })
        } else {
          replaceLastAssistant(prev => prev + chunk)
        }
      })
      .subscribe()
    channelRef.current = channel
    setRemoteTyping(null)
    remoteStreamingRef.current = false
    return () => { supabase.removeChannel(channel); channelRef.current = null }
  }, [activeConversationId, session?.user?.id, members])

  function broadcastEdviseTyping(status: 'start' | 'stop') {
    if (!channelRef.current || !session) return
    const name = members.find(m => m.userId === session.user.id)?.name ?? session.user.email ?? 'A teammate'
    channelRef.current.send({ type: 'broadcast', event: 'edvise_typing', payload: { userId: session.user.id, name, status } })
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

  // Plain message to teammates in a shared conversation — persisted and broadcast
  // via realtime, but never sent to Edvise. Kept in apiMessages so that if someone
  // later clicks "Ask Edvise", it has the intervening team discussion as context.
  async function doSendPlain(userText: string) {
    if (isStreaming || !session || !conversationIdRef.current) return
    addMessage({ role: 'user', content: userText })
    apiMessages.current.push({ role: 'user', content: userText })
    saveMessage(conversationIdRef.current, 'user', userText, session.user.id).catch(() => {})
  }

  async function doSend(userText: string, kbScope = '', thresholdsOverride?: Thresholds, hidden = false, clarifyToolCallId?: string) {
    if (isStreaming) return
    setMainView('chat')

    // Create Supabase conversation on the first message of this session,
    // whether or not a file is attached — a pure-chat conversation (no
    // upload) previously never got persisted at all: no row, no saved
    // messages, no sidebar entry, nothing survived a refresh.
    if (session && !conversationIdRef.current) {
      try {
        const title = userText.slice(0, 60)
        const convo = await createConversation(title, session.user.id)
        conversationIdRef.current = convo.id
        setActiveConversationId(convo.id)
        setSidebarRefreshKey(k => k + 1)
        // Persist uploaded file references so they survive logout/reload
        const filesToSave = [
          ...(fileIdsRef.current.length
            ? fileIdsRef.current.map(f => ({ file_id: f.fileId, filename: f.filename, file_type: 'csv' }))
            : fileIdRef.current ? [{ file_id: fileIdRef.current, filename: fileLabel ?? 'data.csv', file_type: 'csv' }] : []),
          ...pdfFiles.map(f => ({ file_id: f.fileId, filename: f.name, file_type: 'pdf' })),
        ]
        if (filesToSave.length) saveConversationFiles(convo.id, filesToSave).catch(() => {})
        // Upgrade the raw-text fallback title to a short, meaningful one once
        // it's ready — off the critical path, so the conversation is usable
        // immediately with the fallback in the meantime.
        fetch('/api/generate-title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: userText }),
        })
          .then(res => res.json())
          .then(({ title: generatedTitle }: { title: string | null }) => {
            if (!generatedTitle) return
            updateConversationTitle(convo.id, generatedTitle).then(() => setSidebarRefreshKey(k => k + 1))
          })
          .catch(() => {})
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
    broadcastEdviseTyping('start')

    // Persist user message
    if (session && conversationIdRef.current) {
      saveMessage(conversationIdRef.current, 'user', userText, session.user.id).catch(() => {})
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
        // Multiple unmerged sheets: send them all as fileIds so Claude can
        // cross-reference them itself. Otherwise, the single-file path as before.
        ...(fileIdsRef.current.length > 1
          ? { fileIds: fileIdsRef.current }
          : { fileId: fileIdRef.current }),
        pdfFiles: pdfFiles.length ? pdfFiles : undefined,
        thresholdPrompt: activeThresholds ? thresholdPrompt(activeThresholds, indicatorsRef.current) : undefined,
        columnMapping: columnMapping ?? undefined,
        schoolContext: schoolContextRef.current || undefined,
        kbScope,
        userSchool: session?.user?.user_metadata?.school_name || undefined,
        onChunk(text) {
          accumulated += text
          replaceLastAssistant(() => accumulated)
          if (session) channelRef.current?.send({ type: 'broadcast', event: 'edvise_stream', payload: { userId: session.user.id, chunk: text } })
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

      // Auto-generate artifact in the right panel if the model called update_plan
      if (pendingGenerate) {
        setPanelOpen(true)
        setPanelTab(pendingGenerate)
        const scopedNoteIds = manualGenerateNoteIdsRef.current ?? undefined
        manualGenerateNoteIdsRef.current = null
        handleGenerate(pendingGenerate, scopedNoteIds)
      }

      // Persist assistant message
      if (session && conversationIdRef.current) {
        saveMessage(conversationIdRef.current, 'assistant', accumulated).catch(() => {})
      }
    } catch (err) {
      replaceLastAssistant(() => `Error: ${String(err)}`)
    } finally {
      setIsStreaming(false)
      broadcastEdviseTyping('stop')
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

  function resetForNewImport(loadingLabel: string) {
    setMessages([])
    apiMessages.current = []
    setPhase('idle')
    fileIdRef.current = undefined
    fileIdsRef.current = []
    conversationIdRef.current = undefined
    setActiveConversationId(undefined)
    setThresholds(undefined)
    setColumnMapping(undefined)
    setCsvPreview(undefined)
    setColumnUniques(undefined)
    columnUniquesRef.current = undefined
    indicatorsRef.current = []
    setFileLabel(loadingLabel)
    addMessage({ role: 'assistant', isLoading: true })
  }

  // Shared by file upload and Google Sheets import: given parsed CSV metadata and
  // the Anthropic file id it was uploaded to, ask Claude to label columns and
  // show the confirmation card. `extra` lets a multi-sheet import (see
  // presentImportedSheets) fold in indicators/columns/labels found on OTHER
  // sheets than the one being confirmed here — most commonly a disciplinary
  // column, which almost never lives on the roster. Anything this sheet finds
  // or defines on its own takes priority over the extras on a naming conflict.
  async function presentImportedCsv(
    meta: CsvMeta,
    fileId: string,
    formulaRules?: string[],
    extra?: {
      indicators?: import('./api/suggest-columns/route').Indicators
      columnUniques?: Record<string, string[]>
      columns?: string[]
      labels?: Record<string, string>
      columnSources?: Record<string, string>
      // The real uploaded filename backing `meta`, when it differs from
      // meta.filename — presentImportedSheets sets meta.filename to the
      // original workbook name for display, but signals need the actual
      // per-sheet csv filename Claude can find under /files/input/.
      setupSourceFile?: string
    }
  ) {
    fileIdRef.current = fileId
    setFileLabel(meta.filename)
    setCsvPreview({ columns: meta.columns, rows: meta.preview })
    // columnUniques carries two key schemes: bare column names (setup sheet
    // only — used by the grade-level lookup below, which has no concept of
    // other sheets) AND "sourceFile::column" (every sheet, including setup —
    // used by the criteria UI to look up the RIGHT sheet's values when a
    // multi-tab upload has two sheets sharing a column name, which would
    // otherwise silently collide under the bare-name scheme alone).
    const setupSourceFileForUniques = extra?.setupSourceFile ?? meta.filename
    const scopedSetupUniques = Object.fromEntries(
      Object.entries(meta.columnUniques).map(([col, vals]) => [signalKey({ column: col, sourceFile: setupSourceFileForUniques }), vals])
    )
    const mergedUniques = { ...extra?.columnUniques, ...scopedSetupUniques, ...meta.columnUniques }
    setColumnUniques(mergedUniques)
    columnUniquesRef.current = mergedUniques

    // Ask Claude to suggest human-readable labels and classify risk indicator columns
    let suggestedLabels: Record<string, string> = {}
    let detectedIndicators: import('./api/suggest-columns/route').Indicators = []
    try {
      const res = await fetch('/api/suggest-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: meta.columns, preview: meta.preview, columnUniques: meta.columnUniques }),
      })
      if (res.ok) {
        const body = await res.json()
        suggestedLabels = body.labels ?? body  // backward-compat if labels is missing
        detectedIndicators = body.indicators ?? []
      }
    } catch { /* non-fatal — card falls back to title-case */ }

    const setupSourceFile = extra?.setupSourceFile ?? meta.filename
    indicatorsRef.current = [
      ...detectedIndicators.map(s => ({ ...s, sourceFile: s.sourceFile ?? setupSourceFile })),
      ...(extra?.indicators ?? []),
    ]
    const allColumns = [...meta.columns, ...(extra?.columns ?? []).filter(c => !meta.columns.includes(c))]
    const allLabels = { ...extra?.labels, ...suggestedLabels }
    setMessages(prev => prev.filter(m => !('isLoading' in m)))
    setPhase('confirming')
    addMessage({ role: 'card', type: 'data_confirm', data: { ...meta, columns: allColumns, suggestedLabels: allLabels, formulaRules, columnSources: extra?.columnSources }, onConfirm: handleColumnsConfirmed })
  }

  function tableSample(t: SheetTable): Record<string, string>[] {
    return t.rows.slice(0, 5).map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ''])))
  }

  // Sheets are never merged — each selected sheet is uploaded as its own
  // separate, untouched file, and Claude cross-references them itself via
  // code execution when a question needs more than one (validated directly:
  // given two unmerged files, it correctly found the join key per file on its
  // own — ID in one, name in another — and computed an exact match against
  // known ground truth). Merging used to force every sheet into one flattened
  // table for setup, which is exactly what caused a real bug: a behavior
  // sheet's "any incident" count got mislabeled as "suspension," silently
  // conflating a parent conference with an actual suspension. One sheet
  // (whichever is naturally one-row-per-student — picked automatically, never
  // shown to the teacher as a "primary" sheet) still owns the "N students"
  // count and drives absence/academic-failure detection, but the column
  // confirmation screen itself shows EVERY selected sheet's columns — every
  // other sheet is independently classified for its own labels and, most
  // often, a disciplinary column with real category values (e.g. "In School
  // Suspension" vs. "Parent Conference") rather than a pre-counted number.
  async function presentImportedSheets(tables: SheetTable[], idxs: number[], filename: string) {
    addMessage({ role: 'assistant', isLoading: true })
    try {
      const summaries = tables.map(summarizeSheet)
      const setupIdx = chooseSetupSheet(summaries, idxs)
      const otherIdxs = idxs.filter(i => i !== setupIdx)

      const uploads = await Promise.all(idxs.map(async i => {
        const table = tables[i]
        const csvText = sheetsToCsv(table.headers, table.rows)
        const csvFilename = `${table.name}.csv`
        const csvFile = new File([csvText], csvFilename, { type: 'text/csv' })
        const { fileId: id } = await uploadFile(csvFile)
        return { i, fileId: id, filename: csvFilename, csvText }
      }))
      fileIdsRef.current = uploads.map(u => ({ fileId: u.fileId, filename: u.filename }))

      // Classify every other sheet IN PARALLEL, not one at a time — this can
      // easily be 3-4 sheets, and each classification call takes a few
      // seconds on its own, so doing them sequentially would make a 5-sheet
      // import noticeably slower for no reason (they're fully independent).
      let extraColumns: string[] = []
      const columnSources: Record<string, string> = {}
      const otherResults = await Promise.all(otherIdxs.map(async i => {
        const u = uploads.find(x => x.i === i)!
        const otherMeta = parseCsvText(u.csvText, u.filename)
        extraColumns.push(...otherMeta.columns)
        otherMeta.columns.forEach(c => { if (!columnSources[c]) columnSources[c] = tables[i].name })
        try {
          const res = await fetch('/api/suggest-columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columns: otherMeta.columns, preview: otherMeta.preview, columnUniques: otherMeta.columnUniques }),
          })
          if (res.ok) {
            const body = await res.json()
            const found: import('./api/suggest-columns/route').Indicators = body.indicators ?? []
            const foundLabels: Record<string, string> = body.labels ?? {}
            // Every sheet's own signals are kept, not just the first found —
            // e.g. a tardy log and a separate suspension log can BOTH
            // contribute independent "behavior" signals, combined with OR
            // later in the criteria step rather than one silently winning.
            // columnUniques is scoped "sourceFile::column" here (not bare
            // column name) so that two sheets sharing a column name — common
            // in a multi-tab upload — don't silently clobber each other once
            // merged across sheets below.
            const scopedUniques = Object.fromEntries(
              Object.entries(otherMeta.columnUniques).map(([col, vals]) => [signalKey({ column: col, sourceFile: u.filename }), vals])
            )
            return { labels: foundLabels, columnUniques: scopedUniques, indicators: found.map(s => ({ ...s, sourceFile: u.filename })) }
          }
        } catch { /* non-fatal — this sheet's columns just won't get labeled/classified */ }
        return { labels: {}, columnUniques: {}, indicators: [] as import('./api/suggest-columns/route').Indicators }
      }))
      extraColumns = Array.from(new Set(extraColumns))
      const extraLabels = Object.assign({}, ...otherResults.map(r => r.labels))
      const extraColumnUniques = Object.assign({}, ...otherResults.map(r => r.columnUniques))
      const extraIndicators: import('./api/suggest-columns/route').Indicators = otherResults.flatMap(r => r.indicators)

      const setupUpload = uploads.find(u => u.i === setupIdx)!
      const meta = parseCsvText(setupUpload.csvText, filename)
      const setupColumnSet = new Set(meta.columns)
      for (const c of Object.keys(columnSources)) if (setupColumnSet.has(c)) delete columnSources[c]
      await presentImportedCsv(meta, setupUpload.fileId, undefined, {
        indicators: extraIndicators,
        columnUniques: extraColumnUniques,
        columns: extraColumns,
        labels: extraLabels,
        columnSources,
        setupSourceFile: setupUpload.filename,
      })

      if (idxs.length > 1) {
        addMessage({ role: 'assistant', content: `Kept all ${idxs.length} selected sheets attached separately — nothing was merged. "${tables[setupIdx].name}" is the one-row-per-student sheet, so its ${meta.rows.toLocaleString()} rows are the "students" count above, but the column list below includes every selected sheet's columns; Edvise can reference the raw files (${otherIdxs.map(i => `"${tables[i].name}"`).join(', ')}) directly whenever a question needs them.` })
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      addMessage({ role: 'assistant', content: `Could not prepare sheets: ${String(err)}` })
    }
  }

  async function handleFileSelect(file: File) {
    resetForNewImport(`Reading ${file.name}…`)
    try {
      if (isSpreadsheetFile(file.name)) {
        const tables = await parseWorkbook(file)
        if (tables.length === 0) throw new Error('No sheets with data found in that file')
        if (tables.length === 1) {
          setMessages(prev => prev.filter(m => !('isLoading' in m)))
          await presentImportedSheets(tables, [0], file.name)
        } else {
          // Ask Claude which column identifies a student in each sheet before
          // building the picker — there's no fixed header spelling to regex-match
          // against, so this has to look at the actual headers/values per sheet.
          setFileLabel(`Reading ${file.name} — analyzing ${tables.length} sheets…`)
          await Promise.all(tables.map(async t => {
            t.identityHint = await fetchIdentityColumns(t.headers, tableSample(t))
          }))
          setMessages(prev => prev.filter(m => !('isLoading' in m)))
          addMessage({
            role: 'card', type: 'sheet_picker', filename: file.name, sheets: tables.map(summarizeSheet),
            onConfirm: (idxs) => presentImportedSheets(tables, idxs, file.name),
          })
        }
        return
      }
      const [meta, { fileId: id }] = await Promise.all([parseCsv(file), uploadFile(file)])
      await presentImportedCsv(meta, id)
    } catch (err) {
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      setFileLabel(undefined)
      addMessage({ role: 'assistant', content: `Could not read file: ${String(err)}` })
    }
  }

  // Imports the chosen tab (and any enrichment tabs) from a Google Sheet, merging
  // server-side, then feeds the result into the same confirmation pipeline as a
  // plain CSV upload.
  async function importAndPresentGoogleSheet(
    spreadsheetId: string,
    accessToken: string,
    tabs?: { primaryTab: string; enrichTabs: string[] }
  ) {
    addMessage({ role: 'assistant', isLoading: true })
    try {
      const { fileId: id, filename, csv, formulaRules, warnings } = await importGoogleSheet(spreadsheetId, accessToken, tabs)
      const meta = parseCsvText(csv, filename)
      await presentImportedCsv(meta, id, formulaRules)
      if (warnings?.length) addMessage({ role: 'assistant', content: warnings.map(w => `- ${w}`).join('\n') })
    } catch (err) {
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      addMessage({ role: 'assistant', content: `Could not import from Google Sheets: ${describeGoogleSheetsError(err)}` })
    }
  }

  // The picker is restricted to native Google Sheets, but this is a cheap
  // extra safety net — an unconverted Excel file uploaded to Drive triggers
  // this exact API error, and the raw JSON blob isn't actionable for a teacher.
  function describeGoogleSheetsError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('must not be an Office file')) {
      return 'That file is an Excel file stored in Google Drive, not a native Google Sheet, so Google\'s API can\'t read it directly. Open it in Drive and use "File > Save as Google Sheets," or use the "Upload Excel" button instead to import it directly.'
    }
    return message
  }

  async function handleGoogleSheetImport() {
    if (!session) return
    setSheetImporting(true)
    try {
      const accessToken = session.access_token
      const tokenResp = await getGoogleToken(accessToken, window.location.href)
      if (tokenResp.needsAuth && tokenResp.authUrl) {
        // Full-page redirect to Google's consent screen; our own callback route
        // sends the browser back here once the teacher approves.
        window.location.href = tokenResp.authUrl
        return
      }
      if (!tokenResp.token) throw new Error('Could not get a Google access token')

      const spreadsheetId = await openGoogleSheetPicker(tokenResp.token, process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? '')
      if (!spreadsheetId) return // teacher cancelled the picker

      resetForNewImport('Importing from Google Sheets…')
      const { single, tabs, spreadsheetTitle } = await getGoogleSheetTabs(spreadsheetId, accessToken)
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      if (single || tabs.length <= 1) {
        addMessage({ role: 'assistant', isLoading: true })
        await importAndPresentGoogleSheet(spreadsheetId, accessToken)
      } else {
        addMessage({
          role: 'card', type: 'sheet_picker', filename: spreadsheetTitle, sheets: tabs,
          onConfirm: (idxs) => {
            const baseIdx = chooseSetupSheet(tabs, idxs)
            const enrichIdxs = idxs.filter(i => i !== baseIdx)
            return importAndPresentGoogleSheet(spreadsheetId, accessToken, {
              primaryTab: tabs[baseIdx].name,
              enrichTabs: enrichIdxs.map(i => tabs[i].name),
            })
          },
        })
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => !('isLoading' in m)))
      setFileLabel(undefined)
      addMessage({ role: 'assistant', content: `Could not import from Google Sheets: ${describeGoogleSheetsError(err)}` })
    } finally {
      setSheetImporting(false)
    }
  }

  function handleColumnsConfirmed(mapping: Record<string, string>, formulaRulesText?: string) {
    setColumnMapping(mapping)
    setPhase('criteria')
    if (formulaRulesText && session) {
      const userId = session.user.id
      const lines = formulaRulesText.split('\n').map(l => l.trim()).filter(Boolean)
      Promise.all(lines.map(line => addContextRule(userId, line)))
        .then(() => refreshSchoolContext(userId))
        .catch(err => console.error('Failed to save formula rules to context:', err))
    }
    addMessage({ role: 'card', type: 'criteria', columnMapping: mapping, columnUniques: columnUniquesRef.current ?? {}, indicators: indicatorsRef.current, onConfirm: handleCriteriaConfirmed })
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
    setMembers([])
    // Notes and generated documents belong to the conversation they were
    // created in, same as handleNewChat — notes/artifacts aren't reloaded
    // from this conversation's own history below (not persisted per-
    // conversation), so without this the previous conversation's leftover
    // right-panel state would otherwise carry over.
    setNotes([])
    setArtifacts({})
    setGenerating(null)
    setPanelOpen(false)
    setPanelTab('notes')

    // Load messages, file references, and the member list (for attributing
    // teammates' messages) from Supabase
    try {
      const [dbMsgs, files, memberList] = await Promise.all([
        getConversationMessages(id),
        getConversationFiles(id),
        session ? getConversationMembers(id, session.access_token) : Promise.resolve([]),
      ])
      setMembers(memberList)
      const loaded: Message[] = dbMsgs.map(m => {
        if (m.role === 'user') {
          const isOwn = !m.user_id || m.user_id === session?.user?.id
          if (isOwn) return { role: 'user' as const, content: m.content, id: m.id }
          const sender = memberList.find(mem => mem.userId === m.user_id)
          return { role: 'user' as const, content: m.content, id: m.id, senderName: sender?.name ?? 'Teammate' }
        }
        return { role: 'assistant' as const, content: m.content, id: m.id }
      })
      setMessages(loaded)
      apiMessages.current = dbMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      setPhase('chatting')
      // Restore uploaded file references — a conversation may have multiple
      // unmerged CSVs (a multi-sheet upload kept as separate files) or just one.
      const csvFiles = files.filter(f => f.file_type === 'csv')
      const pdfs = files.filter(f => f.file_type === 'pdf')
      if (csvFiles.length > 1) {
        fileIdsRef.current = csvFiles.map(f => ({ fileId: f.file_id, filename: f.filename }))
        fileIdRef.current = csvFiles[0].file_id
        setFileLabel(`${csvFiles.length} sheets (${csvFiles[0].filename}, +${csvFiles.length - 1} more)`)
      } else if (csvFiles.length === 1) {
        fileIdRef.current = csvFiles[0].file_id
        setFileLabel(csvFiles[0].filename)
      }
      if (pdfs.length) setPdfFiles(pdfs.map(f => ({ name: f.filename, fileId: f.file_id })))
    } catch {
      addMessage({ role: 'assistant', content: 'Could not load conversation.' })
    }
  }

  function handleNewChat() {
    setMessages([])
    apiMessages.current = []
    setPhase('idle')
    fileIdRef.current = undefined
    fileIdsRef.current = []
    conversationIdRef.current = undefined
    setActiveConversationId(undefined)
    setThresholds(undefined)
    setCsvPreview(undefined)
    setColumnUniques(undefined)
    columnUniquesRef.current = undefined
    setFileLabel(undefined)
    setPdfFiles([])
    setMembers([])
    setMainView('chat')
    // Notes and generated documents belong to the conversation they were
    // created in — a new chat starts with an empty right panel, not the
    // previous conversation's leftover notes/Action Plan/Agenda/Report
    // still sitting there.
    setNotes([])
    setArtifacts({})
    setGenerating(null)
    setPanelOpen(false)
    setPanelTab('notes')
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
          content: `The foundational analysis walks through **4 stages**:\n\n1. **Risk Overview** — school-wide picture of how many students carry risk flags\n2. **Grade Breakdown** — where risk is most concentrated by grade level\n3. **Subgroup Analysis** — equity patterns across race/ethnicity, ELL status, and gender\n4. **SEL Analysis** — how at-risk students experience school through engagement, connectedness, and wellbeing\n\nUpload your gradebook (CSV or Excel) below to begin.`,
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
      addMessage({ role: 'assistant', content: "Go ahead — ask anything. You can upload a CSV/Excel file, a PDF, or just type your question." })
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
      if (!thresholds || !thresholds.length) return ['Academic Failure', 'Chronic Absence', 'Suspensions / Behavior', 'All risk indicators']
      if (thresholds.some(t => t.category === 'attendance')) opts.push('Chronic Absence')
      if (thresholds.some(t => t.category === 'behavior')) opts.push('Suspensions / Behavior')
      if (thresholds.some(t => t.category === 'courseFailure')) opts.push('Academic Failure')
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
    fileIdsRef.current = []
    setFileLabel(undefined)
    setThresholds(undefined)
    setCsvPreview(undefined)
    setColumnUniques(undefined)
    columnUniquesRef.current = undefined
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

  // Manually requesting a document from the Notes-tab picker (as opposed to
  // asking in plain chat language) used to call handleGenerate directly for
  // all three types, skipping the clarifying questions entirely — a real
  // gap, since none of the three have a fixed template anymore and Claude
  // should always ask what the teacher wants (focus + format) before
  // generating, not just when triggered via chat. So this routes through
  // the same real chat turn (and therefore the same ask_clarifying_question
  // -> update_plan flow) instead of bypassing it; the selected note ids are
  // stashed in a ref and picked back up once update_plan actually fires, so
  // the eventual document still scopes to just the notes the teacher picked
  // rather than all of them.
  const GENERATE_LABEL: Record<ArtifactType, string> = {
    action_plan: 'action plan',
    agenda: 'meeting agenda',
    report: 'report',
  }
  function requestGenerateFromNotes(type: ArtifactType, noteIds: string[]) {
    manualGenerateNoteIdsRef.current = noteIds
    const label = GENERATE_LABEL[type]
    handleSend(noteIds.length === notes.length
      ? `Generate a ${label} from my saved notes.`
      : `Generate a ${label} from these ${noteIds.length} selected notes.`)
  }

  async function handleGenerate(type: ArtifactType, noteIds?: string[]) {
    setGenerating(type)
    try {
      const selectedNotes = noteIds
        ? notes.filter(n => noteIds.includes(n.id))
        : notes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateArtifact(type, apiMessages.current as any, selectedNotes)
      setArtifacts(prev => ({ ...prev, [type]: result }))
    } catch (err) {
      console.error('Artifact generation failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  // Reply to an anchored inline comment (see AnchoredComments.tsx) — the
  // teacher highlighted one exact passage in an already-generated document
  // and commented on just that. This is a real, SCOPED round trip: Claude
  // revises only what the comment calls for (via editContext in
  // /api/artifact), not a full regeneration — so the document stays visible
  // and in place the whole time, no full-tab loading state. Returns the
  // short summary of what changed so the open thread can show it inline,
  // alongside the same relay card in the main chat claude.ai itself shows.
  async function handleArtifactComment(type: ArtifactType, quotedText: string, comment: string): Promise<string> {
    const current = artifacts[type] as { title?: string } | undefined
    const title = current?.title ?? type.replace('_', ' ')
    const relayId = `relay-${Date.now()}`
    addMessage({ role: 'card', type: 'comment_relay', id: relayId, artifactType: type, artifactTitle: title, quoted: quotedText, text: comment, status: 'sent' })

    apiMessages.current.push({ role: 'user', content: `Comment on the ${type.replace('_', ' ')} titled "${title}", on the passage "${quotedText}": ${comment}` })

    try {
      const result = await generateArtifact(type, [], undefined, { currentDocument: current, quotedText, comment }) as { document: Record<string, unknown>; summary: string }
      setArtifacts(prev => ({ ...prev, [type]: result.document }))
      const newTitle = (result.document?.title as string | undefined) ?? title
      setMessages(prev => prev.map(m =>
        (m.role === 'card' && m.type === 'comment_relay' && m.id === relayId)
          ? { ...m, status: 'done', artifactTitle: newTitle, summary: result.summary }
          : m
      ))
      return result.summary
    } catch (err) {
      console.error('Anchored comment edit failed:', err)
      const errSummary = `Something went wrong updating the ${type.replace('_', ' ')} — want to try again?`
      setMessages(prev => prev.map(m =>
        (m.role === 'card' && m.type === 'comment_relay' && m.id === relayId)
          ? { ...m, status: 'done', summary: errSummary }
          : m
      ))
      throw err
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
            <SchoolContextSettings
              session={session}
              onRulesChanged={rules => { schoolContextRef.current = rules.filter(r => r.enabled).map(r => r.text).join('\n\n') }}
            />
          ) : (mainView === 'kb' || mainView === 'library-kb') && session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL ? (
            <AdminKB session={session} />
          ) : mainView === 'library-pending' && session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL ? (
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
              {ENABLE_TEAM_SHARING && members.length > 1 && (
                <div
                  title={members.map(m => `${m.name}${m.role === 'owner' ? ' (owner)' : ''}`).join(', ')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 14 }}
                >
                  <div style={{ display: 'flex' }}>
                    {members.slice(0, 4).map((m, i) => (
                      <div
                        key={m.userId}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: 'var(--primary, #2A3B7C)',
                          color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', border: '2px solid var(--surface, #fff)', marginLeft: i === 0 ? 0 : -7,
                        }}
                      >
                        {m.name[0]?.toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#3E94A5', fontWeight: 600, background: '#edf6f8', border: '1px solid #b8dde6', borderRadius: 10, padding: '2px 8px' }}>
                    Shared · {members.length}
                  </span>
                </div>
              )}
              {ENABLE_TEAM_SHARING && conversationIdRef.current && (
                <button
                  className="tbar-btn"
                  onClick={openShareModal}
                  title="Share with your team"
                  style={{ marginLeft: 'auto' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </button>
              )}
              <button
                className="tbar-btn"
                onClick={() => setPanelOpen(o => !o)}
                title="Notes & artifacts"
                style={{ marginLeft: conversationIdRef.current ? undefined : 'auto', position: 'relative' }}
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
              onOpenArtifact={type => {
                setPanelOpen(true)
                setPanelTab(type)
              }}
            />

            {remoteTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                <div className="ev-av" style={{ width: 18, height: 18, fontSize: 9 }}>Ev</div>
                Edvise is answering {remoteTyping}&rsquo;s question…
                <span className="typing" style={{ marginLeft: 2 }}><span /><span /><span /></span>
              </div>
            )}

            <MessageInput
              onSend={handleSend}
              onFileSelect={handleFileSelect}
              disabled={inputDisabled}
              fileLabel={fileLabel}
              onRemoveFile={fileLabel ? handleRemoveFile : undefined}
              thresholds={thresholds}
              onChangeCriteria={handleChangeCriteria}
              indicators={indicatorsRef.current}
              columnUniques={columnUniques}
              csvPreview={csvPreview}
              activeKB={activeKB}
              onToggleSource={k => setActiveKB(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
              pdfFiles={pdfFiles}
              pdfUploading={pdfUploading}
              onPdfSelect={handlePdfSelect}
              onRemovePdf={handleRemovePdf}
              focusTrigger={inputFocusTrigger}
              onGoogleSheetImport={ENABLE_GOOGLE_SHEETS ? handleGoogleSheetImport : undefined}
              sheetImporting={sheetImporting}
              isShared={ENABLE_TEAM_SHARING && members.length > 1}
              onSendPlain={doSendPlain}
            />
          </>
        )}
      </div>

      <RightPanel
        open={panelOpen}
        width={panelWidth}
        onWidthChange={setPanelWidth}
        onClose={() => setPanelOpen(false)}
        tab={panelTab}
        onTabChange={setPanelTab}
        notes={notes}
        onDeleteNote={deleteNote}
        artifacts={artifacts}
        generating={generating}
        onRequestGenerate={requestGenerateFromNotes}
        onSave={handleSaveArtifact}
        onDiscard={handleDiscardArtifact}
        onComment={handleArtifactComment}
        onArtifactChange={(type, updated) => setArtifacts(prev => ({ ...prev, [type]: updated }))}
        messages={messages}
        showSharedAnalysis={ENABLE_TEAM_SHARING && members.length > 1}
      />

      {/* Share modal */}
      {ENABLE_TEAM_SHARING && shareModalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShareModalOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Share with your team</span>
              <button onClick={() => setShareModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Teammates you add can view this conversation's full history and continue chatting in it. This appears in their Team Workspace.
            </p>

            {members.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Members</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {members.map(m => (
                    <div key={m.userId} style={{ fontSize: 13, color: 'var(--text)' }}>{m.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{m.role === 'owner' ? '(owner)' : ''}</span></div>
                  ))}
                </div>
              </div>
            )}

            <input
              type="text"
              value={shareEmailsInput}
              onChange={e => setShareEmailsInput(e.target.value)}
              placeholder="teacher@school.edu, another@school.edu"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
            />
            {shareResult && (
              <div style={{ fontSize: 12, marginTop: 8 }}>
                {shareResult.added.length > 0 && <div style={{ color: '#2E705E' }}>Added: {shareResult.added.join(', ')}</div>}
                {shareResult.notFound.length > 0 && <div style={{ color: '#c53030' }}>No Edvise account found for: {shareResult.notFound.join(', ')}</div>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={handleShare}
                disabled={sharing || !shareEmailsInput.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #2A3B7C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sharing || !shareEmailsInput.trim() ? 0.6 : 1 }}
              >
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
