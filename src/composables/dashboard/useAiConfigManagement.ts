import { ref, watch, type Ref } from 'vue'
import type { Agent, McpToolDefinition, ModelPreset } from '@/types'
import { getAuthToken } from '@/api/http'
import { listMcpTools } from '@/api/mcp'
import {
  createAiConfig,
  deleteAiConfig as apiDeleteAiConfig,
  listAiConfigs,
  updateAiConfig,
} from '@/api/ai'
import {
  applyLoadedConfig,
  buildAiConfigPayload,
  buildAiForm,
  buildEditForm,
  mapMcpToolRows,
} from './useAiConfigManagementHelpers'

type SettingsSection = 'mcp' | 'bot' | 'appearance'

interface UseAiConfigManagementOptions {
  defaultMcpTools: string[]
  mcpToolMetaByName: Ref<Record<string, McpToolDefinition>>
  modelPresets: Ref<ModelPreset[]>
  normalizeSystemAutoControl: (raw: unknown) => any
  alert?: (options: { title?: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }) => Promise<void>
  onReloadAgents: () => Promise<void>
}

export const useAiConfigManagement = (options: UseAiConfigManagementOptions) => {
  const {
    defaultMcpTools,
    mcpToolMetaByName,
    modelPresets,
    normalizeSystemAutoControl,
    alert,
    onReloadAgents,
  } = options

  const aiConfigModalOpen = ref(false)
  const aiConfigDeleteConfirm = ref(false)
  const aiConfigSettingsSection = ref<SettingsSection | ''>('')
  const aiConfigMode = ref<'create' | 'edit'>('create')
  const aiConfigForm = ref<any>(null)
  const availableMcpTools = ref<string[]>([])

  const loadMcpTools = async () => {
    if (!getAuthToken()) return
    try {
      const rows = mapMcpToolRows(await listMcpTools())
      const map: Record<string, McpToolDefinition> = {}
      for (const row of rows) map[row.name] = row
      mcpToolMetaByName.value = map
      const tools = Array.from(new Set(rows.map(item => item.name)))
      availableMcpTools.value = tools.length > 0 ? tools : [...defaultMcpTools]
    } catch {
      // catalog is optional on first paint
    }
  }

  const toggleAiConfigSettingsSection = (section: SettingsSection) => {
    aiConfigSettingsSection.value = aiConfigSettingsSection.value === section ? '' : section
  }

  const openCreateAiConfig = async (role: 'worker' = 'worker') => {
    aiConfigMode.value = 'create'
    aiConfigDeleteConfirm.value = false
    aiConfigSettingsSection.value = ''
    if (!availableMcpTools.value.length) {
      try { await loadMcpTools() } catch { /* fallback defaults */ }
    }
    aiConfigForm.value = {
      ...buildAiForm(role, modelPresets.value),
      system_auto_control: normalizeSystemAutoControl({}),
    }
    aiConfigModalOpen.value = true
  }

  const loadAiConfigDetail = async (id?: number) => {
    if (!id || !getAuthToken() || !aiConfigForm.value) return
    try {
      const cfg = (await listAiConfigs()).find((row: any) => row.id === id)
      if (!cfg) return
      aiConfigForm.value = applyLoadedConfig(aiConfigForm.value, cfg, modelPresets.value, normalizeSystemAutoControl)
    } catch {
      // keep the optimistic form
    }
  }

  const openAgentSettings = (agent: Agent) => {
    aiConfigMode.value = 'edit'
    aiConfigDeleteConfirm.value = false
    aiConfigSettingsSection.value = ''
    aiConfigForm.value = buildEditForm(agent, modelPresets.value, normalizeSystemAutoControl)
    aiConfigModalOpen.value = true
    void loadAiConfigDetail(agent.aiConfigId)
  }

  const saveAiConfig = async () => {
    if (!aiConfigForm.value || !getAuthToken()) return false
    const { payload, selectedPreset } = buildAiConfigPayload(
      aiConfigForm.value,
      modelPresets.value,
      normalizeSystemAutoControl,
    )
    if (!selectedPreset) {
      await alert?.({ title: '保存失败', message: '请先选择一个已保存的服务器模型。', type: 'warning' })
      return false
    }
    try {
      if (aiConfigMode.value === 'create') {
        await createAiConfig(payload)
      } else if (aiConfigForm.value.id) {
        await updateAiConfig(aiConfigForm.value.id, payload)
      }
    } catch (err) {
      await alert?.({ title: '保存失败', message: (err as Error)?.message || 'AI 配置保存失败，请检查配置后重试。', type: 'error' })
      return false
    }
    aiConfigModalOpen.value = false
    await onReloadAgents()
    await alert?.({ title: '保存成功', message: 'AI 配置已保存。', type: 'success' })
    return true
  }

  const deleteAiConfig = async () => {
    if (!aiConfigForm.value?.id || !getAuthToken()) return
    try { await apiDeleteAiConfig(aiConfigForm.value.id) } catch { /* best-effort */ }
    aiConfigModalOpen.value = false
    aiConfigDeleteConfirm.value = false
    await onReloadAgents()
  }

  watch(modelPresets, presets => {
    if (!aiConfigForm.value || aiConfigForm.value.model_preset_id) return
    aiConfigForm.value.model_preset_id = presets[0]?.id || ''
    aiConfigForm.value.model = presets[0]?.model || ''
  }, { deep: true })

  return {
    aiConfigModalOpen,
    aiConfigDeleteConfirm,
    aiConfigSettingsSection,
    aiConfigMode,
    aiConfigForm,
    availableMcpTools,
    loadMcpTools,
    toggleAiConfigSettingsSection,
    openCreateAiConfig,
    openAgentSettings,
    saveAiConfig,
    deleteAiConfig,
  }
}
