import type { McpCatalogTool, McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

export interface UploadAttachmentItem {
  client_id: string
  file_ref?: string
  file_name: string
  mime_type: string
  bytes: number
  is_image: boolean
  preview_url?: string
  status: 'uploading' | 'ready'
}

export interface MentionCandidate {
  key: string
  type: 'tool' | 'file' | 'skill'
  label: string
  detail: string
  groupKey?: string
}

export interface SkillMentionCandidate {
  slug: string
  name: string
  summary: string
  triggers?: string[]
  risk?: string
}

const collectSkillMentionCandidates = (
  skills: SkillMentionCandidate[] | undefined,
  query: string,
) => (skills || [])
  .map<MentionCandidate>(skill => ({
    key: `skill:${skill.slug}`,
    type: 'skill',
    label: skill.name || skill.slug,
    detail: [skill.summary, skill.risk && `风险：${skill.risk}`].filter(Boolean).join('；'),
    groupKey: 'skills',
  }))
  .filter(item => !query || `${item.label} ${item.detail} ${item.key}`.toLowerCase().includes(query))

const toToolMentionCandidate = (
  group: McpCatalogToolGroup,
  tool: McpCatalogTool,
  query: string,
  seenTools: Set<string>,
): MentionCandidate | null => {
  const name = String(tool.name || '').trim()
  if (!name || seenTools.has(name)) return null
  const searchable = `${name} ${tool.description || ''} ${group.groupLabel || ''}`.toLowerCase()
  if (query && !searchable.includes(query)) return null
  seenTools.add(name)
  return {
    key: `tool:${name}`,
    type: 'tool',
    label: name,
    detail: [group.groupDescription, tool.description || group.groupLabel || 'MCP 工具']
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .join('；'),
    groupKey: group.groupKey,
  }
}

export const collectToolMentionCandidates = (
  toolGroups: McpCatalogToolGroup[] | undefined,
  query: string,
) => {
  const seenTools = new Set<string>()
  const tools: MentionCandidate[] = []
  for (const group of toolGroups || []) {
    if (group.disabled) continue
    for (const tool of group.tools || []) {
      const candidate = toToolMentionCandidate(group, tool, query, seenTools)
      if (candidate) tools.push(candidate)
    }
  }
  return tools
}

export const collectFileMentionCandidates = (
  allFiles: string[],
  selectableFileRoot: string | undefined,
  query: string,
) => {
  const selectableRoot = String(selectableFileRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return allFiles
    .map(path => String(path || '').replace(/\\/g, '/'))
    .filter(path => path && !path.endsWith('/'))
    .filter(path => !selectableRoot || path === selectableRoot || path.startsWith(`${selectableRoot}/`))
    .filter(path => !query || path.toLowerCase().includes(query))
    .map<MentionCandidate>(path => ({
      key: `file:${path}`,
      type: 'file',
      label: path.split('/').pop() || path,
      detail: path,
    }))
}

export const buildMentionCandidates = (
  open: boolean,
  toolGroups: McpCatalogToolGroup[] | undefined,
  allFiles: string[],
  selectableFileRoot: string | undefined,
  query: string,
  skills?: SkillMentionCandidate[],
) => {
  if (!open) return []
  return [
    ...collectSkillMentionCandidates(skills, query),
    ...collectToolMentionCandidates(toolGroups, query),
    ...collectFileMentionCandidates(allFiles, selectableFileRoot, query),
  ].slice(0, 10)
}
