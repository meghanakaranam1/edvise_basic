'use client'
import { useState, useMemo } from 'react'

export type StudentTableData = {
  filename: string
  columns: string[]
  rows: (string | number)[][]
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  Critical: { bg: '#FEE2E2', color: '#991B1B' },
  High:     { bg: '#FEF3C7', color: '#92400E' },
  Moderate: { bg: '#ECFDF5', color: '#065F46' },
}

const PAGE_SIZE = 25

function downloadCSV(filename: string, rawCsv?: string, columns?: string[], rows?: (string | number)[][]) {
  let content: string
  if (rawCsv) {
    content = rawCsv
  } else {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    content = [columns!.map(escape).join(','), ...rows!.map(r => r.map(escape).join(','))].join('\n')
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

export default function StudentTableCard({ data, rawCsv }: { data: StudentTableData; rawCsv?: string }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  const tierCol = data.columns.findIndex(c => /tier|risk/i.test(c))

  const sorted = useMemo(() => {
    if (sortCol === null) return data.rows
    return [...data.rows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      const an = Number(av), bn = Number(bv)
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data.rows, sortCol, sortDir])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(i: number) {
    if (sortCol === i) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(i); setSortDir('asc'); setPage(0) }
  }

  return (
    <div style={{ border: '1px solid #e4e9f2', borderRadius: 12, overflow: 'hidden', background: 'white', marginTop: 10 }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e4e9f2', background: '#f7f9fc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {data.filename.replace(/\.csv$/i, '')}
          </span>
          <span style={{ fontSize: 11, color: '#7a89b8' }}>{data.rows.length.toLocaleString()} students</span>
        </div>
        <button
          onClick={() => downloadCSV(data.filename, rawCsv, data.columns, data.rows)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#eef8fb', border: '1px solid #b8dde6', borderRadius: 7, fontSize: 12, color: '#1b6070', fontWeight: 600, cursor: 'pointer' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {data.columns.map((col, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  style={{
                    padding: '8px 12px', background: '#eef8fb', fontWeight: 600, color: '#1b6070',
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
                    textAlign: 'left', borderBottom: '2px solid #b8dde6',
                    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  {col}{sortCol === i ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => {
              const tier = tierCol >= 0 ? String(row[tierCol]) : ''
              return (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : '#f5fbfc' }}>
                  {row.map((cell, ci) => {
                    const isTier = ci === tierCol
                    const ts = TIER_STYLE[tier]
                    return (
                      <td key={ci} style={{ padding: '7px 12px', borderBottom: '1px solid #e8f4f7', color: '#374151', whiteSpace: 'nowrap' }}>
                        {isTier && ts
                          ? <span style={{ background: ts.bg, color: ts.color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, fontSize: 11 }}>{String(cell)}</span>
                          : String(cell)
                        }
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderTop: '1px solid #e4e9f2', background: '#f7f9fc' }}>
          <span style={{ fontSize: 12, color: '#7a89b8' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e4e9f2', background: 'white', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#ccc' : '#2A3B7C', fontSize: 12 }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e4e9f2', background: 'white', cursor: page === totalPages - 1 ? 'default' : 'pointer', color: page === totalPages - 1 ? '#ccc' : '#2A3B7C', fontSize: 12 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
