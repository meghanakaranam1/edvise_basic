import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabaseAdmin().auth.getUser(token)
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
      {
        file: new File([buf], filename, { type: mimeType }),
      },
      {
        headers: { 'anthropic-beta': 'files-api-2025-04-14' },
      } as any
    )
    anthropicFileId = uploaded.id
    console.log('✅ File uploaded to Anthropic:', anthropicFileId)
  } catch (err) {
    console.error('❌ Anthropic file upload failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to upload file to Anthropic' }, { status: 500 })
  }

  // Extract text preview and generate tags
  const preview = await extractTextPreview(buf, filename, ext)
  const tags = await generateTags(preview, filename)

  // Auto-approve global docs if admin
  const isAdmin = user.email === ADMIN_EMAIL
  const status = (scope === 'global' && isAdmin) ? 'approved' : 'pending'

  // "school"-scoped docs are tagged with the uploader's own school so
  // search can actually isolate them per school (previously always null —
  // every school's uploads were silently visible to every other school).
  // "global" docs intentionally have no single owning school.
  const schoolName = scope === 'school' ? (user.user_metadata?.school_name ?? null) : null

  const { data, error } = await supabaseAdmin().from('kb_documents').insert({
    filename,
    scope,
    school_name: schoolName,
    status,
    anthropic_file_id: anthropicFileId,
    tags,
    uploaded_by: user.id,
    file_type: ext,
    category,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Anthropic's Files API does not serve back the original bytes for this
  // account (every upload comes back `downloadable: false`, confirmed
  // independent of file age/type) — so a copy is kept in Supabase Storage,
  // keyed by this document's own row id, purely so it can actually be
  // downloaded again later (see /api/kb/download). Awaited, not
  // fire-and-forget — a serverless function can be frozen the instant it
  // returns a response.
  const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'csv' ? 'text/csv' : 'text/plain'
  const { error: storageError } = await supabaseAdmin().storage
    .from('documents')
    .upload(`kb/${data.id}`, buf, { contentType: mimeType, upsert: true })
  if (storageError) console.error('Storage copy failed (non-fatal — Claude still has the file):', storageError.message)

  return NextResponse.json({ document: data })
}
