'use client'
import { useMemo, useState } from 'react'
import type { Message } from '../MessageList'
import { parseCardParts, renderCard } from '../MessageList'

// The four standard cards produced by the guided "foundational analysis" flow —
// the same for any teacher who runs it, hence "default." Everything else (ad-hoc
// charts, roster exports) is a specific teacher's own question, hence "custom."
const DEFAULT_CARD_TYPES = new Set(['risk_overview', 'grade_comparison', 'subgroup', 'sel_overview'])

type ExtractedCard = { cardType: string; data: unknown; key: string }

function extractCards(messages: Message[]): ExtractedCard[] {
  const cards: ExtractedCard[] = []
  messages.forEach((msg, i) => {
    if (msg.role !== 'assistant' || !('content' in msg) || !msg.content) return
    parseCardParts(msg.content).forEach((part, j) => {
      if (part.type === 'card') cards.push({ cardType: part.cardType, data: part.data, key: `${i}-${j}` })
    })
  })
  return cards
}

function Section({ title, cards }: { title: string; cards: ExtractedCard[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
          padding: '8px 12px', background: '#f7f9fc', borderRadius: 8, border: '1px solid #e4e9f2',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#2A3B7C' }}>{title} <span style={{ color: '#7a89b8', fontWeight: 500 }}>({cards.length})</span></span>
        <span style={{ fontSize: 11, color: '#7a89b8' }}>{open ? '∧' : '∨'}</span>
      </div>
      {open && (
        cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 12px', color: '#7a89b8', fontSize: 12 }}>Nothing here yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {cards.map(c => renderCard(c.cardType, c.data, c.key))}
          </div>
        )
      )}
    </div>
  )
}

export default function SharedAnalysisTab({ messages }: { messages: Message[] }) {
  const { defaultCards, customCards } = useMemo(() => {
    const all = extractCards(messages)
    return {
      defaultCards: all.filter(c => DEFAULT_CARD_TYPES.has(c.cardType)),
      customCards: all.filter(c => !DEFAULT_CARD_TYPES.has(c.cardType)),
    }
  }, [messages])

  if (!defaultCards.length && !customCards.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#7a89b8', fontSize: 12 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
        No analysis generated in this conversation yet.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: '#7a89b8', marginBottom: 12 }}>
        Analysis your team has generated in this conversation — visible to everyone here.
      </div>
      <Section title="Default Analysis" cards={defaultCards} />
      <Section title="Team-Contributed Analysis" cards={customCards} />
    </div>
  )
}
