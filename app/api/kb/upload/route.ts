import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? ''

async function extractTextPreview(buf: Buffer, filename: string, ext: string): Promise<string> {
  if (ext === 'pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (await import('pdf-parse') as any).default ?? (await import('pdf-parse'))
      const result = await pdfParse(buf)
      return result.text.slice(0, 2000)
    } catch {
      return filename
    }
  }
  if (ext === 'csv' || ext === 'txt') {
    return buf.toString('utf-8').slice(0, 2000)
  }
  return filename
}

async function generateTags(preview: string, filename: string): Promise<string[]> {
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Read this document excerpt and return a JSON array of 5–10 search tags.
Tags should cover: student risk types (chronic absence, suspensions, academic failure), intervention strategies, SEL factors, grade levels, implementation approach.
Return ONLY a valid JSON array like: ["chronic absence", "family outreach", "tier 2", "middle school"]

Document: ${filename}
Excerpt: ${preview}`,
      }],
    })
    const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : ''
    const start = text.indexOf('['), end = text.lastIndexOf(']') + 1
    return start !== -1 ? JSON.parse(text.slice(start, end)) : []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  // Get user from auth header
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const scope = (form.get('scope') as string | null) ?? 'school'
  const category = (form.get('category') as string | null) ?? null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const filename = file.name
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const buf = Buffer.from(await file.arrayBuffer())

  // Upload to Anthropic Files API
  let anthropicFileId: string | null = null
  try {
    const mimeType = ext === 'pdf' ? 'application/pdf' : 'text/plain'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploaded = await (anthropic.beta.files as any).upload(
      { file: [filename, buf, mimeType] },
      { headers: { 'anthropic-beta': 'files-api-2025-04-14' } },
    )
    anthropicFileId = uploaded.id
  } catch (err) {
    console.error('Anthropic file upload failed:', err)
    return NextResponse.json({ error: 'Failed to upload file to Anthropic' }, { status: 500 })
  }

  // Extract text preview for tag generation
  const preview = await extractTextPreview(buf, filename, ext)
  const tags = await generateTags(preview, filename)

  // Global scope docs auto-approve if admin
  const isAdmin = user.email === ADMIN_EMAIL
  const status = (scope === 'global' && isAdmin) ? 'approved' : 'pending'

  const { data, error } = await supabase.from('kb_documents').insert({
    filename,
    scope,
    school_name: null,
    status,
    anthropic_file_id: anthropicFileId,
    tags,
    uploaded_by: user.id,
    file_type: ext,
    category,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}
