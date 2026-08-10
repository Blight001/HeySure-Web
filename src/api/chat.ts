import { del, get, post, put, request } from './http'

export type AiKind = 'assistant' | 'core'

export interface AiContext {
  aiKind: AiKind
  aiConfigId?: number
}

/**
 * Build the query string every chat endpoint expects: `ai_kind=<assistant|core>`
 * plus an optional `ai_config_id` (omitted for the default assistant). Extra
 * key/value pairs (`session_id`, `after_id`, ...) are appended verbatim.
 */
const queryForAi = (ctx: AiContext, extra: Record<string, string | number | undefined> = {}) => {
  const query: Record<string, string> = { ai_kind: ctx.aiKind }
  if (ctx.aiConfigId !== undefined) query.ai_config_id = String(ctx.aiConfigId)
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue
    query[key] = String(value)
  }
  return query
}

export interface ChatSessionRow {
  id: string
  name: string
  total_tokens?: number
  forward_to_bot?: boolean
  created_at?: number | string | null
  updated_at?: number | string | null
}

export interface ChatAttachment {
  id?: number
  file_ref: string
  workspace_path: string
  file_name: string
  mime_type: string
  bytes: number
  is_image: boolean
  url?: string
}

export const uploadChatAttachment = (
  ctx: AiContext,
  sessionId: string,
  file: File,
) => {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('ai_kind', ctx.aiKind)
  form.append('session_id', sessionId || 'default')
  if (ctx.aiConfigId !== undefined) form.append('ai_config_id', String(ctx.aiConfigId))
  return request<ChatAttachment>('/api/chat/attachments/upload', {
    method: 'POST',
    body: form,
    rawBody: true,
    fallbackError: '附件上传失败',
  })
}

export const listChatSessions = (ctx: AiContext) =>
  get<ChatSessionRow[]>('/api/chat/sessions', {
    query: queryForAi(ctx),
    fallbackError: '会话列表加载失败',
  })

export const createChatSession = (ctx: AiContext, name: string) =>
  post<ChatSessionRow>(
    '/api/chat/sessions',
    { name, ai_config_id: ctx.aiConfigId, ai_kind: ctx.aiKind },
    { fallbackError: '会话创建失败' },
  )

export const deleteChatSession = (ctx: AiContext, sessionId: string) =>
  del<void>(`/api/chat/sessions/${sessionId}`, {
    query: queryForAi(ctx),
    fallbackError: '会话删除失败',
  })

export const renameChatSession = (ctx: AiContext, sessionId: string, name: string) =>
  put<ChatSessionRow>(`/api/chat/sessions/${sessionId}`, { name }, {
    query: queryForAi(ctx),
    fallbackError: '会话重命名失败',
  })

export const setSessionForwardToBot = (ctx: AiContext, sessionId: string, enabled: boolean) =>
  put<{ id: string; forward_to_bot: boolean; warning?: string }>(
    `/api/chat/sessions/${sessionId}/forward-to-bot`,
    { enabled },
    { query: queryForAi(ctx), fallbackError: '设置机器人回复失败' },
  )

export const getChatTotalTokens = (ctx: AiContext) =>
  get<{ total_tokens: number }>('/api/chat/total-tokens', {
    query: queryForAi(ctx),
    fallbackError: 'Token 统计加载失败',
  })

export const getChatHistory = (
  ctx: AiContext,
  sessionId: string,
  options: { afterId?: number; beforeId?: number; limit?: number } = {},
) =>
  get<any[]>('/api/chat/history', {
    query: queryForAi(ctx, {
      session_id: sessionId,
      after_id: options.afterId !== undefined ? String(options.afterId) : undefined,
      before_id: options.beforeId !== undefined ? String(options.beforeId) : undefined,
      limit: options.limit !== undefined ? String(options.limit) : undefined,
    }),
    fallbackError: '会话历史加载失败',
  })

export const getSystemPromptPreview = (
  ctx: AiContext,
  options: { sessionId?: string; selectedMcpTools?: string[] } = {},
) =>
  get<{ prompt: string; prompt_source?: string }>('/api/chat/system-prompt-preview', {
    query: queryForAi(ctx, {
      session_id: options.sessionId,
      selected_mcp_tools: options.selectedMcpTools === undefined
        ? undefined
        : JSON.stringify(options.selectedMcpTools),
    }),
    fallbackError: 'Prompt 预览加载失败',
  })

export const getRunStatus = (runId: string, after: number) =>
  get<any>(`/api/chat/run/status/${runId}`, {
    query: { after },
    fallbackError: '运行状态查询失败',
  })

export const getActiveRun = (ctx: AiContext, sessionId: string) =>
  get<{ run?: any }>('/api/chat/run/active', {
    query: queryForAi(ctx, { session_id: sessionId }),
    fallbackError: '当前运行状态查询失败',
  })

export const stopRun = (runId: string) =>
  post<void>(`/api/chat/run/${runId}/stop`, undefined, { fallbackError: '终止失败' })

export const startRun = (payload: {
  visible_content: string
  model_content: string
  visible_tags?: string
  selected_mcp_tools?: string[]
  session_id: string
  session_name: string
  ai_config_id?: number
  ai_kind: AiKind
  attachments?: Array<{ file_ref: string }>
}) => post<{ run_id: string }>('/api/chat/run/start', payload, { fallbackError: 'run start failed' })

export const injectMessage = (payload: {
  content: string
  session_id: string
  session_name: string
  ai_config_id?: number
  ai_kind: AiKind
  attachments?: Array<{ file_ref: string }>
}) =>
  post<{ active: boolean; run_id?: string; user_message_id?: number }>(
    '/api/chat/run/inject',
    payload,
    { fallbackError: 'inject failed' },
  )

export const deleteChatMessage = (messageId: number) =>
  del<void>(`/api/chat/${messageId}`, { fallbackError: '删除消息失败' })

export const recallChatMessage = (messageId: number) =>
  post<{ recall_content?: string }>(`/api/chat/recall/${messageId}`, undefined, {
    fallbackError: '撤回失败',
  })

export const saveChatMessage = (payload: {
  role: 'system' | 'user' | 'assistant'
  content: string
  tags?: string
  ai_config_id?: number
  ai_kind: AiKind
  session_id: string
  session_name: string
  total_tokens?: number
}) => post<any>('/api/chat/save', payload, { fallbackError: '保存消息失败' })

export const patchChatMessageTags = (messageId: number, tags: string) =>
  request<void>(`/api/chat/${messageId}/tags`, {
    method: 'PATCH',
    body: { tags },
    fallbackError: '更新消息状态失败',
  })

export const executeChatAction = (payload: {
  action: string
  filename?: string
  search?: string
  replace?: string
  content?: string
  command?: string
  ai_config_id?: number
}) => post<any>('/api/chat/execute-action', payload, { fallbackError: '工具执行失败' })
