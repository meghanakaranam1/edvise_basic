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

  // Non-admins see their own uploads (any scope) plus every "school"-scoped
  // doc that matches their own school — so the shared school KB actually
  // shows what colleagues at the same school have uploaded, not just a
  // teacher's own files.
  if (!isAdmin) {
    const { data: profile } = await supabaseAdmin().from('profiles').select('school_name').eq('id', user.id).single()
    const school = profile?.school_name?.trim().replace(/[,()]/g, '')
    if (school) {
      query.or(`uploaded_by.eq.${user.id},and(scope.eq.school,school_name.ilike.${school})`)
    } else {
      query.eq('uploaded_by', user.id)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}
