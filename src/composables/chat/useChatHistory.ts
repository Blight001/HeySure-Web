import { nextTick } from 'vue'
import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceProps, ChatMessage } from '@/types/chat'
import { waitMs } from '@/utils/chatAsync'
import {
  findDuplicateAssistantIndex,
  getFirstMessageId,
  getLastMessageId,
  hasAssistantMessageWithContent,
  isConversationClearToolMessage,
  isConversationEditToolMessage,
  mapHistoryMessage,
  mapHistoryMessages,
} from '@/utils/chatHistoryMap'
import { isSameAssistantVisibleReply, normalizeAssistantReplyText } from '@/utils/chatReplyCompare'
import { parseChatResponseInline } from '@/utils/chatParser'
import type { ChatActionsApi } from './useChatActions'
import type { ChatLiveAssistantApi } from './useChatLiveAssistant'
import type { ChatScrollApi } from './useChatScroll'
import type { ChatSessionsApi } from './useChatSessions'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const HISTORY_PAGE_SIZE = 30

interface HistoryCtx {
  props: ChatInterfaceProps
  state: ChatWorkspaceState
  scroll: ChatScrollApi
  live: ChatLiveAssistantApi
  actions: ChatActionsApi
  sessions: ChatSessionsApi
  dialogs: ChatDialogFns
  historyEpoch: { value: number }
}

const maybeClearLiveFor = (ctx: HistoryCtx, msgVisible: string) => {
  const liveVisible = normalizeAssistantReplyText(ctx.live.liveTargetText.value)
  if (
    liveVisible
    && isSameAssistantVisibleReply(msgVisible, liveVisible)
    && !ctx.state.isRunActive.value
    && ctx.live.liveAssistantText.value.trim()
  ) {
    ctx.live.clearLiveAssistantView()
  }
}

const resolveDuplicateAssistant = (ctx: HistoryCtx, idx: number, msg: ChatMessage, msgVisible: string) => {
  const existing = ctx.state.chatMessages.value[idx]
  if (msg.id && !existing.id) {
    ctx.state.chatMessages.value.splice(idx, 1)
    return false
  }
  maybeClearLiveFor(ctx, msgVisible)
  return true
}

const tryMergeAssistant = (ctx: HistoryCtx, msg: ChatMessage) => {
  if (msg.role !== 'assistant') return false
  const msgVisible = normalizeAssistantReplyText(msg.content)
  if (!msgVisible) return false
  const duplicateIdx = findDuplicateAssistantIndex(ctx.state.chatMessages.value, msgVisible)
  if (duplicateIdx >= 0) return resolveDuplicateAssistant(ctx, duplicateIdx, msg, msgVisible)
  maybeClearLiveFor(ctx, msgVisible)
  return false
}

const tryMergeOptimisticUser = (ctx: HistoryCtx, msg: ChatMessage) => {
  if (msg.role !== 'user' || !msg.id) return false
  const idx = ctx.state.chatMessages.value.findIndex(item =>
    item.role === 'user'
    && Number(item.id || 0) < 0
    && item.content === msg.content)
  if (idx < 0) return false
  ctx.state.chatMessages.value.splice(idx, 1, mapHistoryMessage(msg))
  return true
}

const upsertHistoryMessages = async (ctx: HistoryCtx, incoming: ChatMessage[]) => {
  if (!incoming.length) return
  const existingIds = new Set(ctx.state.chatMessages.value.map(m => m.id).filter(Boolean))
  for (const msg of incoming) {
    if (msg.id && existingIds.has(msg.id)) continue
    if (tryMergeOptimisticUser(ctx, msg)) continue
    if (tryMergeAssistant(ctx, msg)) continue
    ctx.state.chatMessages.value.push(mapHistoryMessage(msg))
  }
  ctx.actions.restoreActionStatesFromHistory(ctx.state.chatMessages.value)
  if (ctx.scroll.stickToBottom.value) await ctx.scroll.scrollToBottom(true)
}

const appendOptimisticUserMessage = async (
  ctx: HistoryCtx,
  content: string,
  tags: string,
  attachments: ChatMessage['attachments'],
) => {
  const id = -Date.now()
  ctx.state.chatMessages.value.push({
    id,
    role: 'user',
    content,
    display_text: content,
    inlineContent: [{ type: 'text', content }],
    tags,
    attachments,
    created_at: Date.now(),
  })
  ctx.scroll.stickToBottom.value = true
  await ctx.scroll.scrollToBottom(true)
  return id
}

const removeOptimisticUserMessage = (ctx: HistoryCtx, id: number) => {
  const idx = ctx.state.chatMessages.value.findIndex(item => item.id === id)
  if (idx >= 0) ctx.state.chatMessages.value.splice(idx, 1)
}

const loadOlderHistory = async (ctx: HistoryCtx) => {
  if (ctx.state.loadingOlder.value || !ctx.state.hasMoreHistory.value) return
  if (!getAuthToken() || !ctx.state.currentSessionId.value) return
  const beforeId = getFirstMessageId(ctx.state.chatMessages.value)
  if (!beforeId) return
  const sid = ctx.state.currentSessionId.value
  ctx.state.loadingOlder.value = true
  const el = ctx.scroll.chatScrollRef.value
  const prevHeight = el ? el.scrollHeight : 0
  const prevTop = el ? el.scrollTop : 0
  const olderMapped = await fetchOlderPage(ctx, sid, beforeId)
  if (ctx.state.currentSessionId.value !== sid) {
    ctx.state.loadingOlder.value = false
    return
  }
  applyOlderPage(ctx, olderMapped, prevHeight, prevTop)
}

const fetchOlderPage = async (ctx: HistoryCtx, sid: string, beforeId: number) => {
  try {
    const older = await chatApi.getChatHistory(ctx.state.chatCtx.value, sid, {
      beforeId,
      limit: HISTORY_PAGE_SIZE,
    })
    return mapHistoryMessages(Array.isArray(older) ? older : [])
  } catch {
    ctx.state.loadingOlder.value = false
    return null
  }
}

const applyOlderPage = async (
  ctx: HistoryCtx,
  olderMapped: ChatMessage[] | null,
  prevHeight: number,
  prevTop: number,
) => {
  if (!olderMapped) return
  ctx.state.hasMoreHistory.value = olderMapped.length >= HISTORY_PAGE_SIZE
  if (olderMapped.length > 0) {
    ctx.state.chatMessages.value = [...olderMapped, ...ctx.state.chatMessages.value]
    ctx.actions.restoreActionStatesFromHistory(ctx.state.chatMessages.value)
    await nextTick()
    ctx.scroll.preserveAnchorAfterPrepend(prevHeight, prevTop)
  }
  ctx.state.loadingOlder.value = false
}

const autoFillHistoryUntilScrollable = async (ctx: HistoryCtx, epoch: number) => {
  for (let guard = 0; guard < 20; guard += 1) {
    if (epoch !== ctx.historyEpoch.value || !ctx.state.hasMoreHistory.value || ctx.state.loadingOlder.value) return
    await nextTick()
    const el = ctx.scroll.chatScrollRef.value
    if (!el || el.scrollHeight > el.clientHeight + 8) return
    const before = ctx.state.chatMessages.value.length
    await loadOlderHistory(ctx)
    if (epoch !== ctx.historyEpoch.value || ctx.state.chatMessages.value.length === before) return
    if (ctx.scroll.stickToBottom.value) await ctx.scroll.scrollToBottom()
  }
}

const appendLiveAssistantAsLocalMessage = async (ctx: HistoryCtx, text: string) => {
  const content = String(text || '')
  if (!content.trim() || hasAssistantMessageWithContent(ctx.state.chatMessages.value, content)) return
  const parsed = parseChatResponseInline(content)
  ctx.state.chatMessages.value.push({
    role: 'assistant',
    content,
    created_at: Date.now(),
    display_text: parsed.displayText,
    think: parsed.think,
    blocks: parsed.blocks,
    inlineContent: parsed.inlineContent,
  })
  if (ctx.scroll.stickToBottom.value) await ctx.scroll.scrollToBottom()
}

const appendRunErrorNotice = async (ctx: HistoryCtx, runId: string, message: string) => {
  const key = runId || `unknown_${Date.now()}`
  if (ctx.state.shownRunErrorIds.value.has(key)) return
  ctx.state.shownRunErrorIds.value.add(key)
  const content = ['[AI 对话出错]', String(message || '').trim() || '后端运行失败，但没有返回具体错误信息。'].join('\n')
  const fallbackMsg: ChatMessage = { role: 'system', content, created_at: Date.now(), display_text: content }
  const localIndex = ctx.state.chatMessages.value.push(fallbackMsg) - 1
  ctx.scroll.stickToBottom.value = true
  await ctx.scroll.scrollToBottom(true)
  await persistRunErrorNotice(ctx, key, content, localIndex)
}

const persistRunErrorNotice = async (ctx: HistoryCtx, key: string, content: string, localIndex: number) => {
  if (!getAuthToken() || !ctx.state.currentSessionId.value) return
  try {
    const currentSessionName = ctx.state.sessionList.value.find(s => s.id === ctx.state.currentSessionId.value)?.name
    const saved = await chatApi.saveChatMessage({
      role: 'system',
      content,
      tags: `run_error:${key}`,
      ai_config_id: ctx.props.aiConfigId,
      ai_kind: ctx.state.aiKindValue.value,
      session_id: ctx.state.currentSessionId.value,
      session_name: currentSessionName || '新对话',
      total_tokens: 0,
    })
    ctx.state.chatMessages.value.splice(localIndex, 1, { ...saved, display_text: saved.content })
  } catch (err) {
    console.warn('persist run error notice failed', err)
  }
}

const reloadCurrentHistorySnapshot = async (ctx: HistoryCtx) => {
  if (!getAuthToken() || !ctx.state.currentSessionId.value) return
  let history
  try {
    history = await chatApi.getChatHistory(ctx.state.chatCtx.value, ctx.state.currentSessionId.value, { limit: HISTORY_PAGE_SIZE })
  } catch {
    return
  }
  const mapped = mapHistoryMessages(history)
  ctx.state.hasMoreHistory.value = mapped.length >= HISTORY_PAGE_SIZE
  ctx.state.chatMessages.value = mapped
  ctx.actions.restoreActionStatesFromHistory(ctx.state.chatMessages.value)
  await ctx.sessions.loadTotalTokens()
  ctx.scroll.stickToBottom.value = true
  await ctx.scroll.scrollToBottom()
}

const fetchHistoryWithRetry = async (ctx: HistoryCtx, sid: string) => {
  let history: ChatMessage[] | undefined
  let lastErr: any = null
  for (let attempt = 0; attempt < 2 && history === undefined; attempt += 1) {
    try {
      history = await chatApi.getChatHistory(ctx.state.chatCtx.value, sid, { limit: HISTORY_PAGE_SIZE })
    } catch (err) {
      lastErr = err
      if (attempt === 0) await waitMs(300)
    }
  }
  return { history, lastErr }
}

const loadChatHistory = async (ctx: HistoryCtx, sid: string) => {
  if (!getAuthToken() || !sid) return
  ctx.state.loadingOlder.value = false
  const epoch = ++ctx.historyEpoch.value
  const { history, lastErr } = await fetchHistoryWithRetry(ctx, sid)
  if (epoch !== ctx.historyEpoch.value) return
  if (history === undefined) {
    await ctx.dialogs.alert({ message: lastErr?.message || '会话历史加载失败，请重试', type: 'error' })
    return
  }
  const mapped = mapHistoryMessages(history)
  ctx.state.hasMoreHistory.value = mapped.length >= HISTORY_PAGE_SIZE
  ctx.state.chatMessages.value = mapped
  ctx.actions.restoreActionStatesFromHistory(ctx.state.chatMessages.value)
  ctx.scroll.stickToBottom.value = true
  await ctx.scroll.scrollToBottom()
  ctx.scroll.pinToBottomSettled()
  ctx.state.currentSessionId.value = sid
  void autoFillHistoryUntilScrollable(ctx, epoch)
}

const fetchRunHistoryIncrementalOnce = async (ctx: HistoryCtx) => {
  if (!ctx.state.currentSessionId.value || !getAuthToken()) return
  const lastId = getLastMessageId(ctx.state.chatMessages.value)
  let incremental
  try {
    incremental = await chatApi.getChatHistory(
      ctx.state.chatCtx.value,
      ctx.state.currentSessionId.value,
      lastId > 0 ? { afterId: lastId } : { limit: HISTORY_PAGE_SIZE },
    )
  } catch {
    return
  }
  const list = Array.isArray(incremental) ? incremental : []
  await upsertHistoryMessages(ctx, list)
  if (list.some(isConversationEditToolMessage)) await ctx.sessions.loadSessions()
  if (list.some(isConversationClearToolMessage)) await reloadCurrentHistorySnapshot(ctx)
}

export const useChatHistory = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  scroll: ChatScrollApi,
  live: ChatLiveAssistantApi,
  actions: ChatActionsApi,
  sessions: ChatSessionsApi,
  dialogs: ChatDialogFns,
) => {
  const ctx: HistoryCtx = {
    props, state, scroll, live, actions, sessions, dialogs, historyEpoch: { value: 0 },
  }
  return {
    loadChatHistory: (sid: string) => loadChatHistory(ctx, sid),
    loadOlderHistory: () => loadOlderHistory(ctx),
    fetchRunHistoryIncrementalOnce: () => fetchRunHistoryIncrementalOnce(ctx),
    upsertHistoryMessages: (incoming: ChatMessage[]) => upsertHistoryMessages(ctx, incoming),
    appendLiveAssistantAsLocalMessage: (text: string) => appendLiveAssistantAsLocalMessage(ctx, text),
    appendRunErrorNotice: (runId: string, message: string) => appendRunErrorNotice(ctx, runId, message),
    appendOptimisticUserMessage: (
      content: string,
      tags: string,
      attachments: ChatMessage['attachments'],
    ) => appendOptimisticUserMessage(ctx, content, tags, attachments),
    removeOptimisticUserMessage: (id: number) => removeOptimisticUserMessage(ctx, id),
    reloadCurrentHistorySnapshot: () => reloadCurrentHistorySnapshot(ctx),
    hasAssistantMessageWithContent: (content: string) =>
      hasAssistantMessageWithContent(state.chatMessages.value, content),
  }
}

export type ChatHistoryApi = ReturnType<typeof useChatHistory>
