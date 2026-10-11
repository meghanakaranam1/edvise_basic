import type { ConversationMember } from './db'
import type { IdentityColumns } from './columnClassifier'

// Asks Claude to identify which column (if any) is a student ID, or which
// pair of columns are Last/First name, for a single sheet — reused ahead of
// merging so the sheet picker (and the merge itself) don't rely on a
// hardcoded list of header spellings. Never throws: an API hiccup here should
// degrade to sheetMerge's own regex fallback, not block the whole import.
export async function fetchIdentityColumns(headers: string[], preview: Record<string, string>[]): Promise<IdentityColumns> {
  try {
    const res = await fetch('/api/suggest-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: headers, preview }),
    })
    if (!res.ok) return {}
    const body = await res.json()
    return body.identityColumns ?? {}
  } catch {
    return {}
  }
}

export async function generateArtifact(
  type: 'action_plan' | 'agenda' | 'report',
  messages: { role: string; content: string }[],
  notes?: { id: string; content: string }[],
  // Present only for an anchored inline-comment edit (see AnchoredComments.tsx)
  // — a scoped revision of an existing document, not a fresh generation. When
  // set, the API returns { document, summary } instead of the bare document.
  editContext?: { currentDocument: unknown; quotedText: string; comment: string }
): Promise<unknown> {
  const res = await fetch('/api/artifact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, messages, notes, editContext }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadFile(file: File): Promise<{ fileId: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getGoogleToken(accessToken: string, callbackUrl: string): Promise<{ token?: string; needsAuth?: boolean; authUrl?: string }> {
  const res = await fetch('/api/google-sheets/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ callbackUrl }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? res.statusText)
  }
  return res.json()
}

export async function importGoogleSheet(
  spreadsheetId: string,
  accessToken: string,
  tabs?: { primaryTab: string; enrichTabs: string[] }
): Promise<{ fileId: string; filename: string; csv: string; formulaRules?: string[]; warnings?: string[] }> {
  const res = await fetch('/api/google-sheets/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ spreadsheetId, primaryTab: tabs?.primaryTab, enrichTabs: tabs?.enrichTabs }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? res.statusText)
  }
  return res.json()
}

export async function getGoogleSheetTabs(
  spreadsheetId: string,
  accessToken: string
): Promise<{ spreadsheetTitle: string; single: boolean; tabs: import('./sheetMerge').SheetSummary[] }> {
  const res = await fetch('/api/google-sheets/tabs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ spreadsheetId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? res.statusText)
  }
  return res.json()
}

export async function shareConversation(conversationId: string, emails: string[], accessToken: string): Promise<{ added: string[]; notFound: string[] }> {
  const res = await fetch(`/api/conversations/${conversationId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ emails }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? res.statusText)
  }
  return res.json()
}

export async function getConversationMembers(conversationId: string, accessToken: string): Promise<ConversationMember[]> {
  const res = await fetch(`/api/conversations/${conversationId}/members`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const body = await res.json()
  return body.members ?? []
}

export async function streamChat({
  messages,
  fileId,
  fileIds,
  pdfFiles,
  thresholdPrompt,
  columnMapping,
  schoolContext,
  kbScope,
  userSchool,
  onChunk,
  onImage,
  onCsv,
  onTableCsv,
  onSources,
  onAskChoices,
  onUpdatePlan,
}: {
  messages: { role: 'user' | 'assistant'; content: string | unknown[] }[]
  fileId?: string
  fileIds?: { fileId: string; filename: string }[]
  pdfFiles?: { name: string; fileId: string }[]
  thresholdPrompt?: string
  columnMapping?: Record<string, string>
  schoolContext?: string
  kbScope?: string
  // The requesting teacher's own school — scopes "school"-tagged KB results
  // to just their school. See kbSearch.ts for why this matters.
  userSchool?: string
  onChunk: (text: string) => void
  onImage: (data: string, mediaType: string) => void
  onCsv: (filename: string, data: string) => void
  onTableCsv: (filename: string, csv: string) => void
  onSources?: (sources: Array<{ title: string; kind: 'kb' | 'web' | 'pdf'; url?: string; kbDocId?: string; fileId?: string; filename?: string }>) => void
  onAskChoices?: (toolCallId: string, question: string, choices: string[], allowMultiple: boolean) => void
  onUpdatePlan?: (artifactType: 'action_plan' | 'agenda' | 'report') => void
}): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, fileId, fileIds, pdfFiles, thresholdPrompt, columnMapping, schoolContext, kbScope, userSchool }),
  })
  if (!res.ok) throw new Error(await res.text())

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    buf += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        const e = JSON.parse(line)
        if (e.type === 'text') onChunk(e.data as string)
        if (e.type === 'image') onImage(e.data as string, (e.mediaType as string) ?? 'image/png')
        if (e.type === 'csv') onCsv(e.filename as string, e.data as string)
        if (e.type === 'table_csv') onTableCsv(e.filename as string, e.csv as string)
        if (e.type === 'sources' && onSources) onSources(e.sources as Array<{ title: string; kind: 'kb' | 'web' | 'pdf'; url?: string; kbDocId?: string; fileId?: string; filename?: string }>)
        if (e.type === 'ask_choices' && onAskChoices) onAskChoices(e.toolCallId as string, e.question as string, e.choices as string[], (e.allowMultiple as boolean) ?? false)
        if (e.type === 'update_plan' && onUpdatePlan) onUpdatePlan(e.artifactType as 'action_plan' | 'agenda' | 'report')
      } catch { /* skip malformed lines */ }
    }
    if (done) break
  }
}
