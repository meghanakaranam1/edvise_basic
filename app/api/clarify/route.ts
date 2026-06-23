import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { message, history }: {
    message: string
    history: { role: string; content: string }[]
  } = await req.json()

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a classifier for an educational assistant used by teachers.

A teacher sent a message. Decide if it needs clarification before you can give a useful, targeted response.

NEEDS clarification (return true) when the message is vague and the answer would be significantly better with more context:
- Vague "how can I..." or "what are some ways to..." questions without context (e.g. "how can I engage students?", "what are some intervention strategies?", "how do I improve attendance?")
- Requests to create something without enough detail (meeting agendas, letters home, action plans, newsletters, communication plans)
- Open-ended brainstorming requests without a specified focus

Does NOT need clarification (return false):
- Specific questions that already name a grade level, subject, student group, or specific challenge
- Factual questions with clear answers
- Greetings or pleasantries
- Follow-up questions where prior conversation already provides context
- Data or analysis questions

Return ONLY valid JSON, no markdown, no explanation:

If clarification needed:
{"needsClarification":true,"questions":[{"id":"q1","label":"Question?","options":["Option A","Option B","Option C"]},{"id":"q2","label":"Question?","options":["X","Y","Z"]}]}

If not needed:
{"needsClarification":false}

Rules:
- 2–3 questions maximum
- 3–4 options each, specific and relevant to what the teacher asked
- Questions must surface the most important unknowns for giving a useful, targeted response`,
      messages: [
        ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    return Response.json(JSON.parse(text))
  } catch {
    return Response.json({ needsClarification: false })
  }
}
