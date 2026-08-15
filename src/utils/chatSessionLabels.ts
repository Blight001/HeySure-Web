import type { SessionItem } from '@/types/chat'

export const BLANK_SESSION_NAME = '新对话'
export const PLACEHOLDER_SESSION_NAMES = new Set(['新对话', '未命名会话', '默认会话', '选择对话'])

export const isTaskSessionName = (name: string) => /^任务[:：]\s*/.test(String(name || '').trim())
export const isTaskSessionId = (id: string) => String(id || '').startsWith('session_task_')
export const isTaskSession = (item: SessionItem) => isTaskSessionId(item.id) || isTaskSessionName(item.name || '')

export const isPlaceholderSessionName = (name: string) => {
  const n = String(name || '').trim()
  return !n || PLACEHOLDER_SESSION_NAMES.has(n)
}

/** 用首条用户消息生成会话标题（可后续手动重命名）。 */
export const buildAutoSessionTitle = (content: string) => {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  if (!text) return BLANK_SESSION_NAME
  return text.length > 28 ? `${text.slice(0, 28)}…` : text
}
