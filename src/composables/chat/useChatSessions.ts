import { computed } from 'vue'
import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps, SessionItem } from '@/types/chat'
import { BLANK_SESSION_NAME, buildAutoSessionTitle, isPlaceholderSessionName, isTaskSession } from '@/utils/chatSessionLabels'
import type { ChatDraftsApi } from './useChatDrafts'
import type { ChatFrontPromptApi } from './useChatFrontPrompt'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const mapSessionRows = (rows: any[]): SessionItem[] =>
  (Array.isArray(rows) ? rows : []).map((row: any) => ({
    id: String(row?.id || ''),
    name: String(row?.name || BLANK_SESSION_NAME),
    totalTokens: Number(row?.total_tokens || 0),
    createdAt: row?.created_at ?? row?.createdAt ?? row?.updated_at ?? row?.updatedAt ?? null,
    forwardToBot: Boolean(row?.forward_to_bot ?? row?.forwardToBot),
  }))

const loadSessions = async (state: ChatWorkspaceState) => {
  if (!getAuthToken()) return
  try {
    state.sessionList.value = mapSessionRows(await chatApi.listChatSessions(state.chatCtx.value))
  } catch {
    // keep the previous list
  }
}

const createSession = async (
  ctx: { state: ChatWorkspaceState; drafts: ChatDraftsApi; prompt: ChatFrontPromptApi },
  nameInput?: string,
  options: { carryDraft?: boolean; preserveMessages?: boolean } = {},
) => {
  const name = String(nameInput ?? BLANK_SESSION_NAME).trim() || BLANK_SESSION_NAME
  if (!getAuthToken()) return ''
  let session
  try {
    session = await chatApi.createChatSession(ctx.state.chatCtx.value, name)
  } catch {
    return ''
  }
  await loadSessions(ctx.state)
  if (options.carryDraft) ctx.drafts.markPreserveDraft(session.id)
  ctx.state.currentSessionId.value = session.id
  if (!options.preserveMessages) ctx.state.chatMessages.value = []
  await ctx.prompt.loadFrontPromptToolSchemas()
  return session.id
}

const maybeAutoTitleSession = async (state: ChatWorkspaceState, sessionId: string, firstMessage: string) => {
  const sid = String(sessionId || '').trim()
  if (!sid || !getAuthToken()) return
  const row = state.sessionList.value.find(item => item.id === sid)
  if (row && !isPlaceholderSessionName(row.name)) return
  const title = buildAutoSessionTitle(firstMessage)
  if (!title || title === row?.name) return
  try {
    await chatApi.renameChatSession(state.chatCtx.value, sid, title)
    await loadSessions(state)
  } catch {
    // 自动命名失败不影响发送主流程
  }
}

const deleteSession = async (
  ctx: { state: ChatWorkspaceState; drafts: ChatDraftsApi; dialogs: ChatDialogFns },
  sid: string,
) => {
  if (!(await ctx.dialogs.confirm({ message: '确定删除这个对话记录吗？', type: 'warning' }))) return
  if (!getAuthToken()) return
  try {
    await chatApi.deleteChatSession(ctx.state.chatCtx.value, sid)
  } catch {
    return
  }
  ctx.drafts.removeChatDraft(sid)
  await loadSessions(ctx.state)
  if (ctx.state.currentSessionId.value === sid) {
    ctx.state.currentSessionId.value = ''
    ctx.state.chatMessages.value = []
  }
}

const renameSession = async (
  ctx: { state: ChatWorkspaceState; dialogs: ChatDialogFns },
  payload: { sessionId: string; name: string },
) => {
  const sid = String(payload?.sessionId || '').trim()
  const name = String(payload?.name || '').trim()
  if (!sid || !name || !getAuthToken()) return
  try {
    await chatApi.renameChatSession(ctx.state.chatCtx.value, sid, name)
  } catch {
    await ctx.dialogs.alert({ message: '会话重命名失败', type: 'error' })
    return
  }
  await loadSessions(ctx.state)
}

const setSessionForward = async (
  ctx: { state: ChatWorkspaceState; dialogs: ChatDialogFns },
  payload: { sessionId: string; enabled: boolean },
) => {
  const sid = String(payload?.sessionId || '').trim()
  if (!sid || !getAuthToken()) return
  try {
    const result = await chatApi.setSessionForwardToBot(ctx.state.chatCtx.value, sid, payload.enabled)
    await loadSessions(ctx.state)
    if (result.warning) await ctx.dialogs.alert({ message: result.warning, type: 'warning' })
  } catch {
    await ctx.dialogs.alert({ message: '设置机器人同步失败', type: 'error' })
  }
}

const deleteSessions = async (
  ctx: { state: ChatWorkspaceState; dialogs: ChatDialogFns },
  sessionIds: string[],
) => {
  const ids = Array.from(new Set(sessionIds.map(id => String(id || '').trim()).filter(Boolean)))
  if (ids.length === 0) return
  if (!(await ctx.dialogs.confirm({ message: `确定删除选中的 ${ids.length} 个对话记录吗？`, type: 'warning' }))) return
  if (!getAuthToken()) return
  const deleted = new Set<string>()
  for (const sid of ids) {
    try {
      await chatApi.deleteChatSession(ctx.state.chatCtx.value, sid)
      deleted.add(sid)
    } catch {
      // keep deleting the rest
    }
  }
  await loadSessions(ctx.state)
  if (deleted.has(ctx.state.currentSessionId.value)) {
    ctx.state.currentSessionId.value = ''
    ctx.state.chatMessages.value = []
  }
  if (deleted.size > 0) await ctx.dialogs.alert({ message: `已删除 ${deleted.size} 个对话记录`, type: 'success' })
}

const loadTotalTokens = async (
  ctx: { state: ChatWorkspaceState; emit: ChatInterfaceEmitFn; tokenEpoch: { value: number } },
  sessionId = ctx.state.currentSessionId.value,
) => {
  const sid = String(sessionId || '').trim()
  const epoch = ++ctx.tokenEpoch.value
  if (!sid) {
    if (!ctx.state.currentSessionId.value) ctx.emit('totalChatTokensUpdate', 0)
    return 0
  }
  if (!getAuthToken()) return 0
  let data
  try {
    data = await chatApi.getChatTotalTokens(ctx.state.chatCtx.value, sid)
  } catch {
    return 0
  }
  if (epoch !== ctx.tokenEpoch.value || ctx.state.currentSessionId.value !== sid) return 0
  ctx.emit('totalChatTokensUpdate', data.total_tokens || 0)
  await loadSessions(ctx.state)
  return data.total_tokens || 0
}

export const useChatSessions = (
  _props: ChatInterfaceProps,
  emit: ChatInterfaceEmitFn,
  state: ChatWorkspaceState,
  dialogs: ChatDialogFns,
  drafts: ChatDraftsApi,
  prompt: ChatFrontPromptApi,
) => {
  const tokenEpoch = { value: 0 }
  const sessionCtx = { state, drafts, prompt }
  const dialogCtx = { state, dialogs }
  return {
    sessionList: state.sessionList,
    recentNormalSessions: computed(() =>
      state.sessionList.value.filter(item => !isTaskSession(item)).slice(0, 3)),
    recentTaskSessions: computed(() =>
      state.sessionList.value.filter(isTaskSession).slice(0, 3)),
    bumpTokenEpoch: () => { tokenEpoch.value += 1 },
    loadSessions: () => loadSessions(state),
    createSession: (nameInput?: string, options: { carryDraft?: boolean; preserveMessages?: boolean } = {}) =>
      createSession(sessionCtx, nameInput, options),
    createSessionFromButton: () => createSession(sessionCtx),
    maybeAutoTitleSession: (sessionId: string, firstMessage: string) =>
      maybeAutoTitleSession(state, sessionId, firstMessage),
    deleteSession: (sid: string) => deleteSession({ state, drafts, dialogs }, sid),
    renameSession: (payload: { sessionId: string; name: string }) => renameSession(dialogCtx, payload),
    setSessionForward: (payload: { sessionId: string; enabled: boolean }) => setSessionForward(dialogCtx, payload),
    deleteSessions: (sessionIds: string[]) => deleteSessions(dialogCtx, sessionIds),
    loadTotalTokens: (sessionId?: string) => loadTotalTokens({ state, emit, tokenEpoch }, sessionId),
  }
}

export type ChatSessionsApi = ReturnType<typeof useChatSessions>
