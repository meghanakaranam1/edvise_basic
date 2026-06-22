export type Note = { id: string; content: string }

export type ArtifactType = 'action_plan' | 'agenda' | 'report'

export type ActionPlanStep = {
  id: string
  title: string
  bullets: string[]
}

export type ActionPlanScheduleRow = {
  date_week: string
  focus: string
  lead: string
  status: string
}

export type ActionPlan = {
  title: string
  date_created?: string
  tags: string[]
  summary: string
  goal: string
  target_date: string
  students: string[]
  steps: ActionPlanStep[]
  schedule: ActionPlanScheduleRow[]
  notes?: string
}

export type Agenda = {
  title: string
  date_suggestion: string
  duration_minutes: number
  location: string
  purpose: string
  attendees_placeholder: string[]
  items: {
    time: string
    title: string
    detail: string
    lead: string
    duration_min: number
  }[]
}

export type ReportSection = {
  title: string
  content: string
}

export type Report = {
  title: string
  template: 'full_analysis' | 'family_letter'
  sections: ReportSection[]
  closing_actions: string[]
}

export type Artifacts = {
  action_plan?: ActionPlan
  agenda?: Agenda
  report?: Report
}
