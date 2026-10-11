import { supabaseAdmin } from './supabaseAdmin'

export type KbDoc = {
  id: string
  filename: string
  scope: string
  status: string
  anthropic_file_id: string
  tags: string[]
  file_type: string
  school_name: string | null
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

// userSchool scopes "school"-tagged documents to the requesting teacher's
// own school — without it, every school's "school-based" uploads were
// visible to every other school (confirmed: school_name was never even
// recorded at upload, so nothing filtered on it). "global" docs are never
// restricted — they're meant to be shared across every school by design.
export async function searchKB(query: string, scopes: string[], topK = 4, userSchool?: string): Promise<KbDoc[]> {
  if (!scopes.length) return []

  const normalizedScopes = scopes.map(s => (s === 'student_success' ? 'global' : s))

  const { data, error } = await supabaseAdmin()
    .from('kb_documents')
    .select('id, filename, scope, status, anthropic_file_id, tags, file_type, school_name')
    .eq('status', 'approved')
    .in('scope', normalizedScopes)

  if (error || !data?.length) return []

  const normalizedUserSchool = userSchool?.trim().toLowerCase()
  const docs = (data as KbDoc[]).filter(d => {
    if (!d.anthropic_file_id) return false
    if (d.scope !== 'school') return true
    // A school-scoped doc with no recorded school (legacy rows from before
    // this was tracked) is excluded rather than shown to everyone — safer
    // default for FERPA-relevant content than leaking it school-wide.
    if (!d.school_name || !normalizedUserSchool) return false
    return d.school_name.trim().toLowerCase() === normalizedUserSchool
  })
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
