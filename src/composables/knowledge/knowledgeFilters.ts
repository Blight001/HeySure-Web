import type { KnowledgeEntryItem } from '@/api/librarian'
import { getMcpToolZhLabel } from '@/utils/mcpTools'
import { deviceDisplayLabel, inheritanceToolKey } from './knowledgeFormat'
import type {
  DetailPresentation,
  InheritanceSkillDevice,
  InheritanceThoughtItem,
  InheritanceToolTab,
  IntrinsicPersonaAgent,
  KnowledgeItem,
  SystemPromptSection,
  ThoughtEndpointFilter,
} from './types'

export function normalizeDetailQuery(query: string) {
  return query.trim().toLocaleLowerCase()
}

export function includesDetailQuery(query: string, ...values: unknown[]) {
  if (!query) return true
  return values.some(value => String(value ?? '').toLocaleLowerCase().includes(query))
}

export function filterPersonaAgents(agents: IntrinsicPersonaAgent[], query: string) {
  return agents.filter(agent => includesDetailQuery(
    query,
    agent.name,
    agent.description,
    agent.role,
    agent.digital_member_role,
    agent.platform,
    agent.model,
  ))
}

export function filterPromptSections(sections: SystemPromptSection[], query: string) {
  if (!query) return sections
  return sections
    .map(section => matchPromptSection(section, query))
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
}

function matchPromptSection(section: SystemPromptSection, query: string) {
  if (includesDetailQuery(query, section.title, section.key)) return section
  const items = section.items.filter(item => includesDetailQuery(query, item.label, item.key, item.content))
  return items.length ? { ...section, items, count: items.length } : null
}

export function filterInheritanceDevices(devices: InheritanceSkillDevice[], query: string) {
  if (!query) return devices
  return devices
    .map(device => matchInheritanceDevice(device, query))
    .filter((device): device is NonNullable<typeof device> => Boolean(device))
}

function matchInheritanceDevice(device: InheritanceSkillDevice, query: string) {
  const deviceMatches = includesDetailQuery(
    query,
    device.device_id,
    device.device_type,
    deviceDisplayLabel(device),
  )
  if (deviceMatches) return device
  const tools = device.tools.filter(tool => includesDetailQuery(
    query,
    tool.name,
    getMcpToolZhLabel(tool.name),
    tool.description,
  ))
  return tools.length ? { ...device, tools, tool_count: tools.length } : null
}

export function filterInstalledThoughts(
  installed: InheritanceThoughtItem[],
  query: string,
  endpointFilter: ThoughtEndpointFilter,
) {
  return installed.filter(skill => {
    const endpointMatches = endpointFilter === 'all'
      || String(skill.endpoint_kind || 'any') === endpointFilter
    return endpointMatches && includesDetailQuery(
      query,
      skill.displayName,
      skill.slug,
      skill.summary,
      skill.ownerHandle,
      skill.version,
    )
  })
}

export function buildInheritanceToolTabs(devices: InheritanceSkillDevice[]): InheritanceToolTab[] {
  return devices.flatMap(device =>
    device.tools.map(tool => ({
      key: inheritanceToolKey(device, tool),
      device,
      tool,
    })),
  )
}

export function pickInheritanceToolTab(tabs: InheritanceToolTab[], activeKey: string) {
  return tabs.find(item => item.key === activeKey) || tabs[0] || null
}

export function pickPromptSection(sections: SystemPromptSection[], activeKey: string) {
  return sections.find(section => section.key === activeKey) || sections[0] || null
}

export function pickPromptItem(section: SystemPromptSection | null, activeKey: string) {
  return section?.items.find(item => item.key === activeKey) || section?.items[0] || null
}

export function findDetailAgent(agents: IntrinsicPersonaAgent[], personaId: number | null) {
  return agents.find(agent => agent.id === personaId) || null
}

type PresentationInput = {
  currentDetail: KnowledgeEntryItem | null
  selectedItem: KnowledgeItem | null
  filteredPersonaCount: number
  visiblePromptCount: number
  visibleToolCount: number
  filteredThoughtCount: number
}

export function buildDetailPresentation(input: PresentationInput): DetailPresentation {
  const personas = input.currentDetail?.intrinsic_personas
  if (personas) return personaPresentation(input, personas)
  const prompts = input.currentDetail?.system_prompts
  if (prompts) return promptPresentation(input, prompts)
  const skills = input.currentDetail?.inheritance_skills
  if (skills) return skillsPresentation(input, skills)
  const thoughts = input.currentDetail?.inheritance_tools
  if (thoughts) return thoughtsPresentation(input, thoughts)
  return entryPresentation(input)
}

function firstText(values: Array<string | null | undefined>, fallback: string) {
  const hit = values.find(value => Boolean(value))
  return hit == null ? fallback : hit
}

function detailTitle(input: PresentationInput, fallback: string) {
  return firstText([input.currentDetail?.title, input.selectedItem?.title], fallback)
}

function personaPresentation(
  input: PresentationInput,
  personas: NonNullable<KnowledgeEntryItem['intrinsic_personas']>,
): DetailPresentation {
  return {
    eyebrow: '知识库 · 固有配置',
    title: detailTitle(input, '固有人格'),
    description: firstText([input.currentDetail?.summary, personas.description], ''),
    icon: 'robot',
    searchPlaceholder: '搜索 AI、角色、平台或模型',
    resultText: `${input.filteredPersonaCount} / ${personas.total} 个 AI`,
  }
}

function promptPresentation(
  input: PresentationInput,
  prompts: NonNullable<KnowledgeEntryItem['system_prompts']>,
): DetailPresentation {
  return {
    eyebrow: '知识库 · 系统配置',
    title: detailTitle(input, '固有思想'),
    description: firstText([input.currentDetail?.summary, prompts.description], ''),
    icon: 'compass',
    searchPlaceholder: '搜索配置项、键名或提示词内容',
    resultText: `${input.visiblePromptCount} / ${prompts.total} 项配置`,
  }
}

function skillsPresentation(
  input: PresentationInput,
  skills: NonNullable<KnowledgeEntryItem['inheritance_skills']>,
): DetailPresentation {
  return {
    eyebrow: '知识库 · 能力目录',
    title: detailTitle(input, '传承技能'),
    description: skills.description,
    icon: 'bolt',
    searchPlaceholder: '搜索设备、MCP 名称或工具描述',
    resultText: `${input.visibleToolCount} / ${skills.total} 个 MCP`,
  }
}

function thoughtsPresentation(
  input: PresentationInput,
  thoughts: NonNullable<KnowledgeEntryItem['inheritance_tools']>,
): DetailPresentation {
  return {
    eyebrow: '知识库 · 可复用经验',
    title: detailTitle(input, '传承思想'),
    description: thoughts.description,
    icon: 'dna',
    searchPlaceholder: '搜索名称、标识或简介',
    resultText: `${input.filteredThoughtCount} / ${thoughts.installed_total} 个本地快照`,
  }
}

function entryPresentation(input: PresentationInput): DetailPresentation {
  return {
    eyebrow: '知识库 · 条目详情',
    title: detailTitle(input, '知识库详情'),
    description: firstText([
      input.currentDetail?.summary,
      input.currentDetail?.memory_id,
      input.selectedItem?.id,
    ], ''),
    icon: 'book',
    searchPlaceholder: '',
    resultText: '',
  }
}
