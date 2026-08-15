import { onBeforeUnmount } from 'vue'
import { getExternalControlStatus, listAiConfigs, updateAiConfigFields, type ExternalControlEvent } from '@/api/ai'
import { me } from '@/api/auth'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
import { parseModelOptions } from '@/utils/chatModelOptions'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const applyAiConfigRow = (state: ChatWorkspaceState, cfg: any, currentUser: any) => {
  state.modelOptions.value = parseModelOptions(currentUser?.model_presets)
  const configuredPresetId = String(cfg?.model_preset_id || '').trim()
  state.selectedModelId.value = state.modelOptions.value.some(option => option.id === configuredPresetId)
    ? configuredPresetId
    : (state.modelOptions.value.find(option => option.model === String(cfg?.model || ''))?.id || '')
  state.configuredFrontPrompt.value = String(cfg?.prompt || '').trim()
  state.externalControlMode.value = cfg?.execution_mode === 'external_mcp'
}

const resetAiConfigState = (state: ChatWorkspaceState) => {
  state.configuredFrontPrompt.value = ''
  state.externalControlMode.value = false
  state.externalControlEvents.value = []
  state.modelOptions.value = []
  state.selectedModelId.value = ''
}

const loadExternalControlEvents = async (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  const configId = Number(props.aiConfigId || 0)
  if (!configId || !getAuthToken()) return
  try {
    const status = await getExternalControlStatus(configId)
    state.externalControlEvents.value = (Array.isArray(status.events) ? status.events : [])
      .filter(item => item.event_type === 'mcp.result')
    state.externalControlError.value = ''
  } catch (err: any) {
    state.externalControlError.value = err?.message || '控制日志加载失败'
  }
}

const loadConfiguredFrontPrompt = async (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  syncPolling: () => void,
) => {
  resetAiConfigState(state)
  if (!getAuthToken() || props.aiConfigId === undefined || props.aiConfigId === null) return
  let rows
  let currentUser
  try {
    ;[rows, currentUser] = await Promise.all([listAiConfigs(), me()])
  } catch {
    return
  }
  const cfg = (Array.isArray(rows) ? rows : []).find((row: any) => Number(row?.id) === Number(props.aiConfigId))
  applyAiConfigRow(state, cfg, currentUser)
  if (state.externalControlMode.value) await loadExternalControlEvents(props, state)
  syncPolling()
}

const switchConversationModel = async (
  ctx: { props: ChatInterfaceProps; state: ChatWorkspaceState; emit: ChatInterfaceEmitFn; dialogs: ChatDialogFns },
  modelId: string,
) => {
  const configId = Number(ctx.props.aiConfigId || 0)
  const option = ctx.state.modelOptions.value.find(item => item.id === modelId)
  if (!configId || !option || modelId === ctx.state.selectedModelId.value) return
  if (ctx.state.isRunActive.value || ctx.state.isTyping.value) {
    await ctx.dialogs.alert({ message: '请等待当前回复结束后再切换模型', type: 'warning' })
    return
  }
  const previousId = ctx.state.selectedModelId.value
  ctx.state.modelSwitching.value = true
  ctx.state.selectedModelId.value = modelId
  try {
    await updateAiConfigFields(configId, { model_preset_id: option.id, model: option.model })
    ctx.emit('modelChanged', { aiConfigId: configId, model: option.model, modelPresetId: option.id })
    await ctx.dialogs.alert({ message: `已切换到 ${option.name || option.model}`, type: 'success' })
  } catch (error: any) {
    ctx.state.selectedModelId.value = previousId
    await ctx.dialogs.alert({ message: error?.message || '模型切换失败', type: 'error' })
  } finally {
    ctx.state.modelSwitching.value = false
  }
}

export const useChatAiConfig = (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
  emit: ChatInterfaceEmitFn,
  dialogs: ChatDialogFns,
) => {
  let externalControlPollTimer: number | null = null
  const stopExternalControlPolling = () => {
    if (externalControlPollTimer === null) return
    window.clearInterval(externalControlPollTimer)
    externalControlPollTimer = null
  }
  const syncExternalControlPolling = () => {
    stopExternalControlPolling()
    if (!state.externalControlMode.value) return
    externalControlPollTimer = window.setInterval(() => void loadExternalControlEvents(props, state), 3000)
  }
  onBeforeUnmount(stopExternalControlPolling)
  return {
    modelOptions: state.modelOptions,
    selectedModelId: state.selectedModelId,
    modelSwitching: state.modelSwitching,
    configuredFrontPrompt: state.configuredFrontPrompt,
    externalControlMode: state.externalControlMode,
    externalControlEvents: state.externalControlEvents,
    externalControlError: state.externalControlError,
    loadConfiguredFrontPrompt: () => loadConfiguredFrontPrompt(props, state, syncExternalControlPolling),
    loadExternalControlEvents: () => loadExternalControlEvents(props, state),
    syncExternalControlPolling,
    stopExternalControlPolling,
    switchConversationModel: (modelId: string) => switchConversationModel({ props, state, emit, dialogs }, modelId),
    externalEventResultText: (event: ExternalControlEvent) => {
      try { return JSON.stringify(event.result ?? {}, null, 2) } catch { return String(event.result ?? '') }
    },
  }
}

export type ChatAiConfigApi = ReturnType<typeof useChatAiConfig>
