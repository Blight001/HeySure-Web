import { del, get, patch, post } from './http'

export type WorkflowCardStatus = 'active' | 'deprecated' | 'draft' | 'validated' | 'published'
export type WorkflowStepType = 'mcp' | 'condition' | 'delay' | 'ai' | 'end'

export interface WorkflowDefinition {
  schemaVersion: 1
  name?: string
  description?: string
  inputSchema: Record<string, any>
  startStepId: string
  steps: Record<string, Record<string, any>>
  limits: { timeoutSeconds: number; maxTransitions: number; maxResultBytes?: number }
  output: Record<string, any>
  requiredCapabilities?: string[]
  compatibility?: Record<string, any>
  defaultDeviceId?: string
  contractDeviceIds?: string[]
}

export interface WorkflowCard {
  id: string
  name: string
  description: string
  status: WorkflowCardStatus
  risk_level: string
  tags: string[]
  access_scope: 'all' | 'owner' | 'selected'
  allowed_ai_config_ids: number[]
  definition: WorkflowDefinition
  latest_version_id: string | null
  default_device_id: string
  created_at: number
  updated_at: number
}

export interface WorkflowCardVersion {
  id: string
  card_id: string
  version_number: number
  schema_version: number
  definition_digest: string
  tool_contracts: Record<string, any>
  contract_device_ids: string[]
  default_device_id: string
  published_by: number
  published_at: number
  definition?: WorkflowDefinition
}

export interface WorkflowCardInput {
  name: string
  description?: string
  tags?: string[]
  access_scope?: 'all' | 'owner' | 'selected'
  allowed_ai_config_ids?: number[]
  risk_level?: string
  definition?: Record<string, any>
  device_id?: string
  default_device_id?: string
  device_ids?: string[]
}

export const listWorkflowCards = (query: { status?: string; tag?: string; device_id?: string; limit?: number; offset?: number } = {}) =>
  get<{ items: WorkflowCard[]; limit: number; offset: number; total: number }>('/api/workflow-cards', {
    query,
    fallbackError: '自动化卡片加载失败',
  })

export const getWorkflowCard = (cardId: string) =>
  get<WorkflowCard>(`/api/workflow-cards/${encodeURIComponent(cardId)}`, { fallbackError: '卡片读取失败' })

export const createWorkflowCard = (body: WorkflowCardInput) =>
  post<WorkflowCard>('/api/workflow-cards', body, { fallbackError: '卡片创建失败' })

export const importWorkflowCard = (body: WorkflowCardInput) =>
  post<WorkflowCard>('/api/workflow-cards/import', body, { fallbackError: '卡片导入失败' })

export const updateWorkflowCard = (cardId: string, body: Partial<WorkflowCardInput>) =>
  patch<WorkflowCard>(`/api/workflow-cards/${encodeURIComponent(cardId)}`, body, { fallbackError: '卡片保存失败' })

export const patchWorkflowCardDefinition = (
  cardId: string,
  body: { base_version_id: string; operations: Array<{ op: 'add' | 'replace' | 'remove' | 'test'; path: string; value?: any }> },
) => post<{ card_id: string; base_version_id: string; version: WorkflowCardVersion; changed_paths: string[] }>(
  `/api/workflow-cards/${encodeURIComponent(cardId)}/patch-definition`, body,
  { fallbackError: '卡片局部修改失败' },
)

export const validateWorkflowCard = (cardId: string) =>
  post<{ valid: boolean; digest: string; warnings: string[] }>(
    `/api/workflow-cards/${encodeURIComponent(cardId)}/validate`, {}, { fallbackError: '卡片校验失败' },
  )

export const listWorkflowCardVersions = (cardId: string) =>
  get<{ items: WorkflowCardVersion[] }>(`/api/workflow-cards/${encodeURIComponent(cardId)}/versions`, {
    fallbackError: '版本列表加载失败',
  })

export const getWorkflowCardVersion = (cardId: string, versionId: string) =>
  get<WorkflowCardVersion>(
    `/api/workflow-cards/${encodeURIComponent(cardId)}/versions/${encodeURIComponent(versionId)}`,
    { fallbackError: '版本读取失败' },
  )

export const cloneWorkflowCard = (cardId: string) =>
  post<WorkflowCard>(`/api/workflow-cards/${encodeURIComponent(cardId)}/clone`, {}, { fallbackError: '卡片复制失败' })

export const exportWorkflowCard = (cardId: string) =>
  get<Record<string, any>>(`/api/workflow-cards/${encodeURIComponent(cardId)}/export`, {
    fallbackError: '卡片导出失败',
  })

export const deleteWorkflowCard = (cardId: string) =>
  del<void>(`/api/workflow-cards/${encodeURIComponent(cardId)}`, { fallbackError: '卡片删除失败' })
