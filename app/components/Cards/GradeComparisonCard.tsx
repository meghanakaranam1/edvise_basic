'use client'
import { useState } from 'react'
import { RiskBody } from './RiskOverviewCard'
import type { RiskOverviewData } from './RiskOverviewCard'

type Grade = Omit<RiskOverviewData, 'total'> & { label: string; n: number }
export type GradeComparisonData = { grades: Grade[] }

const TAB_COLORS = ['#1565c0', '#d32f2f', '#2e7d32', '#7b1fa2', '#f57c00', '#00838f', '#5c6bc0']

function sortGrades(grades: Grade[]) {
  return [...grades].sort((a, b) => {
    const na = parseInt(String(a.label).replace(/\D/g, ''), 10)
    const nb = parseInt(String(b.label).replace(/\D/g, ''), 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.label.localeCompare(b.label)
  })
}

export default function GradeComparisonCard({ data }: { data: GradeComparisonData }) {
  const grades = sortGrades(data?.grades ?? [])
  const [active, setActive] = useState(0)

  if (!grades.length) return null

  const idx = Math.min(active, grades.length - 1)
  const g = grades[idx]

  return (
    <div style={{ border: '1px solid #e4e9f2', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e4e9f2', background: '#f7f9fc' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#2A3B7C', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Grade breakdown
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {grades.map((grade, i) => {
            const c = TAB_COLORS[i % TAB_COLORS.length]
            const isActive = i === idx
            return (
              <button
                key={grade.label}
                type="button"
                onClick={() => setActive(i)}
                style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${isActive ? c : '#e4e9f2'}`,
                  background: isActive ? `${c}18` : 'white',
                  color: isActive ? c : '#7a89b8',
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all .15s',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                {grade.label}
                <span style={{ fontSize: 10, color: '#7a89b8', fontWeight: 400 }}>n={grade.n.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ padding: 12 }}>
        <RiskBody data={{ ...g, total: g.n }} scope="grade" />
      </div>
    </div>
  )
}
