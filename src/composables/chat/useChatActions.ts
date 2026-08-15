import { callMcpTool } from '@/api/mcp'
import * as chatApi from '@/api/chat'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceProps, ChatMessage, PersistedBlockState, PersistedMessageActionState } from '@/types/chat'
import { blockSignature, decodeStateFromTags, encodeTagsWithState, splitTags } from '@/utils/chatActionState'
import { buildMcpDisplayResult, safeJson } from '@/utils/chatMcpResult'
import type { ActionBlock } from '@/utils/chatParser'
import type { ChatSessionsApi } from './useChatSessions'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const collectMessageState = (state: ChatWorkspaceState, msg: ChatMessage): PersistedMessageActionState | null => {
  if (!msg.blocks || msg.blocks.length === 0) return null
  const blocks: Record<string, PersistedBlockState> = {}
  const signatures: Record<string, PersistedBlockState> = {}
  for (const block of msg.blocks) {
    const sig = blockSignature(block)
    const applied = state.appliedEdits.value.has(block.id) || state.appliedSignatures.value.has(sig)
    const result = state.actionResults.value[block.id] || state.actionResultsBySignature.value[sig]
    if (!applied && !result) continue
    const next = { applied, result }
    blocks[block.id] = next
    signatures[sig] = next
  }
  if (Object.keys(blocks).length === 0) return null
  return { blocks, signatures }
}

const persistMessageActionState = async (state: ChatWorkspaceState, msg: ChatMessage) => {
  if (!msg.id || !getAuthToken()) return
  const { base } = splitTags(msg.tags)
  const nextTags = encodeTagsWithState(base, collectMessageState(state, msg))
  if ((msg.tags || '') === nextTags) return
  try {
    await chatApi.patchChatMessageTags(msg.id, nextTags)
    msg.tags = nextTags
  } catch (err) {
    console.warn('persistMessageActionState failed', err)
  }
}

const persistMessageActionStateWhenReady = (state: ChatWorkspaceState, msg: ChatMessage, attempts = 12) => {
  if (msg.id) {
    void persistMessageActionState(state, msg)
    return
  }
  if (attempts <= 0) return
  setTimeout(() => persistMessageActionStateWhenReady(state, msg, attempts - 1), 250)
}

const resetActionMaps = (state: ChatWorkspaceState) => {
  state.appliedEdits.value = new Set()
  state.appliedSignatures.value = new Set()
  state.actionResults.value = {}
  state.actionResultsBySignature.value = {}
  state.undoActions.value = {}
}

const indexBlocksBySig = (blocks: ActionBlock[]) => {
  const msgBlockBySig: Record<string, string[]> = {}
  for (const block of blocks) {
    const sig = blockSignature(block)
    if (!msgBlockBySig[sig]) msgBlockBySig[sig] = []
    msgBlockBySig[sig].push(block.id)
  }
  return msgBlockBySig
}

const applyOneBlockState = (state: ChatWorkspaceState, blockId: string, blockState?: PersistedBlockState) => {
  if (blockState?.applied) state.appliedEdits.value.add(blockId)
  if (typeof blockState?.result === 'string' && blockState.result.trim()) {
    state.actionResults.value[blockId] = blockState.result
    state.appliedEdits.value.add(blockId)
  }
}

const applyPersistedBlockMap = (state: ChatWorkspaceState, blocks: Record<string, PersistedBlockState>) => {
  for (const [blockId, blockState] of Object.entries(blocks)) applyOneBlockState(state, blockId, blockState)
}

const applyPersistedSigMap = (
  state: ChatWorkspaceState,
  sigStates: Record<string, PersistedBlockState>,
  msgBlockBySig: Record<string, string[]>,
) => {
  for (const [sig, blockState] of Object.entries(sigStates)) {
    const resolvedIds = msgBlockBySig[sig] || []
    if (blockState?.applied) state.appliedSignatures.value.add(sig)
    if (typeof blockState?.result === 'string' && blockState.result.trim()) {
      state.actionResultsBySignature.value[sig] = blockState.result
    }
    for (const resolvedId of resolvedIds) applyOneBlockState(state, resolvedId, blockState)
  }
}

const applyMessageActionState = (state: ChatWorkspaceState, msg: ChatMessage) => {
  const persisted = decodeStateFromTags(msg.tags)
  applyPersistedBlockMap(state, persisted?.blocks || {})
  applyPersistedSigMap(state, persisted?.signatures || {}, indexBlocksBySig(msg.blocks || []))
}

const restoreActionStatesFromHistory = (state: ChatWorkspaceState, messages: ChatMessage[]) => {
  resetActionMaps(state)
  for (const msg of messages) applyMessageActionState(state, msg)
}

interface ActionBlockCtx {
  msg: ChatMessage
  block: ActionBlock
}

const getActionBlock = (state: ChatWorkspaceState, msgIdx: number, blockIdx: number): ActionBlockCtx | null => {
  if (msgIdx < 0) return null
  const msg = state.chatMessages.value[msgIdx]
  const block = msg?.blocks?.[blockIdx]
  if (!msg || !block) return null
  return { msg, block }
}

const markBlockApplied = (state: ChatWorkspaceState, block: ActionBlock, result: string, undo?: { tool: string; arguments: Record<string, any> }) => {
  state.appliedEdits.value.add(block.id)
  state.appliedSignatures.value.add(blockSignature(block))
  state.actionResults.value[block.id] = result
  state.actionResultsBySignature.value[blockSignature(block)] = result
  if (undo?.tool && undo?.arguments) state.undoActions.value[block.id] = undo
}

const executeMcpBlock = async (
  ctx: { props: ChatInterfaceProps; state: ChatWorkspaceState; dialogs: ChatDialogFns; sessions: ChatSessionsApi },
  item: ActionBlockCtx,
) => {
  if (ctx.state.appliedEdits.value.has(item.block.id)) return
  let data
  try {
    data = await callMcpTool({
      tool: item.block.tool || '',
      arguments: item.block.arguments || {},
      ai_config_id: ctx.props.aiConfigId,
    })
  } catch (err: any) {
    await ctx.dialogs.alert({ message: err?.message || `工具执行失败: ${item.block.tool || 'unknown'}`, type: 'error' })
    return
  }
  markBlockApplied(
    ctx.state,
    item.block,
    buildMcpDisplayResult(item.block, data),
    data?.result?.undo || data?.mcp?.result?.undo,
  )
  persistMessageActionStateWhenReady(ctx.state, item.msg)
  await ctx.sessions.loadTotalTokens()
}

const executeWorkspaceBlock = async (
  ctx: { props: ChatInterfaceProps; state: ChatWorkspaceState; dialogs: ChatDialogFns; sessions: ChatSessionsApi },
  item: ActionBlockCtx,
) => {
  let data
  try {
    data = await chatApi.executeChatAction({
      action: item.block.type,
      filename: item.block.filename,
      search: item.block.search,
      replace: item.block.replace,
      content: item.block.content,
      command: item.block.command,
      ai_config_id: ctx.props.aiConfigId,
    })
  } catch (err: any) {
    await ctx.dialogs.alert({ message: err?.message || '工具执行失败', type: 'error' })
    return
  }
  markBlockApplied(ctx.state, item.block, safeJson(data, 12000), data?.result?.undo || data?.mcp?.result?.undo)
  persistMessageActionStateWhenReady(ctx.state, item.msg)
  await ctx.sessions.loadTotalTokens()
}

const executeAction = async (
  ctx: { props: ChatInterfaceProps; state: ChatWorkspaceState; dialogs: ChatDialogFns; sessions: ChatSessionsApi },
  msgIdx: number,
  blockIdx: number,
) => {
  const item = getActionBlock(ctx.state, msgIdx, blockIdx)
  if (!item || !getAuthToken()) return
  if (item.block.type === 'mcp') return executeMcpBlock(ctx, item)
  return executeWorkspaceBlock(ctx, item)
}

const revertAction = async (
  ctx: { props: ChatInterfaceProps; state: ChatWorkspaceState; sessions: ChatSessionsApi },
  msgIdx: number,
  blockIdx: number,
) => {
  const item = getActionBlock(ctx.state, msgIdx, blockIdx)
  if (!item || item.block.type !== 'mcp') return
  const undo = ctx.state.undoActions.value[item.block.id]
  if (!undo || !getAuthToken()) return
  try {
    await callMcpTool({ ...undo, ai_config_id: ctx.props.aiConfigId })
  } catch {
    return
  }
  ctx.state.appliedEdits.value.delete(item.block.id)
  ctx.state.appliedSignatures.value.delete(blockSignature(item.block))
  delete ctx.state.undoActions.value[item.block.id]
  delete ctx.state.actionResults.value[item.block.id]
  delete ctx.state.actionResultsBySignature.value[blockSignature(item.block)]
  persistMessageActionStateWhenReady(ctx.state, item.msg)
  await ctx.sessions.loadTotalTokens()
}

const resolveHistoryIndexFromRenderedMessage = (state: ChatWorkspaceState, renderMsg: { id?: number } | null) => {
  if (!renderMsg) return -1
  const messageId = Number(renderMsg.id || 0)
  if (!Number.isFinite(messageId) || messageId <= 0) return -1
  return state.chatMessages.value.findIndex(item => Number(item.id || 0) === messageId)
}

const deleteMessage = async (
  ctx: { state: ChatWorkspaceState; dialogs: ChatDialogFns },
  idx: number,
) => {
  if (idx < 0) return
  const msg = ctx.state.chatMessages.value[idx]
  if (!msg.id) {
    ctx.state.chatMessages.value.splice(idx, 1)
    return
  }
  if (!(await ctx.dialogs.confirm({ message: '确定要删除这条消息吗？', type: 'warning' }))) return
  if (!getAuthToken()) return
  try {
    await chatApi.deleteChatMessage(msg.id)
    ctx.state.chatMessages.value.splice(idx, 1)
    await ctx.dialogs.alert({ message: '消息已删除', type: 'success' })
  } catch {
    // best-effort
  }
}

const recallMessage = async (
  ctx: { state: ChatWorkspaceState; dialogs: ChatDialogFns },
  idx: number,
) => {
  if (idx < 0) return
  const msg = ctx.state.chatMessages.value[idx]
  if (!msg.id) return
  if (!(await ctx.dialogs.confirm({ message: '确定撤回此消息吗？将删除它之后的对话。', type: 'warning' }))) return
  if (!getAuthToken()) return
  let data
  try {
    data = await chatApi.recallChatMessage(msg.id)
  } catch {
    return
  }
  ctx.state.chatMessages.value.splice(idx)
  ctx.state.chatInput.value = data.recall_content || msg.content
}

export const useChatActions = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  dialogs: ChatDialogFns,
  sessions: ChatSessionsApi,
) => {
  const ctx = { props, state, dialogs, sessions }
  const dialogCtx = { state, dialogs }
  return {
    appliedEditsArray: state.appliedEditsArray,
    appliedSignaturesArray: state.appliedSignaturesArray,
    actionResults: state.actionResults,
    actionResultsBySignature: state.actionResultsBySignature,
    restoreActionStatesFromHistory: (messages: ChatMessage[]) => restoreActionStatesFromHistory(state, messages),
    executeAction: (msgIdx: number, blockIdx: number) => executeAction(ctx, msgIdx, blockIdx),
    revertAction: (msgIdx: number, blockIdx: number) => revertAction(ctx, msgIdx, blockIdx),
    onConversationDelete: async (_renderIdx: number, message: { id?: number } | null) => {
      await deleteMessage(dialogCtx, resolveHistoryIndexFromRenderedMessage(state, message))
    },
    onConversationRecall: async (_renderIdx: number, message: { id?: number } | null) => {
      await recallMessage(dialogCtx, resolveHistoryIndexFromRenderedMessage(state, message))
    },
    onConversationApply: async (_renderIdx: number, blockIdx: number, message: { id?: number } | null) => {
      await executeAction(ctx, resolveHistoryIndexFromRenderedMessage(state, message), blockIdx)
    },
    onConversationRevert: async (_renderIdx: number, blockIdx: number, message: { id?: number } | null) => {
      await revertAction(ctx, resolveHistoryIndexFromRenderedMessage(state, message), blockIdx)
    },
  }
}

export type ChatActionsApi = ReturnType<typeof useChatActions>
