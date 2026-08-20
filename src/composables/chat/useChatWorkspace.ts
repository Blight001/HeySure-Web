import { computed } from 'vue'
import { enqueueExternalControllerMessage } from '@/api/ai'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
import { BLANK_SESSION_NAME, buildAutoSessionTitle, isPlaceholderSessionName } from '@/utils/chatSessionLabels'
import {
  useChatActions,
  useChatAiConfig,
  useChatDrafts,
  useChatFilePicker,
  useChatFrontPrompt,
  useChatHistory,
  useChatLiveAssistant,
  useChatRunControl,
  useChatRunTimers,
  useChatScroll,
  useChatSend,
  useChatSessions,
  useChatUploads,
  useFrontPromptPopup,
} from './chatFeatures'
import { bindChatWorkspaceLifecycle } from './useChatWorkspaceLifecycle'
import { useChatWorkspaceState, type ChatWorkspaceState } from './useChatWorkspaceState'

const assembleWorkspace = (
  props: ChatInterfaceProps,
  emit: ChatInterfaceEmitFn,
  dialogs: ChatDialogFns,
) => {
  const state = useChatWorkspaceState(props)
  const scroll = useChatScroll()
  const live = useChatLiveAssistant(scroll, state.chatMessages)
  const drafts = useChatDrafts(props, state)
  const timers = useChatRunTimers(props, state)
  const uploads = useChatUploads(props, state, emit, dialogs)
  const popup = useFrontPromptPopup(props, state)
  const files = useChatFilePicker(props, emit, state)
  const prompt = useChatFrontPrompt(props, state)
  const aiConfig = useChatAiConfig(props, state, emit, dialogs)
  const sessions = useChatSessions(props, emit, state, dialogs, drafts, prompt)
  const actions = useChatActions(props, state, dialogs, sessions)
  const history = useChatHistory(props, state, scroll, live, actions, sessions, dialogs)
  scroll.setLoadOlder(() => { void history.loadOlderHistory() })
  const run = useChatRunControl({ props, emit, state, timers, live, history, sessions, prompt, dialogs })
  const send = useChatSend({ props, emit, state, uploads, files, prompt, sessions, history, run, timers, live, dialogs })
  run.setDrainQueue(() => send.drainPendingQueue())
  return { props, emit, dialogs, state, scroll, live, drafts, timers, uploads, popup, files, prompt, aiConfig, sessions, actions, history, run, send }
}

type WorkspaceCtx = ReturnType<typeof assembleWorkspace>

const isBlankConversationOf = (state: ChatWorkspaceState, liveText: { value: string }) =>
  computed(() => {
    if (state.chatMessages.value.length > 0) return false
    if (state.isTyping.value || state.isRunActive.value) return false
    return !String(liveText.value || '').trim()
  })

const sendExternalControllerChatCore = async (ctx: WorkspaceCtx, overrideContent?: string) => {
  const content = (overrideContent ?? ctx.state.chatInput.value).trim()
  const readyUploads = ctx.uploads.uploadedAttachments.value.filter(item => item.status === 'ready' && item.file_ref)
  if (!content && readyUploads.length === 0) return
  if (ctx.uploads.uploadingCount.value > 0) {
    await ctx.dialogs.alert({ message: '附件仍在上传，请稍候再发送', type: 'warning' })
    return
  }
  if (readyUploads.length > 0) {
    await ctx.dialogs.alert({ message: '外部控制器对话暂不支持附件，请先发送文字说明。', type: 'warning' })
    return
  }
  if (!getAuthToken()) return
  await dispatchExternalControllerChat(ctx, content)
}

const sendExternalControllerChat = async (ctx: WorkspaceCtx, overrideContent?: string) => {
  if (ctx.state.isSubmitting.value) return
  ctx.state.isSubmitting.value = true
  try {
    await sendExternalControllerChatCore(ctx, overrideContent)
  } finally {
    ctx.state.isSubmitting.value = false
  }
}

const dispatchExternalControllerChat = async (ctx: WorkspaceCtx, content: string) => {
  if (!ctx.state.currentSessionId.value) {
    const createdId = await ctx.sessions.createSession(BLANK_SESSION_NAME, { carryDraft: true })
    if (!createdId) return
  }
  const currentSessionName = ctx.state.sessionList.value.find(s => s.id === ctx.state.currentSessionId.value)?.name || BLANK_SESSION_NAME
  const shouldAutoTitle = isPlaceholderSessionName(currentSessionName)
  ctx.state.chatInput.value = ''
  ctx.state.chatMentions.value = []
  try {
    await enqueueExternalControllerMessage(Number(ctx.props.aiConfigId), {
      content,
      session_id: ctx.state.currentSessionId.value,
      session_name: shouldAutoTitle ? buildAutoSessionTitle(content) : currentSessionName,
      ai_kind: ctx.state.aiKindValue.value,
    })
    if (shouldAutoTitle) void ctx.sessions.maybeAutoTitleSession(ctx.state.currentSessionId.value, content)
    await ctx.history.fetchRunHistoryIncrementalOnce()
    await ctx.aiConfig.loadExternalControlEvents()
  } catch (err: any) {
    ctx.state.chatInput.value = content
    await ctx.dialogs.alert({ message: err?.message || '消息发送到外部控制器失败', type: 'error' })
  }
}

const handleChatSend = (ctx: WorkspaceCtx, content?: string) => (
  ctx.state.externalControlMode.value
    ? sendExternalControllerChat(ctx, content)
    : ctx.send.sendChat(content)
)

const collectBindings = (ctx: WorkspaceCtx) => ({
  ...ctx.state,
  ...ctx.scroll,
  ...ctx.live,
  ...ctx.timers,
  ...ctx.uploads,
  ...ctx.popup,
  ...ctx.files,
  ...ctx.prompt,
  ...ctx.aiConfig,
  ...ctx.sessions,
  ...ctx.actions,
  ...ctx.history,
  ...ctx.run,
  ...ctx.send,
  isBlankConversation: isBlankConversationOf(ctx.state, ctx.live.liveAssistantText),
  clearAttachments: () => ctx.prompt.clearAttachments(() => ctx.emit('update:selectedFiles', [])),
  handleChatSend: (content?: string) => handleChatSend(ctx, content),
})

export const useChatWorkspace = (
  props: ChatInterfaceProps,
  emit: ChatInterfaceEmitFn,
  dialogs: ChatDialogFns,
) => {
  const ctx = assembleWorkspace(props, emit, dialogs)
  bindChatWorkspaceLifecycle(ctx)
  return collectBindings(ctx)
}
