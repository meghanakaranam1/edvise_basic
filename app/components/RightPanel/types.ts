export type Note = { id: string; content: string }

export type ArtifactType = 'action_plan' | 'agenda' | 'report'

export type ActionPlan = {
  goal: string
  focus_group: string[]
  weeks: {
    week_label: string
    theme: string
    actions: {
      id: string
      action: string
      detail: string
      owner: string
      status: 'not_started' | 'in_progress' | 'completed' | 'blocked'
      done: boolean
    }[]
  }[]
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

export type Report = {
  title: string
  summary: string
  key_findings: string[]
  recommendations: string[]
  next_steps: string[]
}

export type Artifacts = {
  action_plan?: ActionPlan
  agenda?: Agenda
  report?: Report
}
