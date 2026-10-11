import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Short, meaningful conversation titles — replaces the old behavior of just
// truncating the teacher's raw first message to 60 characters (which could
// cut off mid-word and rarely said anything useful at a glance in the
// sidebar). Runs once, right after the first message, off the critical path.
export async function POST(req: NextRequest) {
  const { text }: { text: string } = await req.json()

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 20,
      system: `Give this teacher's message a short conversation title — 3 to 6 words, title case, no quotes, no trailing period, no emoji. It should say what the conversation is actually about (e.g. "Chronic Absence Review", "Q1 Math Grade Trends"), not just repeat the message verbatim. Return ONLY the title text, nothing else.`,
      messages: [{ role: 'user', content: text.slice(0, 2000) }],
    })
    const title = message.content[0]?.type === 'text' ? message.content[0].text.trim().replace(/^["']|["']$/g, '') : ''
    if (!title) throw new Error('empty title')
    return Response.json({ title: title.slice(0, 60) })
  } catch {
    // Non-fatal — caller keeps whatever fallback title it already set.
    return Response.json({ title: null }, { status: 200 })
  }
}
