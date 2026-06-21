import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ArtifactType = 'action_plan' | 'agenda' | 'report'

const SCHEMAS: Record<ArtifactType, string> = {
  action_plan: `{
  "goal": "one-sentence intervention goal",
  "focus_group": ["e.g. Critical-tier Hispanic males", "Grade 7 chronic absentees"],
  "weeks": [
    {
      "week_label": "Week 1",
      "theme": "short theme title",
      "actions": [
        { "id": "w1_1", "action": "action title", "detail": "specific detail", "owner": "Teacher", "status": "not_started", "done": false }
      ]
    }
  ]
}`,
  agenda: `{
  "title": "meeting title",
  "date_suggestion": "e.g. Next available Monday",
  "duration_minutes": 60,
  "location": "Conference Room / Virtual",
  "purpose": "1–2 sentence meeting purpose",
  "attendees_placeholder": ["Grade Level Team", "School Counselor", "Admin"],
  "items": [
    { "time": "9:00 AM", "title": "item title", "detail": "what to cover", "lead": "Teacher", "duration_min": 10 }
  ]
}`,
  report: `{
  "title": "report title",
  "summary": "2–3 sentence executive summary grounded in specific numbers",
  "key_findings": ["finding with specific data", "finding 2"],
  "recommendations": ["actionable recommendation 1", "rec 2"],
  "next_steps": ["immediate next step 1", "step 2"]
}`,
}

const INSTRUCTIONS: Record<ArtifactType, string> = {
  action_plan: 'Generate a 4-week action plan. Include 3–5 specific, actionable steps per week focused on the highest-risk students from the conversation. Make owners realistic: Teacher, Counselor, Admin, or Team.',
  agenda: 'Generate a 60–90 min team meeting agenda to review the findings and coordinate next steps. Include 5–7 timed agenda items, each with a designated lead.',
  report: 'Generate a concise school data report. Ground every point in specific numbers from the conversation. Include 4–6 key findings, 3–5 recommendations, and 2–3 immediate next steps.',
}

export async function POST(req: NextRequest) {
  const { type, messages }: { type: ArtifactType; messages: { role: string; content: string }[] } = await req.json()

  if (!SCHEMAS[type]) return new Response('Invalid type', { status: 400 })

  const context = messages
    .map(m => `${m.role === 'user' ? 'Teacher' : 'Edvise'}: ${m.content.slice(0, 1000)}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `You are an education specialist generating structured artifacts for teachers. ${INSTRUCTIONS[type]}

Return ONLY valid JSON — no markdown fences, no explanation, no extra text. Match this schema exactly:
${SCHEMAS[type]}`,
    messages: [{ role: 'user', content: `Conversation:\n\n${context}\n\nGenerate the ${type.replace('_', ' ')}.` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  try {
    return Response.json(JSON.parse(match?.[0] ?? raw))
  } catch {
    return new Response('JSON parse error', { status: 500 })
  }
}
