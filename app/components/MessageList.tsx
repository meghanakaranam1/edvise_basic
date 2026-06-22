'use client'
import { useEffect, useRef, useState } from 'react'
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
import BrainstormQCard, { type BrainstormQData } from './Cards/BrainstormQCard'

export type Message =
  | { role: 'user'; content: string; id?: string }
  | { role: 'assistant'; content: string; images?: string[]; csvs?: { filename: string; data: string }[]; tableCsvs?: { filename: string; csv: string }[]; sources?: Array<{ title: string; kind: 'kb' | 'web' | 'pdf'; url?: string }>; id?: string }
  | { role: 'assistant'; isLoading: true; id?: string }
  | { role: 'card'; type: 'data_confirm'; data: Parameters<typeof DataConfirmCard>[0]['data']; onConfirm: (mapping: Record<string, string>) => void; id?: string }
  | { role: 'card'; type: 'criteria'; columnMapping?: Record<string, string>; columnUniques?: Record<string, string[]>; indicators?: import('../api/suggest-columns/route').Indicators; onConfirm: (t: Thresholds) => void; id?: string }
  | { role: 'card'; type: 'brainstorm_q'; data: BrainstormQData; onSubmit: (text: string) => void; id?: string }

const MODES = [
  {
    key: 'questions',
    title: 'I have my own questions',
    desc: 'Ask anything — upload a CSV, a PDF, or just start a conversation',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    color: '#1B3A6B',
    bg: '#eef0f8',
    border: '#c5cce0',
  },
  {
    key: 'analysis',
    title: 'Run foundational analysis',
    desc: 'School-wide risk overview — attendance, behavior & academic failure',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    color: '#2E705E',
    bg: '#eaf4f0',
    border: '#a8d4c8',
  },
  {
    key: 'brainstorm',
    title: 'Brainstorm interventions',
    desc: 'Evidence-based strategies tailored to your students',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
        <path d="M9 21h6"/><path d="M12 3a6 6 0 0 1 6 6c0 2.22-1.21 4.16-3 5.2V17a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-2.8C7.21 13.16 6 11.22 6 9a6 6 0 0 1 6-6z"/>
      </svg>
    ),
    color: '#7a4f1a',
    bg: '#fdf3dc',
    border: '#f0d898',
  },
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

type Suggestion = { label: string; needsKB: boolean }

function parseSuggestions(text: string): { text: string; suggestions: Suggestion[] } {
  const match = text.match(/<!--SUGGEST:\s*(.*?)\s*-->/)
  if (!match) return { text, suggestions: [] }
  const suggestions: Suggestion[] = match[1].split('|').map((s) => s.trim()).filter(Boolean).map(s => {
    const needsKB = s.endsWith('[kb]')
    return { label: needsKB ? s.slice(0, -4).trim() : s, needsKB }
  })
  return { text: text.replace(/<!--SUGGEST:[\s\S]*?-->/, '').trim(), suggestions }
}

function parseSourceSections(text: string): { kb: string | null; web: string | null; rest: string } {
  const kbMatch = text.match(/<!--KB_START-->([\s\S]*?)<!--KB_END-->/)
  const webMatch = text.match(/<!--WEB_START-->([\s\S]*?)<!--WEB_END-->/)
  const kb = kbMatch ? kbMatch[1].trim() : null
  const web = webMatch ? webMatch[1].trim() : null
  const rest = text
    .replace(/<!--KB_START-->[\s\S]*?<!--KB_END-->/g, '')   // complete blocks
    .replace(/<!--WEB_START-->[\s\S]*?<!--WEB_END-->/g, '')
    .replace(/<!--(?:KB|WEB)_START-->[\s\S]*/g, '')          // incomplete block (streaming cut-off)
    .replace(/<!--(?:KB|WEB)_END-->/g, '')                   // stray end tags
    .trim()
  return { kb, web, rest }
}

function SourceTabs({ kb, web, kbSources, webSources }: {
  kb: string; web: string
  kbSources: Array<{ title: string; kind: 'kb' | 'web' | 'pdf'; url?: string }>
  webSources: Array<{ title: string; kind: 'kb' | 'web' | 'pdf'; url?: string }>
}) {
  const [active, setActive] = useState<'kb' | 'web'>('kb')
  const content = active === 'kb' ? kb : web
  const sources = active === 'kb' ? kbSources : webSources

  const tabStyle = (t: 'kb' | 'web'): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    borderRadius: '6px 6px 0 0', border: '1px solid var(--border)',
    borderBottom: active === t ? '1px solid var(--surface)' : '1px solid var(--border)',
    background: active === t ? 'var(--surface)' : 'var(--primary-light)',
    color: active === t ? 'var(--primary)' : 'var(--text-muted)',
    marginBottom: -1,
  })

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        <button style={tabStyle('kb')} onClick={() => setActive('kb')}>📚 Knowledge Base</button>
        <button style={tabStyle('web')} onClick={() => setActive('web')}>🌐 Web</button>
      </div>
      <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 6px 6px 6px', padding: '12px 14px', background: 'var(--surface)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {sources.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</span>
            {sources.map((s, i) =>
              s.kind === 'web' && s.url ? (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef9ec', border: '1px solid #f6d860', color: '#92400e', textDecoration: 'none', fontWeight: 500 }}>
                  <sup style={{ fontSize: 9, fontWeight: 700, marginRight: 1 }}>{i + 1}</sup>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  {s.title}
                </a>
              ) : (
                <span key={i}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#eef0f8', border: '1px solid #c5cce0', color: '#1B3A6B', fontWeight: 500 }}>
                  <sup style={{ fontSize: 9, fontWeight: 700, marginRight: 1 }}>{i + 1}</sup>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {s.title}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
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
  onFocusInput,
  onAddNote,
}: {
  messages: Message[]
  isStreaming: boolean
  onStarterClick: (text: string) => void
  onSuggestionClick: (text: string, needsKB: boolean) => void
  onFocusInput?: () => void
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
        <div style={{ display: 'flex', gap: 14, marginTop: 8, width: '100%', maxWidth: 700 }}>
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => {
                onStarterClick(m.title)
              }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 12,
                background: '#fff', border: `1.5px solid ${m.border}`,
                borderRadius: 14, padding: '20px 16px', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit', transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 16px ${m.border}cc`)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {m.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{m.desc}</div>
              </div>
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
                    <CriteriaSettingCard columnMapping={msg.columnMapping} columnUniques={msg.columnUniques} indicators={msg.indicators} onConfirm={msg.onConfirm} />
                  )}
                  {msg.type === 'brainstorm_q' && (
                    <BrainstormQCard data={msg.data} onSubmit={msg.onSubmit} />
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
          const { kb: kbSection, web: webSection, rest: restContent } = parseSourceSections(withoutSuggest)
          const hasTabs = !!(kbSection && webSection)
          const parts = parseCardParts(hasTabs ? restContent : withoutSuggest)
          const isLast = i === messages.length - 1
          const textContent = parts.filter(p => p.type === 'text').map(p => (p as { type: 'text'; content: string }).content).join('\n').trim()
          const allSources = msg.sources ?? []
          const kbSources = allSources.filter(s => s.kind === 'kb')
          const webSources = allSources.filter(s => s.kind === 'web')

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
                  {hasTabs && kbSection && webSection && (
                    <SourceTabs kb={kbSection} web={webSection} kbSources={kbSources} webSources={webSources} />
                  )}
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
                        background: '#eef0f8', border: '1px solid #c5cce0',
                        borderRadius: 8, fontSize: 13, color: '#1B3A6B',
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
                  {!hasTabs && msg.sources && msg.sources.length > 0 && !isStreaming && msg.content.trim().length > 0 && !msg.content.includes('"brainstorm_q"') && (() => {
                    // Only show sources whose citation number [N] actually appears in the response
                    const citedSources = msg.sources
                      .map((s, j) => ({ s, originalIdx: j + 1 }))
                      .filter(({ originalIdx }) => new RegExp(`\\[${originalIdx}\\]`).test(withoutSuggest))
                    if (!citedSources.length) return null
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</span>
                        {citedSources.map(({ s, originalIdx }) => (
                          s.kind === 'web' && s.url ? (
                            <a key={originalIdx} href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef9ec', border: '1px solid #f6d860', color: '#92400e', textDecoration: 'none', fontWeight: 500 }}>
                              <sup style={{ fontSize: 9, fontWeight: 700, marginRight: 1 }}>{originalIdx}</sup>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                              {s.title}
                            </a>
                          ) : s.kind === 'pdf' ? (
                            <span key={originalIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#faf5ff', border: '1px solid #d8b4fe', color: '#5b21b6', fontWeight: 500 }}>
                              <sup style={{ fontSize: 9, fontWeight: 700, marginRight: 1 }}>{originalIdx}</sup>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                              {s.title}
                            </span>
                          ) : (
                            <span key={originalIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#eef0f8', border: '1px solid #c5cce0', color: '#1B3A6B', fontWeight: 500 }}>
                              <sup style={{ fontSize: 9, fontWeight: 700, marginRight: 1 }}>{originalIdx}</sup>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              {s.title}
                            </span>
                          )
                        ))}
                      </div>
                    )
                  })()}
                  {suggestions.length > 0 && !msg.sources?.some((_, j) => new RegExp(`\\[${j + 1}\\]`).test(withoutSuggest)) && (
                    <div className="suggestions">
                      {suggestions.map((s, j) =>
                        j === 0 ? (
                          <button key={j} className="sug-btn next-step" onClick={() => onSuggestionClick(s.label, s.needsKB)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" style={{ flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            {s.label}
                          </button>
                        ) : (
                          <button key={j} className="sug-btn question" onClick={() => onSuggestionClick(s.label, s.needsKB)}>
                            {s.label}
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
