import { supabase } from './supabase'

export type Conversation = { id: string; title: string; created_at: string; updated_at: string; is_shared?: boolean }
export type ConversationMember = { userId: string; role: string; name: string; email: string }
export type Profile = { id: string; email: string; name: string; school_name: string; role: string }
export type ContextRule = { id: string; text: string; name: string | null; enabled: boolean; created_at: string; updated_at: string }
export type DbMessage = { id: string; conversation_id: string; role: string; content: string; user_id: string | null; created_at: string }
export type ArtifactRow = { id: string; title: string; data: unknown; created_at: string }
export type ConversationFile = { id: string; conversation_id: string; file_id: string; filename: string; file_type: string; created_at: string }

// ── Conversations ──────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, is_shared')
    .eq('is_shared', false)
    .order('updated_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

// Shared conversations this user belongs to (as owner or invited member) — the
// "Team Workspace" list, kept separate from personal "Recent" conversations.
export async function listSharedConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, is_shared')
    .eq('is_shared', true)
    .order('updated_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

export async function createConversation(title: string, userId: string, accessToken?: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title, user_id: userId })
    .select()
    .single()
  if (error) throw error
  // Done server-side (service-role key, bypasses RLS) rather than through
  // this client's own session — the client-side insert intermittently
  // 403'd with "new row violates row-level security policy for table
  // conversation_members", seemingly unable to reliably see the
  // just-committed conversations row above from the RLS policy's own check.
  if (accessToken) {
    fetch(`/api/conversations/${data.id}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(err => console.error('conversation_members insert error:', err))
  }
  return data
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId)
  if (error) console.error('updateConversationTitle error:', error)
}

export async function getConversationMessages(conversationId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, user_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string, userId?: string) {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content, user_id: userId ?? null })
  if (error) console.error('saveMessage error:', error)
}


// ── Conversation Files ─────────────────────────────────────────────────────

export async function saveConversationFiles(
  conversationId: string,
  files: { file_id: string; filename: string; file_type: string }[]
) {
  if (!files.length) return
  const { error } = await supabase
    .from('conversation_files')
    .insert(files.map(f => ({ conversation_id: conversationId, ...f })))
  if (error) console.error('saveConversationFiles error:', error)
}

export async function getConversationFiles(conversationId: string): Promise<ConversationFile[]> {
  const { data, error } = await supabase
    .from('conversation_files')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return []
  return data ?? []
}

// Every file this user has uploaded, across their own (non-shared) personal
// conversations — powers "All documents" in the sidebar. Deliberately scoped
// to listConversations() only, NOT listSharedConversations() — the shared/
// team-workspace schema (is_shared, conversation_members) doesn't exist in
// production yet, and this needs to work standalone without that migration.
export async function listAllUploadedFiles(): Promise<(ConversationFile & { conversationTitle: string })[]> {
  const conversations = await listConversations()
  if (!conversations.length) return []
  const ids = conversations.map(c => c.id)
  const titleById = new Map(conversations.map(c => [c.id, c.title]))

  const { data, error } = await supabase
    .from('conversation_files')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false })
  if (error) return []

  return (data ?? []).map(f => ({ ...f, conversationTitle: titleById.get(f.conversation_id) ?? 'Untitled conversation' }))
}

// ── Artifacts ──────────────────────────────────────────────────────────────

export async function saveArtifact(
  table: 'action_plans' | 'meeting_agendas' | 'reports',
  title: string,
  data: unknown,
  id?: string,
): Promise<ArtifactRow> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (id) {
    const { data: row, error } = await supabase
      .from(table)
      .update({ title, data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return row
  }

  const { data: row, error } = await supabase
    .from(table)
    .insert({ title, data, user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return row
}

export async function listArtifacts(
  table: 'action_plans' | 'meeting_agendas' | 'reports',
): Promise<ArtifactRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select('id, title, data, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function deleteArtifact(table: 'action_plans' | 'meeting_agendas' | 'reports', id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

// ── School context rules ────────────────────────────────────────────────────

export async function listContextRules(userId: string): Promise<ContextRule[]> {
  const { data, error } = await supabase
    .from('school_context_rules')
    .select('id, text, name, enabled, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

export async function addContextRule(userId: string, text: string, name?: string): Promise<ContextRule> {
  const { data, error } = await supabase
    .from('school_context_rules')
    .insert({ user_id: userId, text, name: name || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContextRule(id: string, fields: { text?: string; name?: string | null; enabled?: boolean }) {
  const { error } = await supabase
    .from('school_context_rules')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteContextRule(id: string) {
  const { error } = await supabase.from('school_context_rules').delete().eq('id', id)
  if (error) throw error
}
