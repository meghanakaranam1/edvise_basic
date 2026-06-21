import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ''

async function requireAdmin(req: NextRequest): Promise<{ user: { id: string; email?: string } } | null> {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user || user.email !== ADMIN_EMAIL) return null
  return { user }
}

// PATCH /api/kb/[id] — approve or reject
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { status } = await req.json()
  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('kb_documents')
    .update({ status, approved_by: admin.user.id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/kb/[id] — remove doc + delete from Anthropic Files
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const { data } = await supabase
    .from('kb_documents')
    .select('anthropic_file_id')
    .eq('id', id)
    .single()

  if (data?.anthropic_file_id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (anthropic.beta.files as any).delete(data.anthropic_file_id, {
        headers: { 'anthropic-beta': 'files-api-2025-04-14' },
      })
    } catch { /* non-fatal */ }
  }

  const { error } = await supabase.from('kb_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
