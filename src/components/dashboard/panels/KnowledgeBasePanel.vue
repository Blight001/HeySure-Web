<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs } from 'vue'
import { formatDateMinute } from '@/utils/datetime'
import AppIcon from '@/components/common/AppIcon.vue'
import {
  deleteEntry,
  deleteInstalledClawHubSkill,
  installClawHubSkill,
  readInstalledClawHubSkill,
  readClawHubSkill,
  readEntry,
  saveIntrinsicProperties,
  saveSystemPrompts,
  searchClawHubSkills,
  setInstalledClawHubSkillEndpoint,
  updateInstalledClawHubSkill,
  updateEntry,
  type ClawHubInstalledSkillDetail,
  type ClawHubSkillDetail,
  type ClawHubSkillSearchResult,
  type KnowledgeEntryItem,
} from '@/api/librarian'
import { getAuthToken } from '@/api/http'
import { updateAiConfigFields } from '@/api/ai'
import { me } from '@/api/auth'
import type { InheritanceMcpTestResult } from '@/api/mcp'
import McpAiTestModal from '@/components/dashboard/modals/McpAiTestModal.vue'
import { useMessage } from '@/composables/useMessage'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { getMcpToolParamRows, getMcpToolZhLabel } from '@/utils/mcpTools'
import MarkdownText from '@/components/chat/MarkdownText.vue'
import type { McpToolDefinition } from '@/types'
import type { ModelPreset, User } from '@/types'

defineOptions({
  inheritAttrs: false,
})

interface KnowledgeItem {
  id: string
  title: string
  author: string
  time: string
  tags: string[]
}

interface Props {
  items: KnowledgeItem[]
  totalCount: number
  noGlass?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'refresh-user', user: User): void
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
}>()

const attrs = useAttrs()
const { confirm } = useMessage()
const rootAttrs = computed(() => {
  const { class: _class, ...rest } = attrs
  return rest
})
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailQuery = ref('')
const detailCloseButton = ref<HTMLButtonElement | null>(null)
const selectedItem = ref<KnowledgeItem | null>(null)
const currentDetail = ref<KnowledgeEntryItem | null>(null)
const detailHistory = ref<KnowledgeEntryItem[]>([])
const canGoBackDetail = computed(() => detailHistory.value.length > 0)
const savingPersonaId = ref<number | null>(null)
const personaEditError = ref('')
const personaEditNotice = ref('')
const personaDraftPrompt = ref('')
// 当前在固有人格栏目内展开的 AI。
const detailPersonaId = ref<number | null>(null)
const editingPropertyCategory = ref<string | null>(null)
const savingPropertyCategory = ref<string | null>(null)
const propertyEditError = ref('')
const propertyEditNotice = ref('')
const propertyDraftTools = ref<Array<{
  name: string
  description: string
  parameters: Array<{ name: string; description: string }>
}>>([])
const editingPromptSection = ref<string | null>(null)
const activePromptSectionKey = ref('')
const activePromptItemKey = ref('')
const savingPromptSection = ref<string | null>(null)
const promptEditError = ref('')
const promptEditNotice = ref('')
const promptDraftItems = ref<Array<{ key: string; content: string | number }>>([])
const activeInheritanceToolKey = ref('')
const clawhubQuery = ref('')
const clawhubModalOpen = ref(false)
const clawhubSearching = ref(false)
const clawhubError = ref('')
const clawhubNotice = ref('')
const clawhubResults = ref<ClawHubSkillSearchResult[]>([])
const clawhubDetailLoading = ref(false)
const clawhubInspectingSlug = ref('')
const clawhubSelected = ref<ClawHubSkillDetail | null>(null)
const clawhubInstallingSlug = ref('')
const installedClawhubModalOpen = ref(false)
const installedClawhubLoading = ref(false)
const installedClawhubSaving = ref(false)
const installedClawhubDeleting = ref(false)
const installedClawhubError = ref('')
const installedClawhubNotice = ref('')
const installedClawhubSelected = ref<ClawHubInstalledSkillDetail | null>(null)
const installedClawhubDraft = ref('')
const installedClawhubEditMode = ref(false)
const installedKnowledgeMemoryId = ref('')
const installedClawhubIsKnowledge = computed(() => Boolean(installedKnowledgeMemoryId.value))

const stripSkillFrontmatter = (raw: string) => {
  const text = String(raw || '')
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end < 0) return text
  return text.slice(end + 4).replace(/^\s+/, '')
}

const installedClawhubPreview = computed(() => stripSkillFrontmatter(installedClawhubDraft.value))
// 传承思想端归类：安装时选择 + 已装列表筛选 + 改端。
const installEndpointKind = ref<'auto' | 'any' | 'desktop' | 'browser'>('auto')
const thoughtEndpointFilter = ref<'all' | 'any' | 'desktop' | 'browser'>('all')
const installedEndpointSaving = ref(false)

const ENDPOINT_LABELS: Record<string, string> = { any: '通用', desktop: '桌面端', browser: '浏览器端' }
const endpointLabel = (kind?: string | null) => ENDPOINT_LABELS[String(kind || 'any')] || '通用'
const deviceTypeLabel = (kind?: string | null) => ({
  server: '服务端（系统内置）',
  desktop: '桌面设备',
  browser: '浏览器设备',
  linux: 'Linux 设备',
}[String(kind || '').toLowerCase()] || String(kind || '端侧设备'))
const detailContent = computed(() => currentDetail.value?.body || currentDetail.value?.summary || '（无内容）')
const intrinsicPersonas = computed(() => currentDetail.value?.intrinsic_personas || null)
const detailAgent = computed(() =>
  intrinsicPersonas.value?.agents.find(agent => agent.id === detailPersonaId.value) || null,
)
const personaHasUnsavedChanges = computed(() => Boolean(
  detailAgent.value && personaDraftPrompt.value !== (detailAgent.value.prompt || ''),
))
const systemPrompts = computed(() => currentDetail.value?.system_prompts || null)
const inheritanceSkills = computed(() => currentDetail.value?.inheritance_skills || null)
const inheritanceServerCategories = computed(() => inheritanceSkills.value?.server_categories || [])
// 传承技能中服务端固定工具以独立设备形式展示：toolbox（工具箱）、library（图书管理工具） + 真实在线端设备。
const inheritanceDevices = computed(() =>
  (inheritanceSkills.value?.devices || []),
)

const inheritanceThoughts = computed(() => currentDetail.value?.inheritance_tools || null)

const normalizedDetailQuery = computed(() => detailQuery.value.trim().toLocaleLowerCase())
const includesDetailQuery = (...values: unknown[]) => {
  const query = normalizedDetailQuery.value
  if (!query) return true
  return values.some(value => String(value ?? '').toLocaleLowerCase().includes(query))
}

const filteredPersonaAgents = computed(() => {
  const agents = intrinsicPersonas.value?.agents || []
  return agents.filter(agent => includesDetailQuery(
    agent.name,
    agent.description,
    agent.role,
    agent.digital_member_role,
    agent.platform,
    agent.model,
  ))
})

const filteredPromptSections = computed(() => {
  const sections = systemPrompts.value?.sections || []
  if (!normalizedDetailQuery.value) return sections
  return sections
    .map(section => {
      if (includesDetailQuery(section.title, section.key)) return section
      const items = section.items.filter(item => includesDetailQuery(item.label, item.key, item.content))
      return items.length ? { ...section, items, count: items.length } : null
    })
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
})

const selectedPromptSection = computed(() =>
  filteredPromptSections.value.find(section => section.key === activePromptSectionKey.value)
  || filteredPromptSections.value[0]
  || null,
)

const selectedPromptItem = computed(() =>
  selectedPromptSection.value?.items.find(item => item.key === activePromptItemKey.value)
  || selectedPromptSection.value?.items[0]
  || null,
)

const filteredInheritanceDevices = computed(() => {
  const devices = inheritanceDevices.value
  if (!normalizedDetailQuery.value) return devices
  return devices
    .map(device => {
      const deviceMatches = includesDetailQuery(
        device.device_id,
        device.device_type,
        deviceDisplayLabel(device),
      )
      if (deviceMatches) return device
      const tools = device.tools.filter(tool => includesDetailQuery(
        tool.name,
        getMcpToolZhLabel(tool.name),
        tool.description,
      ))
      return tools.length ? { ...device, tools, tool_count: tools.length } : null
    })
    .filter((device): device is NonNullable<typeof device> => Boolean(device))
})

const filteredInstalledThoughts = computed(() => {
  const installed = inheritanceThoughts.value?.installed || []
  return installed.filter(skill => {
    const endpointMatches = thoughtEndpointFilter.value === 'all'
      || String(skill.endpoint_kind || 'any') === thoughtEndpointFilter.value
    return endpointMatches && includesDetailQuery(
      skill.displayName,
      skill.slug,
      skill.summary,
      skill.ownerHandle,
      skill.version,
    )
  })
})

const detailPresentation = computed(() => {
  if (intrinsicPersonas.value) {
    return {
      eyebrow: '知识库 · 固有配置',
      title: currentDetail.value?.title || selectedItem.value?.title || '固有人格',
      description: currentDetail.value?.summary || intrinsicPersonas.value.description,
      icon: 'robot' as const,
      searchPlaceholder: '搜索 AI、角色、平台或模型',
      resultText: `${filteredPersonaAgents.value.length} / ${intrinsicPersonas.value.total} 个 AI`,
    }
  }
  if (systemPrompts.value) {
    const total = systemPrompts.value.total
    const visible = filteredPromptSections.value.reduce((sum, section) => sum + section.items.length, 0)
    return {
      eyebrow: '知识库 · 系统配置',
      title: currentDetail.value?.title || selectedItem.value?.title || '固有思想',
      description: currentDetail.value?.summary || systemPrompts.value.description,
      icon: 'compass' as const,
      searchPlaceholder: '搜索配置项、键名或提示词内容',
      resultText: `${visible} / ${total} 项配置`,
    }
  }
  if (inheritanceSkills.value) {
    const visibleTools = filteredInheritanceDevices.value.reduce((sum, device) => sum + device.tools.length, 0)
    return {
      eyebrow: '知识库 · 能力目录',
      title: currentDetail.value?.title || selectedItem.value?.title || '传承技能',
      description: inheritanceSkills.value.description,
      icon: 'bolt' as const,
      searchPlaceholder: '搜索设备、MCP 名称或工具描述',
      resultText: `${visibleTools} / ${inheritanceSkills.value.total} 个 MCP`,
    }
  }
  if (inheritanceThoughts.value) {
    return {
      eyebrow: '知识库 · 可复用经验',
      title: currentDetail.value?.title || selectedItem.value?.title || '传承思想',
      description: inheritanceThoughts.value.description,
      icon: 'dna' as const,
      searchPlaceholder: '搜索名称、标识或简介',
      resultText: `${filteredInstalledThoughts.value.length} / ${inheritanceThoughts.value.installed_total} 个本地快照`,
    }
  }
  return {
    eyebrow: '知识库 · 条目详情',
    title: currentDetail.value?.title || selectedItem.value?.title || '知识库详情',
    description: currentDetail.value?.summary || currentDetail.value?.memory_id || selectedItem.value?.id || '',
    icon: 'book' as const,
    searchPlaceholder: '',
    resultText: '',
  }
})

const detailSearchVisible = computed(() => Boolean(
  intrinsicPersonas.value || systemPrompts.value || inheritanceSkills.value || inheritanceThoughts.value,
))

const installedEndpointKind = computed<'any' | 'desktop' | 'browser'>(() => {
  const kind = String(installedClawhubSelected.value?.skill?.endpoint_kind || 'any')
  return kind === 'desktop' || kind === 'browser' ? kind : 'any'
})

const toolParameters = (tool: {
  name?: string
  parameters?: Array<{ name: string; type: string; required: boolean; description: string }>
  inputSchema?: Record<string, any>
}) => {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {}
  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties as Record<string, any>
    : {}
  const fromApi = Array.isArray(tool.parameters) ? tool.parameters : []
  if (fromApi.length) {
    return fromApi.map(param => ({
      ...param,
      description: String(param.description || '').trim()
        || String(properties[param.name]?.description || '').trim(),
    }))
  }
  return getMcpToolParamRows({
    name: String(tool.name || ''),
    inputSchema: schema,
  } as McpToolDefinition)
}
const formatImplementationCode = (code: unknown) => JSON.stringify(code, null, 2)

type InheritanceSkillDevice = NonNullable<KnowledgeEntryItem['inheritance_skills']>['devices'][number]
type InheritanceSkillTool = InheritanceSkillDevice['tools'][number]

const inheritanceToolKey = (device: InheritanceSkillDevice, tool: InheritanceSkillTool) =>
  `${device.device_type}:${device.device_id}:${tool.name}`

const filteredInheritanceToolTabs = computed(() =>
  filteredInheritanceDevices.value.flatMap(device =>
    device.tools.map(tool => ({
      key: inheritanceToolKey(device, tool),
      device,
      tool,
    })),
  ),
)

const selectedInheritanceToolTab = computed(() =>
  filteredInheritanceToolTabs.value.find(item => item.key === activeInheritanceToolKey.value)
  || filteredInheritanceToolTabs.value[0]
  || null,
)

const selectedInheritanceServerCategory = computed(() => {
  const toolName = selectedInheritanceToolTab.value?.tool.name
  if (!toolName) return null
  return inheritanceServerCategories.value.find(category =>
    category.tools.some(tool => tool.name === toolName),
  ) || null
})

const isServerInheritanceDevice = (device: InheritanceSkillDevice) =>
  String(device.device_type || '').toLowerCase() === 'server'

const deviceDisplayLabel = (device: InheritanceSkillDevice) => {
  const id = String(device?.device_id || '').toLowerCase().trim()
  if (id === 'toolbox') return '工具箱（服务端内置）'
  if (id === 'library') return '图书管理工具（服务端治理）'
  return deviceTypeLabel(device?.device_type)
}

const hasImplementation = (tool: InheritanceSkillTool) => {
  const impl = tool.implementation
  return Boolean(impl && Object.keys(impl).length)
}

interface McpTestTarget {
  device: InheritanceSkillDevice
  tool: InheritanceSkillTool
}

const normalizeModelPresets = (raw: unknown): ModelPreset[] => {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '[]') } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  return parsed
    .map((item: any, index) => {
      const model = String(item?.model || '').trim()
      const apiKey = String(item?.api_key || '').trim()
      const baseUrl = String(item?.base_url || '').trim()
      if (!model || !apiKey || !baseUrl) return null
      let id = String(item?.id || model || `model_${index + 1}`).trim()
      if (!id || seen.has(id)) id = `${model}_${index + 1}`
      seen.add(id)
      return {
        id,
        name: String(item?.name || model).trim() || model,
        api_key: apiKey,
        base_url: baseUrl,
        model,
      }
    })
    .filter(Boolean) as ModelPreset[]
}

const mcpTestModalOpen = ref(false)
const mcpTestTarget = ref<McpTestTarget | null>(null)
// 类型上只有 inputSchema，但部分接口返回仍是 snake_case，运行时兜底一层
const mcpTestInputSchema = computed(() => {
  const tool = mcpTestTarget.value?.tool as Record<string, any> | undefined
  return tool?.inputSchema || tool?.input_schema || {}
})

// 弹窗自动置顶：每个 overlay 各领一个自增 z-index，后开者居上
const detailZIndex = usePopupZIndex(detailOpen)
const clawhubZIndex = usePopupZIndex(clawhubModalOpen)
const installedClawhubZIndex = usePopupZIndex(installedClawhubModalOpen)
const mcpTestPresetLoading = ref(false)
const mcpTestSubmitting = ref(false)
const mcpTestError = ref('')
const mcpTestNotice = ref('')
const mcpTestPresetOptions = ref<ModelPreset[]>([])
const mcpTestSelectedPresetId = ref('')
const mcpTestUserHint = ref('')
const mcpTestResult = ref<InheritanceMcpTestResult | null>(null)

// Direct param test inside the same popup (for reuse testing)
const mcpTestDirectArgs = ref('{}')
const mcpTestDirectResult = ref<any>(null)
const mcpTestDirectLoading = ref(false)
const mcpTestDirectError = ref('')

const loadMcpTestPresetOptions = async () => {
  mcpTestPresetLoading.value = true
  mcpTestError.value = ''
  try {
    const user = await me()
    mcpTestPresetOptions.value = normalizeModelPresets(user.model_presets)
    mcpTestSelectedPresetId.value = mcpTestPresetOptions.value[0]?.id || ''
    if (!mcpTestPresetOptions.value.length) {
      mcpTestError.value = '未配置可用模型，请先在系统设置中添加模型预设'
    }
  } catch (err) {
    mcpTestError.value = (err as Error).message || '模型列表加载失败'
    mcpTestPresetOptions.value = []
    mcpTestSelectedPresetId.value = ''
  } finally {
    mcpTestPresetLoading.value = false
  }
}

const openMcpTestModal = async (device: InheritanceSkillDevice, tool: InheritanceSkillTool) => {
  mcpTestTarget.value = { device, tool }
  mcpTestUserHint.value = ''
  mcpTestError.value = ''
  mcpTestNotice.value = ''
  mcpTestResult.value = null
  mcpTestDirectArgs.value = '{}'
  mcpTestDirectResult.value = null
  mcpTestDirectError.value = ''
  mcpTestModalOpen.value = true
  await loadMcpTestPresetOptions()
}

const closeMcpTestModal = () => {
  mcpTestModalOpen.value = false
  mcpTestTarget.value = null
  mcpTestPresetOptions.value = []
  mcpTestSelectedPresetId.value = ''
  mcpTestUserHint.value = ''
  mcpTestResult.value = null
  mcpTestError.value = ''
  mcpTestNotice.value = ''
  mcpTestSubmitting.value = false
  // clear direct test too
  mcpTestDirectArgs.value = '{}'
  mcpTestDirectResult.value = null
  mcpTestDirectLoading.value = false
  mcpTestDirectError.value = ''
}

// 具体的模型测试 / 直接调用逻辑已迁入 McpAiTestModal 组件，本文件只负责开关弹窗

type IntrinsicPersonaAgent = NonNullable<KnowledgeEntryItem['intrinsic_personas']>['agents'][number]
type InheritanceServerCategory = NonNullable<NonNullable<KnowledgeEntryItem['inheritance_skills']>['server_categories']>[number]

const openPersonaDetail = (agent: IntrinsicPersonaAgent) => {
  if (!agent.id) return
  detailPersonaId.value = agent.id
  personaEditError.value = ''
  personaEditNotice.value = ''
  personaDraftPrompt.value = agent.prompt || ''
}

const closePersonaDetail = () => {
  detailPersonaId.value = null
  personaEditError.value = ''
  personaEditNotice.value = ''
  personaDraftPrompt.value = ''
}

const selectPersonaSection = async (agent: IntrinsicPersonaAgent) => {
  if (!agent.id) return
  if (detailPersonaId.value === agent.id) return
  if (personaHasUnsavedChanges.value) {
    const ok = await confirm({
      message: '当前成员的人格 Prompt 尚未保存，确认切换到其他成员吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closePersonaDetail()
  openPersonaDetail(agent)
}

const selectPromptSection = async (section: SystemPromptSection) => {
  if (selectedPromptSection.value?.key === section.key) return
  if (editingPromptSection.value) {
    const ok = await confirm({
      message: '当前提示词栏目还有未保存的修改，确认切换栏目吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
    cancelEditPromptSection()
  }
  activePromptSectionKey.value = section.key
  activePromptItemKey.value = section.items[0]?.key || ''
  promptEditError.value = ''
  promptEditNotice.value = ''
}

const selectInheritanceToolTab = async (key: string) => {
  if (selectedInheritanceToolTab.value?.key === key) return
  if (editingPropertyCategory.value) {
    const ok = await confirm({
      message: '当前工具说明还有未保存的修改，确认切换工具吗？',
      type: 'warning',
      confirmText: '放弃并切换',
      cancelText: '继续编辑',
    })
    if (!ok) return
    cancelEditPropertyCategory()
  }
  activeInheritanceToolKey.value = key
  propertyEditError.value = ''
  propertyEditNotice.value = ''
}

const savePersona = async (agent: IntrinsicPersonaAgent) => {
  if (!agent.id) return
  savingPersonaId.value = agent.id
  personaEditError.value = ''
  personaEditNotice.value = ''
  try {
    await updateAiConfigFields(agent.id, {
      prompt: personaDraftPrompt.value,
    })
    agent.prompt = personaDraftPrompt.value
    personaEditNotice.value = `${agent.name} 人格 Prompt 已保存`
  } catch (err) {
    personaEditError.value = (err as Error).message || '保存失败'
  } finally {
    savingPersonaId.value = null
  }
}

const startEditPropertyCategory = (category: InheritanceServerCategory) => {
  editingPropertyCategory.value = category.namespace
  propertyEditError.value = ''
  propertyEditNotice.value = ''
  propertyDraftTools.value = (category.tools || []).map(tool => ({
    name: tool.name,
    description: tool.description || '',
    parameters: toolParameters(tool).map(param => ({
      name: param.name,
      description: param.description || '',
    })),
  }))
}

const cancelEditPropertyCategory = () => {
  editingPropertyCategory.value = null
  propertyEditError.value = ''
  propertyDraftTools.value = []
}

const updateDraftToolDescription = (toolName: string, value: string) => {
  propertyDraftTools.value = propertyDraftTools.value.map(tool =>
    tool.name === toolName ? { ...tool, description: value } : tool,
  )
}

const updateDraftParamDescription = (toolName: string, paramName: string, value: string) => {
  propertyDraftTools.value = propertyDraftTools.value.map(tool => {
    if (tool.name !== toolName) return tool
    return {
      ...tool,
      parameters: tool.parameters.map(param =>
        param.name === paramName ? { ...param, description: value } : param,
      ),
    }
  })
}

const propertyDraftTool = (toolName: string) => propertyDraftTools.value.find(tool => tool.name === toolName)

const propertyDraftToolDescription = (toolName: string) => propertyDraftTool(toolName)?.description ?? ''

const propertyDraftParamDescription = (toolName: string, paramName: string) =>
  propertyDraftTool(toolName)?.parameters.find(param => param.name === paramName)?.description ?? ''

const savePropertyCategory = async (category: InheritanceServerCategory) => {
  savingPropertyCategory.value = category.namespace
  propertyEditError.value = ''
  propertyEditNotice.value = ''
  try {
    const token = getAuthToken()
    await saveIntrinsicProperties(token, propertyDraftTools.value)
    // 回读当前条目（传承技能等），保持停留在当前卡片并刷新数据。
    const memoryId = currentDetail.value?.memory_id || selectedItem.value?.id
    if (memoryId) {
      currentDetail.value = await readEntry(token, memoryId)
    }
    editingPropertyCategory.value = null
    propertyDraftTools.value = []
    propertyEditNotice.value = `${category.namespace} 已保存`
  } catch (err) {
    propertyEditError.value = (err as Error).message || '保存失败'
  } finally {
    savingPropertyCategory.value = null
  }
}

type SystemPromptSection = NonNullable<KnowledgeEntryItem['system_prompts']>['sections'][number]

const startEditPromptSection = (section: SystemPromptSection) => {
  editingPromptSection.value = section.key
  promptEditError.value = ''
  promptEditNotice.value = ''
  promptDraftItems.value = section.items.map(item => ({
    key: item.key,
    content: item.type === 'number' ? Number(item.content || 0) : item.content || '',
  }))
}

const cancelEditPromptSection = () => {
  editingPromptSection.value = null
  promptEditError.value = ''
  promptDraftItems.value = []
}

const promptDraftValue = (key: string) =>
  promptDraftItems.value.find(item => item.key === key)?.content ?? ''

const updatePromptDraftValue = (key: string, value: string | number) => {
  promptDraftItems.value = promptDraftItems.value.map(item =>
    item.key === key ? { ...item, content: value } : item,
  )
}

const savePromptSection = async (section: SystemPromptSection) => {
  savingPromptSection.value = section.key
  promptEditError.value = ''
  promptEditNotice.value = ''
  try {
    const token = getAuthToken()
    const updated = await saveSystemPrompts(token, promptDraftItems.value)
    currentDetail.value = updated
    if (token) {
      const refreshedUser = await me(token)
      emit('refresh-user', refreshedUser)
    }
    editingPromptSection.value = null
    promptDraftItems.value = []
    promptEditNotice.value = `${section.title} 已保存`
  } catch (err) {
    promptEditError.value = (err as Error).message || '保存失败'
  } finally {
    savingPromptSection.value = null
  }
}

const searchClawHub = async () => {
  const query = clawhubQuery.value.trim()
  if (!query) {
    clawhubError.value = '请输入搜索关键词'
    return
  }
  clawhubSearching.value = true
  clawhubError.value = ''
  clawhubNotice.value = ''
  try {
    const token = getAuthToken()
    const data = await searchClawHubSkills(token, query, 20)
    clawhubResults.value = data.results || []
  } catch (err) {
    clawhubError.value = (err as Error).message || '搜索失败'
  } finally {
    clawhubSearching.value = false
  }
}

const openClawHubModal = () => {
  clawhubModalOpen.value = true
  clawhubError.value = ''
  clawhubNotice.value = ''
  installEndpointKind.value = 'auto'
}

const closeClawHubModal = () => {
  clawhubModalOpen.value = false
  clawhubError.value = ''
  clawhubNotice.value = ''
  clawhubDetailLoading.value = false
  clawhubInspectingSlug.value = ''
}

const inspectClawHubSkill = async (slug: string) => {
  const targetSlug = String(slug || '').trim()
  if (!targetSlug) return
  clawhubDetailLoading.value = true
  clawhubInspectingSlug.value = targetSlug
  clawhubError.value = ''
  clawhubNotice.value = ''
  clawhubModalOpen.value = true
  try {
    const token = getAuthToken()
    clawhubSelected.value = await readClawHubSkill(token, targetSlug)
  } catch (err) {
    clawhubError.value = (err as Error).message || '详情加载失败'
  } finally {
    clawhubDetailLoading.value = false
    clawhubInspectingSlug.value = ''
  }
}

const installSelectedClawHubSkill = async (force = false) => {
  const selected = clawhubSelected.value
  const slug = selected?.slug
  if (!slug) return
  clawhubInstallingSlug.value = slug
  clawhubError.value = ''
  clawhubNotice.value = ''
  try {
    const token = getAuthToken()
    const installed = await installClawHubSkill(token, slug, {
      version: selected.version,
      force,
      endpoint_kind: installEndpointKind.value === 'auto' ? undefined : installEndpointKind.value,
    })
    currentDetail.value = installed.entry
    clawhubSelected.value = {
      ...selected,
      installed: true,
    }
    clawhubResults.value = clawhubResults.value.map(item =>
      item.slug === slug ? { ...item, installed: true } : item,
    )
    clawhubNotice.value = force ? `${slug} 已更新` : `${slug} 已安装到本地传承思想`
  } catch (err) {
    clawhubError.value = (err as Error).message || '安装失败'
  } finally {
    clawhubInstallingSlug.value = ''
  }
}

const clawhubScanLabel = computed(() => {
  const scan = clawhubSelected.value?.scan || {}
  const security = (scan.security && typeof scan.security === 'object') ? scan.security as Record<string, any> : {}
  const moderation = (scan.moderation && typeof scan.moderation === 'object') ? scan.moderation as Record<string, any> : {}
  return String(security.status || moderation.verdict || moderation.summary || scan.error || '未知')
})

const openInstalledClawHubSkill = async (slug: string) => {
  const targetSlug = String(slug || '').trim()
  if (!targetSlug) return
  installedClawhubModalOpen.value = true
  installedClawhubLoading.value = true
  installedClawhubError.value = ''
  installedClawhubNotice.value = ''
  installedClawhubSelected.value = null
  installedClawhubDraft.value = ''
  installedClawhubEditMode.value = false
  installedKnowledgeMemoryId.value = ''
  try {
    const token = getAuthToken()
    const detail = await readInstalledClawHubSkill(token, targetSlug)
    installedClawhubSelected.value = detail
    installedClawhubDraft.value = detail.skill_card || ''
  } catch (err) {
    installedClawhubError.value = (err as Error).message || '加载失败'
  } finally {
    installedClawhubLoading.value = false
  }
}

type InheritanceThoughtItem = NonNullable<KnowledgeEntryItem['inheritance_tools']>['installed'][number]

const openInheritanceThoughtItem = async (item: InheritanceThoughtItem) => {
  const memoryId = String(item.memory_id || '').trim()
  if (item.kind === 'knowledge' && memoryId) {
    installedClawhubModalOpen.value = true
    installedClawhubLoading.value = true
    installedClawhubError.value = ''
    installedClawhubNotice.value = ''
    installedClawhubSelected.value = null
    installedClawhubDraft.value = ''
    installedClawhubEditMode.value = false
    installedKnowledgeMemoryId.value = memoryId
    try {
      const token = getAuthToken()
      const detail = await readEntry(token, memoryId)
      installedClawhubSelected.value = {
        slug: memoryId,
        skill: { displayName: detail.title, source: 'topic' },
        skill_card: detail.body || '',
        metadata: { source: 'topic' },
        path: detail.file_path,
        present: true,
      }
      installedClawhubDraft.value = detail.body || ''
    } catch (err) {
      installedClawhubError.value = (err as Error).message || '条目加载失败'
    } finally {
      installedClawhubLoading.value = false
    }
    return
  }
  await openInstalledClawHubSkill(item.slug)
}

const closeInstalledClawHubModal = () => {
  installedClawhubModalOpen.value = false
  installedClawhubLoading.value = false
  installedClawhubSaving.value = false
  installedClawhubDeleting.value = false
  installedClawhubError.value = ''
  installedClawhubNotice.value = ''
  installedClawhubEditMode.value = false
  installedKnowledgeMemoryId.value = ''
}

const requestCloseInstalledClawHubModal = async () => {
  const hasUnsavedChanges = installedClawhubEditMode.value
    && installedClawhubDraft.value !== (installedClawhubSelected.value?.skill_card || '')
  if (hasUnsavedChanges) {
    const ok = await confirm({
      message: '本地快照还有未保存的修改，确认关闭吗？',
      type: 'warning',
      confirmText: '放弃并关闭',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closeInstalledClawHubModal()
}

const saveInstalledClawHubSkill = async () => {
  const slug = installedClawhubSelected.value?.slug
  if (!slug) return
  installedClawhubSaving.value = true
  installedClawhubError.value = ''
  installedClawhubNotice.value = ''
  try {
    const token = getAuthToken()
    if (installedKnowledgeMemoryId.value) {
      const updated = await updateEntry(token, installedKnowledgeMemoryId.value, installedClawhubDraft.value)
      installedClawhubSelected.value = {
        slug: installedKnowledgeMemoryId.value,
        skill: { displayName: updated.detail.title, source: 'topic' },
        skill_card: updated.detail.body || '',
        metadata: { source: 'topic' },
        path: updated.detail.file_path,
        present: true,
      }
      installedClawhubDraft.value = updated.detail.body || ''
      currentDetail.value = updated.entry
    } else {
      const updated = await updateInstalledClawHubSkill(token, slug, installedClawhubDraft.value)
      installedClawhubSelected.value = updated.detail
      installedClawhubDraft.value = updated.detail.skill_card || ''
      currentDetail.value = updated.entry
    }
    installedClawhubNotice.value = '已保存'
    installedClawhubEditMode.value = false
  } catch (err) {
    installedClawhubError.value = (err as Error).message || '保存失败'
  } finally {
    installedClawhubSaving.value = false
  }
}

const applyInstalledEndpoint = async (kind: 'any' | 'desktop' | 'browser') => {
  const slug = installedClawhubSelected.value?.slug
  if (!slug || kind === installedEndpointKind.value) return
  installedEndpointSaving.value = true
  installedClawhubError.value = ''
  installedClawhubNotice.value = ''
  try {
    const token = getAuthToken()
    const res = await setInstalledClawHubSkillEndpoint(token, slug, kind)
    installedClawhubSelected.value = res.detail
    installedClawhubNotice.value = `已改端为「${endpointLabel(kind)}」`
  } catch (err) {
    installedClawhubError.value = (err as Error).message || '改端失败'
  } finally {
    installedEndpointSaving.value = false
  }
}

const removeInstalledClawHubSkill = async () => {
  const slug = installedClawhubSelected.value?.slug
  if (!slug) return
  const ok = await confirm({
    message: installedClawhubIsKnowledge.value
      ? `确认永久删除传承知识「${installedClawhubSelected.value?.skill?.displayName || slug}」？此操作不可撤销。`
      : `确认删除本地快照 ${slug}？删除后需要重新安装。`,
    type: 'warning',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return
  installedClawhubDeleting.value = true
  installedClawhubError.value = ''
  try {
    const token = getAuthToken()
    const deleted = installedKnowledgeMemoryId.value
      ? await deleteEntry(token, installedKnowledgeMemoryId.value)
      : await deleteInstalledClawHubSkill(token, slug)
    currentDetail.value = deleted.entry
    if (!installedKnowledgeMemoryId.value) {
      clawhubResults.value = clawhubResults.value.map(item =>
        item.slug === slug ? { ...item, installed: false } : item,
      )
    }
    installedClawhubModalOpen.value = false
    installedClawhubSelected.value = null
    installedClawhubDraft.value = ''
  } catch (err) {
    installedClawhubError.value = (err as Error).message || '删除失败'
  } finally {
    installedClawhubDeleting.value = false
  }
}

const formatTime = (ts?: number | null) => formatDateMinute(ts, '')

const initializeDetailColumns = (detail: KnowledgeEntryItem) => {
  closePersonaDetail()
  activePromptSectionKey.value = detail.system_prompts?.sections[0]?.key || ''
  activePromptItemKey.value = detail.system_prompts?.sections[0]?.items[0]?.key || ''
  const firstDevice = detail.inheritance_skills?.devices.find(device => device.tools.length)
  const firstTool = firstDevice?.tools[0]
  activeInheritanceToolKey.value = firstDevice && firstTool
    ? inheritanceToolKey(firstDevice, firstTool)
    : ''
  const firstPersona = detail.intrinsic_personas?.agents.find(agent => Boolean(agent.id))
  if (firstPersona) openPersonaDetail(firstPersona)
}

const openDetail = async (item: KnowledgeItem) => {
  selectedItem.value = item
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detailQuery.value = ''
  detailHistory.value = []
  currentDetail.value = null
  detailPersonaId.value = null
  personaEditError.value = ''
  personaEditNotice.value = ''
  editingPropertyCategory.value = null
  propertyEditError.value = ''
  propertyEditNotice.value = ''
  editingPromptSection.value = null
  activePromptSectionKey.value = ''
  activePromptItemKey.value = ''
  promptEditError.value = ''
  promptEditNotice.value = ''
  activeInheritanceToolKey.value = ''
  clawhubModalOpen.value = false
  clawhubError.value = ''
  clawhubNotice.value = ''
  clawhubResults.value = []
  clawhubSelected.value = null
  clawhubInspectingSlug.value = ''
  clawhubInstallingSlug.value = ''
  installedClawhubModalOpen.value = false
  installedClawhubSelected.value = null
  installedClawhubDraft.value = ''
  try {
    const token = getAuthToken()
    const detail = await readEntry(token, item.id)
    currentDetail.value = detail
    initializeDetailColumns(detail)
  } catch (err) {
    detailError.value = (err as Error).message || '条目加载失败'
  } finally {
    detailLoading.value = false
    await nextTick()
    detailCloseButton.value?.focus()
  }
}

const retryDetail = () => {
  if (selectedItem.value) void openDetail(selectedItem.value)
}

const closeDetail = () => {
  detailOpen.value = false
  detailError.value = ''
  detailQuery.value = ''
  detailHistory.value = []
  currentDetail.value = null
  closeMcpTestModal()
  selectedItem.value = null
  savingPersonaId.value = null
  detailPersonaId.value = null
  personaEditError.value = ''
  personaEditNotice.value = ''
  personaDraftPrompt.value = ''
  editingPropertyCategory.value = null
  savingPropertyCategory.value = null
  propertyEditError.value = ''
  propertyEditNotice.value = ''
  propertyDraftTools.value = []
  editingPromptSection.value = null
  activePromptSectionKey.value = ''
  activePromptItemKey.value = ''
  savingPromptSection.value = null
  promptEditError.value = ''
  promptEditNotice.value = ''
  promptDraftItems.value = []
  activeInheritanceToolKey.value = ''
  clawhubQuery.value = ''
  clawhubModalOpen.value = false
  clawhubError.value = ''
  clawhubNotice.value = ''
  clawhubResults.value = []
  clawhubSelected.value = null
  clawhubInspectingSlug.value = ''
  clawhubInstallingSlug.value = ''
  installedClawhubModalOpen.value = false
  installedClawhubSelected.value = null
  installedClawhubDraft.value = ''
}

const requestCloseDetail = async () => {
  if (personaHasUnsavedChanges.value || editingPromptSection.value || editingPropertyCategory.value) {
    const ok = await confirm({
      message: '当前栏目还有未保存的编辑内容，确认关闭吗？',
      type: 'warning',
      confirmText: '放弃并关闭',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closeDetail()
}

const goBackDetail = () => {
  const previous = detailHistory.value[detailHistory.value.length - 1]
  if (!previous) return
  detailHistory.value = detailHistory.value.slice(0, -1)
  currentDetail.value = previous
  initializeDetailColumns(previous)
  detailQuery.value = ''
  detailError.value = ''
}

const navigateBackOrCloseDetail = () => {
  if (canGoBackDetail.value) {
    goBackDetail()
    return
  }
  void requestCloseDetail()
}

const handleDetailKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !detailOpen.value) return
  event.preventDefault()
  if (installedClawhubModalOpen.value) {
    void requestCloseInstalledClawHubModal()
    return
  }
  if (clawhubModalOpen.value) {
    closeClawHubModal()
    return
  }
  if (mcpTestModalOpen.value) return
  navigateBackOrCloseDetail()
}

onMounted(() => window.addEventListener('keydown', handleDetailKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleDetailKeydown))
</script>

<template>
  <div v-bind="rootAttrs" :class="[
    attrs.class,
    'p-4 flex-1 flex flex-col overflow-hidden transition-all duration-300',
    noGlass ? '' : 'glass rounded-2xl border border-zinc-200 shadow-sm dark:bg-zinc-900/80 dark:border-zinc-800 hover:shadow-md'
  ]">
    <div class="flex justify-between items-center border-b border-zinc-100 pb-2 mb-2 dark:border-zinc-800">
      <h2 v-if="!noGlass" class="font-bold text-zinc-800 flex items-center gap-2 dark:text-zinc-100">
        <AppIcon name="book" class="w-[18px] h-[18px]" /> 知识库
      </h2>
      <div v-else class="flex items-center gap-2">
        <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">知识库</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs bg-zinc-100/60 px-2 py-0.5 rounded-full text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-300">{{ totalCount }} 条目</span>
      </div>
    </div>
    
    <div class="overflow-y-auto pr-1 space-y-2 flex-1 custom-scrollbar">
      <div v-if="items.length === 0" class="text-center text-zinc-400 text-xs py-10 dark:text-zinc-500">
        暂无知识库条目
      </div>
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="w-full text-center p-5 bg-zinc-50/60 rounded border border-zinc-100 hover:border-indigo-200 transition-all duration-200 cursor-pointer group hover:scale-[1.01] hover:shadow-sm dark:bg-zinc-800/60 dark:border-zinc-700 dark:hover:border-indigo-400"
          @click="openDetail(item)"
        >
          <h4 class="text-lg font-medium text-zinc-800 group-hover:text-indigo-600 truncate dark:text-zinc-100 dark:group-hover:text-indigo-300">{{ item.title }}</h4>
        </button>
      </TransitionGroup>
    </div>

    <Teleport to="body">
    <div
      v-if="detailOpen"
      :style="{ zIndex: detailZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-detail-title"
      @click.self="navigateBackOrCloseDetail"
    >
      <div class="acrylic-modal w-full max-w-7xl h-app-viewport sm:h-[92vh] flex flex-col overflow-hidden rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-zinc-200 dark:border-zinc-800">
        <header class="shrink-0 border-b border-zinc-200/80 bg-white/45 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950/25 sm:px-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <button
              ref="detailCloseButton"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              :aria-label="canGoBackDetail ? '返回上一级' : '关闭知识库详情'"
              :title="canGoBackDetail ? '返回上一级（Esc）' : '关闭（Esc）'"
              @click="navigateBackOrCloseDetail"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 id="knowledge-detail-title" class="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {{ detailPresentation.title }}
            </h2>
          </div>
        </header>

        <div
          v-if="!detailLoading && !detailError && currentDetail && detailSearchVisible"
          class="shrink-0 border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/25 sm:px-6"
        >
          <div class="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center">
            <label class="relative min-w-0 flex-1">
              <span class="sr-only">筛选当前栏目</span>
              <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                v-model="detailQuery"
                type="search"
                class="w-full rounded-xl border border-zinc-200 bg-white/80 py-2.5 pl-9 pr-9 text-sm text-zinc-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus:border-indigo-700 dark:focus:ring-indigo-950"
                :placeholder="detailPresentation.searchPlaceholder"
              />
              <button
                v-if="detailQuery"
                type="button"
                class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="清空搜索"
                @click="detailQuery = ''"
              >
                <AppIcon name="close" class="h-3 w-3" />
              </button>
            </label>
            <div class="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:min-w-[9rem] sm:text-right">
              {{ detailPresentation.resultText }}
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar sm:p-6">
          <div v-if="detailLoading" class="mx-auto max-w-6xl space-y-3 py-5" aria-live="polite">
            <div class="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/70"></div>
            <div class="text-center text-xs text-zinc-400">正在整理栏目内容…</div>
          </div>
          <div v-else-if="detailError" class="mx-auto flex max-w-md flex-col items-center py-16 text-center" role="alert">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
              <AppIcon name="warning" class="h-5 w-5" />
            </div>
            <div class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">栏目加载失败</div>
            <div class="mt-1 text-xs leading-relaxed text-rose-500 dark:text-rose-300">{{ detailError }}</div>
            <button type="button" class="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500" @click="retryDetail">
              重新加载
            </button>
          </div>
          <template v-else-if="currentDetail">
            <div class="mx-auto max-w-6xl">
            <div v-if="!intrinsicPersonas && !systemPrompts && !inheritanceSkills && !inheritanceThoughts" class="mb-3 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">范围：{{ currentDetail.scope }}</span>
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">置信度：{{ Math.round(currentDetail.confidence * 100) }}%</span>
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">使用：{{ currentDetail.use_count }} 次</span>
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">更新：{{ formatTime(currentDetail.updated_at) }}</span>
            </div>

            <div v-if="currentDetail.summary && !intrinsicPersonas && !systemPrompts && !inheritanceSkills && !inheritanceThoughts" class="mb-4">
              <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">摘要</div>
              <div class="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                {{ currentDetail.summary }}
              </div>
            </div>

            <template v-if="intrinsicPersonas">
              <div class="space-y-3">
                <div v-if="personaEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
                  {{ personaEditNotice }}
                </div>
                <div v-if="personaEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
                  {{ personaEditError }}
                </div>
                <div v-if="filteredPersonaAgents.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="AI 成员栏目">
                  <div class="flex min-w-max items-end gap-1 px-1">
                    <button
                      v-for="agent in filteredPersonaAgents"
                      :key="agent.id || agent.name"
                      type="button"
                      role="tab"
                      class="relative min-w-[8rem] whitespace-nowrap rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold transition-colors"
                      :class="detailPersonaId === agent.id
                        ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
                        : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
                      :aria-selected="detailPersonaId === agent.id"
                      @click="selectPersonaSection(agent)"
                    >
                      {{ agent.name }}
                    </button>
                  </div>
                </div>
                <section v-if="detailAgent" class="min-h-[28rem] rounded-b-xl border border-t-0 border-zinc-200 bg-white/75 p-5 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <header class="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                    <div>
                      <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{{ detailAgent.name }}</h3>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ detailAgent.platform }} · 第 {{ detailAgent.generation }} 代 · {{ detailAgent.model || '未设置模型' }}</p>
                    </div>
                    <div class="flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">ID {{ detailAgent.id }}</span>
                      <span class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{{ detailAgent.role }}</span>
                      <span v-if="detailAgent.is_librarian" class="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">图书管理员</span>
                    </div>
                  </header>
                  <label class="block">
                    <span class="mb-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">人格 Prompt</span>
                    <textarea
                      :value="personaDraftPrompt"
                      rows="18"
                      class="min-h-[22rem] w-full resize-y whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white/90 p-4 font-mono text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
                      @input="personaDraftPrompt = ($event.target as HTMLTextAreaElement).value"
                    />
                  </label>
                  <div class="mt-4 flex justify-end">
                    <button
                      type="button"
                      class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="savingPersonaId === detailAgent.id || !personaHasUnsavedChanges"
                      @click="savePersona(detailAgent)"
                    >
                      {{ savingPersonaId === detailAgent.id ? '保存中…' : '保存人格 Prompt' }}
                    </button>
                  </div>
                </section>
                <div v-if="filteredPersonaAgents.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
                  <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的 AI</div>
                  <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="detailQuery = ''">清空搜索条件</button>
                </div>
              </div>
            </template>
            <template v-else-if="systemPrompts">
              <div class="space-y-4">
                <div v-if="promptEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
                  {{ promptEditNotice }}
                </div>
                <div v-if="promptEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
                  {{ promptEditError }}
                </div>
                <div v-if="filteredPromptSections.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="固有思想栏目">
                  <div class="flex min-w-max items-end gap-1 px-1">
                    <button
                      v-for="section in filteredPromptSections"
                      :key="section.key"
                      type="button"
                      role="tab"
                      class="min-w-[10rem] whitespace-nowrap rounded-t-xl border border-b-0 px-5 py-3 text-sm font-semibold transition-colors"
                      :class="selectedPromptSection?.key === section.key
                        ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
                        : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
                      :aria-selected="selectedPromptSection?.key === section.key"
                      @click="selectPromptSection(section)"
                    >
                      {{ section.title }}
                    </button>
                  </div>
                </div>
                <section v-if="selectedPromptSection" class="min-h-[28rem] overflow-hidden rounded-b-xl border border-t-0 border-zinc-200 bg-white/75 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <header class="flex items-center justify-end gap-3 border-b border-zinc-100 px-5 py-2.5 dark:border-zinc-800">
                    <div class="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>{{ selectedPromptSection.count }} 项</span>
                      <button
                        v-if="editingPromptSection !== selectedPromptSection.key"
                        type="button"
                        class="rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                        @click="startEditPromptSection(selectedPromptSection)"
                      >
                        编辑
                      </button>
                    </div>
                  </header>
                  <div v-if="selectedPromptSection.items.length" class="overflow-x-auto border-b border-zinc-100 bg-zinc-50/70 custom-scrollbar dark:border-zinc-800 dark:bg-zinc-950/30" role="tablist" :aria-label="`${selectedPromptSection.title}子设置`">
                    <div class="flex min-w-max gap-1 px-4 pt-3">
                      <button
                        v-for="item in selectedPromptSection.items"
                        :key="item.key"
                        type="button"
                        role="tab"
                        class="whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2 text-xs font-medium transition-colors"
                        :class="selectedPromptItem?.key === item.key
                          ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
                          : 'border-transparent text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
                        :aria-selected="selectedPromptItem?.key === item.key"
                        @click="activePromptItemKey = item.key"
                      >
                        {{ item.label }}
                      </button>
                    </div>
                  </div>
                  <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
                    <div
                      v-if="selectedPromptItem"
                      :key="selectedPromptItem.key"
                      class="min-h-[22rem] px-5 py-5"
                    >
                      <div class="flex items-center justify-between gap-3 mb-1">
                        <div class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{{ selectedPromptItem.label }}</div>
                        <code class="text-[10px] text-zinc-400 dark:text-zinc-500">{{ selectedPromptItem.key }}</code>
                      </div>
                      <input
                        v-if="editingPromptSection === selectedPromptSection.key && selectedPromptItem.type === 'number'"
                        :value="promptDraftValue(selectedPromptItem.key)"
                        type="number"
                        min="0"
                        max="3600"
                        class="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
                        @input="updatePromptDraftValue(selectedPromptItem.key, Number(($event.target as HTMLInputElement).value || 0))"
                      />
                      <textarea
                        v-else-if="editingPromptSection === selectedPromptSection.key"
                        :value="promptDraftValue(selectedPromptItem.key)"
                        rows="16"
                        class="mt-2 min-h-[20rem] w-full resize-y whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white/60 p-4 font-mono text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:focus:ring-indigo-800"
                        @input="updatePromptDraftValue(selectedPromptItem.key, ($event.target as HTMLTextAreaElement).value)"
                      />
                      <pre v-else class="mt-2 min-h-[20rem] whitespace-pre-wrap rounded-xl border border-zinc-100 bg-white/60 p-4 font-mono text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">{{ selectedPromptItem.content || '（空）' }}</pre>
                    </div>
                    <div v-if="editingPromptSection === selectedPromptSection.key" class="flex justify-end gap-2 px-5 py-4">
                      <button
                        type="button"
                        class="px-3 py-1.5 rounded border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        :disabled="savingPromptSection === selectedPromptSection.key"
                        @click="cancelEditPromptSection"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="savingPromptSection === selectedPromptSection.key"
                        @click="savePromptSection(selectedPromptSection)"
                      >
                        {{ savingPromptSection === selectedPromptSection.key ? '保存中…' : '保存' }}
                      </button>
                    </div>
                  </div>
                </section>
                <div v-if="filteredPromptSections.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
                  <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的配置项</div>
                  <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="detailQuery = ''">清空搜索条件</button>
                </div>
              </div>
            </template>
            <template v-else-if="inheritanceSkills">
              <div class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-indigo-700 dark:text-indigo-300">传承技能 MCP</div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      @click.stop.prevent="emit('view-all-mcp')"
                    >
                      查看全部 MCP
                    </button>
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-indigo-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      @click.stop.prevent="emit('manage-device-tools')"
                    >
                      管理设备动态 MCP
                    </button>
                  </div>
                </div>
                <div v-if="propertyEditNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
                  {{ propertyEditNotice }}
                </div>
                <div v-if="propertyEditError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
                  {{ propertyEditError }}
                </div>
                <div
                  v-if="!inheritanceDevices.length"
                  class="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-10 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-500"
                >
                  暂无 MCP 工具。
                </div>
                <div v-if="filteredInheritanceToolTabs.length" class="overflow-x-auto border-b border-zinc-200 custom-scrollbar dark:border-zinc-700" role="tablist" aria-label="传承技能工具栏目">
                  <div class="flex min-w-max items-end gap-1 px-1">
                    <button
                      v-for="item in filteredInheritanceToolTabs"
                      :key="item.key"
                      type="button"
                      role="tab"
                      class="min-w-[10rem] whitespace-nowrap rounded-t-xl border border-b-0 px-4 py-2.5 text-left transition-colors"
                      :class="selectedInheritanceToolTab?.key === item.key
                        ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300'
                        : 'border-transparent bg-zinc-100/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
                      :aria-selected="selectedInheritanceToolTab?.key === item.key"
                      @click="selectInheritanceToolTab(item.key)"
                    >
                      <span class="block text-xs font-semibold">{{ getMcpToolZhLabel(item.tool.name) }}</span>
                      <span class="mt-0.5 block max-w-[13rem] truncate text-[10px] opacity-70">{{ deviceDisplayLabel(item.device) }}</span>
                    </button>
                  </div>
                </div>
                <section
                  v-for="device in filteredInheritanceDevices"
                  :key="`${device.device_type}-${device.device_id}`"
                  v-show="selectedInheritanceToolTab?.device.device_id === device.device_id && selectedInheritanceToolTab?.device.device_type === device.device_type"
                  class="min-h-[30rem] overflow-hidden rounded-b-xl border border-t-0 border-zinc-200 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-800/40"
                >
                  <header class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                          {{ deviceDisplayLabel(device) }}
                        </div>
                        <div class="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                          <template v-if="device.device_id === 'toolbox' || device.device_id === 'library'">内置服务端固定</template>
                          <template v-else>设备号：{{ device.device_id || '未提供' }}</template>
                          <template v-if="device.updated_at"> · {{ formatTime(device.updated_at) }}</template>
                        </div>
                      </div>
                      <span class="shrink-0 rounded bg-white/75 px-2 py-1 text-[10px] text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">{{ device.tool_count }} 个 MCP</span>
                    </div>
                  </header>
                  <div class="space-y-3 bg-white/75 p-3 dark:bg-zinc-900/40">
                    <div v-if="!device.tools.length" class="px-3 py-6 text-center text-xs text-zinc-400">
                      该设备暂未上报 MCP 工具
                    </div>
                    <article
                      v-for="tool in device.tools"
                      :key="`${device.device_id}-${tool.name}`"
                      v-show="selectedInheritanceToolTab?.tool.name === tool.name"
                      class="min-h-[24rem] rounded-xl border border-zinc-100 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-950/35"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                          <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ getMcpToolZhLabel(tool.name) }}</h4>
                          <code class="mt-0.5 block break-all text-[11px] text-indigo-600 dark:text-indigo-300">{{ tool.name }}</code>
                        </div>
                        <button
                          v-if="!isServerInheritanceDevice(device)"
                          type="button"
                          class="shrink-0 whitespace-nowrap rounded-lg border border-emerald-200 bg-white/75 px-2.5 py-1.5 text-[11px] text-emerald-700 transition-colors hover:bg-emerald-50 active:bg-emerald-100 dark:border-emerald-900/60 dark:bg-zinc-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                          @click="openMcpTestModal(device, tool)"
                        >
                          测试 MCP
                        </button>
                        <span v-else class="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">服务端内置</span>
                      </div>

                      <div class="mt-3">
                        <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">工具描述</div>
                        <p class="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                          {{ tool.description || '（无描述）' }}
                          <span v-if="tool.destructive" class="ml-1 text-amber-600 dark:text-amber-300">可能产生写入/变更</span>
                        </p>
                      </div>

                      <div class="mt-3">
                        <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">参数详情</div>
                        <div v-if="toolParameters(tool).length" class="overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-700">
                          <div
                            v-for="param in toolParameters(tool)"
                            :key="`${device.device_id}-${tool.name}-${param.name}`"
                            class="grid grid-cols-1 gap-1.5 border-b border-zinc-100 px-3 py-2 text-[11px] last:border-b-0 dark:border-zinc-700 sm:grid-cols-[minmax(8rem,12rem)_5rem_4rem_1fr]"
                          >
                            <code class="break-all font-semibold text-zinc-700 dark:text-zinc-200">{{ param.name }}</code>
                            <span class="text-zinc-500 dark:text-zinc-400">{{ param.type || 'any' }}</span>
                            <span :class="param.required ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-400 dark:text-zinc-500'">{{ param.required ? '必填' : '可选' }}</span>
                            <span class="text-zinc-600 dark:text-zinc-300">{{ param.description || '（无描述）' }}</span>
                          </div>
                        </div>
                        <div v-else class="text-[11px] text-zinc-400 dark:text-zinc-500">无参数</div>
                      </div>

                      <div class="mt-3">
                        <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">底层实现</div>
                        <pre v-if="hasImplementation(tool)" class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 font-mono text-[10px] leading-relaxed text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-200">{{ formatImplementationCode(tool.implementation) }}</pre>
                        <div v-else class="text-[11px] text-zinc-400 dark:text-zinc-500">未提供实现信息</div>
                      </div>
                    </article>

                    <div
                      v-if="isServerInheritanceDevice(device) && selectedInheritanceServerCategory"
                      class="border-t border-zinc-100 pt-4 dark:border-zinc-800"
                    >
                      <div class="mb-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                        编辑服务端工具说明（保存后同步工具目录与 mcp.describe+tool）。工具箱与图书管理工具共享此编辑。
                      </div>
                      <div class="space-y-2">
                        <section
                          v-for="category in inheritanceServerCategories"
                          :key="category.namespace"
                          v-show="category.namespace === selectedInheritanceServerCategory?.namespace"
                          class="overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/40"
                        >
                          <header class="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                            <div class="flex items-center justify-between gap-3">
                              <div class="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">工具总栏目：{{ category.namespace }}</div>
                              <div class="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span>{{ category.count }} 个工具</span>
                                <button
                                  v-if="editingPropertyCategory !== category.namespace"
                                  type="button"
                                  class="rounded border border-indigo-200 bg-white/75 px-2 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                                  @click="startEditPropertyCategory(category)"
                                >
                                  编辑
                                </button>
                              </div>
                            </div>
                          </header>
                          <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
                            <div
                              v-for="tool in category.tools"
                              :key="tool.name"
                              v-show="tool.name === selectedInheritanceToolTab?.tool.name"
                              class="px-3 py-3"
                            >
                              <div class="grid grid-cols-1 gap-2 md:grid-cols-[13rem_1fr]">
                                <div>
                                  <div class="mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">调用工具</div>
                                  <code class="break-all text-[11px] text-indigo-600 dark:text-indigo-300">{{ tool.name }}</code>
                                </div>
                                <div>
                                  <div class="mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">工具描述</div>
                                  <textarea
                                    v-if="editingPropertyCategory === category.namespace"
                                    :value="propertyDraftToolDescription(tool.name)"
                                    rows="3"
                                    class="w-full resize-y rounded border border-zinc-200 bg-white/75 p-2 text-xs leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
                                    @input="updateDraftToolDescription(tool.name, ($event.target as HTMLTextAreaElement).value)"
                                  />
                                  <div v-else class="text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                                    {{ tool.description || '（无描述）' }}
                                    <span v-if="tool.destructive" class="ml-1 text-amber-600 dark:text-amber-300">可能产生写入/变更</span>
                                  </div>
                                </div>
                              </div>
                              <div class="mt-2">
                                <div class="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">参数说明</div>
                                <div v-if="toolParameters(tool).length" class="overflow-hidden rounded border border-zinc-100 dark:border-zinc-700">
                                  <div
                                    v-for="param in toolParameters(tool)"
                                    :key="`${tool.name}-${param.name}`"
                                    class="grid grid-cols-1 gap-2 border-b border-zinc-100 px-2 py-1.5 text-[11px] last:border-b-0 dark:border-zinc-700 md:grid-cols-[11rem_6rem_4rem_1fr]"
                                  >
                                    <code class="break-all text-zinc-700 dark:text-zinc-200">{{ param.name }}</code>
                                    <span class="text-zinc-500 dark:text-zinc-400">{{ param.type || 'any' }}</span>
                                    <span :class="param.required ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-400 dark:text-zinc-500'">
                                      {{ param.required ? '必填' : '可选' }}
                                    </span>
                                    <textarea
                                      v-if="editingPropertyCategory === category.namespace"
                                      :value="propertyDraftParamDescription(tool.name, param.name)"
                                      rows="2"
                                      class="w-full resize-y rounded border border-zinc-200 bg-white/75 px-2 py-1 text-[11px] leading-relaxed text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:focus:ring-indigo-800"
                                      @input="updateDraftParamDescription(tool.name, param.name, ($event.target as HTMLTextAreaElement).value)"
                                    />
                                    <span v-else class="text-zinc-600 dark:text-zinc-300">{{ param.description || '（无描述）' }}</span>
                                  </div>
                                </div>
                                <div v-else class="text-[11px] text-zinc-500 dark:text-zinc-400">无参数</div>
                              </div>
                            </div>
                            <div v-if="editingPropertyCategory === category.namespace" class="flex justify-end gap-2 px-3 py-3">
                              <button
                                type="button"
                                class="rounded border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                :disabled="savingPropertyCategory === category.namespace"
                                @click="cancelEditPropertyCategory"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                class="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                                :disabled="savingPropertyCategory === category.namespace"
                                @click="savePropertyCategory(category)"
                              >
                                {{ savingPropertyCategory === category.namespace ? '保存中…' : '保存' }}
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </section>
                <div v-if="inheritanceDevices.length && filteredInheritanceDevices.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-700">
                  <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的设备或 MCP</div>
                  <button type="button" class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300" @click="detailQuery = ''">清空搜索条件</button>
                </div>
              </div>
            </template>
            <template v-else-if="inheritanceThoughts">
              <div class="space-y-4">
                <div v-if="clawhubNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
                  {{ clawhubNotice }}
                </div>
                <div v-if="clawhubError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
                  {{ clawhubError }}
                </div>

                <section class="rounded-lg border border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/40 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">ClawHub</div>
                      <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 break-all">
                        {{ inheritanceThoughts.registry_url }} · 本地快照默认不自动启用
                      </div>
                    </div>
                    <button
                      type="button"
                      class="px-3 py-2 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500"
                      @click.stop.prevent="openClawHubModal"
                    >
                      搜索 ClawHub
                    </button>
                  </div>
                </section>

                <section v-if="inheritanceThoughts.installed.length" class="space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">已安装</div>
                    <div class="flex items-center gap-1 text-[10px]">
                      <button
                        v-for="opt in [{ v: 'all', t: '全部' }, { v: 'any', t: '通用' }, { v: 'desktop', t: '桌面端' }, { v: 'browser', t: '浏览器端' }]"
                        :key="opt.v"
                        type="button"
                        class="px-1.5 py-0.5 rounded border transition-colors"
                        :class="thoughtEndpointFilter === opt.v ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-zinc-200 text-zinc-500 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400'"
                        @click.stop.prevent="thoughtEndpointFilter = opt.v as any"
                      >{{ opt.t }}</button>
                    </div>
                  </div>
                  <div v-if="filteredInstalledThoughts.length === 0" class="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center dark:border-zinc-700">
                    <div class="text-sm font-medium text-zinc-600 dark:text-zinc-300">没有匹配的传承思想</div>
                    <button
                      type="button"
                      class="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                      @click="detailQuery = ''; thoughtEndpointFilter = 'all'"
                    >
                      清空搜索与端筛选
                    </button>
                  </div>
                  <button
                    v-for="skill in filteredInstalledThoughts"
                    :key="skill.slug"
                    type="button"
                    class="w-full text-left rounded-lg border border-zinc-100 bg-zinc-50/60 hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-indigo-700 px-3 py-2 transition-colors"
                    @click.stop.prevent="openInheritanceThoughtItem(skill)"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ skill.displayName || skill.slug }}</div>
                        <code class="text-[11px] text-indigo-600 dark:text-indigo-300 break-all">{{ skill.slug }}</code>
                      </div>
                      <div class="flex flex-wrap items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">{{ endpointLabel(skill.endpoint_kind) }}</span>
                        <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60">{{ skill.kind === 'knowledge' ? '知识' : (skill.version || 'latest') }}</span>
                        <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60">{{ skill.present ? '文件可用' : '文件缺失' }}</span>
                        <span class="px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/60 text-indigo-600 dark:text-indigo-300">查看/编辑</span>
                      </div>
                    </div>
                  </button>
                </section>
              </div>
            </template>
            <template v-else>
              <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">具体内容</div>
              <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">{{ detailContent }}</pre>
            </template>

            <div v-if="currentDetail.source_job_id" class="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              来源任务：{{ currentDetail.source_job_id }} · 第 {{ currentDetail.source_generation || 1 }} 代
            </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <div
      v-if="clawhubModalOpen"
      :style="{ zIndex: clawhubZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ClawHub 搜索"
      @click.self="closeClawHubModal"
    >
      <div class="acrylic-modal h-app-viewport w-full max-w-6xl rounded-none shadow-2xl flex flex-col border-0 sm:h-[88vh] sm:rounded-2xl sm:border border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">ClawHub 搜索</div>
            <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {{ inheritanceThoughts?.registry_url || 'https://clawhub.ai' }}
            </div>
          </div>
          <button type="button" class="ml-3 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="关闭 ClawHub 搜索" @click="closeClawHubModal">
            <AppIcon name="close" class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(13rem,40%)_1fr] lg:grid-cols-[22rem_1fr] lg:grid-rows-1">
          <aside class="min-h-0 border-b lg:border-b-0 lg:border-r border-zinc-100 dark:border-zinc-800 flex flex-col">
            <div class="p-3 border-b border-zinc-100 dark:border-zinc-800">
              <div class="flex gap-2">
                <input
                  v-model="clawhubQuery"
                  type="search"
                  class="min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
                  placeholder="calendar、github、browser"
                  @keydown.enter.prevent="searchClawHub"
                />
                <button
                  type="button"
                  class="px-3 py-2 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="clawhubSearching"
                  @click="searchClawHub"
                >
                  {{ clawhubSearching ? '搜索中…' : '搜索' }}
                </button>
              </div>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              <div v-if="clawhubError" class="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
                {{ clawhubError }}
              </div>
              <div v-if="clawhubNotice" class="text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
                {{ clawhubNotice }}
              </div>
              <div v-if="!clawhubSearching && clawhubResults.length === 0" class="text-center text-zinc-400 text-xs py-10">
                输入关键词搜索 ClawHub
              </div>
              <button
                v-for="result in clawhubResults"
                :key="result.slug"
                type="button"
                class="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                :class="clawhubSelected?.slug === result.slug ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30' : 'border-zinc-100 bg-zinc-50/60 hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-indigo-700'"
                @click.stop.prevent="inspectClawHubSkill(result.slug)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ result.displayName || result.slug }}</div>
                    <code class="text-[11px] text-indigo-600 dark:text-indigo-300 break-all">{{ result.slug }}</code>
                  </div>
                  <span v-if="clawhubInspectingSlug === result.slug" class="shrink-0 text-[10px] text-zinc-400">查看中…</span>
                </div>
                <div class="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                  <span>{{ result.owner?.displayName || result.ownerHandle || 'unknown' }}</span>
                  <span>{{ result.version || 'latest' }}</span>
                  <span v-if="result.installed" class="text-emerald-600 dark:text-emerald-300">已安装</span>
                </div>
              </button>
            </div>
          </aside>

          <main class="min-h-0 flex flex-col">
            <div v-if="clawhubDetailLoading" class="flex-1 flex items-center justify-center text-sm text-zinc-400">详情加载中…</div>
            <div v-else-if="clawhubSelected" class="flex-1 min-h-0 flex flex-col">
              <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                    {{ clawhubSelected.detail?.skill?.displayName || clawhubSelected.slug }}
                  </div>
                  <div class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {{ clawhubSelected.slug }} · {{ clawhubSelected.version || 'latest' }} · 扫描：{{ clawhubScanLabel }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    端
                    <select
                      v-model="installEndpointKind"
                      class="text-[11px] text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
                    >
                      <option value="auto">自动判断</option>
                      <option value="any">通用</option>
                      <option value="desktop">桌面端</option>
                      <option value="browser">浏览器端</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="clawhubInstallingSlug === clawhubSelected.slug"
                    @click.stop.prevent="installSelectedClawHubSkill(clawhubSelected.installed)"
                  >
                    {{ clawhubInstallingSlug === clawhubSelected.slug ? '处理中…' : (clawhubSelected.installed ? '更新快照' : '安装快照') }}
                  </button>
                </div>
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">{{ clawhubSelected.skill_card || '（无内容）' }}</pre>
              </div>
            </div>
            <div v-else class="flex-1 flex items-center justify-center text-sm text-zinc-400">
              选择一个搜索结果查看 SKILL.md
            </div>
          </main>
        </div>
      </div>
    </div>
    <div
      v-if="installedClawhubModalOpen"
      :style="{ zIndex: installedClawhubZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="本地知识快照"
      @click.self="requestCloseInstalledClawHubModal"
    >
      <div class="acrylic-modal h-app-viewport w-full max-w-5xl rounded-none shadow-2xl flex flex-col border-0 sm:h-[88vh] sm:rounded-2xl sm:border border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
              {{ installedClawhubSelected?.skill?.displayName || installedClawhubSelected?.slug || (installedClawhubIsKnowledge ? '传承知识' : '本地快照') }}
            </div>
            <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {{ installedClawhubSelected?.slug || '加载中' }}
            </div>
          </div>
          <button type="button" class="ml-3 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="关闭本地快照" @click="requestCloseInstalledClawHubModal">
            <AppIcon name="close" class="h-4 w-4" />
          </button>
        </div>

        <div v-if="installedClawhubLoading" class="flex-1 flex items-center justify-center text-sm text-zinc-400">加载中…</div>
        <div v-else class="flex-1 min-h-0 flex flex-col">
          <div class="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">{{ installedClawhubIsKnowledge ? '知识' : (installedClawhubSelected?.skill?.version || 'latest') }}</span>
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">{{ installedClawhubSelected?.present ? '文件可用' : '文件缺失' }}</span>
              <label v-if="!installedClawhubIsKnowledge" class="flex items-center gap-1">
                端
                <select
                  :value="installedEndpointKind"
                  :disabled="installedEndpointSaving || !installedClawhubSelected"
                  class="text-[11px] text-zinc-700 dark:text-zinc-200 bg-white/60 dark:bg-zinc-900/50 px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 disabled:opacity-60"
                  @change="applyInstalledEndpoint(($event.target as HTMLSelectElement).value as 'any' | 'desktop' | 'browser')"
                >
                  <option value="any">通用</option>
                  <option value="desktop">桌面端</option>
                  <option value="browser">浏览器端</option>
                </select>
              </label>
              <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60 truncate max-w-[20rem]">{{ installedClawhubSelected?.path || '' }}</span>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                :class="installedClawhubEditMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
                  : 'border-zinc-200 bg-white/75 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                :disabled="!installedClawhubSelected"
                @click.stop.prevent="installedClawhubEditMode = !installedClawhubEditMode"
              >
                {{ installedClawhubEditMode ? '预览' : '编辑' }}
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded border border-rose-200 bg-white/75 text-xs text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900/60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                :disabled="installedClawhubDeleting || !installedClawhubSelected"
                @click.stop.prevent="removeInstalledClawHubSkill"
              >
                {{ installedClawhubDeleting ? '删除中…' : '删除' }}
              </button>
              <button
                v-if="installedClawhubEditMode"
                type="button"
                class="px-3 py-1.5 rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="installedClawhubSaving || !installedClawhubSelected"
                @click.stop.prevent="saveInstalledClawHubSkill"
              >
                {{ installedClawhubSaving ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
          <div v-if="installedClawhubError" class="mx-5 mt-3 text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">
            {{ installedClawhubError }}
          </div>
          <div v-if="installedClawhubNotice" class="mx-5 mt-3 text-xs text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
            {{ installedClawhubNotice }}
          </div>
          <div class="flex-1 min-h-0 p-5 overflow-y-auto">
            <div
              v-if="!installedClawhubEditMode"
              class="h-full text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800"
            >
              <MarkdownText
                v-if="installedClawhubPreview.trim()"
                :text="installedClawhubPreview"
              />
              <div v-else class="text-zinc-400">（无内容）</div>
            </div>
            <textarea
              v-else
              v-model="installedClawhubDraft"
              class="w-full h-full resize-none whitespace-pre font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
              spellcheck="false"
            />
          </div>
        </div>
      </div>
    </div>
    <McpAiTestModal
      v-model:show="mcpTestModalOpen"
      :tool-name="mcpTestTarget?.tool?.name || ''"
      :device-id="mcpTestTarget?.device?.device_id || ''"
      :device-type="mcpTestTarget?.device?.device_type || 'desktop'"
      :description="mcpTestTarget?.tool?.description || ''"
      :input-schema="mcpTestInputSchema"
      @close="closeMcpTestModal"
    />
    </Teleport>
  </div>
</template>
