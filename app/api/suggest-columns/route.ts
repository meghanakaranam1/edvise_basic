import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type IndicatorType = 'rate' | 'days' | 'count' | 'grade-numeric' | 'grade-letter'

export type Indicators = {
  absence?: { column: string; type: 'rate' | 'days' }
  suspension?: { column: string; type: 'count' }
  academicFailure?: { column: string; type: 'count' | 'grade-numeric' | 'grade-letter' }
}

export async function POST(req: NextRequest) {
  const { columns, preview }: { columns: string[]; preview: Record<string, string>[] } = await req.json()

  // Build a compact sample so Claude can see actual values
  const sampleRows = preview.slice(0, 5)
  const sampleText = columns.map(col => {
    const vals = sampleRows.map(r => r[col]).filter(Boolean).slice(0, 5).join(', ')
    return `  "${col}": [${vals}]`
  }).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `You are a school data analyst. Given raw CSV column names and sample values from a student gradebook, return a JSON object with exactly two fields:

"labels": map every raw column name to a clear human-readable label a teacher would recognize.

"indicators": identify which columns represent the three key student risk indicators. For each, specify the raw column name and its storage type:
- "absence": the attendance or absence column. type = "rate" if stored as a decimal (0–1) or percentage (0–100), type = "days" if stored as integer count of days absent.
- "suspension": the suspension or disciplinary column. type = "count".
- "academicFailure": the best column for academic failure. Prefer a count of failed courses over a GPA/score. type = "count" if it counts failures, type = "grade-numeric" if it is a 0–100 numeric grade/GPA, type = "grade-letter" if it contains letter grades (A/B/C/D/F).

If a category cannot be found, omit it from indicators. Return ONLY valid JSON, no explanation, no markdown.`,
    messages: [{
      role: 'user',
      content: `Column names and sample values:\n{\n${sampleText}\n}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: { labels?: Record<string, string>; indicators?: Indicators } = {}
  try { parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {} } catch { parsed = {} }

  const labels: Record<string, string> = parsed.labels ?? {}
  const indicators: Indicators = parsed.indicators ?? {}

  // Fill any missing labels with title-case fallback
  for (const col of columns) {
    if (!labels[col]) {
      labels[col] = col.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  return Response.json({ labels, indicators })
}
