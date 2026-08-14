import { get, post } from './http'

export type WorkflowRunStatus =
  | 'pending' | 'running' | 'waiting_device'
  | 'retry_wait' | 'paused_offline' | 'waiting_ai' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'

export interface WorkflowRun {
  id: string
  card_id: string
  card_version_id: string
  device_id: string
  status: WorkflowRunStatus
  current_step_id: string
  transition_count: number
  output: any
  error: any
  deadline_at: number
  started_at: number | null
  finished_at: number | null
  created_at: number
  updated_at: number
  actor_type: string
  actor_id: string
}

export interface WorkflowStepRun {
  id: string
  run_id: string
  step_id: string
  attempt: number
  dispatch_task_id: string
  tool_name: string
  tool_provider: string
  status: string
  arguments: Record<string, any>
  result: any
  error: any
  started_at: number | null
  deadline_at: number
  finished_at: number | null
}

export interface WorkflowAiReview {
  id: string
  run_id: string
  step_id: string
  type: 'ai_review'
  status: string
  risk_summary: string
  expires_at: number
  decision: string | null
  ai_config_id?: number | null
  notified_at?: number | null
}

export const startWorkflowRun = (
  cardId: string,
  body: { device_id?: string; input: Record<string, any>; version_id?: string; idempotency_key: string },
) => post<WorkflowRun>(`/api/workflow-cards/${encodeURIComponent(cardId)}/runs`, body, {
  fallbackError: '自动化运行启动失败',
})

export const listWorkflowRuns = (query: {
  card_id?: string; device_id?: string; status?: string; created_from?: number; created_to?: number; limit?: number; offset?: number
} = {}) => get<{ items: WorkflowRun[]; limit: number; offset: number }>('/api/workflow-runs', {
  query,
  fallbackError: '运行历史加载失败',
})

export const getWorkflowRun = (runId: string) =>
  get<WorkflowRun>(`/api/workflow-runs/${encodeURIComponent(runId)}`, { fallbackError: '运行状态读取失败' })

export const listWorkflowRunSteps = (runId: string) =>
  get<{ items: WorkflowStepRun[] }>(`/api/workflow-runs/${encodeURIComponent(runId)}/steps`, {
    fallbackError: '步骤历史加载失败',
  })

export const listWorkflowAiReviews = (runId: string) =>
  get<{ items: WorkflowAiReview[] }>(`/api/workflow-runs/${encodeURIComponent(runId)}/ai-reviews`, {
    fallbackError: 'AI 审核记录加载失败',
  })

export const cancelWorkflowRun = (runId: string, reason = 'cancelled by user') =>
  post<WorkflowRun>(`/api/workflow-runs/${encodeURIComponent(runId)}/cancel`, { reason }, {
    fallbackError: '取消运行失败',
  })

export const retryWorkflowRun = (runId: string, idempotencyKey?: string) =>
  post<WorkflowRun>(`/api/workflow-runs/${encodeURIComponent(runId)}/retry`, {
    idempotency_key: idempotencyKey || null,
  }, { fallbackError: '重试运行失败' })

export const getWorkflowStepResult = (runId: string, stepRunId: string) =>
  get<{ result: any; reference: string | null }>(
    `/api/workflow-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepRunId)}/result`,
    { fallbackError: '完整步骤结果读取失败' },
  )
