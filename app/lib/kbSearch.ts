import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export type KbDoc = {
  id: string
  filename: string
  scope: string
  status: string
  anthropic_file_id: string
  tags: string[]
  file_type: string
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(w => w.length > 2)
  )
}

function scoreDoc(doc: KbDoc, queryStems: Set<string>): number {
  const tagStems = tokenize((doc.tags ?? []).join(' '))
  const nameStems = tokenize(doc.filename.replace(/\.(pdf|txt|docx)$/i, ''))
  // Docs with no tags rely on filename only — give filename matches full weight
  const noTags = (doc.tags ?? []).length === 0

  let score = 0
  for (const q of queryStems) {
    if (tagStems.has(q)) score += 2
    else if (nameStems.has(q)) score += noTags ? 2 : 1
  }
  return score
}

export async function searchKB(query: string, scopes: string[], topK = 4): Promise<KbDoc[]> {
  if (!scopes.length) return []

  const normalizedScopes = scopes.map(s => (s === 'student_success' ? 'global' : s))

  const { data, error } = await supabase
    .from('kb_documents')
    .select('id, filename, scope, status, anthropic_file_id, tags, file_type')
    .eq('status', 'approved')
    .in('scope', normalizedScopes)

  if (error || !data?.length) return []

  const docs = (data as KbDoc[]).filter(d => d.anthropic_file_id)
  if (!docs.length) return []

  const queryStems = tokenize(query)
  if (!queryStems.size) return []

  const scored = docs
    .map(d => ({ score: scoreDoc(d, queryStems), doc: d }))
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)

  console.log('🔍 KB search for:', query, '→', scored.length, 'matching docs, top score:', scored[0]?.score ?? 0)

  return scored.slice(0, topK).map(x => x.doc)
}
