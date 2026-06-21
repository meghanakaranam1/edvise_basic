import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { columns }: { columns: string[] } = await req.json()

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `You are a school data analyst. Given raw CSV column names from a student gradebook, return a JSON object mapping each raw column name to a clear, human-readable label a teacher would recognize.

Use your knowledge of education data conventions to interpret abbreviations, codes, and prefixes. Return ONLY a valid JSON object, no explanation, no markdown.`,
    messages: [{
      role: 'user',
      content: `Column names: ${JSON.stringify(columns)}`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const labels: Record<string, string> = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

  // Fill any missing columns with title-case fallback
  for (const col of columns) {
    if (!labels[col]) {
      labels[col] = col.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  return Response.json(labels)
}
