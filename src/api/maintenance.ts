import { get, post } from './http'

export type MaintenanceStatus = 'queued' | 'running' | 'waiting_user' | 'succeeded' | 'failed' | 'cancelled'
export type MaintenancePhase = 'triage' | 'diagnose' | 'plan' | 'implement' | 'test' | 'review' | 'commit' | 'push' | 'release' | 'verify'
export type MaintenanceSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface MaintenanceTask {
  id: string
  title: string
  description?: string
  status: MaintenanceStatus
  phase: MaintenancePhase
  severity: MaintenanceSeverity
  device_id?: string | null
  device_name?: string | null
  device_online?: boolean
  source_member_name?: string | null
  created_at: string
  updated_at: string
  started_at?: string | null
  completed_at?: string | null
  branch_name?: string | null
  base_sha?: string | null
  result_summary?: string | null
}

export interface MaintenanceApproval {
  id: string
  kind: string
  title: string
  description?: string | null
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  created_at: string
}

export interface MaintenanceArtifact {
  id: string
  kind: 'diff' | 'test' | 'commit' | 'release' | 'audit' | string
  title: string
  summary?: string | null
  content?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

export interface MaintenanceEvent {
  id: number
  task_id: string
  kind: string
  phase?: MaintenancePhase | string | null
  summary: string
  detail?: string | null
  actor?: string | null
  visibility?: 'public' | 'internal'
  metadata?: Record<string, unknown>
  created_at: string
}

export interface MaintenanceTaskDetail extends MaintenanceTask {
  approvals?: MaintenanceApproval[]
  artifacts?: MaintenanceArtifact[]
}

export interface MaintenanceListResponse { items: MaintenanceTask[]; total?: number }
export interface MaintenanceEventsResponse { items: MaintenanceEvent[]; next_after_id?: number | null }

export interface CreateMaintenanceTaskInput {
  maintainer_ai_config_id: number
  device_id: string
  title: string
  description: string
  severity: MaintenanceSeverity
  acceptance_criteria?: string
  affected_repo?: string
}

const asItems = <T>(value: T[] | { items?: T[] }): T[] => Array.isArray(value) ? value : value.items || []
const isoDate = (value: unknown) => {
  if (!value) return ''
  if (typeof value === 'number') return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString()
  return String(value)
}
const taskStatus = (value: unknown): MaintenanceStatus => {
  const status = String(value || 'queued')
  if (status === 'completed') return 'succeeded'
  if (status === 'error') return 'failed'
  if (status === 'stopped') return 'cancelled'
  return status as MaintenanceStatus
}
const severity = (value: unknown): MaintenanceSeverity => {
  const level = String(value || 'medium')
  return (level === 'normal' ? 'medium' : level) as MaintenanceSeverity
}
const normalizeTask = (raw: any): MaintenanceTask => ({
  ...raw,
  id: String(raw?.id || raw?.task_id || ''),
  status: taskStatus(raw?.status),
  phase: String(raw?.phase || 'triage') as MaintenancePhase,
  severity: severity(raw?.severity),
  result_summary: raw?.result_summary ?? raw?.summary ?? null,
  completed_at: isoDate(raw?.completed_at ?? raw?.finished_at) || null,
  created_at: isoDate(raw?.created_at), updated_at: isoDate(raw?.updated_at),
  started_at: isoDate(raw?.started_at) || null,
})
const normalizeApproval = (raw: any): MaintenanceApproval => ({
  ...raw, id: String(raw?.id || raw?.approval_id || ''), kind: String(raw?.kind || raw?.approval_type || 'approval'),
  description: raw?.description ?? raw?.detail ?? null, created_at: isoDate(raw?.created_at),
})
const normalizeArtifact = (raw: any): MaintenanceArtifact => ({
  ...raw, id: String(raw?.id || raw?.artifact_id || ''), created_at: isoDate(raw?.created_at),
})
const normalizeEvent = (raw: any): MaintenanceEvent => ({
  ...raw, id: Number(raw?.id || raw?.sequence || 0), task_id: String(raw?.task_id || ''),
  kind: String(raw?.kind || raw?.event_type || 'event'), summary: String(raw?.summary || raw?.payload?.summary || ''),
  detail: raw?.detail ?? raw?.payload?.detail ?? null, actor: raw?.actor ?? raw?.actor_id ?? raw?.actor_type ?? null,
  metadata: raw?.metadata ?? raw?.payload ?? {}, created_at: isoDate(raw?.created_at),
})

export const listMaintenanceTasks = async () => {
  const data = await get<MaintenanceTask[] | MaintenanceListResponse>('/api/maintenance/tasks')
  return asItems(data).map(normalizeTask)
}

export const createMaintenanceTask = async (input: CreateMaintenanceTaskInput) =>
  normalizeTask(await post<MaintenanceTask>('/api/maintenance/tasks', input))

export const getMaintenanceTask = async (id: string) => {
  const raw = await get<any>(`/api/maintenance/tasks/${encodeURIComponent(id)}`)
  const task = raw?.task || raw
  return {
    ...normalizeTask(task),
    approvals: asItems(raw?.approvals || []).map(normalizeApproval),
    artifacts: asItems(raw?.artifacts || []).map(normalizeArtifact),
  } as MaintenanceTaskDetail
}

export const listMaintenanceEvents = async (id: string, afterId = 0) => {
  const data = await get<MaintenanceEvent[] | MaintenanceEventsResponse>(
    `/api/maintenance/tasks/${encodeURIComponent(id)}/events`,
    { query: { after_id: afterId } },
  )
  return asItems(data).map(normalizeEvent)
}

export const steerMaintenanceTask = (id: string, message: string) =>
  post(`/api/maintenance/tasks/${encodeURIComponent(id)}/steer`, { content: message })

export const interruptMaintenanceTask = (id: string) =>
  post(`/api/maintenance/tasks/${encodeURIComponent(id)}/interrupt`, {})

export const decideMaintenanceApproval = (id: string, decision: 'accept' | 'decline', comment?: string) =>
  post(`/api/maintenance/approvals/${encodeURIComponent(id)}/decision`, {
    decision: decision === 'accept' ? 'approved' : 'denied', comment,
  })
