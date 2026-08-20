import { nextTick, onMounted, watch } from 'vue'
import type { ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
import type { ChatAiConfigApi } from './useChatAiConfig'
import type { ChatDraftsApi } from './useChatDrafts'
import type { ChatFrontPromptApi } from './useChatFrontPrompt'
import type { ChatHistoryApi } from './useChatHistory'
import type { ChatRunControlApi } from './useChatRunControl'
import type { ChatSendApi } from './useChatSend'
import type { ChatSessionsApi } from './useChatSessions'
import type { ChatUploadsApi } from './useChatUploads'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

export interface WorkspaceLifecycleCtx {
  props: ChatInterfaceProps
  emit: ChatInterfaceEmitFn
  state: ChatWorkspaceState
  drafts: ChatDraftsApi
  prompt: ChatFrontPromptApi
  sessions: ChatSessionsApi
  history: ChatHistoryApi
  run: ChatRunControlApi
  send: ChatSendApi
  aiConfig: ChatAiConfigApi
  uploads: ChatUploadsApi
}

const initializeSessions = async (ctx: WorkspaceLifecycleCtx) => {
  ctx.run.resetRunUi()
  void ctx.aiConfig.loadConfiguredFrontPrompt()
  void ctx.prompt.loadFrontPromptToolSchemas()
  await ctx.sessions.loadSessions()
  const requested = ctx.state.preferredInitialSessionId.value
  if (requested && ctx.state.sessionList.value.some(item => item.id === requested)) {
    ctx.state.currentSessionId.value = requested
    await ctx.history.loadChatHistory(ctx.state.currentSessionId.value)
  } else {
    ctx.state.currentSessionId.value = ''
    ctx.state.chatMessages.value = []
    ctx.emit('totalChatTokensUpdate', 0)
    ctx.drafts.restoreChatDraft('')
  }
  ctx.prompt.loadEffectiveSystemPromptPreview()
}

const onAiOrInitialChange = async (ctx: WorkspaceLifecycleCtx) => {
  ctx.uploads.clearUploadedAttachments()
  ctx.run.resetRunUi()
  ctx.state.chatMessages.value = []
  ctx.state.currentSessionId.value = ''
  await initializeSessions(ctx)
}

const applySessionDraft = (ctx: WorkspaceLifecycleCtx, sid: string, oldSid: string) => {
  if (ctx.drafts.takePreservedDraftSession(sid)) {
    ctx.drafts.writeChatDraft(sid)
    ctx.drafts.removeChatDraft(oldSid)
    return
  }
  ctx.drafts.restoreChatDraft(sid)
}

const onSessionChange = async (ctx: WorkspaceLifecycleCtx, sid: string, oldSid: string) => {
  ctx.run.bumpExternalDiscovery()
  ctx.emit('update:currentSessionId', sid || '')
  if (sid === oldSid) return
  applySessionDraft(ctx, sid, oldSid)
  ctx.prompt.loadEffectiveSystemPromptPreview()
  if (!sid) {
    ctx.sessions.bumpTokenEpoch()
    ctx.emit('totalChatTokensUpdate', 0)
    return
  }
  const cachedTokens = ctx.state.sessionList.value.find(item => item.id === sid)?.totalTokens || 0
  ctx.emit('totalChatTokensUpdate', cachedTokens)
  void ctx.sessions.loadTotalTokens(sid)
  resumeSessionRuntime(ctx)
}

const resumeSessionRuntime = (ctx: WorkspaceLifecycleCtx) => {
  ctx.run.resetRunUi()
  ctx.send.restorePendingQueue()
  ctx.run.startSessionSyncPolling()
  void ctx.run.checkActiveRun().then(() => {
    if (!ctx.state.isRunActive.value && !ctx.state.isTyping.value) void ctx.send.drainPendingQueue()
  })
  ctx.prompt.loadEffectiveSystemPromptPreview()
}

const mountWorkspace = async (ctx: WorkspaceLifecycleCtx) => {
  if (ctx.props.currentUserId) ctx.run.connectStream(ctx.props.currentUserId)
  await initializeSessions(ctx)
  ctx.emit('update:currentSessionId', ctx.state.currentSessionId.value || '')
  ctx.emit('taskPlanRefresh', ctx.state.taskPlanRefreshSignal.value)
  await nextTick()
}

export const bindChatWorkspaceLifecycle = (ctx: WorkspaceLifecycleCtx) => {
  watch(
    () => [ctx.props.aiConfigId, ctx.state.preferredInitialSessionId.value] as const,
    () => { void onAiOrInitialChange(ctx) },
    { immediate: false },
  )
  watch(() => ctx.props.mcpCatalogRefreshKey, async (nextKey, previousKey) => {
    if (nextKey === previousKey) return
    await ctx.prompt.loadFrontPromptToolSchemas()
    ctx.prompt.loadEffectiveSystemPromptPreview()
  })
  watch(ctx.state.currentSessionId, (sid, oldSid) => { void onSessionChange(ctx, sid, oldSid || '') })
  watch(ctx.prompt.selectedMcpToolNames, () => { ctx.prompt.loadEffectiveSystemPromptPreview() })
  onMounted(() => { void mountWorkspace(ctx) })
}

export { initializeSessions }
