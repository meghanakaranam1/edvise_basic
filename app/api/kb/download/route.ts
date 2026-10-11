import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

// Serves a KB document from Supabase Storage, where /api/kb/upload keeps a
// copy specifically for this purpose. NOT served from the Anthropic Files
// API — every file this account uploads there comes back `downloadable:
// false` (confirmed via a direct API test, independent of file age or
// type), so that endpoint can never actually return the bytes.
export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get('id')
  if (!docId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: doc, error } = await supabaseAdmin()
    .from('kb_documents')
    .select('filename, file_type')
    .eq('id', docId)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: fileData, error: downloadError } = await supabaseAdmin().storage.from('documents').download(`kb/${docId}`)
  if (downloadError || !fileData) return NextResponse.json({ error: 'File not available' }, { status: 404 })

  const contentType = doc.file_type === 'pdf' ? 'application/pdf' : doc.file_type === 'csv' ? 'text/csv' : 'text/plain'
  const bytes = await fileData.arrayBuffer()

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${doc.filename}"`,
    },
  })
}
