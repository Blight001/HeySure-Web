import { computed, ref } from 'vue'
import { me } from '@/api/auth'
import { getAuthToken } from '@/api/http'
import { readEntry, saveIntrinsicProperties } from '@/api/librarian'
import type { InheritanceMcpTestResult } from '@/api/mcp'
import type { ModelPreset } from '@/types'
import {
  inheritanceToolKey,
  normalizeModelPresets,
  pickMcpTestInputSchema,
  toolParameters,
} from './knowledgeFormat'
import {
  buildInheritanceToolTabs,
  filterInheritanceDevices,
  normalizeDetailQuery,
  pickInheritanceToolTab,
} from './knowledgeFilters'
import type {
  InheritanceServerCategory,
  InheritanceSkillDevice,
  InheritanceSkillTool,
  KnowledgeShared,
  McpTestTarget,
  PropertyDraftTool,
} from './types'

export function createInheritanceState() {
  return {
    editingPropertyCategory: ref<string | null>(null),
    savingPropertyCategory: ref<string | null>(null),
    propertyEditError: ref(''),
    propertyEditNotice: ref(''),
    propertyDraftTools: ref<PropertyDraftTool[]>([]),
    activeInheritanceToolKey: ref(''),
    mcpTestModalOpen: ref(false),
    mcpTestTarget: ref<McpTestTarget | null>(null),
    mcpTestPresetLoading: ref(false),
    mcpTestSubmitting: ref(false),
    mcpTestError: ref(''),
    mcpTestNotice: ref(''),
    mcpTestPresetOptions: ref<ModelPreset[]>([]),
    mcpTestSelectedPresetId: ref(''),
    mcpTestUserHint: ref(''),
    mcpTestResult: ref<InheritanceMcpTestResult | null>(null),
    mcpTestDirectArgs: ref('{}'),
    mcpTestDirectResult: ref<any>(null),
    mcpTestDirectLoading: ref(false),
    mcpTestDirectError: ref(''),
  }
}

export type InheritanceState = ReturnType<typeof createInheritanceState>

export async function selectInheritanceToolTab(
  state: InheritanceState,
  shared: KnowledgeShared,
  key: string,
  currentKey?: string,
) {
  if (currentKey === key) return
  if (state.editingPropertyCategory.value) {
    const ok = await shared.confirm({
      message: '当前工具说明还有未保存的修改，确认切换工具吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
    cancelEditPropertyCategory(state)
  }
  state.activeInheritanceToolKey.value = key
  state.propertyEditError.value = ''
  state.propertyEditNotice.value = ''
}

export function startEditPropertyCategory(state: InheritanceState, category: InheritanceServerCategory) {
  state.editingPropertyCategory.value = category.namespace
  state.propertyEditError.value = ''
  state.propertyEditNotice.value = ''
  state.propertyDraftTools.value = (category.tools || []).map(tool => ({
    name: tool.name,
    description: tool.description || '',
    parameters: toolParameters(tool).map(param => ({
      name: param.name,
      description: param.description || '',
    })),
  }))
}

export function cancelEditPropertyCategory(state: InheritanceState) {
  state.editingPropertyCategory.value = null
  state.propertyEditError.value = ''
  state.propertyDraftTools.value = []
}

export function updateDraftToolDescription(state: InheritanceState, toolName: string, value: string) {
  state.propertyDraftTools.value = state.propertyDraftTools.value.map(tool =>
    tool.name === toolName ? { ...tool, description: value } : tool,
  )
}

export function updateDraftParamDescription(
  state: InheritanceState,
  toolName: string,
  paramName: string,
  value: string,
) {
  state.propertyDraftTools.value = state.propertyDraftTools.value.map(tool => {
    if (tool.name !== toolName) return tool
    return {
      ...tool,
      parameters: tool.parameters.map(param =>
        param.name === paramName ? { ...param, description: value } : param,
      ),
    }
  })
}

export function propertyDraftTool(state: InheritanceState, toolName: string) {
  return state.propertyDraftTools.value.find(tool => tool.name === toolName)
}

export function propertyDraftToolDescription(state: InheritanceState, toolName: string) {
  return propertyDraftTool(state, toolName)?.description ?? ''
}

export function propertyDraftParamDescription(state: InheritanceState, toolName: string, paramName: string) {
  return propertyDraftTool(state, toolName)?.parameters.find(param => param.name === paramName)?.description ?? ''
}

export async function savePropertyCategory(
  state: InheritanceState,
  shared: KnowledgeShared,
  category: InheritanceServerCategory,
) {
  state.savingPropertyCategory.value = category.namespace
  state.propertyEditError.value = ''
  state.propertyEditNotice.value = ''
  try {
    const token = getAuthToken()
    await saveIntrinsicProperties(token, state.propertyDraftTools.value)
    const memoryId = shared.currentDetail.value?.memory_id || shared.selectedItem.value?.id
    if (memoryId) {
      shared.currentDetail.value = await readEntry(token, memoryId)
    }
    state.editingPropertyCategory.value = null
    state.propertyDraftTools.value = []
    state.propertyEditNotice.value = `${category.namespace} 已保存`
  } catch (err) {
    state.propertyEditError.value = (err as Error).message || '保存失败'
  } finally {
    state.savingPropertyCategory.value = null
  }
}

export async function loadMcpTestPresetOptions(state: InheritanceState) {
  state.mcpTestPresetLoading.value = true
  state.mcpTestError.value = ''
  try {
    const user = await me()
    state.mcpTestPresetOptions.value = normalizeModelPresets(user.model_presets)
    state.mcpTestSelectedPresetId.value = state.mcpTestPresetOptions.value[0]?.id || ''
    if (!state.mcpTestPresetOptions.value.length) {
      state.mcpTestError.value = '未配置可用模型，请先在系统设置中添加模型预设'
    }
  } catch (err) {
    state.mcpTestError.value = (err as Error).message || '模型列表加载失败'
    state.mcpTestPresetOptions.value = []
    state.mcpTestSelectedPresetId.value = ''
  } finally {
    state.mcpTestPresetLoading.value = false
  }
}

export async function openMcpTestModal(
  state: InheritanceState,
  device: InheritanceSkillDevice,
  tool: InheritanceSkillTool,
) {
  state.mcpTestTarget.value = { device, tool }
  state.mcpTestUserHint.value = ''
  state.mcpTestError.value = ''
  state.mcpTestNotice.value = ''
  state.mcpTestResult.value = null
  state.mcpTestDirectArgs.value = '{}'
  state.mcpTestDirectResult.value = null
  state.mcpTestDirectError.value = ''
  state.mcpTestModalOpen.value = true
  await loadMcpTestPresetOptions(state)
}

export function closeMcpTestModal(state: InheritanceState) {
  state.mcpTestModalOpen.value = false
  state.mcpTestTarget.value = null
  state.mcpTestPresetOptions.value = []
  state.mcpTestSelectedPresetId.value = ''
  state.mcpTestUserHint.value = ''
  state.mcpTestResult.value = null
  state.mcpTestError.value = ''
  state.mcpTestNotice.value = ''
  state.mcpTestSubmitting.value = false
  state.mcpTestDirectArgs.value = '{}'
  state.mcpTestDirectResult.value = null
  state.mcpTestDirectLoading.value = false
  state.mcpTestDirectError.value = ''
}

export function pickInheritanceServerCategory(
  categories: InheritanceServerCategory[],
  toolName?: string,
) {
  if (!toolName) return null
  return categories.find(category => category.tools.some(tool => tool.name === toolName)) || null
}

export function useKnowledgeInheritance(shared: KnowledgeShared) {
  const state = createInheritanceState()
  const inheritanceSkills = computed(() => shared.currentDetail.value?.inheritance_skills || null)
  const inheritanceServerCategories = computed(() => inheritanceSkills.value?.server_categories || [])
  const inheritanceDevices = computed(() => inheritanceSkills.value?.devices || [])
  const filteredInheritanceDevices = computed(() => filterInheritanceDevices(
    inheritanceDevices.value,
    normalizeDetailQuery(shared.detailQuery.value),
  ))
  const filteredInheritanceToolTabs = computed(() => buildInheritanceToolTabs(filteredInheritanceDevices.value))
  const selectedInheritanceToolTab = computed(() => pickInheritanceToolTab(
    filteredInheritanceToolTabs.value,
    state.activeInheritanceToolKey.value,
  ))
  const selectedInheritanceServerCategory = computed(() => pickInheritanceServerCategory(
    inheritanceServerCategories.value,
    selectedInheritanceToolTab.value?.tool.name,
  ))
  const mcpTestInputSchema = computed(() => pickMcpTestInputSchema(state.mcpTestTarget.value))
  return {
    ...state,
    inheritanceSkills,
    inheritanceServerCategories,
    inheritanceDevices,
    filteredInheritanceDevices,
    filteredInheritanceToolTabs,
    selectedInheritanceToolTab,
    selectedInheritanceServerCategory,
    mcpTestInputSchema,
    inheritanceToolKey,
    selectInheritanceToolTab: (key: string) => selectInheritanceToolTab(
      state,
      shared,
      key,
      selectedInheritanceToolTab.value?.key,
    ),
    startEditPropertyCategory: (category: InheritanceServerCategory) => startEditPropertyCategory(state, category),
    cancelEditPropertyCategory: () => cancelEditPropertyCategory(state),
    updateDraftToolDescription: (toolName: string, value: string) =>
      updateDraftToolDescription(state, toolName, value),
    updateDraftParamDescription: (toolName: string, paramName: string, value: string) =>
      updateDraftParamDescription(state, toolName, paramName, value),
    propertyDraftToolDescription: (toolName: string) => propertyDraftToolDescription(state, toolName),
    propertyDraftParamDescription: (toolName: string, paramName: string) =>
      propertyDraftParamDescription(state, toolName, paramName),
    savePropertyCategory: (category: InheritanceServerCategory) => savePropertyCategory(state, shared, category),
    openMcpTestModal: (device: InheritanceSkillDevice, tool: InheritanceSkillTool) =>
      openMcpTestModal(state, device, tool),
    closeMcpTestModal: () => closeMcpTestModal(state),
  }
}
