// images, when present, are data: URLs (PNG) captured from any dashboard
// cards in the same turn via html2canvas — see CardSnapshotTarget and
// handleSaveToNotes in MessageList.tsx. Saved by the same "Save to notes"
// button as the text, not a separate control.
export type Note = { id: string; content: string; images?: string[] }

export type ArtifactType = 'action_plan' | 'agenda' | 'report'

// All three artifact types share one open shape — no fixed template for any
// of them. Claude always asks the teacher what they actually want (focus,
// and for action_plan/agenda, format/structure too — see
// /api/chat/route.ts) before generating, so section count/titles/order and
// whether closing_actions makes sense at all are teacher-driven, not a
// preset structure the UI assumes.
export type ArtifactSection = {
  title: string
  content: string
}

export type GeneratedDocument = {
  title: string
  date_created?: string
  sections: ArtifactSection[]
  closing_actions?: string[]
}

export type ActionPlan = GeneratedDocument
export type Agenda = GeneratedDocument
export type Report = GeneratedDocument

export type Artifacts = {
  action_plan?: ActionPlan
  agenda?: Agenda
  report?: Report
}

// One generated version of a document, kept around so the teacher can click
// back to an earlier report/agenda/action-plan after generating a new one —
// see handleGenerate / pushArtifactVersion in page.tsx. Session-only, same
// lifespan as Notes and Artifacts (cleared on new chat / conversation
// switch) — not persisted to Supabase.
export type ArtifactVersion = { id: string; doc: GeneratedDocument }

export type ArtifactHistory = Record<ArtifactType, ArtifactVersion[]>
export type ActiveArtifactIds = Record<ArtifactType, string | undefined>
