import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

const SOURCE_RANK: Record<string, number> = { server: 0, desktop: 1, browser: 2 }

export const normalizePromptTool = (tool: any) => ({
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
