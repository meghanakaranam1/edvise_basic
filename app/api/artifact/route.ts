import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ArtifactType = 'action_plan' | 'agenda' | 'report'

const SCHEMAS: Record<ArtifactType, string> = {
  action_plan: `{
  "title": "[Target Group] Intervention Plan ([Primary Risk])",
  "tags": ["Behavior", "Academic"],
  "summary": "2–3 sentence description of the target group and what this plan addresses",
  "goal": "1–2 sentence measurable goal",
  "target_date": "",
  "students": [],
  "steps": [
    {
      "id": "step_1",
      "title": "Step title",
      "bullets": [
        "Specific action (Owner: Role)",
        "Another action (Owner: Role)"
      ]
    }
  ],
  "schedule": [],
  "notes": ""
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
  "title": "Descriptive title — topic & key themes",
  "template": "full_analysis",
  "sections": [
    {
      "title": "SECTION 1 — CLASSROOM & COHORT SNAPSHOT",
      "content": "Rich markdown narrative. Use **bold** for subsection titles (not # headings). Use - for bullet lists. Include: cohort overview with numbers, attendance overview, key early-warning subgroups, grade-level patterns. 200-350 words."
    },
    {
      "title": "SECTION 2 — INTERSECTION ANALYSIS",
      "content": "Rich markdown. Subsections: **Where risks overlap (and why it matters)**, **Notable grade-level signal**, **Tiered support framework (aligned to the findings)**. Include why intersections matter, specific subgroup numbers, Tier 1/2/3 breakdown, immediate data gaps. 200-350 words."
    },
    {
      "title": "SECTION 3 — SEL & WELLBEING",
      "content": "Rich markdown. Subsections: **SEL patterns evident in the data**, **Students/groups to flag for additional SEL/counseling support**, **Current/proposed SEL-aligned approaches (from notes)**. 150-250 words."
    },
    {
      "title": "SECTION 4 — INTERVENTION STRATEGIES",
      "content": "Rich markdown. Number each strategy (1), 2), 3) etc). For each: **Strategy Name** then sub-bullets: - **How to implement:** ..., - **Owner(s):** ..., - **Cadence/timeline:** ..., - **Success metrics:** bulleted list. Include 3-4 strategies. 300-450 words."
    }
  ],
  "closing_actions": [
    "Specific priority action with owner and deadline (e.g. Run the X cut for Y students; Owner: Z; due within 1 week)",
    "Another priority action"
  ]
}`,
}

const INSTRUCTIONS: Record<ArtifactType, string> = {
  action_plan: 'Generate a detailed Tier 2 intervention action plan. The teacher\'s saved notes are the PRIMARY source — the steps, strategies, and specific details in the notes must directly appear in the plan. Do not invent generic steps that are not grounded in the notes or conversation. Create 4–6 numbered intervention steps, each with a clear title and 3–5 specific, actionable bullets drawn from the notes. Each bullet must include Owner. Leave target_date and schedule empty — do NOT add any dates, timelines, phases, or day/week counts unless the teacher explicitly asked for them. Tags should reflect the primary risk categories (e.g. Behavior, Academic, Attendance, Engagement). Make owners realistic: ELA Teacher, Counselor, Success Coach, Dean/AP, Admin.',
  agenda: 'Generate a 60–90 min team meeting agenda. The teacher\'s saved notes are the PRIMARY source — the agenda items, discussion points, and focus areas must reflect what is in the notes. Do not invent generic agenda items not grounded in the notes or conversation. Include 5–7 timed agenda items, each with a designated lead and specific detail drawn from the notes.',
  report: 'Generate a comprehensive student support report. The teacher\'s saved notes are the PRIMARY source — the strategies, findings, and specific details in the notes must appear in the report sections. Do not invent generic content not grounded in the notes or conversation. Each section must be rich markdown narrative prose with subsection headings (**bold**), bullet lists, and specific numbers from the data. The closing_actions must be 4–6 specific priority items with named owners, drawn directly from the notes.',
}

const FAMILY_LETTER_SCHEMA = `{
  "title": "letter title",
  "template": "family_letter",
  "sections": [
    {
      "title": "WHAT WE FOUND",
      "content": "Plain-language summary of findings written to families — warm, clear, jargon-free. Use simple bullet lists. 150-200 words."
    },
    {
      "title": "WHAT THIS MEANS FOR YOUR CHILD",
      "content": "Explain the implications in accessible terms. What signs to watch for. 100-150 words."
    },
    {
      "title": "HOW YOU CAN HELP",
      "content": "Specific, actionable things families can do at home. Numbered list format. 100-150 words."
    },
    {
      "title": "WHAT THE SCHOOL IS DOING",
      "content": "What the school will do next and how families can stay informed. 100-150 words."
    }
  ],
  "closing_actions": ["School next step 1", "How families can reach out"]
}`

const FAMILY_LETTER_INSTRUCTION = 'Generate a family-facing letter based on the data. Write in plain, warm, accessible language a parent or guardian can understand. Avoid all educational jargon. Focus on what the findings mean for students and what families can do to help.'

export async function POST(req: NextRequest) {
  const { type, messages, notes, reportTemplate }: {
    type: ArtifactType
    messages: { role: string; content: string }[]
    notes?: { id: string; content: string }[]
    reportTemplate?: string
  } = await req.json()

  if (!SCHEMAS[type]) return new Response('Invalid type', { status: 400 })

  const context = messages
    .map(m => `${m.role === 'user' ? 'Teacher' : 'Edvise'}: ${m.content.slice(0, 1000)}`)
    .join('\n\n')

  const notesBlock = notes && notes.length > 0
    ? `\n\nSaved notes from the teacher:\n${notes.map((n, i) => `Note ${i + 1}: ${n.content.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 600)}`).join('\n\n')}`
    : ''

  const isFamilyLetter = type === 'report' && reportTemplate === 'family_letter'
  const schema = isFamilyLetter ? FAMILY_LETTER_SCHEMA : SCHEMAS[type]
  const instruction = isFamilyLetter ? FAMILY_LETTER_INSTRUCTION : INSTRUCTIONS[type]
  // Inject the actual template value into the report schema context
  const schemaWithTemplate = isFamilyLetter ? schema : schema.replace('"full_analysis"', `"${reportTemplate ?? 'full_analysis'}"`)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `You are an education specialist generating structured artifacts for teachers. ${instruction}

Return ONLY valid JSON — no markdown fences, no explanation, no extra text. Match this schema exactly:
${schemaWithTemplate}`,
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
    return new Response('JSON parse error', { status: 500 })
  }
}
