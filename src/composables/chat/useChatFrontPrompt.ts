import { computed } from 'vue'
import * as chatApi from '@/api/chat'
import { listMcpTools } from '@/api/mcp'
import { getAuthToken } from '@/api/http'
import type { ChatInterfaceProps } from '@/types/chat'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'
import { normalizePromptToolGroup, sortPromptTools } from '@/utils/chatPromptTools'
import type { ChatWorkspaceState } from './useChatWorkspaceState'

const loadEffectiveSystemPromptPreview = async (state: ChatWorkspaceState, tools: string[]) => {
  state.effectiveSystemPromptPreview.value = ''
  state.frontPromptPreviewError.value = ''
  if (!getAuthToken()) return
  try {
    const data = await chatApi.getSystemPromptPreview(state.chatCtx.value, {
      sessionId: state.currentSessionId.value || undefined,
      selectedMcpTools: tools,
    })
    state.effectiveSystemPromptPreview.value = String(data?.prompt || '').trim()
  } catch (error: any) {
    state.frontPromptPreviewError.value = error?.message || 'Prompt 预览加载失败'
  }
}

const resetPromptToolState = (state: ChatWorkspaceState) => {
  state.frontPromptAvailableTools.value = []
  state.frontPromptToolGroups.value = []
  state.frontPromptToolScope.value = ''
  state.frontPromptToolMcpEnabled.value = null
  state.frontPromptToolSchemaError.value = ''
}

const applyPromptToolResponse = (state: ChatWorkspaceState, props: ChatInterfaceProps, response: any) => {
  const tools = Array.isArray(response.tools) ? response.tools : []
  const promptTools = Array.isArray(response.promptTools) ? response.promptTools : []
  const endpointToolDefs = Array.isArray(response.endpointToolDefs) ? response.endpointToolDefs : []
  state.frontPromptAvailableTools.value = sortPromptTools(promptTools.length > 0
    ? promptTools
    : [...tools.map((tool: any) => ({ ...tool, mcpSource: 'server' })), ...endpointToolDefs])
  const groups = Array.isArray(response.promptToolGroups) ? response.promptToolGroups : []
  state.frontPromptToolGroups.value = groups
    .map(normalizePromptToolGroup)
    .filter((group: McpCatalogToolGroup) => group.groupLabel)
  state.frontPromptToolScope.value = String(response.promptToolsScope || (props.aiConfigId ? 'current_ai' : 'all_current'))
  state.frontPromptToolMcpEnabled.value = typeof response.promptToolsMcpEnabled === 'boolean'
    ? response.promptToolsMcpEnabled
    : null
}

const loadFrontPromptToolSchemas = async (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  resetPromptToolState(state)
  if (!getAuthToken()) return
  try {
    applyPromptToolResponse(state, props, await listMcpTools({ aiConfigId: props.aiConfigId }))
  } catch (error: any) {
    state.frontPromptToolSchemaError.value = error?.message || 'MCP schema 加载失败'
  }
}

const groupToolNames = (group?: McpCatalogToolGroup) =>
  group?.tools.map(tool => String(tool.name || '').trim()).filter(Boolean) || []

const toggleToolGroup = (
  state: ChatWorkspaceState,
  groups: McpCatalogToolGroup[],
  groupKey: string,
  reload: () => void,
) => {
  const group = groups.find(item => item.groupKey === groupKey)
  if (group?.disabled) return
  const names = groupToolNames(group)
  const unchecked = new Set(state.uncheckedMcpToolNames.value)
  const allChecked = names.length > 0 && names.every(name => !unchecked.has(name))
  names.forEach(name => (allChecked ? unchecked.add(name) : unchecked.delete(name)))
  state.uncheckedMcpToolNames.value = [...unchecked]
  reload()
}

const toggleMcpTool = (state: ChatWorkspaceState, toolName: string, reload: () => void) => {
  const name = String(toolName || '').trim()
  if (!name) return
  const unchecked = new Set(state.uncheckedMcpToolNames.value)
  if (unchecked.has(name)) unchecked.delete(name)
  else unchecked.add(name)
  state.uncheckedMcpToolNames.value = [...unchecked]
  reload()
}

export const useChatFrontPrompt = (props: ChatInterfaceProps, state: ChatWorkspaceState) => {
  const attachableToolGroups = computed<McpCatalogToolGroup[]>(() => {
    if (state.frontPromptToolMcpEnabled.value === false) return []
    return state.frontPromptToolGroups.value.filter(group => group.tools.length > 0)
  })
  const selectedToolGroupKeys = computed(() => attachableToolGroups.value
    .filter(group => !group.disabled && group.tools.some(tool => !state.uncheckedMcpToolNames.value.includes(tool.name)))
    .map(group => group.groupKey))
  const checkedToolGroups = computed(() => attachableToolGroups.value
    .filter(group => selectedToolGroupKeys.value.includes(group.groupKey)))
  const selectedMcpToolNames = computed(() => Array.from(new Set(
    checkedToolGroups.value.flatMap(group => group.tools
      .map(tool => String(tool.name || '').trim())
      .filter(name => name && !state.uncheckedMcpToolNames.value.includes(name))),
  )))
  const reloadPreview = () => { void loadEffectiveSystemPromptPreview(state, selectedMcpToolNames.value) }
  return {
    attachableToolGroups,
    selectedToolGroupKeys,
    selectedMcpToolNames,
    loadEffectiveSystemPromptPreview: reloadPreview,
    loadFrontPromptToolSchemas: () => loadFrontPromptToolSchemas(props, state),
    toggleToolGroup: (groupKey: string) => toggleToolGroup(state, attachableToolGroups.value, groupKey, reloadPreview),
    toggleMcpTool: (toolName: string) => toggleMcpTool(state, toolName, reloadPreview),
    clearAttachments: (emitClearFiles: () => void) => {
      emitClearFiles()
      state.uncheckedMcpToolNames.value = attachableToolGroups.value.flatMap(group => groupToolNames(group))
      reloadPreview()
    },
  }
}

export type ChatFrontPromptApi = ReturnType<typeof useChatFrontPrompt>
