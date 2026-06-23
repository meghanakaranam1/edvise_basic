'use client'
import { useState } from 'react'

type Question = { id: string; label: string; options: string[] }
export type BrainstormQData = {
  questions: Question[]
  submitLabel?: string
  promptPrefix?: string
}

const isOtherChoice = (choice: string) => /other|specify|custom/i.test(choice)

export default function BrainstormQCard({
  data,
  onSubmit,
}: {
  data: BrainstormQData
  onSubmit: (text: string) => void
}) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [confirmedAnswers, setConfirmedAnswers] = useState<{ label: string; ans: string[] }[]>([])

  const questions = data.questions
  const current = questions[step]
  const isLast = step === questions.length - 1
  const currentSelected = selected[current.id] ?? []
  const hasOtherSelected = currentSelected.some(isOtherChoice)

  function toggle(option: string) {
    setSelected(prev => {
      const cur = prev[current.id] ?? []
      const next = cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option]
      return { ...prev, [current.id]: next }
    })
  }

  function resolveAns(q: Question): string[] {
    return (selected[q.id] ?? [])
      .map(a => isOtherChoice(a) ? (otherText[q.id] ?? '').trim() : a)
      .filter(Boolean)
  }

  function advance() {
    if (currentSelected.length === 0) return
    if (isLast) { doSubmit(); return }
    setStep(s => s + 1)
  }

  function skip() {
    if (isLast) { doSubmit(); return }
    setStep(s => s + 1)
  }

  function doSubmit() {
    const parts = questions
      .map(q => ({ label: q.label, ans: resolveAns(q) }))
      .filter(p => p.ans.length > 0)

    setConfirmedAnswers(parts)
    setSubmitted(true)

    const answerLines = parts.map(p => `${p.label}: ${p.ans.join(', ')}`).join('\n')
    const prompt = data.promptPrefix
      ? `${data.promptPrefix}\n${answerLines || 'No specific preferences'}`
      : (answerLines || 'Please proceed with a general response.')
    onSubmit(prompt)
  }

  if (submitted) {
    return (
      <div style={{
        border: '1px solid #e5e7eb', borderRadius: 12,
        background: '#fff', maxWidth: 480, overflow: 'hidden',
      }}>
        {confirmedAnswers.map(({ label, ans }) => (
          <div key={label} style={{
            padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'baseline',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <span style={{ color: '#3E94A5', fontSize: 11, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 12, color: '#374151' }}>
              <span style={{ fontWeight: 600, color: '#2A3B7C' }}>
                {label.replace(/\?$/, '')}:
              </span>{' '}
              {ans.join(', ')}
            </span>
          </div>
        ))}
        {confirmedAnswers.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>
            Generating response…
          </div>
        )}
      </div>
    )
  }

  const canSubmit = currentSelected.length > 0 && (!hasOtherSelected || (otherText[current.id] ?? '').trim())

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 12,
      background: '#fff', maxWidth: 480, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Question header */}
      <div style={{ padding: '14px 16px 10px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
          {current.label}
        </p>
      </div>

      {/* Choices */}
      <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {current.options.map(choice => {
          const sel = currentSelected.includes(choice)
          const isOther = isOtherChoice(choice)
          return (
            <div key={choice}>
              <button
                onClick={() => toggle(choice)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex',
                  alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${sel ? '#3E94A5' : '#e5e7eb'}`,
                  background: sel ? '#eef7f9' : '#f9fafb',
                  color: sel ? '#1b6070' : '#374151',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.1s',
                }}
              >
                {/* Checkbox / radio indicator */}
                <span style={{
                  width: 16, height: 16, flexShrink: 0,
                  border: `2px solid ${sel ? '#3E94A5' : '#d1d5db'}`,
                  borderRadius: questions.length === 1 ? 4 : 4,
                  background: sel ? '#3E94A5' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.1s',
                }}>
                  {sel && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {choice}
              </button>
              {/* Inline text input for Other when selected */}
              {isOther && sel && (
                <div style={{ marginTop: 6, paddingLeft: 2 }}>
                  <input
                    autoFocus
                    type="text"
                    value={otherText[current.id] ?? ''}
                    onChange={e => setOtherText(prev => ({ ...prev, [current.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && canSubmit) advance() }}
                    placeholder="Please specify…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      border: '1px solid #3E94A5', borderRadius: 8,
                      padding: '8px 12px', fontSize: 12,
                      fontFamily: 'inherit', outline: 'none', color: '#2A3B7C',
                      background: '#fff',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderTop: '1px solid #f3f4f6',
        background: '#f9fafb', borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {currentSelected.length} selected
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={skip}
            style={{
              fontSize: 12, color: '#6b7280', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              padding: '5px 10px', borderRadius: 6,
            }}
          >
            Skip
          </button>
          <button
            onClick={advance}
            disabled={!canSubmit}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none',
              fontSize: 12, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', transition: 'background 0.1s',
              background: canSubmit ? '#2A3B7C' : '#e5e7eb',
              color: canSubmit ? '#fff' : '#9ca3af',
            }}
          >
            {isLast ? (data.submitLabel ?? '→') : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}
