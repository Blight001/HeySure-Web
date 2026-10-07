import { listAiConfigs, updateAiConfigFields } from '@/api/ai'
import { me } from '@/api/auth'
import { getAuthToken } from '@/api/http'
import type { ChatDialogFns, ChatInterfaceEmitFn, ChatInterfaceProps } from '@/types/chat'
import { parseModelOptions } from '@/utils/chatModelOptions'
import { listCodexModels, type CodexModelRow } from '@/api/codex'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const codexOptions = (rows: CodexModelRow[]) => rows
  .filter(row => row?.id && row?.deviceId)
  .map(row => ({
    id: `codex:${row.deviceId}:${row.id}`,
    model: String(row.id),
    name: String(row.displayName || row.name || row.id),
    source: 'codex' as const,
    provider: row.provider || 'codex',
    deviceId: String(row.deviceId),
    deviceName: String(row.deviceName || row.deviceId),
    devicePlatform: row.devicePlatform,
    online: row.online,
  }))

const applyAiConfigRow = (state: ChatWorkspaceState, cfg: any, currentUser: any, codexModels: CodexModelRow[] = []) => {
  state.modelOptions.value = [
    ...parseModelOptions(currentUser?.model_presets).map(option => ({ ...option, source: 'preset' as const })),
    ...codexOptions(codexModels),
  ]
  const configuredPresetId = String(cfg?.model_preset_id || '').trim()
  state.selectedModelId.value = state.modelOptions.value.some(option => option.id === configuredPresetId)
    ? configuredPresetId
    : (state.modelOptions.value.find(option => option.model === String(cfg?.model || ''))?.id || '')
  state.configuredFrontPrompt.value = String(cfg?.prompt || '').trim()
}

const resetAiConfigState = (state: ChatWorkspaceState) => {
  state.configuredFrontPrompt.value = ''
  state.modelOptions.value = []
  state.selectedModelId.value = ''
}

const loadConfiguredFrontPrompt = async (
  props: ChatInterfaceProps,
  state: ChatWorkspaceState,
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
  let codexModels: CodexModelRow[] = []
  try {
    const result = await listCodexModels()
    codexModels = Array.isArray(result?.models) ? result.models : []
  } catch {
    // Codex is optional: keep normal model presets usable when no device is connected.
  }
  const cfg = (Array.isArray(rows) ? rows : []).find((row: any) => Number(row?.id) === Number(props.aiConfigId))
  applyAiConfigRow(state, cfg, currentUser, codexModels)
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
    if (option.source === 'codex') {
      ctx.emit('modelChanged', { aiConfigId: configId, model: option.model, modelPresetId: option.id })
      await ctx.dialogs.alert({ message: `已选择 Codex · ${option.name}（设备：${option.deviceName || option.deviceId}）`, type: 'success' })
      return
    }
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
  return {
    modelOptions: state.modelOptions,
    selectedModelId: state.selectedModelId,
    modelSwitching: state.modelSwitching,
    configuredFrontPrompt: state.configuredFrontPrompt,
    loadConfiguredFrontPrompt: () => loadConfiguredFrontPrompt(props, state),
    switchConversationModel: (modelId: string) => switchConversationModel({ props, state, emit, dialogs }, modelId),
  }
}

export type ChatAiConfigApi = ReturnType<typeof useChatAiConfig>
