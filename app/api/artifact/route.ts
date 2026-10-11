import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ArtifactType = 'action_plan' | 'agenda' | 'report'

const SCHEMAS: Record<ArtifactType, string> = {
  action_plan: `{
  "title": "Descriptive title — target group & primary focus",
  "sections": [
    {
      "title": "Section title — written to match what the teacher asked for, not a fixed label like 'Intervention Steps'",
      "content": "Rich markdown. Use **bold** for subsection titles (not # headings), numbered/bulleted lists for steps/actions, and include Owner for any action item."
    }
  ],
  "closing_actions": [
    "Specific priority action with owner and deadline",
    "Another priority action"
  ]
}`,
  agenda: `{
  "title": "Meeting title",
  "sections": [
    {
      "title": "Section title — written to match what the teacher asked for, not a fixed label like 'Agenda Items'",
      "content": "Rich markdown. Use **bold** for subsection titles (not # headings), and a bulleted or numbered list for agenda items/time blocks if that's the format requested — include time/duration/lead inline in the bullet text when relevant, not as separate structured fields."
    }
  ],
  "closing_actions": [
    "A follow-up item or next step from the meeting, if that fits the requested format"
  ]
}`,
  report: `{
  "title": "Descriptive title — topic & key themes",
  "sections": [
    {
      "title": "Section title — written to match what the teacher asked for, not a fixed label",
      "content": "Rich markdown narrative. Use **bold** for subsection titles (not # headings). Use - for bullet lists and specific numbers from the data where relevant."
    }
  ],
  "closing_actions": [
    "Specific priority action with owner and deadline (e.g. Run the X cut for Y students; Owner: Z; due within 1 week)",
    "Another priority action"
  ]
}`,
}

const INSTRUCTIONS: Record<ArtifactType, string> = {
  action_plan: 'Generate an intervention action plan. There is no fixed template — the teacher defines the content and format themselves, via clarifying questions already asked earlier in the conversation (what to focus on, how it should be organized/formatted). Build the "sections" array to match EXACTLY what they asked for: use their own topic(s)/structure as section titles (not a generic label like "Intervention Steps" unless that is genuinely what was requested), include as many or as few sections as fits their request, and match the format they described — numbered steps with owners, a narrative plan, a simple checklist, etc. Treat ALL of the teacher\'s saved notes with equal weight — synthesize across every note, not just the most recent topic. The steps, strategies, and specific details must be drawn from the notes/conversation combined — do not invent generic content not grounded in them. Do NOT add any dates, timelines, phases, or day/week counts unless the teacher explicitly asked for them. closing_actions should be specific priority items with named owners where that fits the requested format — omit it (empty array) if it doesn\'t fit. If genuinely nothing in the conversation says what this plan should focus on or be formatted like, write a reasonable general-purpose version instead of guessing wildly.',
  agenda: 'Generate a meeting agenda. There is no fixed template — the teacher defines the content and format themselves, via clarifying questions already asked earlier in the conversation (what to focus on, how it should be organized/formatted). Build the "sections" array to match EXACTLY what they asked for: use their own topic(s)/structure as section titles (not a generic label like "Agenda Items" unless that is genuinely what was requested), include as many or as few sections as fits their request, and match the format they described — a standard timed agenda, a simple topic list, a discussion-focused outline, etc. Treat ALL of the teacher\'s saved notes with equal weight — synthesize across every note, not just the most recent topic. The agenda items, discussion points, and focus areas must reflect the full breadth of the notes/conversation combined — do not invent generic content not grounded in them. closing_actions should be concrete follow-up items where that fits the requested format — omit it (empty array) if it doesn\'t fit. If genuinely nothing in the conversation says what this meeting should focus on or be formatted like, write a reasonable general-purpose version instead of guessing wildly.',
  report: 'Generate a student support report. There is no fixed template — the teacher defines the content and format themselves, usually via clarifying questions already asked earlier in the conversation (what to focus on, who it\'s for, how it should be organized). Build the "sections" array to match EXACTLY what they asked for: use their own topic(s) as section titles (not generic labels like "Snapshot" or "Analysis" unless that is genuinely what was requested), include as many or as few sections as fits their request, and match the tone/format they described — a narrative write-up, a plain-language family-facing version, a short bullet breakdown, etc. Treat ALL of the teacher\'s saved notes with equal weight — synthesize across every note, not just the most recent topic. The findings and specific details from the notes/data must appear in the sections — do not invent generic content not grounded in the notes or conversation. Each section\'s content is markdown: use **bold** for subsection titles (not # headings), bullet lists, and specific numbers from the data where relevant. closing_actions should be specific priority items with named owners where that fits the requested format — omit it (empty array) if the teacher asked for something where priority actions don\'t make sense (e.g. a short family letter). If genuinely nothing in the conversation says what this report should focus on or be formatted like, write a reasonable general-purpose version instead of guessing wildly.',
}

// An anchored inline comment — the teacher highlighted a specific passage in
// the already-generated document and left feedback on just that part (see
// AnchoredComments.tsx). This is a SCOPED edit: Claude revises only what the
// comment actually calls for and leaves the rest of the document untouched,
// rather than regenerating from scratch the way a fresh generation does.
type EditContext = {
  currentDocument: unknown
  quotedText: string
  comment: string
}

// A message's content coming from the chat history is NOT always a plain
// string — clarifying-question exchanges (now mandatory before every
// action_plan/agenda generation) push tool_use/tool_result blocks instead,
// whose content is an array of objects. Blindly calling .slice(0, 1000) on
// that doesn't throw, but the template literal that wraps it stringifies
// each block as "[object Object]" — Claude would see garbage instead of
// the actual question/answer, degrading or outright breaking generation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block: Record<string, unknown>) => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object') {
          if (typeof block.text === 'string') return block.text
          if (typeof block.content === 'string') return block.content
          if (block.input !== undefined) return JSON.stringify(block.input)
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export async function POST(req: NextRequest) {
  const { type, messages, notes, editContext }: {
    type: ArtifactType
    messages: { role: string; content: unknown }[]
    notes?: { id: string; content: string }[]
    editContext?: EditContext
  } = await req.json()

  if (!SCHEMAS[type]) return new Response('Invalid type', { status: 400 })

  const context = messages
    .map(m => `${m.role === 'user' ? 'Teacher' : 'Edvise'}: ${contentToText(m.content).slice(0, 1000)}`)
    .join('\n\n')

  const notesBlock = notes && notes.length > 0
    ? `\n\nSaved notes from the teacher:\n${notes.map((n, i) => `Note ${i + 1}: ${n.content.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 600)}`).join('\n\n')}`
    : ''

  const schema = SCHEMAS[type]
  const instruction = INSTRUCTIONS[type]

  if (editContext) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are revising an EXISTING ${type.replace('_', ' ')} based on one specific, scoped piece of feedback — not regenerating it from scratch. The teacher highlighted one exact passage in the document and left a comment on it. Make ONLY the change(s) that comment actually calls for; leave every other part of the document — wording, structure, other sections/steps/items — exactly as it was, unless the comment clearly implies a broader change is needed. The document schema is:
${schema}

Return ONLY valid JSON, no markdown fences, no explanation, matching exactly this shape:
{"document": <the complete updated document, matching the schema above, with the scoped change applied>, "summary": "<one short sentence describing what you changed, written to the teacher, e.g. 'Added a specific deadline to that step.'>"}`,
      messages: [{
        role: 'user',
        content: `Current document (JSON):\n${JSON.stringify(editContext.currentDocument)}\n\nThe teacher highlighted this exact passage:\n"${editContext.quotedText}"\n\nTheir comment on it:\n"${editContext.comment}"\n\nRevise the document accordingly.`,
      }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    try {
      const parsed = JSON.parse(match?.[0] ?? raw) as { document: Record<string, unknown>; summary: string }
      parsed.document.date_created = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      return Response.json(parsed)
    } catch {
      return new Response('JSON parse error', { status: 500 })
    }
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `You are an education specialist generating structured artifacts for teachers. ${instruction}

Return ONLY valid JSON — no markdown fences, no explanation, no extra text. Match this schema exactly:
${schema}`,
    messages: [{ role: 'user', content: `${notesBlock ? `Teacher's saved notes (use these as the primary source):\n${notesBlock.trim()}\n\n` : ''}Conversation context:\n\n${context}\n\nGenerate the ${type.replace('_', ' ')}.` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  try {
    const parsed = JSON.parse(match?.[0] ?? raw)
    // Stamp the generation date so the UI footer is always accurate
    parsed.date_created = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return Response.json(parsed)
  } catch {
    // Logged server-side (visible in Vercel's function logs) since the
    // client only sees a generic failure — this is the one place that can
    // reveal whether the model actually returned malformed JSON, or
    // whether the context it was given was garbled going in.
    console.error(`/api/artifact JSON parse error for type=${type}. Raw response:`, raw)
    return new Response('JSON parse error', { status: 500 })
  }
}
