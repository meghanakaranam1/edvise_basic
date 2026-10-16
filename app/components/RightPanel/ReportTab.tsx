'use client'
import type { Report, ArtifactVersion } from './types'
import GeneratedDocTab from './GeneratedDocTab'

export default function ReportTab({
  data,
  history,
  activeId,
  onSelectVersion,
  generating,
  onGenerate,
  onSave,
  onDiscard,
  onComment,
  onChange,
}: {
  data?: Report
  history?: ArtifactVersion[]
  activeId?: string
  onSelectVersion?: (id: string) => void
  generating: boolean
  onGenerate: () => void
  onSave?: () => void
  onDiscard?: () => void
  onComment?: (quotedText: string, comment: string) => Promise<string>
  onChange?: (updated: Report) => void
}) {
  return (
    <GeneratedDocTab
      data={data}
      history={history}
      activeId={activeId}
      onSelectVersion={onSelectVersion}
      generating={generating}
      onGenerate={onGenerate}
      onSave={onSave}
      onDiscard={onDiscard}
      onComment={onComment}
      onChange={onChange}
      accentColor="#6c3fc5"
      icon="📄"
      breadcrumbLabel="Report"
      emptyTitle="No report yet"
      emptyDescription="Generate a data report from your analysis conversation."
      generateLabel="Generate report"
      loadingLabel="Generating report…"
      downloadFallbackName="report"
    />
  )
}
