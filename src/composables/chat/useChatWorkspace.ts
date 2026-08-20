import { computed } from 'vue'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
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
  handleChatSend: (content?: string) => ctx.send.sendChat(content),
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
