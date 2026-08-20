import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type {
  ChatDialogFns,
  ChatInterfaceEmitFn,
  ChatInterfaceProps,
  PendingUploadAttachment,
  QueuedChatMessage,
} from '@/types/chat'
import {
  buildAttachedPathSection as buildAttachedPathSectionFromPaths,
  encodeUserAttachmentTags as encodeAttachmentTagList,
} from '@/utils/chatActionState'
import { activeChatMentions, buildMentionContextSection, encodeChatMentions, type ChatMention } from '@/utils/chatMentions'
import { BLANK_SESSION_NAME, buildAutoSessionTitle, isPlaceholderSessionName } from '@/utils/chatSessionLabels'
import type { ChatFilePickerApi } from './useChatFilePicker'
import type { ChatFrontPromptApi } from './useChatFrontPrompt'
import type { ChatHistoryApi } from './useChatHistory'
import type { ChatLiveAssistantApi } from './useChatLiveAssistant'
import type { ChatRunControlApi } from './useChatRunControl'
import type { ChatRunTimersApi } from './useChatRunTimers'
import type { ChatSessionsApi } from './useChatSessions'
import type { ChatUploadsApi } from './useChatUploads'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

export interface ChatSendDeps {
  props: ChatInterfaceProps
  emit: ChatInterfaceEmitFn
  state: ChatWorkspaceState
  uploads: ChatUploadsApi
  files: ChatFilePickerApi
  prompt: ChatFrontPromptApi
  sessions: ChatSessionsApi
  history: ChatHistoryApi
  run: ChatRunControlApi
  timers: ChatRunTimersApi
  live: ChatLiveAssistantApi
  dialogs: ChatDialogFns
}

const CHAT_QUEUE_STORAGE_PREFIX = 'heysure:chat-queue:v2'

const pendingQueueStorageKey = (deps: ChatSendDeps) => {
  const user = deps.props.currentUserId ?? 'anonymous'
  const ai = deps.props.aiConfigId ?? 'na'
  const sid = deps.state.currentSessionId.value || 'none'
  return `${CHAT_QUEUE_STORAGE_PREFIX}:${user}:${deps.state.aiKindValue.value}:${ai}:${sid}`
}

const pendingQueueIndexKey = (deps: ChatSendDeps) => {
  const user = deps.props.currentUserId ?? 'anonymous'
  const ai = deps.props.aiConfigId ?? 'na'
  return `${CHAT_QUEUE_STORAGE_PREFIX}:index:${user}:${deps.state.aiKindValue.value}:${ai}`
}

const readPendingQueueIndex = (deps: ChatSendDeps): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingQueueIndexKey(deps)) || '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && !!x) : []
  } catch {
    return []
  }
}

const updatePendingQueueIndex = (deps: ChatSendDeps, hasItems: boolean) => {
  const sid = deps.state.currentSessionId.value
  if (!sid) return
  const withoutCurrent = readPendingQueueIndex(deps).filter(item => item !== sid)
  const next = hasItems ? [sid, ...withoutCurrent] : withoutCurrent
  try {
    if (next.length) localStorage.setItem(pendingQueueIndexKey(deps), JSON.stringify(next))
    else localStorage.removeItem(pendingQueueIndexKey(deps))
  } catch {
    // localStorage unavailable
  }
}

const legacyPendingQueueStorageKey = (deps: ChatSendDeps) => {
  const ai = deps.props.aiConfigId ?? 'na'
  const sid = deps.state.currentSessionId.value || 'none'
  return `heysure_pending_queue_${deps.state.aiKindValue.value}_${ai}_${sid}`
}

const makeQueueId = () => `queue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const sanitizeQueuedAttachment = (raw: any, index: number): PendingUploadAttachment | null => {
  const fileRef = String(raw?.file_ref || '').trim()
  if (!fileRef) return null
  return {
    id: raw?.id,
    client_id: String(raw?.client_id || `restored_${index}_${fileRef}`),
    file_ref: fileRef,
    workspace_path: String(raw?.workspace_path || ''),
    file_name: String(raw?.file_name || '附件'),
    mime_type: String(raw?.mime_type || 'application/octet-stream'),
    bytes: Number(raw?.bytes || 0),
    is_image: !!raw?.is_image,
    url: typeof raw?.url === 'string' ? raw.url : undefined,
    status: 'ready',
  }
}

const normalizeQueueItem = (raw: unknown, index: number): QueuedChatMessage | null => {
  if (typeof raw === 'string') {
    const content = raw.trim()
    return content ? {
      id: `legacy_${index}_${Date.now()}`,
      content,
      mentions: [],
      attachments: [],
      selectedFiles: [],
      selectedMcpToolNames: [],
      createdAt: Date.now() + index,
    } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<QueuedChatMessage>
  const content = String(item.content || '').trim()
  const attachments = Array.isArray(item.attachments)
    ? item.attachments.map(sanitizeQueuedAttachment).filter((x): x is PendingUploadAttachment => !!x)
    : []
  if (!content && attachments.length === 0) return null
  return {
    id: String(item.id || makeQueueId()),
    content,
    mentions: Array.isArray(item.mentions) ? item.mentions : [],
    attachments,
    selectedFiles: Array.isArray(item.selectedFiles) ? item.selectedFiles.filter(x => typeof x === 'string') : [],
    selectedMcpToolNames: Array.isArray(item.selectedMcpToolNames)
      ? item.selectedMcpToolNames.filter(x => typeof x === 'string')
      : [],
    createdAt: Number(item.createdAt || Date.now()),
  }
}

const persistPendingQueue = (deps: ChatSendDeps) => {
  try {
    const key = pendingQueueStorageKey(deps)
    if (deps.state.pendingQueue.value.length > 0) {
      localStorage.setItem(key, JSON.stringify(deps.state.pendingQueue.value))
    } else {
      localStorage.removeItem(key)
    }
    updatePendingQueueIndex(deps, deps.state.pendingQueue.value.length > 0)
  } catch {
    // localStorage unavailable
  }
}

const findQueuedSessionId = (deps: ChatSendDeps, sessionIds: string[]) => {
  const available = new Set(sessionIds)
  return readPendingQueueIndex(deps).find(sid => available.has(sid)) || ''
}

const restorePendingQueue = (deps: ChatSendDeps) => {
  try {
    const key = pendingQueueStorageKey(deps)
    const legacyKey = legacyPendingQueueStorageKey(deps)
    const raw = localStorage.getItem(key) || localStorage.getItem(legacyKey)
    const arr = raw ? JSON.parse(raw) : []
    deps.state.pendingQueue.value = Array.isArray(arr)
      ? arr.map(normalizeQueueItem).filter((x): x is QueuedChatMessage => !!x)
      : []
    if (deps.state.pendingQueue.value.length > 0) persistPendingQueue(deps)
    localStorage.removeItem(legacyKey)
  } catch {
    deps.state.pendingQueue.value = []
  }
}

const enqueuePending = (deps: ChatSendDeps, item: QueuedChatMessage) => {
  deps.state.pendingQueue.value = [...deps.state.pendingQueue.value, item]
  persistPendingQueue(deps)
}

const removePendingQueueItem = (deps: ChatSendDeps, itemId: string) => {
  deps.state.pendingQueue.value = deps.state.pendingQueue.value.filter(item => item.id !== itemId)
  persistPendingQueue(deps)
}

const updatePendingQueueItem = (deps: ChatSendDeps, itemId: string, content: string) => {
  const nextContent = content.trim()
  if (!nextContent) return
  deps.state.pendingQueue.value = deps.state.pendingQueue.value.map(item =>
    item.id === itemId ? { ...item, content: nextContent } : item)
  persistPendingQueue(deps)
}

interface PreparedSend {
  content: string
  readyUploads: PendingUploadAttachment[]
  mentions: ChatMention[]
  selectedFiles: string[]
  selectedMcpToolNames: string[]
}

const prepareSendInput = async (
  deps: ChatSendDeps,
  overrideContent: string | undefined,
  silent: boolean,
): Promise<PreparedSend | null> => {
  const content = (overrideContent ?? deps.state.chatInput.value).trim()
  const readyUploads = deps.uploads.uploadedAttachments.value.filter(item => item.status === 'ready' && item.file_ref)
  if (silent || (!content && readyUploads.length === 0)) return null
  if (deps.uploads.uploadingCount.value > 0) {
    await deps.dialogs.alert({ message: '附件仍在上传，请稍候再发送', type: 'warning' })
    return null
  }
  if (!getAuthToken()) return null
  return {
    content,
    readyUploads,
    mentions: [...deps.state.chatMentions.value],
    selectedFiles: [...deps.props.selectedFiles],
    selectedMcpToolNames: [...deps.prompt.selectedMcpToolNames.value],
  }
}

const encodeUserContextTags = (files: string[], mentions: ChatMention[], toPath: (path: string) => string) =>
  [encodeAttachmentTagList(files, toPath), encodeChatMentions(mentions)].filter(Boolean).join(' | ')

const buildSendPayload = (deps: ChatSendDeps, prepared: PreparedSend) => {
  const selectedReadableFiles = prepared.selectedFiles
    .map(file => deps.files.normalizeSelectionPath(file))
    .filter(file => deps.files.isSelectableFilePath(file))
  const selectedAiPaths = selectedReadableFiles.map(path => deps.files.toAiWorkspacePath(path))
  const attachedPathStr = buildAttachedPathSectionFromPaths(selectedReadableFiles, deps.files.toAiWorkspacePath)
  const activeMentions = activeChatMentions(prepared.content, prepared.mentions)
  const mentionContext = buildMentionContextSection(activeMentions)
  const currentSessionName = deps.state.sessionList.value.find(s => s.id === deps.state.currentSessionId.value)?.name || BLANK_SESSION_NAME
  const visibleUserContent = prepared.content || `已上传 ${prepared.readyUploads.length} 个附件`
  return {
    selectedReadableFiles,
    visibleUserContent,
    shouldAutoTitle: isPlaceholderSessionName(currentSessionName),
    currentSessionName,
    startPayload: {
      visible_content: visibleUserContent,
      model_content: [visibleUserContent, mentionContext, attachedPathStr].filter(Boolean).join('\n\n'),
      visible_tags: encodeUserContextTags(selectedAiPaths, activeMentions, deps.files.toAiWorkspacePath),
      selected_mcp_tools: prepared.selectedMcpToolNames,
      session_id: deps.state.currentSessionId.value,
      session_name: isPlaceholderSessionName(currentSessionName)
        ? buildAutoSessionTitle(visibleUserContent)
        : currentSessionName,
      ai_config_id: deps.props.aiConfigId,
      ai_kind: deps.state.aiKindValue.value,
      attachments: prepared.readyUploads.map(item => ({ file_ref: item.file_ref })),
    },
  }
}

const beginOutgoingRun = (deps: ChatSendDeps) => {
  deps.state.isTyping.value = true
  deps.state.currentRunStatus.value = 'queued'
  deps.state.currentMcpTool.value = ''
  deps.live.clearLiveAssistantView()
  deps.timers.startRunTimers()
  deps.timers.updatePhase('generating')
}

const handleSendError = async (
  deps: ChatSendDeps,
  prepared: PreparedSend,
  optimisticId: number,
  err: any,
  restoreComposer: boolean,
) => {
  deps.history.removeOptimisticUserMessage(optimisticId)
  if (restoreComposer) {
    deps.state.chatInput.value = prepared.content
    deps.state.chatMentions.value = prepared.mentions
  }
  deps.state.isTyping.value = false
  deps.state.currentRunStatus.value = 'error'
  deps.timers.finalizeRunTimers()
  deps.state.currentRunPhase.value = 'idle'
  deps.state.currentMcpTool.value = ''
  deps.timers.stopTimeTicker()
  const text = String(err?.message || '')
  if (text.includes('already active')) {
    await deps.dialogs.alert({ message: '当前会话已有进行中的任务，正在接入运行状态。', type: 'warning' })
    await deps.run.checkActiveRun()
    return
  }
  await deps.dialogs.alert({ message: `发送失败: ${text || '未知错误'}`, type: 'error' })
}

const dispatchNewRun = async (
  deps: ChatSendDeps,
  prepared: PreparedSend,
  optimisticId: number,
  restoreComposer: boolean,
) => {
  const built = buildSendPayload(deps, prepared)
  beginOutgoingRun(deps)
  try {
    const started = await chatApi.startRun(built.startPayload)
    deps.state.currentRunId.value = started.run_id
    deps.state.currentRunIsExternal.value = false
    if (restoreComposer && prepared.readyUploads.length > 0) deps.uploads.clearUploadedAttachments()
    if (restoreComposer && built.selectedReadableFiles.length > 0) deps.emit('update:selectedFiles', [])
    if (built.shouldAutoTitle) void deps.sessions.maybeAutoTitleSession(deps.state.currentSessionId.value, built.visibleUserContent)
    await deps.history.fetchRunHistoryIncrementalOnce()
    deps.run.resetBoundaryTrackers()
    deps.run.startRunPolling()
    return true
  } catch (err: any) {
    await handleSendError(deps, prepared, optimisticId, err, restoreComposer)
    return false
  }
}

const preparedFromQueueItem = (item: QueuedChatMessage): PreparedSend => ({
  content: item.content,
  readyUploads: item.attachments,
  mentions: item.mentions,
  selectedFiles: item.selectedFiles,
  selectedMcpToolNames: item.selectedMcpToolNames,
})

const clearComposerAfterQueue = (deps: ChatSendDeps, prepared: PreparedSend) => {
  deps.state.chatInput.value = ''
  deps.state.chatMentions.value = []
  if (prepared.readyUploads.length > 0) deps.uploads.clearUploadedAttachments()
  if (prepared.selectedFiles.length > 0) deps.emit('update:selectedFiles', [])
}

const queuePreparedSend = (deps: ChatSendDeps, prepared: PreparedSend) => {
  enqueuePending(deps, {
    id: makeQueueId(),
    content: prepared.content,
    mentions: prepared.mentions,
    attachments: prepared.readyUploads.map(item => ({ ...item, preview_url: undefined, status: 'ready' })),
    selectedFiles: prepared.selectedFiles,
    selectedMcpToolNames: prepared.selectedMcpToolNames,
    createdAt: Date.now(),
  })
  clearComposerAfterQueue(deps, prepared)
}

const sendChatCore = async (
  deps: ChatSendDeps,
  overrideContent?: string,
  options: { silent?: boolean } = {},
) => {
  const prepared = await prepareSendInput(deps, overrideContent, !!options.silent)
  if (!prepared) return false
  if (overrideContent === undefined && (deps.state.isRunActive.value || deps.state.pendingQueue.value.length > 0)) {
    queuePreparedSend(deps, prepared)
    return true
  }
  const visibleContent = prepared.content || `已上传 ${prepared.readyUploads.length} 个附件`
  const visibleMentions = activeChatMentions(prepared.content, prepared.mentions)
  const optimisticTags = encodeUserContextTags(
    deps.props.selectedFiles.map(path => deps.files.toAiWorkspacePath(deps.files.normalizeSelectionPath(path))),
    visibleMentions,
    deps.files.toAiWorkspacePath,
  )
  deps.state.chatInput.value = ''
  deps.state.chatMentions.value = []
  const optimisticId = await deps.history.appendOptimisticUserMessage(
    visibleContent,
    optimisticTags,
    prepared.readyUploads,
  )
  if (!deps.state.currentSessionId.value) {
    const createdId = await deps.sessions.createSession(BLANK_SESSION_NAME, {
      carryDraft: true,
      preserveMessages: true,
    })
    if (!createdId) {
      deps.history.removeOptimisticUserMessage(optimisticId)
      deps.state.chatInput.value = prepared.content
      deps.state.chatMentions.value = prepared.mentions
      return false
    }
  }
  return dispatchNewRun(deps, prepared, optimisticId, true)
}

const sendQueuedItem = async (deps: ChatSendDeps, item: QueuedChatMessage) => {
  if (!getAuthToken() || deps.state.isTyping.value || deps.state.isRunActive.value) return false
  const prepared = preparedFromQueueItem(item)
  const visibleContent = prepared.content || `已上传 ${prepared.readyUploads.length} 个附件`
  const optimisticTags = encodeUserContextTags(
    prepared.selectedFiles.map(path => deps.files.toAiWorkspacePath(deps.files.normalizeSelectionPath(path))),
    activeChatMentions(prepared.content, prepared.mentions),
    deps.files.toAiWorkspacePath,
  )
  const optimisticId = await deps.history.appendOptimisticUserMessage(
    visibleContent,
    optimisticTags,
    prepared.readyUploads,
  )
  const sent = await dispatchNewRun(deps, prepared, optimisticId, false)
  if (sent) removePendingQueueItem(deps, item.id)
  return sent
}

const drainPendingQueue = async (
  deps: ChatSendDeps,
  sendQueued: (item: QueuedChatMessage) => Promise<boolean>,
) => {
  if (deps.state.isSubmitting.value || deps.state.isTyping.value || deps.state.isRunActive.value) return
  const next = deps.state.pendingQueue.value[0]
  if (next) await sendQueued(next)
}

export const useChatSend = (deps: ChatSendDeps) => {
  const drain = async () => {
    if (deps.state.isSubmitting.value) return
    deps.state.isSubmitting.value = true
    try {
      await drainPendingQueue(deps, item => sendQueuedItem(deps, item))
    } finally {
      deps.state.isSubmitting.value = false
    }
  }
  const send = async (overrideContent?: string, options: { silent?: boolean } = {}) => {
    if (deps.state.isSubmitting.value) return
    deps.state.isSubmitting.value = true
    try {
      await sendChatCore(deps, overrideContent, options)
    } finally {
      deps.state.isSubmitting.value = false
    }
    if (!deps.state.isRunActive.value && deps.state.pendingQueue.value.length > 0) void drain()
  }
  const removeQueued = (itemId: string) => {
    removePendingQueueItem(deps, itemId)
    if (!deps.state.isRunActive.value && deps.state.pendingQueue.value.length > 0) void drain()
  }
  return {
    pendingQueue: deps.state.pendingQueue,
    sendChat: send,
    restorePendingQueue: () => restorePendingQueue(deps),
    drainPendingQueue: drain,
    removePendingQueueItem: removeQueued,
    updatePendingQueueItem: (itemId: string, content: string) => updatePendingQueueItem(deps, itemId, content),
    findQueuedSessionId: (sessionIds: string[]) => findQueuedSessionId(deps, sessionIds),
  }
}

export type ChatSendApi = ReturnType<typeof useChatSend>
