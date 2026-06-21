'use client'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DataConfirmCard from './Cards/DataConfirmCard'
import CriteriaSettingCard, { type Thresholds } from './Cards/CriteriaSettingCard'
import RiskOverviewCard, { type RiskOverviewData } from './Cards/RiskOverviewCard'
import GradeComparisonCard, { type GradeComparisonData } from './Cards/GradeComparisonCard'
import SubgroupCard, { type SubgroupData } from './Cards/SubgroupCard'
import StudentTableCard, { type StudentTableData } from './Cards/StudentTableCard'
import SELCard, { type SELData } from './Cards/SELCard'
import ChartCard, { type ChartData } from './Cards/ChartCard'

export type Message =
  | { role: 'user'; content: string; id?: string }
  | { role: 'assistant'; content: string; images?: string[]; csvs?: { filename: string; data: string }[]; tableCsvs?: { filename: string; csv: string }[]; sources?: Array<{ title: string; kind: 'kb' | 'web'; url?: string }>; id?: string }
  | { role: 'assistant'; isLoading: true; id?: string }
  | { role: 'card'; type: 'data_confirm'; data: Parameters<typeof DataConfirmCard>[0]['data']; onConfirm: (mapping: Record<string, string>) => void; id?: string }
  | { role: 'card'; type: 'criteria'; columnMapping?: Record<string, string>; onConfirm: (t: Thresholds) => void; id?: string }

const STARTERS = [
  { title: 'Full school analysis', desc: 'Attendance, behavior & academic risk overview' },
  { title: 'Grade breakdown', desc: 'Compare risk indicators across grade levels' },
  { title: 'Subgroup analysis', desc: 'Equity gaps by race, gender, SPED, ELL' },
  { title: 'Brainstorm interventions', desc: 'Evidence-based strategies for flagged students' },
]

type TextPart = { type: 'text'; content: string }
type CardPart = { type: 'card'; cardType: string; data: unknown }
type Part = TextPart | CardPart

function parseTableCsv(raw: string): { columns: string[]; rows: string[][] } {
  const lines = raw.trim().split('\n')
  if (lines.length === 0) return { columns: [], rows: [] }
  function parseLine(line: string): string[] {
    const fields: string[] = []
    let i = 0, field = ''
    while (i <= line.length) {
      if (i === line.length || line[i] === ',') {
        fields.push(field); field = ''; i++
      } else if (line[i] === '"') {
        i++
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { field += line[i++] }
        }
      } else {
        field += line[i++]
      }
    }
    return fields
  }
  return { columns: parseLine(lines[0]), rows: lines.slice(1).filter(l => l.trim()).map(parseLine) }
}

function parseSuggestions(text: string): { text: string; suggestions: string[] } {
  const match = text.match(/<!--SUGGEST:\s*(.*?)\s*-->/)
  if (!match) return { text, suggestions: [] }
  const suggestions = match[1].split('|').map((s) => s.trim()).filter(Boolean)
  return { text: text.replace(/<!--SUGGEST:[\s\S]*?-->/, '').trim(), suggestions }
}

function parseCardParts(content: string): Part[] {
  // Strip stray CSV_EXPORT / TABLE_CSV markers echoed into text (data is already captured from stdout)
  content = content.replace(/CSV_EXPORT:[^\n]*\n[A-Za-z0-9+/=\n]*/g, '').replace(/CSV_EXPORT:[^\n]*/g, '')
  content = content.replace(/TABLE_CSV:[^\n]+(\n[^\n]+)*/g, '')

  const parts: Part[] = []
  const regex = /<!--CARD:([\s\S]*?)-->/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index).trim()
    if (textBefore) parts.push({ type: 'text', content: textBefore })
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed.type && parsed.data) {
        parts.push({ type: 'card', cardType: parsed.type, data: parsed.data })
      }
    } catch {
      // Malformed JSON — skip this marker
    }
    lastIndex = match.index + match[0].length
  }

  // Remaining text (strip any partial <!--CARD: that's still streaming)
  const remaining = content.slice(lastIndex).replace(/<!--CARD:[\s\S]*$/, '').trim()
  if (remaining) parts.push({ type: 'text', content: remaining })

  return parts
}

function renderCard(cardType: string, data: unknown, key: string | number) {
  if (cardType === 'risk_overview') {
    return <RiskOverviewCard key={key} data={data as RiskOverviewData} />
  }
  if (cardType === 'grade_comparison') {
    return <GradeComparisonCard key={key} data={data as GradeComparisonData} />
  }
  if (cardType === 'subgroup') {
    return <SubgroupCard key={key} data={data as SubgroupData} />
  }
  if (cardType === 'student_table') {
    return <StudentTableCard key={key} data={data as StudentTableData} />
  }
  if (cardType === 'sel_overview') {
    return <SELCard key={key} data={data as SELData} />
  }
  if (cardType === 'chart') {
    return <ChartCard key={key} data={data as ChartData} />
  }
  return null
}

export default function MessageList({
  messages,
  isStreaming,
  onStarterClick,
  onSuggestionClick,
  onAddNote,
}: {
  messages: Message[]
  isStreaming: boolean
  onStarterClick: (text: string) => void
  onSuggestionClick: (text: string) => void
  onAddNote?: (content: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  function onThreadScroll() {
    const el = threadRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  useEffect(() => {
    if (autoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="welcome">
        <div className="welcome-logo">Ev</div>
        <h1>How can I help today?</h1>
        <p>Upload a gradebook CSV to get started — I&apos;ll analyze attendance, behavior, and academic risk across your school.</p>
        <div className="starters">
          {STARTERS.map((s, i) => (
            <button key={i} className="starter" onClick={() => onStarterClick(s.title)}>
              <div className="starter-title">{s.title}</div>
              <div className="starter-desc">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="thread" ref={threadRef} onScroll={onThreadScroll}>
      {messages.map((msg, i) => {
        if (msg.role === 'user') {
          return (
            <div key={msg.id ?? i} className="msg-wrap user">
              <div className="user-bubble">{msg.content}</div>
            </div>
          )
        }

        if (msg.role === 'card') {
          return (
            <div key={msg.id ?? i} className="msg-wrap assistant">
              <div className="assistant-row">
                <div className="ev-av">Ev</div>
                <div className="assistant-body">
                  {msg.type === 'data_confirm' && (
                    <DataConfirmCard data={msg.data} onConfirm={msg.onConfirm} />
                  )}
                  {msg.type === 'criteria' && (
                    <CriteriaSettingCard columnMapping={msg.columnMapping} onConfirm={msg.onConfirm} />
                  )}
                </div>
              </div>
            </div>
          )
        }

        if (msg.role === 'assistant') {
          if ('isLoading' in msg) {
            return (
              <div key={msg.id ?? i} className="msg-wrap assistant">
                <div className="assistant-row">
                  <div className="ev-av">Ev</div>
                  <div className="assistant-body">
                    <div className="typing">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          const { text: withoutSuggest, suggestions } = parseSuggestions(msg.content)
          const parts = parseCardParts(withoutSuggest)
          const isLast = i === messages.length - 1
          const textContent = parts.filter(p => p.type === 'text').map(p => (p as { type: 'text'; content: string }).content).join('\n').trim()

          return (
            <div key={msg.id ?? i} className="msg-wrap assistant">
              <div className="assistant-row">
                <div className="ev-av">Ev</div>
                <div className="assistant-body">
                  {msg.tableCsvs?.map((t, j) => {
                    const { columns, rows } = parseTableCsv(t.csv)
                    return (
                      <StudentTableCard
                        key={`tcsv-${j}`}
                        data={{ filename: t.filename, columns, rows }}
                        rawCsv={t.csv}
                      />
                    )
                  })}
                  {parts.map((part, j) =>
                    part.type === 'text' ? (
                      part.content ? (
                        <ReactMarkdown key={j} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
                      ) : null
                    ) : (
                      renderCard(part.cardType, part.data, j)
                    )
                  )}
                  {msg.csvs?.map((csv, j) => (
                    <a
                      key={j}
                      href={`data:text/csv;base64,${csv.data}`}
                      download={csv.filename}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        marginTop: 10, padding: '7px 14px',
                        background: '#f0f8fa', border: '1px solid #b8dde6',
                        borderRadius: 8, fontSize: 13, color: '#1b6070',
                        textDecoration: 'none', fontWeight: 500,
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {csv.filename}
                    </a>
                  ))}
                  {msg.images?.map((src, j) => (
                    <img
                      key={`img-${j}`}
                      src={`data:image/png;base64,${src}`}
                      alt="chart"
                      style={{ maxWidth: '100%', borderRadius: 8, marginTop: 12, display: 'block' }}
                    />
                  ))}
                  {isLast && isStreaming && parts.length === 0 && (
                    <div className="typing"><span /><span /><span /></div>
                  )}
                  {onAddNote && textContent && !isStreaming && (
                    <button
                      onClick={() => onAddNote(textContent)}
                      className="save-note-btn"
                      title="Save to notes"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      Save to notes
                    </button>
                  )}
                  {msg.sources && msg.sources.length > 0 && !isStreaming && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</span>
                      {msg.sources.map((s, j) => (
                        s.kind === 'web' && s.url ? (
                          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef9ec', border: '1px solid #f6d860', color: '#92400e', textDecoration: 'none', fontWeight: 500 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            {s.title}
                          </a>
                        ) : (
                          <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#edf6f8', border: '1px solid #b8dde6', color: '#1b6070', fontWeight: 500 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            {s.title}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div className="suggestions">
                      {suggestions.map((s, j) =>
                        j === 0 ? (
                          <button key={j} className="sug-btn next-step" onClick={() => onSuggestionClick(s)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" style={{ flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            {s}
                          </button>
                        ) : (
                          <button key={j} className="sug-btn question" onClick={() => onSuggestionClick(s)}>
                            {s}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }

        return null
      })}
      <div ref={bottomRef} />
    </div>
  )
}
