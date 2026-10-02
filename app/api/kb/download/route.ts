import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get('id')
  if (!docId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Look up the document
  const { data: doc, error } = await supabase
    .from('kb_documents')
    .select('filename, anthropic_file_id, file_type')
    .eq('id', docId)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Fetch the file content from Anthropic Files API
  const res = await fetch(`https://api.anthropic.com/v1/files/${doc.anthropic_file_id}/content`, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
  })

  if (!res.ok) return NextResponse.json({ error: 'File not available' }, { status: 502 })

  const contentType = doc.file_type === 'pdf' ? 'application/pdf' : 'text/plain'
  const bytes = await res.arrayBuffer()

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${doc.filename}"`,
    },
  })
}
