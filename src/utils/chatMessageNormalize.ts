import type { ChatAttachment } from '@/api/chat'
import { parseChatResponseInline, type ActionBlock, type InlineContent } from '@/utils/chatParser'
import { stripMcpCallBlocks } from '@/utils/mcpFormat'
import { isSameAssistantVisibleReply, normalizeAssistantReplyText } from '@/utils/chatReplyCompare'

export interface ConversationInputMessage {
  id?: number
  role?: string
  content: string
  think?: string
  display_text?: string
  inlineContent?: InlineContent[]
  blocks?: ActionBlock[]
  tags?: string
  system_prompt?: string
  front_prompt_details?: string
  created_at?: number
  attachments?: ChatAttachment[]
}

export interface ConversationMessage extends ConversationInputMessage {
  role: 'user' | 'assistant' | 'system'
}

export const normalizeConversationRole = (role?: string): ConversationMessage['role'] => {
  const normalized = String(role || '').toLowerCase()
  if (normalized === 'user' || normalized === 'assistant' || normalized === 'system') return normalized
  return 'assistant'
}

export const parseMcpToolNameFromMessage = (msg?: ConversationInputMessage | ConversationMessage | null) => {
  const text = String(msg?.display_text || msg?.content || '').trim()
  if (!text.startsWith('[MCP工具]')) return ''
  const match = text.match(/^工具[：:]\s*(.+)$/m)
  return String(match?.[1] || '').trim()
}

export const stripMcpCallFormatText = (raw?: string) => stripMcpCallBlocks(raw)

export const stripMcpCallInlineText = (items?: InlineContent[]) => {
  if (!Array.isArray(items)) return items
  return items
    .map((item) => {
      if (item.type !== 'text') return item
      return { ...item, content: stripMcpCallFormatText(item.content) }
    })
    .filter((item) => item.type !== 'text' || String(item.content || '').trim())
}

export const stripMcpCallFormatMessage = (msg: ConversationMessage) => {
  if (msg.role !== 'assistant') return msg
  const next = { ...msg }
  next.content = stripMcpCallFormatText(next.content)
  if (typeof next.display_text === 'string') next.display_text = stripMcpCallFormatText(next.display_text)
  if (typeof next.think === 'string') next.think = stripMcpCallFormatText(next.think)
  next.inlineContent = stripMcpCallInlineText(next.inlineContent)
  return next
}

export const findNextExecutedMcpTool = (nextMessages: ConversationMessage[]) => {
  for (const item of nextMessages.slice(0, 6)) {
    const tool = parseMcpToolNameFromMessage(item)
    if (tool) return tool
    if (item.role === 'user' || item.role === 'assistant') return ''
  }
  return ''
}

const hideTaggedMcpBlocks = (msg: ConversationMessage) => ({
  ...msg,
  inlineContent: (msg.inlineContent || []).filter((item) => item.type !== 'block' || item.block?.type !== 'mcp'),
  blocks: (msg.blocks || []).filter((block) => block.type !== 'mcp'),
})

const hideMatchingMcpBlocks = (msg: ConversationMessage, executedTool: string) => {
  const inlineContent = (msg.inlineContent || []).filter((item) => {
    if (item.type !== 'block' || item.block?.type !== 'mcp') return true
    return String(item.block.tool || '').trim() !== executedTool
  })
  const blocks = (msg.blocks || []).filter((block) => {
    if (block.type !== 'mcp') return true
    return String(block.tool || '').trim() !== executedTool
  })
  return { ...msg, inlineContent, blocks }
}

export const hideExecutedMcpBlocks = (msg: ConversationMessage, nextMessages: ConversationMessage[] = []) => {
  if (msg.role !== 'assistant') return msg
  if (String(msg.tags || '').includes('mcp_assistant_call')) return hideTaggedMcpBlocks(msg)
  const executedTool = findNextExecutedMcpTool(nextMessages)
  if (!executedTool) return msg
  return hideMatchingMcpBlocks(msg, executedTool)
}

const hasParsedConversationFields = (raw: ConversationInputMessage) =>
  (Array.isArray(raw?.inlineContent) && raw.inlineContent.length > 0)
  || typeof raw?.display_text === 'string'
  || typeof raw?.think === 'string'

export const parseConversationMessage = (raw: ConversationInputMessage): ConversationMessage => {
  const role = normalizeConversationRole(raw?.role)
  const content = String(raw?.content || '')
  if (hasParsedConversationFields(raw)) return { ...raw, role }
  const parsed = parseChatResponseInline(content)
  return {
    ...raw,
    role,
    think: typeof raw?.think === 'string' ? raw.think : parsed.think,
    display_text: typeof raw?.display_text === 'string' ? raw.display_text : (parsed.displayText || content),
    blocks: Array.isArray(raw?.blocks) ? raw.blocks : parsed.blocks,
    inlineContent: Array.isArray(raw?.inlineContent) ? raw.inlineContent : parsed.inlineContent,
  }
}

export const isVisibleConversationMessage = (msg: ConversationMessage) => {
  if (msg.role !== 'assistant') return true
  return Boolean(
    String(msg.content || '').trim()
    || String(msg.display_text || '').trim()
    || String(msg.think || '').trim()
    || (Array.isArray(msg.inlineContent) && msg.inlineContent.length > 0),
  )
}

export const normalizeConversationMessages = (rawMessages: ConversationInputMessage[]) => {
  const parsed = (rawMessages || []).map(parseConversationMessage)
  return parsed
    .map((msg, idx) => stripMcpCallFormatMessage(hideExecutedMcpBlocks(msg, parsed.slice(idx + 1))))
    .filter(isVisibleConversationMessage)
}

export const normalizeReasoningText = (raw?: string) =>
  String(raw || '').replace(/\r\n?/g, '\n').trim()

export const trimKnownLiveReasoningPrefix = (live: string, known: string) => {
  const normalizedLive = normalizeReasoningText(live)
  const normalizedKnown = normalizeReasoningText(known)
  if (!normalizedLive || !normalizedKnown) return normalizedLive
  if (normalizedLive === normalizedKnown) return ''
  if (!normalizedLive.startsWith(normalizedKnown)) return normalizedLive
  return normalizedLive.slice(normalizedKnown.length).replace(/^\s+/, '')
}

export const findLatestUserIndex = (messages: ConversationMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return i
  }
  return -1
}

const persistedThinkingTexts = (messages: ConversationMessage[]) =>
  messages
    .filter((msg) => msg.role === 'assistant')
    .map((msg) => stripMcpCallFormatText(msg.think || ''))
    .map(normalizeReasoningText)
    .filter(Boolean)

const trimAgainstLastPersisted = (normalizedLive: string, lastPersisted: string) => {
  if (!lastPersisted) return null
  if (normalizedLive === lastPersisted) return ''
  if (normalizedLive.startsWith(lastPersisted)) {
    return normalizedLive.slice(lastPersisted.length).replace(/^\s+/, '')
  }
  return null
}

export const computeDisplayedLiveThinking = (liveThinking: string, messages: ConversationMessage[]) => {
  const live = stripMcpCallFormatText(liveThinking)
  const normalizedLive = normalizeReasoningText(live)
  if (!normalizedLive) return ''

  const persistedThinking = persistedThinkingTexts(messages)
  const trimmedPersisted = trimAgainstLastPersisted(
    normalizedLive,
    persistedThinking[persistedThinking.length - 1] || '',
  )
  if (trimmedPersisted !== null) return trimmedPersisted

  const knownThinking = persistedThinkingTexts(messages.slice(findLatestUserIndex(messages) + 1)).join('\n\n')
  return trimKnownLiveReasoningPrefix(live, knownThinking)
}

export const buildLiveAssistantMessage = (
  liveText: string,
  createdAt?: number | null,
): ConversationMessage | null => {
  const text = stripMcpCallFormatText(liveText)
  if (!text.trim()) return null
  return {
    id: -1,
    role: 'assistant',
    content: text,
    display_text: text,
    created_at: createdAt ?? undefined,
  }
}

export const buildLiveThinkingMessage = (
  think: string,
  createdAt?: number | null,
): ConversationMessage | null => {
  if (!think) return null
  return {
    id: -3,
    role: 'assistant',
    content: '',
    display_text: '',
    think,
    created_at: createdAt ?? undefined,
  }
}

const removeDuplicateLiveReply = (
  base: ConversationMessage[],
  liveMessage: ConversationMessage,
  liveTargetText: string,
) => {
  const liveCandidates = [
    normalizeAssistantReplyText(liveMessage.display_text || liveMessage.content),
    normalizeAssistantReplyText(liveTargetText),
  ].filter(Boolean)
  const latestUserIndex = findLatestUserIndex(base)
  for (let i = base.length - 1; i > latestUserIndex; i -= 1) {
    if (base[i].role !== 'assistant') continue
    const persistedText = normalizeAssistantReplyText(base[i].display_text || base[i].content)
    if (!persistedText) continue
    const sameReply = liveCandidates.some((liveText) => isSameAssistantVisibleReply(persistedText, liveText))
    if (sameReply) {
      base.splice(i, 1)
      continue
    }
    break
  }
}

export const mergeRenderMessages = (
  normalized: ConversationMessage[],
  frontPrompt: ConversationMessage | null,
  liveThinking: ConversationMessage | null,
  liveAssistant: ConversationMessage | null,
  liveTargetText: string,
) => {
  const base = [...normalized]
  if (frontPrompt) base.unshift(frontPrompt)
  if (liveThinking) base.push(liveThinking)
  if (!liveAssistant) return base
  removeDuplicateLiveReply(base, liveAssistant, liveTargetText)
  base.push(liveAssistant)
  return base
}

export const latestRecordedSystemPrompt = (messages: ConversationMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const prompt = String(messages[i]?.system_prompt || '').trim()
    if (prompt) return prompt
  }
  return ''
}
