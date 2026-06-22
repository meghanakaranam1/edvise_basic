'use client'
import { useState } from 'react'

type Question = { id: string; label: string; options: string[] }
export type BrainstormQData = { questions: Question[] }

const chip: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 20, border: '1px solid',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.12s',
}

export default function BrainstormQCard({
  data,
  onSubmit,
}: {
  data: BrainstormQData
  onSubmit: (text: string) => void
}) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [submitted, setSubmitted] = useState(false)

  const questions = data.questions
  const current = questions[step]
  const isLast = step === questions.length - 1

  function toggle(option: string) {
    setSelected(prev => {
      const cur = prev[current.id] ?? []
      const next = cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option]
      return { ...prev, [current.id]: next }
    })
  }

  function advance(skip?: boolean) {
    if (!skip && isLast) {
      submit()
      return
    }
    if (isLast) {
      submit()
    } else {
      setStep(s => s + 1)
    }
  }

  function submit() {
    const parts = questions
      .map(q => {
        const ans = selected[q.id] ?? []
        return ans.length ? `${q.label} ${ans.join(', ')}` : null
      })
      .filter(Boolean)
    const prompt = parts.length
      ? `Please brainstorm targeted, evidence-based interventions based on these priorities:\n${parts.join('\n')}`
      : 'Please brainstorm broad evidence-based interventions for all flagged students.'
    onSubmit(prompt)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ padding: '10px 14px', background: '#f0f3fa', borderRadius: 10, fontSize: 12, color: '#7a89b8' }}>
        Generating interventions…
      </div>
    )
  }

  const currentSelected = selected[current.id] ?? []

  return (
    <div style={{
      background: '#fff', border: '1px solid #dde4f2', borderRadius: 14,
      padding: '20px 22px', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {questions.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 18 : 6, height: 6, borderRadius: 3,
            background: i < step ? '#3E94A5' : i === step ? '#2A3B7C' : '#e2e8f0',
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ fontSize: 11, color: '#7a89b8', marginLeft: 4 }}>
          {step + 1} of {questions.length}
        </span>
      </div>

      {/* Previous answers summary */}
      {step > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {questions.slice(0, step).map(q => {
            const ans = selected[q.id] ?? []
            return ans.length ? (
              <div key={q.id} style={{ fontSize: 11, color: '#7a89b8' }}>
                <span style={{ fontWeight: 600 }}>{q.label.split('?')[0]}:</span>{' '}
                {ans.join(', ')}
              </div>
            ) : null
          })}
        </div>
      )}

      {/* Current question */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#2A3B7C' }}>{current.label}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {current.options.map(opt => {
          const active = currentSelected.includes(opt)
          return (
            <button key={opt} onClick={() => toggle(opt)} style={{
              ...chip,
              background: active ? '#edf6f8' : '#f7f9fc',
              color: active ? '#1b6070' : '#6b7280',
              borderColor: active ? '#3E94A5' : '#e2e8f0',
              fontWeight: active ? 600 : 500,
            }}>
              {active && '✓ '}{opt}
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => advance(false)}
          style={{
            padding: '8px 18px', background: '#2A3B7C', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {isLast ? 'Generate interventions' : 'Next →'}
        </button>
        <button
          onClick={() => advance(true)}
          style={{
            padding: '8px 12px', background: 'none', color: '#9ca3af',
            border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
