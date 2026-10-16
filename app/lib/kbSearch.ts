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
//
// topK used to hard-cap results at 4 (or 6 from the search_strategies tool)
// BEFORE relevance was even considered for the cut — a real match past
// that rank was silently dropped and could never become a citation, same
// bug as the one already fixed on web search. Relevance filtering
// (score >= 2 below) already does the real work of excluding weak matches;
// this is now just a generous safety ceiling against a pathological case
// (e.g. a school with 100+ approved docs all loosely matching one query)
// rather than a routine truncation — in normal use it should never
// actually bind.
const MAX_KB_RESULTS = 20
export async function searchKB(query: string, scopes: string[], userSchool?: string): Promise<KbDoc[]> {
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

  return scored.slice(0, MAX_KB_RESULTS).map(x => x.doc)
}
