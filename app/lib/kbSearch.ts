import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type KbDoc = {
  id: string
  filename: string
  scope: string
  status: string
  anthropic_file_id: string
  tags: string[]
  file_type: string
}

async function extractSearchTerms(query: string): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `A school administrator asked: "${query}"

Decide if answering this well requires searching a library of educational resources, research, or intervention strategies.

Search IS needed for: intervention plans, PD plans, strategies, programs, best practices, how-to guidance, root cause analysis, SEL approaches — even if the question references specific grades or student groups.
Search is NOT needed for: pure data operations like counts, exports, comparisons of numbers, risk overviews, roster requests, or criteria changes.

If search is needed, return a JSON array of 2–5 short keyword phrases that would find relevant documents (e.g. ["suspension reduction", "restorative practices", "classroom consistency"]).
If search is not needed, return an empty JSON array.

Return ONLY the JSON array, no explanation.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

function scoreDoc(doc: KbDoc, terms: string[]): number {
  const tagText = (doc.tags ?? []).join(' ').toLowerCase()
  return terms.filter(t => tagText.includes(t.toLowerCase())).length
}

export async function searchKB(query: string, scopes: string[], topK = 4): Promise<KbDoc[]> {
  if (!scopes.length) return []

  const [terms, dbResult] = await Promise.all([
    extractSearchTerms(query),
    supabase
      .from('kb_documents')
      .select('id, filename, scope, status, anthropic_file_id, tags, file_type')
      .eq('status', 'approved')
      .in('scope', scopes.map(s => s === 'student_success' ? 'global' : s)),
  ])

  if (!terms.length) return []

  const { data, error } = dbResult
  if (error || !data?.length) return []

  const scored = data
    .filter(d => d.anthropic_file_id)
    .map(d => ({ score: scoreDoc(d as KbDoc, terms), doc: d as KbDoc }))
    .sort((a, b) => b.score - a.score)

  return scored.filter(x => x.score > 0).slice(0, topK).map(x => x.doc)
}
