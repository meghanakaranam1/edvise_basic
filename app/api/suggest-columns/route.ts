import { NextRequest } from 'next/server'
import { classifyColumns } from '../../lib/columnClassifier'

export type { Indicators, IdentityColumns, Signal, IndicatorCategory } from '../../lib/columnClassifier'

export async function POST(req: NextRequest) {
  const { columns, preview, columnUniques }: { columns: string[]; preview: Record<string, string>[]; columnUniques?: Record<string, string[]> } = await req.json()
  const result = await classifyColumns(columns, preview, columnUniques)
  return Response.json(result)
}
