import ExcelJS from 'exceljs'
import type { SheetTable } from './sheetMerge'

export function isSpreadsheetFile(filename: string): boolean {
  return /\.(xlsx|xls)$/i.test(filename)
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('result' in value) return cellToString((value as { result: ExcelJS.CellValue }).result)
    if ('text' in value) return String((value as { text: unknown }).text)
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if ('richText' in value) return (value as { richText: { text: string }[] }).richText.map(r => r.text).join('')
    return String(value)
  }
  return String(value)
}

// row.values is a 1-indexed array that ExcelJS leaves sparse wherever a cell was
// never written — Array.prototype.map/slice preserve those holes, and code
// downstream (Object.fromEntries in particular) throws on a hole instead of
// treating it as an empty cell. Rebuild it by index so it's always dense.
function rowToCells(row: ExcelJS.Row): string[] {
  const raw = row.values as ExcelJS.CellValue[]
  const width = Math.max(raw.length - 1, 0)
  return Array.from({ length: width }, (_, i) => cellToString(raw[i + 1]))
}

// Parses every sheet in a workbook into a plain string-grid table, skipping
// sheets with no header row or no data rows (blank/instructional tabs).
export async function parseWorkbook(file: File): Promise<SheetTable[]> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const tables: SheetTable[] = []
  workbook.eachSheet(worksheet => {
    if (worksheet.state === 'hidden' || worksheet.state === 'veryHidden') return
    const rows: string[][] = []
    let headers: string[] = []
    // The header row isn't always Excel row 1 — a blank title/spacer row above
    // the real header (which eachRow skips, since includeEmpty is false) shifts
    // it to row 2+. Treat whichever row eachRow visits first as the header row.
    let sawHeaderRow = false
    worksheet.eachRow({ includeEmpty: false }, row => {
      const cells = rowToCells(row)
      if (!sawHeaderRow) {
        sawHeaderRow = true
        headers = cells.map((c, i) => c.trim() || `Column ${i + 1}`)
      } else {
        rows.push(headers.map((_, i) => cells[i] ?? ''))
      }
    })
    if (headers.length && rows.length) {
      tables.push({ name: worksheet.name, headers, rows })
    }
  })
  return tables
}
