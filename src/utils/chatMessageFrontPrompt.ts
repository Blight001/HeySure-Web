import {
  renderGroupedMcpToolCatalog,
  stripPromptSection,
  type McpCatalogToolGroup,
} from '@/utils/mcpToolCatalog'
import type { ConversationMessage } from '@/utils/chatMessageNormalize'

export interface FrontPromptToolState {
  tools: FrontPromptTool[]
  groups: McpCatalogToolGroup[]
  scope: string
  mcpEnabled: boolean | null
  error: string
}

export interface FrontPromptTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  destructive: boolean
  mcpSource: string
  allowedForCurrentAi: boolean
}

const SOURCE_RANK: Record<string, number> = { server: 0, desktop: 1, browser: 2 }

export const normalizePromptTool = (tool: any): FrontPromptTool => ({
  name: String(tool?.name || '').trim(),
  description: String(tool?.description || '').trim(),
  inputSchema: (tool?.inputSchema && typeof tool.inputSchema === 'object') ? tool.inputSchema : {},
  destructive: !!tool?.destructive,
  mcpSource: tool?.mcpSource || 'server',
  allowedForCurrentAi: tool?.allowedForCurrentAi !== false,
})

export const sortPromptTools = (items: any[]) =>
  [...items]
    .map(normalizePromptTool)
    .filter(tool => tool.name)
    .sort((a, b) => {
      const ar = SOURCE_RANK[a.mcpSource] ?? 9
      const br = SOURCE_RANK[b.mcpSource] ?? 9
      if (ar !== br) return ar - br
      return a.name.localeCompare(b.name)
    })

export const normalizePromptToolGroup = (group: any): McpCatalogToolGroup => ({
  groupKey: String(group?.groupKey || '').trim(),
  groupLabel: String(group?.groupLabel || '').trim(),
  groupDescription: String(group?.groupDescription || '').trim() || undefined,
  groupKind: group?.groupKind === 'device' ? 'device' : 'workspace',
  deviceId: String(group?.deviceId || '').trim() || undefined,
  deviceType: String(group?.deviceType || '').trim() || undefined,
  tools: sortPromptTools(Array.isArray(group?.tools) ? group.tools : []),
})

export const emptyFrontPromptToolState = (error = ''): FrontPromptToolState => ({
  tools: [],
  groups: [],
  scope: '',
  mcpEnabled: null,
  error,
})

export const parseFrontPromptToolResponse = (response: any, aiConfigId?: number): FrontPromptToolState => {
  const tools = Array.isArray(response?.tools) ? response.tools : []
  const promptTools = Array.isArray(response?.promptTools) ? response.promptTools : []
  const endpointToolDefs = Array.isArray(response?.endpointToolDefs) ? response.endpointToolDefs : []
  const groups = Array.isArray(response?.promptToolGroups) ? response.promptToolGroups : []
  return {
    tools: sortPromptTools(promptTools.length > 0
      ? promptTools
      : [
          ...tools.map((tool: any) => ({ ...tool, mcpSource: 'server' })),
          ...endpointToolDefs,
        ]),
    groups: groups.map(normalizePromptToolGroup).filter((group: McpCatalogToolGroup) => group.groupLabel),
    scope: String(response?.promptToolsScope || (aiConfigId ? 'current_ai' : 'all_current')),
    mcpEnabled: typeof response?.promptToolsMcpEnabled === 'boolean' ? response.promptToolsMcpEnabled : null,
    error: '',
  }
}

const fallbackCatalogGroups = (tools: FrontPromptTool[]): McpCatalogToolGroup[] => {
  const serverTools = tools.filter(tool => (tool.mcpSource || 'server') === 'server')
  const deviceTools = tools.filter(tool => (tool.mcpSource || 'server') !== 'server')
  return [
    { groupKey: 'workspace', groupLabel: '工作区 MCP', groupKind: 'workspace', tools: serverTools },
    { groupKey: 'device:fallback', groupLabel: '端侧设备 MCP', groupKind: 'device', tools: deviceTools },
  ]
}

export const buildFrontPromptCatalogText = (state: FrontPromptToolState) => {
  if (state.mcpEnabled === false) return '- （MCP 未启用）'
  if (state.error) return `- （工具目录加载失败：${state.error}）`
  if (state.groups.length > 0) return renderGroupedMcpToolCatalog(state.groups)
  return renderGroupedMcpToolCatalog(fallbackCatalogGroups(state.tools))
}

export const buildFrontPromptBodyText = (prompt: string) =>
  stripPromptSection(stripPromptSection(prompt, '动态 MCP 说明'), '可用MCP工具')

export const resolveEffectiveFrontPrompt = (
  explicit: string,
  recorded: string,
  preview: string,
) => String(explicit || '').trim() || recorded || preview || ''

export const buildFrontPromptMessage = (
  sessionActive: boolean,
  showFrontPrompt: boolean,
  showPlaceholder: boolean,
  prompt: string,
  placeholder: string,
  details: string,
): ConversationMessage | null => {
  if (!showFrontPrompt || !sessionActive) return null
  if (!prompt && !showPlaceholder) return null
  const content = prompt
    ? `[前置 Prompt]\n${buildFrontPromptBodyText(prompt) || prompt}`
    : `[前置 Prompt]\n${placeholder}`
  return {
    id: -2,
    role: 'system',
    content,
    display_text: content,
    front_prompt_details: details,
  }
}
