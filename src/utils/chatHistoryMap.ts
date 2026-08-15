import { parseChatResponseInline } from '@/utils/chatParser'
import { isSameAssistantVisibleReply, normalizeAssistantReplyText } from '@/utils/chatReplyCompare'
import type { ChatMessage } from '@/types/chat'

export const mapHistoryMessage = (msg: ChatMessage): ChatMessage => {
  const parsed = parseChatResponseInline(msg.content)
  return {
    ...msg,
    display_text: parsed.displayText,
    think: msg.think || parsed.think,
    blocks: parsed.blocks,
    inlineContent: parsed.inlineContent,
  }
}

export const mapHistoryMessages = (history: ChatMessage[]) => history.map(mapHistoryMessage)

export const hasAssistantMessageWithContent = (messages: ChatMessage[], content: string) => {
  const normalized = normalizeAssistantReplyText(content)
  if (!normalized) return false
  return messages.some(msg =>
    msg.role === 'assistant'
    && isSameAssistantVisibleReply(msg.display_text || msg.content, normalized))
}

export const isConversationEditToolMessage = (msg: ChatMessage) => {
  return String(msg.tags || '') === 'mcp_tool_call'
    && String(msg.content || '').includes('工具: conversation.manage')
    && String(msg.content || '').includes('状态: 成功')
}

export const isConversationClearToolMessage = (msg: ChatMessage) => {
  return isConversationEditToolMessage(msg)
    && String(msg.content || '').includes('"action": "clear"')
}

export const collectMessageIds = (messages: ChatMessage[]) =>
  messages.map(m => Number(m.id || 0)).filter(v => Number.isFinite(v) && v > 0)

export const getLastMessageId = (messages: ChatMessage[]) => {
  const ids = collectMessageIds(messages)
  return ids.length ? Math.max(...ids) : 0
}

export const getFirstMessageId = (messages: ChatMessage[]) => {
  const ids = collectMessageIds(messages)
  return ids.length ? Math.min(...ids) : 0
}

export const findDuplicateAssistantIndex = (messages: ChatMessage[], visible: string) =>
  messages.findIndex(item =>
    item.role === 'assistant'
    && isSameAssistantVisibleReply(item.display_text || item.content, visible))
