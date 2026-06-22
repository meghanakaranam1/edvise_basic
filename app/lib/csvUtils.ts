export interface CsvMeta {
  columns: string[]
  rows: number
  preview: Record<string, string>[]
  columnUniques: Record<string, string[]>
  filename: string
}

export function parseCsv(file: File): Promise<CsvMeta> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      const columns = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      const preview = lines.slice(1, 11).map((line) => {
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
        return Object.fromEntries(columns.map((c, i) => [c, vals[i] ?? '']))
      })
      // Collect up to 20 unique non-empty values per column from full dataset
      const uniqueSets: Record<string, Set<string>> = Object.fromEntries(columns.map(c => [c, new Set<string>()]))
      for (const line of lines.slice(1)) {
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
        columns.forEach((c, i) => {
          const v = vals[i]?.trim()
          if (v && uniqueSets[c].size < 20) uniqueSets[c].add(v)
        })
      }
      const columnUniques = Object.fromEntries(columns.map(c => [c, [...uniqueSets[c]]]))
      resolve({ columns, rows: lines.length - 1, preview, columnUniques, filename: file.name })
    }
    reader.readAsText(file)
  })
}
