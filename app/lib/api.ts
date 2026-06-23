export async function generateArtifact(
  type: 'action_plan' | 'agenda' | 'report',
  messages: { role: string; content: string }[],
  notes?: { id: string; content: string }[],
  reportTemplate?: string
): Promise<unknown> {
  const res = await fetch('/api/artifact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, messages, notes, reportTemplate }),
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

export async function streamChat({
  messages,
  fileId,
  pdfFiles,
  thresholdPrompt,
  columnMapping,
  kbScope,
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
  pdfFiles?: { name: string; fileId: string }[]
  thresholdPrompt?: string
  columnMapping?: Record<string, string>
  kbScope?: string
  onChunk: (text: string) => void
  onImage: (data: string, mediaType: string) => void
  onCsv: (filename: string, data: string) => void
  onTableCsv: (filename: string, csv: string) => void
  onSources?: (sources: Array<{ title: string; kind: 'kb' | 'web'; url?: string }>) => void
  onAskChoices?: (toolCallId: string, question: string, choices: string[], allowMultiple: boolean) => void
  onUpdatePlan?: (artifactType: 'action_plan' | 'agenda') => void
}): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, fileId, pdfFiles, thresholdPrompt, columnMapping, kbScope }),
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
        if (e.type === 'sources' && onSources) onSources(e.sources as Array<{ title: string; kind: 'kb' | 'web'; url?: string }>)
        if (e.type === 'ask_choices' && onAskChoices) onAskChoices(e.toolCallId as string, e.question as string, e.choices as string[], (e.allowMultiple as boolean) ?? false)
        if (e.type === 'update_plan' && onUpdatePlan) onUpdatePlan(e.artifactType as 'action_plan' | 'agenda')
      } catch { /* skip malformed lines */ }
    }
    if (done) break
  }
}
