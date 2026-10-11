import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabaseAdmin().auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  const query = supabaseAdmin()
    .from('kb_documents')
    .select('id, filename, scope, status, tags, file_type, category, created_at, uploaded_by, school_name')
    .order('created_at', { ascending: false })

  // Non-admins only see their own uploads
  if (!isAdmin) query.eq('uploaded_by', user.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}
