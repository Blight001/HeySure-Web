import { get, post } from './http'

export interface McpEndpointToolEntry {
  name: string
  mcpSource: 'desktop' | 'browser'
}

export interface McpPromptToolGroup {
  groupKey: string
  groupLabel: string
  groupDescription?: string
  groupKind?: 'workspace' | 'device'
  deviceId?: string
  deviceType?: string
  tools?: any[]
}

export interface McpToolsResponse {
  tools?: any[]
  endpointTools?: McpEndpointToolEntry[]
  endpointToolDefs?: any[]
  promptTools?: any[]
  promptToolGroups?: McpPromptToolGroup[]
  promptToolsScope?: 'current_ai' | 'all_current'
  promptToolsAiConfigId?: number | null
  promptToolsMcpEnabled?: boolean
}

export interface McpCallPayload {
  tool: string
  arguments: Record<string, unknown>
  /** Scope endpoint/device execution to this AI config when provided. */
  ai_config_id?: number | null
}

export const listMcpTools = (options: { aiConfigId?: number } = {}) =>
  get<McpToolsResponse>('/api/mcp/tools', {
    query: { ai_config_id: options.aiConfigId },
    fallbackError: 'MCP 工具列表加载失败',
  })

export const callMcpTool = <T = any>(payload: McpCallPayload) =>
  post<T>('/api/mcp/call', payload, { fallbackError: 'MCP 调用失败' })

export interface InheritanceMcpTestPayload {
  model_preset_id: string
  tool: string
  device_id: string
  /** Optional AI scope for endpoint dispatch during the model-assisted test. */
  ai_config_id?: number | null
  device_type?: string
  description?: string
  parameters?: Array<{
    name: string
    type: string
    required: boolean
    description: string
  }>
  input_schema?: Record<string, unknown>
  implementation?: Record<string, unknown>
  user_hint?: string
}

export interface InheritanceMcpTestResult {
  ok: boolean
  model_preset?: {
    id: string
    name: string
    model: string
  }
  model_reply?: string
  tool_call?: {
    tool: string
    arguments: Record<string, unknown>
  } | null
  tool_result?: Record<string, unknown> | null
  detail?: string
}

export const runInheritanceMcpTest = (payload: InheritanceMcpTestPayload) =>
  post<InheritanceMcpTestResult>('/api/mcp/inheritance-test', payload, {
    fallbackError: 'MCP 传承测试失败',
  })

export interface McpJobPayload {
  tool: string
  arguments?: Record<string, unknown>
  ai_config_id?: number | null
  timeout_seconds?: number
}

export interface McpJobResult {
  job_id: string
  status: string
  success?: boolean | null
  summary?: string | null
  error?: string | null
  result?: unknown
  tool?: string
  device_id?: string
  ai_config_id?: number | null
  created_at?: number
  completed_at?: number | null
}

export const createMcpJob = (payload: McpJobPayload) =>
  post<McpJobResult>('/api/mcp/jobs', payload, { fallbackError: 'MCP 后台任务创建失败' })

export const getMcpJob = (jobId: string) =>
  get<McpJobResult>(`/api/mcp/jobs/${encodeURIComponent(jobId)}`, {
    fallbackError: 'MCP 后台任务状态加载失败',
  })

export const cancelMcpJob = (jobId: string, reason = 'cancelled by caller') =>
  post<McpJobResult>(`/api/mcp/jobs/${encodeURIComponent(jobId)}/cancel`, { reason }, {
    fallbackError: 'MCP 后台任务取消失败',
  })
