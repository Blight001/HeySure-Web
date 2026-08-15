import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps, PendingUploadAttachment } from '@/types/chat'
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

const pendingQueueStorageKey = (deps: ChatSendDeps) => {
  const ai = deps.props.aiConfigId ?? 'na'
  const sid = deps.state.currentSessionId.value || 'none'
  return `heysure_pending_queue_${deps.state.aiKindValue.value}_${ai}_${sid}`
}

const persistPendingQueue = (deps: ChatSendDeps) => {
  try {
    const key = pendingQueueStorageKey(deps)
    if (deps.state.pendingQueue.value.length > 0) {
      localStorage.setItem(key, JSON.stringify(deps.state.pendingQueue.value))
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // localStorage unavailable
  }
}

const restorePendingQueue = (deps: ChatSendDeps) => {
  try {
    const raw = localStorage.getItem(pendingQueueStorageKey(deps))
    const arr = raw ? JSON.parse(raw) : []
    deps.state.pendingQueue.value = Array.isArray(arr)
      ? arr.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
      : []
  } catch {
    deps.state.pendingQueue.value = []
  }
}

const enqueuePending = (deps: ChatSendDeps, content: string) => {
  deps.state.pendingQueue.value = [...deps.state.pendingQueue.value, content]
  persistPendingQueue(deps)
}

const drainPendingQueue = async (deps: ChatSendDeps, sendChat: (content: string) => Promise<void>) => {
  if (deps.state.isTyping.value || deps.state.isRunActive.value) return
  if (deps.state.pendingQueue.value.length === 0) return
  const combined = deps.state.pendingQueue.value.join('\n\n').trim()
  deps.state.pendingQueue.value = []
  persistPendingQueue(deps)
  if (combined) await sendChat(combined)
}

interface PreparedSend {
  content: string
  readyUploads: PendingUploadAttachment[]
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
  return { content, readyUploads }
}

const injectIntoActiveRun = async (deps: ChatSendDeps, prepared: PreparedSend) => {
  deps.state.chatInput.value = ''
  try {
    const res = await chatApi.injectMessage({
      content: prepared.content || `已上传 ${prepared.readyUploads.length} 个附件`,
      session_id: deps.state.currentSessionId.value,
      session_name: deps.state.sessionList.value.find(s => s.id === deps.state.currentSessionId.value)?.name || BLANK_SESSION_NAME,
      ai_config_id: deps.props.aiConfigId,
      ai_kind: deps.state.aiKindValue.value,
      attachments: prepared.readyUploads.map(item => ({ file_ref: item.file_ref })),
    })
    if (res?.active) {
      deps.state.chatMentions.value = []
      if (prepared.readyUploads.length > 0) deps.uploads.clearUploadedAttachments()
      await deps.history.fetchRunHistoryIncrementalOnce()
      if (!deps.state.isRunActive.value) await deps.run.checkActiveRun()
      return 'done' as const
    }
  } catch {
    return handleInjectFailure(deps, prepared)
  }
  return 'retry' as const
}

const handleInjectFailure = async (deps: ChatSendDeps, prepared: PreparedSend) => {
  if (prepared.readyUploads.length > 0) {
    await deps.dialogs.alert({ message: '附件暂时无法投递，已保留在输入框，请稍后重试', type: 'error' })
    return 'done' as const
  }
  enqueuePending(deps, prepared.content)
  return 'done' as const
}

const encodeUserContextTags = (files: string[], mentions: ChatMention[], toPath: (path: string) => string) =>
  [encodeAttachmentTagList(files, toPath), encodeChatMentions(mentions)].filter(Boolean).join(' | ')

const buildSendPayload = (deps: ChatSendDeps, prepared: PreparedSend) => {
  const selectedReadableFiles = deps.props.selectedFiles
    .map(file => deps.files.normalizeSelectionPath(file))
    .filter(file => deps.files.isSelectableFilePath(file))
  const selectedAiPaths = selectedReadableFiles.map(path => deps.files.toAiWorkspacePath(path))
  const attachedPathStr = buildAttachedPathSectionFromPaths(selectedReadableFiles, deps.files.toAiWorkspacePath)
  const activeMentions = activeChatMentions(prepared.content, deps.state.chatMentions.value)
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
      selected_mcp_tools: deps.prompt.selectedMcpToolNames.value,
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
  deps.state.chatInput.value = ''
  deps.state.chatMentions.value = []
  deps.state.isTyping.value = true
  deps.state.currentRunStatus.value = 'queued'
  deps.state.currentMcpTool.value = ''
  deps.live.clearLiveAssistantView()
  deps.timers.startRunTimers()
  deps.timers.updatePhase('generating')
}

const handleSendError = async (deps: ChatSendDeps, err: any) => {
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

const dispatchNewRun = async (deps: ChatSendDeps, prepared: PreparedSend) => {
  const built = buildSendPayload(deps, prepared)
  beginOutgoingRun(deps)
  try {
    const started = await chatApi.startRun(built.startPayload)
    deps.state.currentRunId.value = started.run_id
    deps.state.currentRunIsExternal.value = false
    if (prepared.readyUploads.length > 0) deps.uploads.clearUploadedAttachments()
    if (built.selectedReadableFiles.length > 0) deps.emit('update:selectedFiles', [])
    if (built.shouldAutoTitle) void deps.sessions.maybeAutoTitleSession(deps.state.currentSessionId.value, built.visibleUserContent)
    await deps.history.fetchRunHistoryIncrementalOnce()
    deps.run.resetBoundaryTrackers()
    deps.run.startRunPolling()
  } catch (err: any) {
    await handleSendError(deps, err)
  }
}

const sendChat = async (
  deps: ChatSendDeps,
  overrideContent?: string,
  options: { silent?: boolean } = {},
) => {
  const prepared = await prepareSendInput(deps, overrideContent, !!options.silent)
  if (!prepared) return
  if (!deps.state.currentSessionId.value) {
    const createdId = await deps.sessions.createSession(BLANK_SESSION_NAME, { carryDraft: true })
    if (!createdId) return
  }
  if (overrideContent === undefined && (deps.state.isTyping.value || deps.state.isRunActive.value)) {
    const injected = await injectIntoActiveRun(deps, prepared)
    if (injected === 'done') return
    return sendChat(deps, prepared.content)
  }
  await dispatchNewRun(deps, prepared)
}

export const useChatSend = (deps: ChatSendDeps) => {
  const send = (overrideContent?: string, options: { silent?: boolean } = {}) => sendChat(deps, overrideContent, options)
  return {
    pendingQueue: deps.state.pendingQueue,
    sendChat: send,
    restorePendingQueue: () => restorePendingQueue(deps),
    drainPendingQueue: () => drainPendingQueue(deps, content => send(content)),
  }
}

export type ChatSendApi = ReturnType<typeof useChatSend>
