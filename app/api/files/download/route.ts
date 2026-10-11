import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// Downloads a previously-uploaded conversation file (gradebook CSV, PDF, …)
// from Supabase Storage, where /api/upload keeps a copy specifically for
// this purpose. NOT served from the Anthropic Files API — every file this
// account uploads there comes back `downloadable: false` (confirmed via a
// direct API test, independent of file age or type), so that endpoint can
// never actually return the bytes. Same mechanism as /api/kb/download.
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('id')
  const filename = req.nextUrl.searchParams.get('filename') ?? 'download'
  const fileType = req.nextUrl.searchParams.get('type') ?? ''
  if (!fileId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase.storage.from('documents').download(`conversations/${fileId}`)
  if (error || !data) return NextResponse.json({ error: 'File not available' }, { status: 404 })

  const contentType = fileType === 'pdf' ? 'application/pdf' : fileType === 'csv' ? 'text/csv' : 'application/octet-stream'
  const bytes = await data.arrayBuffer()

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
