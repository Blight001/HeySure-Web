import { del, get, post, put } from './http'

/**
 * `/api/ai/cards` returns the dashboard "agent card" projection — heavy on
 * runtime fields the dashboard renders directly. We keep the row as a loose
 * record because the backend may add fields we want to surface without a
 * coordinated frontend bump.
 */
export type AiCardRow = Record<string, any>

export type AiConfigRow = Record<string, any>

// Each bot's per-channel config slice. Keys mirror the server-side
// ``BotAdapter.default_config`` schema; unknown keys are silently dropped
// by the adapter so it is safe to send extras.
export interface FeishuBotConfig {
  enabled: boolean
  webhook_url?: string
  app_id?: string
  app_secret?: string
  verification_token?: string
  default_receive_id?: string
  default_receive_id_type?: string
}

export interface QqBotConfig {
  enabled: boolean
  app_id?: string
  app_secret?: string
  sandbox?: boolean
  default_target_id?: string
  default_target_type?: string
  markdown_mode?: 'native' | 'template' | 'off'
  markdown_template_id?: string
  stream_enabled?: boolean
}

export interface WechatBotConfig {
  enabled: boolean
  bot_agent?: string
}

export interface BotConfigsPayload {
  feishu?: Partial<FeishuBotConfig>
  qq?: Partial<QqBotConfig>
  wechat?: Partial<WechatBotConfig>
  // Future bots: any additional channel name keys an adapter is registered for.
  [channel: string]: Record<string, any> | undefined
}

export interface AiConfigUpsertPayload {
  name: string
  description?: string
  avatar?: string
  ai_role: 'assistant_admin' | 'digital_member'
  digital_member_role: 'manager' | 'member'
  platform: string
  token_limit: number
  model?: string
  model_preset_id?: string
  reasoning_effort?: '' | 'low' | 'medium' | 'high'
  execution_mode?: 'internal_model' | 'external_mcp'
  prompt?: string
  mcp_tools: string
  bot_channel: 'feishu' | 'qq' | 'wechat'
  bot_configs: BotConfigsPayload
  system_auto_control: string
}

export const listAiCards = () =>
  get<AiCardRow[]>('/api/ai/cards', { fallbackError: 'AI 列表加载失败' })

export const listAiConfigs = () =>
  get<AiConfigRow[]>('/api/ai/configs', { fallbackError: 'AI 配置加载失败' })

export const createAiConfig = (payload: AiConfigUpsertPayload) =>
  post<AiConfigRow>('/api/ai/configs', payload, { fallbackError: 'AI 创建失败' })

export const updateAiConfig = (configId: number, payload: AiConfigUpsertPayload) =>
  put<AiConfigRow>(`/api/ai/configs/${configId}`, payload, { fallbackError: 'AI 更新失败' })

export const updateAiConfigFields = (configId: number, payload: Partial<AiConfigUpsertPayload> & Record<string, any>) =>
  put<AiConfigRow>(`/api/ai/configs/${configId}`, payload, { fallbackError: 'AI 更新失败' })

export const deleteAiConfig = (configId: number) =>
  del<void>(`/api/ai/configs/${configId}`, { fallbackError: 'AI 删除失败' })

export interface ExternalControlEvent {
  id: number
  run_id?: string | null
  event_type: string
  tool_name?: string
  status: string
  result: unknown
  created_at: number
}

export interface ExternalControlStatus {
  ai_config_id: number
  execution_mode: 'external_mcp'
  credentials: Array<Record<string, any>>
  runs: Array<Record<string, any>>
  events: ExternalControlEvent[]
  message_queue?: { queued: number; running: number }
}

export interface ExternalControllerTurn {
  turn_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  session_id: string
  user_message_id: number
  assistant_message_id?: number | null
  created_at: number
}

export const issueExternalControllerCredential = (configId: number, payload: { label?: string; ttl_days?: number } = {}) =>
  post<Record<string, any>>(`/api/external-control/${configId}/credentials`, payload, { fallbackError: '控制文档生成失败' })

export const getExternalControlStatus = (configId: number) =>
  get<ExternalControlStatus>(`/api/external-control/${configId}`, { fallbackError: '外部控制状态加载失败' })

export const enqueueExternalControllerMessage = (
  configId: number,
  payload: { content: string; session_id: string; session_name: string; ai_kind: string; tags?: string },
) => post<ExternalControllerTurn>(
  `/api/external-control/${configId}/messages`,
  payload,
  { fallbackError: '消息发送到外部控制器失败' },
)

export const revokeExternalControllerCredential = (configId: number, credentialId: number) =>
  del<{ revoked: number }>(`/api/external-control/${configId}/credentials/${credentialId}`, { fallbackError: '控制凭证吊销失败' })
