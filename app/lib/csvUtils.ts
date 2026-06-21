export interface CsvMeta {
  columns: string[]
  rows: number
  preview: Record<string, string>[]
  filename: string
}

export function parseCsv(file: File): Promise<CsvMeta> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      const columns = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      const preview = lines.slice(1, 4).map((line) => {
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
        return Object.fromEntries(columns.map((c, i) => [c, vals[i] ?? '']))
      })
      resolve({ columns, rows: lines.length - 1, preview, filename: file.name })
    }
    reader.readAsText(file)
  })
}
