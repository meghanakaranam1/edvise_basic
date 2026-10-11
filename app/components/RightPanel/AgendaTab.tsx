'use client'
import type { Agenda } from './types'
import GeneratedDocTab from './GeneratedDocTab'

export default function AgendaTab({
  data,
  generating,
  onGenerate,
  onSave,
  onDiscard,
  onComment,
  onChange,
}: {
  data?: Agenda
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
  onComment?: (quotedText: string, comment: string) => Promise<string>
  onChange?: (updated: Agenda) => void
}) {
  return (
    <GeneratedDocTab
      data={data}
      generating={generating}
      onGenerate={onGenerate}
      onSave={onSave}
      onDiscard={onDiscard}
      onComment={onComment}
      onChange={onChange}
      accentColor="#1b6070"
      savedColor="#1b6070"
      icon="📅"
      breadcrumbLabel="Agenda"
      emptyTitle="No agenda yet"
      emptyDescription="Generate a meeting agenda based on your analysis."
      generateLabel="Generate agenda"
      loadingLabel="Generating agenda…"
      downloadFallbackName="agenda"
    />
  )
}
