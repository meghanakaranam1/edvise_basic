export type Note = { id: string; content: string }

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
