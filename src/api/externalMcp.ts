import { del, get, post, put } from './http'

export interface ExternalMcpCredential {
  id: number
  label: string
  token_prefix?: string
  state?: 'active' | 'expired' | 'revoked' | string
  active?: boolean
  created_at: string | number
  expires_at: string | number | null
  last_used_at: string | number | null
  revoked_at?: string | number | null
}

export interface ExternalMcpSettings {
  ai_config_id?: number
  enabled: boolean
  public_id?: string | null
  endpoint: string
  member_endpoint?: string
  tool_count: number
  capability_revision?: string | number | null
  credentials: ExternalMcpCredential[]
}

export interface ExternalMcpCredentialCreated {
  credential: ExternalMcpCredential
  token: string
  endpoint: string
  member_endpoint?: string
  codex_config: string | Record<string, unknown>
}

export interface ExternalMcpCredentialRevoked {
  revoked: boolean
  credential: ExternalMcpCredential
}

export interface CreateExternalMcpCredentialPayload {
  label: string
  expires_in_days: number
}

const settingsPath = (configId: number) => `/api/ai/configs/${configId}/external-mcp`

const normalizeSettings = (value: ExternalMcpSettings): ExternalMcpSettings => ({
  ...value,
  enabled: Boolean(value.enabled),
  endpoint: String(value.endpoint || ''),
  tool_count: Number(value.tool_count || 0),
  credentials: Array.isArray(value.credentials) ? value.credentials : [],
})

export const getExternalMcpSettings = (configId: number) =>
  get<ExternalMcpSettings>(settingsPath(configId), { fallbackError: '外部 MCP 配置加载失败' })
    .then(normalizeSettings)

export const updateExternalMcpSettings = (configId: number, enabled: boolean) =>
  put<ExternalMcpSettings>(settingsPath(configId), { enabled }, { fallbackError: '外部 MCP 开放状态更新失败' })
    .then(normalizeSettings)

export const createExternalMcpCredential = (
  configId: number,
  payload: CreateExternalMcpCredentialPayload,
) => post<ExternalMcpCredentialCreated>(`${settingsPath(configId)}/credentials`, payload, {
  fallbackError: '访问凭证生成失败',
})

export const revokeExternalMcpCredential = (configId: number, credentialId: number) =>
  del<ExternalMcpCredentialRevoked>(`${settingsPath(configId)}/credentials/${credentialId}`, { fallbackError: '访问凭证吊销失败' })
