import { supabase } from './supabase'

export type Conversation = { id: string; title: string; created_at: string; updated_at: string }
export type DbMessage = { id: string; conversation_id: string; role: string; content: string; created_at: string }
export type ArtifactRow = { id: string; title: string; data: unknown; created_at: string }

// ── Conversations ──────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

export async function createConversation(title: string): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title, user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getConversationMessages(conversationId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
  if (error) console.error('saveMessage error:', error)
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
