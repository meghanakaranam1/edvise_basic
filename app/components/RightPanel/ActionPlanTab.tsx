'use client'
import type { ActionPlan } from './types'
import GeneratedDocTab from './GeneratedDocTab'

export default function ActionPlanTab({
  data,
  generating,
  onGenerate,
  onSave,
  onDiscard,
  onComment,
  onChange,
}: {
  data?: ActionPlan
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
  onComment?: (quotedText: string, comment: string) => Promise<string>
  onChange?: (updated: ActionPlan) => void
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
      accentColor="#15803d"
      icon="📋"
      breadcrumbLabel="Action Plan"
      emptyTitle="No action plan yet"
      emptyDescription="Generate one from the Notes tab, or click below."
      generateLabel="Generate action plan"
      loadingLabel="Generating action plan…"
      downloadFallbackName="action-plan"
    />
  )
}
