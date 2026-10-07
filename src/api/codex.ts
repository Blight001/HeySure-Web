import { get } from './http'

export interface CodexModelRow {
  id: string
  name?: string
  displayName?: string
  provider?: string
  deviceId: string
  deviceName?: string
  devicePlatform?: string
  deviceType?: string
  online?: boolean
  reasoning?: unknown
}

export const listCodexModels = () =>
  get<{ models: CodexModelRow[] }>('/api/codex/models', { fallbackError: 'Codex 模型列表加载失败' })

export interface CodexEventRow {
  id?: number
  sessionId: string
  sequence?: number
  type: string
  payload?: unknown
  createdAt?: number
}

export const listCodexEventsForChatSession = (chatSessionId: string) =>
  get<{ chatSessionId: string; events: CodexEventRow[] }>(
    `/api/codex/chat-sessions/${encodeURIComponent(chatSessionId)}/events`,
    { fallbackError: 'Codex 活动记录加载失败' },
  )
