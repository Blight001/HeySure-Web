import type { ChatAttachment } from '@/api/chat'
import { ATTACHMENTS_PREFIX } from '@/utils/chatActionState'
import { CHAT_MENTIONS_PREFIX, mentionToken, type ChatMention } from '@/utils/chatMentions'
import type { InlineContent } from '@/utils/chatParser'
import { parseMcpToolBubbleDetails, type McpToolBubbleSections } from '@/utils/mcpFormat'

export interface ChatMessageViewModel {
  role: 'user' | 'assistant' | 'system'
  content: string
  think?: string
  display_text?: string
  inlineContent?: InlineContent[]
  front_prompt_details?: string
  id?: number
  tags?: string
  created_at?: number
  attachments?: ChatAttachment[]
}

export interface ChatMessageKind {
  role: ChatMessageViewModel['role']
  text: string
  trimmed: string
  isFrontPrompt: boolean
  isSystemNotice: boolean
  isUserBubble: boolean
  isCollapsibleNotice: boolean
  noticeBody: string
  noticeTitle: string
  isPhaseSummary: boolean
  phaseNumber: string
  phaseTitle: string
  phaseMarkdown: string
  isTaskComplete: boolean
  isRunError: boolean
  isMcp: boolean
  isPlainAssistant: boolean
}

const COMPRESS_TAGS = new Set([
  'conversation_summary',
  'system_notice_compress',
  'system_notice_compress_started',
  'system_notice_compress_result',
])

const DOMESTIC_SERVER_TOOL_NAMESPACES = new Set([
  'console',
  'disk',
  'file',
  'journal',
  'network',
  'package',
  'process',
  'service',
  'shell',
  'system',
])

const PHASE_SUMMARY_RE = /^\[系统提示\s*·\s*阶段\s*(\d+)\s+(?:已完成|未达成(?:\(failed\))?)\]\s*(.*)$/m
export const SCREENSHOT_MARKER_RE = /\n*\[截图\]\s*\n\s*(\S+)\s*$/

export const messageDisplayText = (message: Pick<ChatMessageViewModel, 'display_text' | 'content'>) =>
  String(message.display_text || message.content || '')

export const parseMessageTagSet = (tags?: string) => new Set(
  String(tags || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean),
)

export const isCompressionNotice = (tags?: string) => {
  const set = parseMessageTagSet(tags)
  for (const tag of COMPRESS_TAGS) {
    if (set.has(tag)) return true
  }
  return false
}

const isWorkflowInteractionNotice = (tags?: string) => {
  const tagSet = parseMessageTagSet(tags)
  return tagSet.has('workflow_interaction')
    || Array.from(tagSet).some(tag => tag.startsWith('workflow_interaction:'))
}

export const isFrontPromptMessage = (message: ChatMessageViewModel) =>
  message.role === 'system' && messageDisplayText(message).startsWith('[前置 Prompt]')

export const isSystemNoticeMessage = (message: ChatMessageViewModel) => {
  if (message.role !== 'user' && message.role !== 'system') return false
  const text = messageDisplayText(message).trim()
  return isCompressionNotice(message.tags)
    || isWorkflowInteractionNotice(message.tags)
    || text.startsWith('[系统提示]')
    || text.startsWith('【任务完成回执】')
}

export const isCollapsibleSystemNotice = (message: ChatMessageViewModel) => {
  if (message.role !== 'user' && message.role !== 'system') return false
  const text = messageDisplayText(message).trim()
  return isCompressionNotice(message.tags)
    || isWorkflowInteractionNotice(message.tags)
    || text.startsWith('[系统提示]')
}

export const systemNoticeBody = (message: ChatMessageViewModel) =>
  messageDisplayText(message).trim()
    .replace(/^\[系统提示\]\s*/, '')
    .replace(/^【自动化卡片交互请求】\s*/, '自动化卡片交互请求\n\n')
    .replace(/^\[对话历史摘要\]\s*/, '对话压缩摘要\n\n')
    .trim()

export const systemNoticeTitle = (body: string) => {
  const firstLine = body
    .split(/\r?\n/)
    .map(line => line.replace(/^[-#>*\s]+/, '').trim())
    .find(Boolean) || '通知详情'
  const normalized = firstLine
    .replace(/^\[(?:系统提示|提示|通知)\]\s*/, '')
    .replace(/[：:]$/, '')
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized
}

export const matchPhaseSummary = (text: string) => text.match(PHASE_SUMMARY_RE)

export const phaseSummaryNumber = (match: RegExpMatchArray | null) => String(match?.[1] || '')

export const phaseSummaryTitle = (match: RegExpMatchArray | null) =>
  String(match?.[2] || '').trim() || `阶段 ${phaseSummaryNumber(match)}`

export const phaseSummaryMarkdown = (text: string, match: RegExpMatchArray | null) => {
  if (!match) return text
  const title = String(match[2] || '').trim()
  const body = text.slice(match[0].length).trim()
  return [`### ${title || `阶段 ${phaseSummaryNumber(match)} 小结`}`, body]
    .filter(Boolean)
    .join('\n\n')
}

export const isTaskCompleteNotice = (message: ChatMessageViewModel) => {
  if (message.role !== 'system') return false
  const text = messageDisplayText(message).trim()
  return text.startsWith('【任务完成回执】') || text.startsWith('【计划完成 ·')
}

export const isRunErrorNotice = (message: ChatMessageViewModel) => {
  const text = messageDisplayText(message).trim()
  return message.role === 'system' && text.startsWith('[AI 对话出错]')
}

export const isMcpToolMessage = (message: ChatMessageViewModel) => {
  const text = messageDisplayText(message).trim()
  return message.role === 'system' && text.startsWith('[MCP工具]')
}

export const describeChatMessage = (message: ChatMessageViewModel): ChatMessageKind => {
  const text = messageDisplayText(message)
  const trimmed = text.trim()
  const phaseMatch = matchPhaseSummary(trimmed)
  const notice = isSystemNoticeMessage(message)
  const noticeBody = systemNoticeBody(message)
  return {
    role: message.role,
    text,
    trimmed,
    isFrontPrompt: isFrontPromptMessage(message),
    isSystemNotice: notice,
    isUserBubble: message.role === 'user' && !notice,
    isCollapsibleNotice: isCollapsibleSystemNotice(message),
    noticeBody,
    noticeTitle: systemNoticeTitle(noticeBody),
    isPhaseSummary: message.role === 'system' && !!phaseMatch,
    phaseNumber: phaseSummaryNumber(phaseMatch),
    phaseTitle: phaseSummaryTitle(phaseMatch),
    phaseMarkdown: phaseSummaryMarkdown(trimmed, phaseMatch),
    isTaskComplete: isTaskCompleteNotice(message),
    isRunError: isRunErrorNotice(message),
    isMcp: isMcpToolMessage(message),
    isPlainAssistant: message.role === 'assistant',
  }
}

export const normalizeMessageInlineContent = (
  message: ChatMessageViewModel,
  kind: ChatMessageKind,
): InlineContent[] => {
  if (kind.isPhaseSummary) return [{ type: 'text', content: kind.phaseMarkdown }]
  if (Array.isArray(message.inlineContent) && message.inlineContent.length > 0) {
    return message.inlineContent
  }
  if (!kind.text) return []
  return [{ type: 'text', content: kind.text }]
}

export const decodeTagSegment = (tags: string, prefix: string): unknown => {
  const idx = tags.indexOf(prefix)
  if (idx < 0) return null
  const raw = tags.slice(idx + prefix.length).split(/\s*\|\s*/)[0]?.trim()
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
}

export const parseAttachedFiles = (tags?: string): string[] => {
  const parsed = decodeTagSegment(String(tags || ''), ATTACHMENTS_PREFIX)
  return Array.isArray(parsed)
    ? parsed.map(item => String(item || '').trim()).filter(Boolean)
    : []
}

const asChatMention = (item: unknown): ChatMention[] => {
  if (!item || typeof item !== 'object') return []
  const raw = item as { type?: string; label?: string; reference?: string; detail?: string }
  const type = raw.type === 'mcp' || raw.type === 'file' || raw.type === 'skill' ? raw.type : null
  const label = String(raw.label || '').trim()
  const reference = String(raw.reference || '').trim()
  if (!type || !label || !reference) return []
  return [{ type, label, reference, detail: String(raw.detail || '').trim() }]
}

export const parseChatMentionsFromTags = (tags?: string): ChatMention[] => {
  const parsed = decodeTagSegment(String(tags || ''), CHAT_MENTIONS_PREFIX)
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap(asChatMention)
}

export const mentionTokenViews = (mentions: ChatMention[]) => mentions.map(mention => ({
  token: mentionToken(mention),
  type: mention.type,
  detail: mention.type === 'mcp'
    ? `${mention.reference}\n${mention.detail}`
    : mention.type === 'skill'
      ? `${mention.reference}\n${mention.detail}`
      : mention.detail,
}))

export const visibleAttachedFiles = (files: string[], mentions: ChatMention[]) => {
  const mentioned = new Set(mentions.filter(item => item.type === 'file').map(item => item.reference))
  return files.filter(path => !mentioned.has(path))
}

export const attachedPathLabel = (path: string) => {
  const value = String(path || '').trim()
  return value.endsWith('/') ? `${value}（文件夹）` : value
}

export const uploadedMessageAttachments = (attachments?: ChatAttachment[]) =>
  Array.isArray(attachments) ? attachments.filter(item => item && item.file_name) : []

export const formatAttachmentBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const describeMessageExtras = (message: ChatMessageViewModel) => {
  const mentions = parseChatMentionsFromTags(message.tags)
  const files = parseAttachedFiles(message.tags)
  return {
    mentions,
    mentionTokens: mentionTokenViews(mentions),
    visibleFiles: visibleAttachedFiles(files, mentions),
    uploads: uploadedMessageAttachments(message.attachments),
  }
}

export const getMcpProviderName = (tool: string) => {
  const namespace = String(tool || '').trim().split(/[.+]/, 1)[0]?.toLowerCase() || ''
  return DOMESTIC_SERVER_TOOL_NAMESPACES.has(namespace) ? '端侧设备' : '工具箱'
}

export const mcpImageUrlFromText = (text: string) =>
  String(text.match(SCREENSHOT_MARKER_RE)?.[1] || '').trim()

export interface McpToolSummary {
  sections: McpToolBubbleSections
  tool: string
  status: string
  provider: string
  deviceId: string
}

export const buildMcpToolSummary = (text: string): McpToolSummary => {
  const sections = parseMcpToolBubbleDetails(text, 'MCP 工具')
  const status = String(text.match(/^状态[：:]\s*(.+)$/m)?.[1] || '').trim()
  const provider = sections.deviceName
    || (sections.deviceId ? `设备 ${sections.deviceId}` : getMcpProviderName(sections.tool))
  return { sections, tool: sections.tool, status, provider, deviceId: sections.deviceId }
}

export const isTaskStartMcp = (status: string, tool: string, params: string) => {
  if (status === '失败' || tool !== 'todo.manage') return false
  return /["']?action["']?\s*[:=]\s*["']create["']/.test(params)
}

export const chatMessageAlignClass = (kind: ChatMessageKind) => {
  if (kind.isFrontPrompt || kind.isTaskComplete) return 'items-center'
  return kind.isUserBubble ? 'items-end' : 'items-start'
}

export const chatMessageWidthClass = (embedded: boolean, kind: ChatMessageKind) => {
  if (embedded) return 'w-full max-w-full'
  return kind.isPlainAssistant ? 'max-w-[95%] sm:max-w-[92%]' : 'max-w-[95%] sm:max-w-[85%]'
}

export const chatMessageBubbleClasses = (kind: ChatMessageKind): string[] => {
  const classes = [bubbleToneClass(kind)]
  if (!kind.isPlainAssistant && !kind.isMcp && !kind.isPhaseSummary) {
    classes.push('px-4 py-3 rounded-2xl border hover:shadow-md')
  }
  if (kind.isFrontPrompt) classes.push('front-prompt-bubble')
  if (kind.isUserBubble) classes.push('user-message-bubble')
  return classes
}

const bubbleToneClass = (kind: ChatMessageKind) => {
  if (kind.isPlainAssistant || kind.isPhaseSummary) {
    return 'px-0 py-1 border-0 bg-transparent text-zinc-800 shadow-none hover:shadow-none dark:text-zinc-200'
  }
  if (kind.isUserBubble) {
    return 'bg-transparent border-indigo-500 text-indigo-700 rounded-tr-sm shadow-none dark:border-indigo-400 dark:text-indigo-300'
  }
  if (kind.isTaskComplete) {
    return 'bg-transparent border-emerald-500 text-emerald-700 rounded-xl shadow-none dark:border-emerald-400 dark:text-emerald-300'
  }
  if (kind.isSystemNotice) {
    return 'bg-transparent border-slate-400 text-slate-700 rounded-tl-sm shadow-none dark:border-slate-500 dark:text-slate-300'
  }
  if (kind.isFrontPrompt) {
    return 'bg-violet-50 border-violet-200 text-zinc-800 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-zinc-100'
  }
  if (kind.isRunError) {
    return 'bg-rose-50 border-rose-300 text-rose-800 rounded-tl-sm dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200'
  }
  if (kind.isMcp) return 'text-sky-700 dark:text-sky-300'
  if (kind.role === 'system') {
    return 'bg-zinc-100/60 border-zinc-200 text-zinc-700 font-mono text-xs dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300'
  }
  return 'bg-white/75 border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-200'
}
