import type { Agent, AgentRole, AgentStatus, AgentTaskSnapshot } from '@/types'
import type { LibraryMcpFullView } from '@/api/librarian'
import { TOKEN_LIMIT_DEFAULTS } from '@/constants/dashboard'

export interface ConnectedDevice {
  id: string
  name: string
  platform?: string
  aiConfigId?: number
  boundAiConfigIds?: number[]
  isWindowsDesktop?: boolean
  isBrowserExtension?: boolean
  isAndroid?: boolean
  isWorkshop?: boolean
  deviceType?: string
  icon?: string
  remark?: string
  reportedAiDescription?: string
  aiDescriptionOverride?: string
  effectiveAiDescription?: string
  catalogGeneration?: number
  catalogHash?: string
  catalogProtocolVersion?: number
  iconOverride?: string
  capabilities: string[]
  libraryGovernanceTools?: string[]
  libraryMcpCatalog?: LibraryMcpFullView | null
  version?: string
  lifecycle?: string
  online?: boolean
  group?: string
  workspaceRoot?: string
  lastTaskId?: string | null
  lastTaskStatus?: string | null
  lastTaskAt?: number | null
  lastError?: string | null
  connectedAt?: number
}

export function normalizeLifecycleStatus(value?: string): AgentStatus {
  if (value === 'learning' || value === 'working' || value === 'reproducing' || value === 'dead') {
    return value
  }
  return 'working'
}

export function normalizeProjectStatus(value?: string): 'running' | 'ended' {
  return value === 'ended' ? 'ended' : 'running'
}

export function normalizeRuntimeStatus(value?: string): 'running' | 'idle' | 'error' {
  if (value === 'running' || value === 'error') return value
  return 'idle'
}

export function rememberLatestRuntimeTool(
  store: Map<number, string>,
  configId?: number,
  tool?: string,
) {
  if (typeof configId !== 'number' || !Number.isFinite(configId)) return ''
  const normalized = String(tool || '').trim()
  if (normalized) {
    store.set(configId, normalized)
    return normalized
  }
  return store.get(configId) || ''
}

export function createAgent(payload: Omit<Agent, 'id' | 'tokensUsed'> & { id?: string; tokensUsed?: number }) {
  const id = payload.id ?? `${payload.role}-${Date.now()}`
  return {
    ...payload,
    id,
    tokensUsed: payload.tokensUsed ?? 0,
  }
}

export function parseTaskSnapshot(raw: any): AgentTaskSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || '').trim()
  if (!title) return null
  return {
    jobId: String(raw.job_id || ''),
    title,
    status: String(raw.status || ''),
    effectiveStatus: String(raw.effective_status || raw.status || 'idle'),
    runStatus: String(raw.run_status || ''),
    triggerType: String(raw.trigger_type || ''),
    scheduleEnabled: !!raw.schedule_enabled,
    scheduleAt: Number.isFinite(Number(raw.schedule_at)) ? Number(raw.schedule_at) : undefined,
    scheduleLoopEnabled: !!raw.schedule_loop_enabled,
    scheduleDurationMinutes: Math.max(0, Number(raw.schedule_duration_minutes) || 0),
    taskTokenUsed: Math.max(0, Number(raw.task_token_used) || 0),
    taskTokenLimit: Number(raw.task_token_limit) || 0,
    createdAt: Number.isFinite(Number(raw.created_at)) ? Number(raw.created_at) : undefined,
    updatedAt: Number.isFinite(Number(raw.updated_at)) ? Number(raw.updated_at) : undefined,
    startedAt: Number.isFinite(Number(raw.started_at)) ? Number(raw.started_at) : undefined,
    finishedAt: Number.isFinite(Number(raw.finished_at)) ? Number(raw.finished_at) : undefined,
  }
}

export function parseConnectedAiConfigId(raw: any) {
  const direct = Number(raw?.aiConfigId ?? raw?.ai_config_id)
  if (Number.isFinite(direct) && direct > 0) return direct
  const id = String(raw?.id || raw?.deviceId || '')
  const match = id.match(/^win-desktop-(\d+)$/)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function normalizeConnectedDevice(raw: any): ConnectedDevice {
  return {
    id: String(raw?.id ?? raw?.socketId ?? ''),
    name: String(raw?.name ?? raw?.id ?? 'agent'),
    platform: raw?.platform ? String(raw.platform) : undefined,
    aiConfigId: parseConnectedAiConfigId(raw),
    boundAiConfigIds: Array.isArray(raw?.boundAiConfigIds)
      ? raw.boundAiConfigIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : undefined,
    isWindowsDesktop: !!raw?.isWindowsDesktop,
    isBrowserExtension: !!raw?.isBrowserExtension,
    isAndroid: !!raw?.isAndroid,
    isWorkshop: !!raw?.isWorkshop,
    deviceType: raw?.deviceType ? String(raw.deviceType).toLowerCase() : undefined,
    icon: raw?.icon ? String(raw.icon) : undefined,
    remark: raw?.remark ? String(raw.remark) : undefined,
    reportedAiDescription: raw?.reportedAiDescription ? String(raw.reportedAiDescription) : undefined,
    aiDescriptionOverride: raw?.aiDescriptionOverride ? String(raw.aiDescriptionOverride) : undefined,
    effectiveAiDescription: raw?.effectiveAiDescription ? String(raw.effectiveAiDescription) : undefined,
    catalogGeneration: Number.isFinite(Number(raw?.catalogGeneration)) ? Number(raw.catalogGeneration) : undefined,
    catalogHash: raw?.catalogHash ? String(raw.catalogHash) : undefined,
    catalogProtocolVersion: Number.isFinite(Number(raw?.catalogProtocolVersion))
      ? Number(raw.catalogProtocolVersion)
      : undefined,
    iconOverride: raw?.iconOverride ? String(raw.iconOverride) : undefined,
    capabilities: Array.isArray(raw?.capabilities) ? raw.capabilities.map((c: any) => String(c)) : [],
    libraryGovernanceTools: Array.isArray(raw?.libraryGovernanceTools)
      ? raw.libraryGovernanceTools.map((c: any) => String(c))
      : undefined,
    libraryMcpCatalog: raw?.libraryMcpCatalog && typeof raw.libraryMcpCatalog === 'object'
      ? raw.libraryMcpCatalog as LibraryMcpFullView
      : undefined,
    version: raw?.version ? String(raw.version) : undefined,
    lifecycle: raw?.lifecycle ? String(raw.lifecycle) : undefined,
    online: raw?.online === false ? false : true,
    group: raw?.group ? String(raw.group) : undefined,
    workspaceRoot: raw?.workspaceRoot ? String(raw.workspaceRoot) : undefined,
    lastTaskId: raw?.lastTaskId ?? null,
    lastTaskStatus: raw?.lastTaskStatus ?? null,
    lastTaskAt: Number.isFinite(Number(raw?.lastTaskAt)) ? Number(raw.lastTaskAt) : null,
    lastError: raw?.lastError ?? null,
    connectedAt: Number.isFinite(Number(raw?.connectedAt)) ? Number(raw.connectedAt) : undefined,
  }
}

export function decorateAgentsWithEndpointConnections(agents: Agent[], connectedDevices: ConnectedDevice[]) {
  const desktopByConfig = new Map<number, ConnectedDevice>()
  const browserByConfig = new Map<number, ConnectedDevice>()
  const androidByConfig = new Map<number, ConnectedDevice>()
  for (const connected of connectedDevices) {
    const configId = Number(connected.aiConfigId)
    if (!Number.isFinite(configId) || configId <= 0) continue
    const platform = String(connected.platform || '').toLowerCase()
    const isAndroid = !!connected.isAndroid || platform.includes('android')
    const isDesktop = !isAndroid && (!!connected.isWindowsDesktop
      || String(connected.id || '').startsWith('win-desktop-')
      || platform.includes('desktop'))
    const isBrowser = !!connected.isBrowserExtension
      || platform.includes('browser-extension')
      || platform.includes('browser')
    if (isAndroid) androidByConfig.set(configId, connected)
    if (isDesktop) desktopByConfig.set(configId, connected)
    if (isBrowser) browserByConfig.set(configId, connected)
  }
  for (const agent of agents) {
    const configId = Number(agent.aiConfigId)
    const desktop = Number.isFinite(configId) ? desktopByConfig.get(configId) : undefined
    const browser = Number.isFinite(configId) ? browserByConfig.get(configId) : undefined
    const android = Number.isFinite(configId) ? androidByConfig.get(configId) : undefined
    agent.desktopAgentConnected = !!desktop
    agent.desktopAgentId = desktop?.id || ''
    agent.desktopAgentName = desktop?.name || ''
    agent.desktopAgentPlatform = desktop?.platform || ''
    agent.desktopAgentCapabilities = desktop?.capabilities || []
    agent.browserAgentConnected = !!browser
    agent.browserAgentId = browser?.id || ''
    agent.browserAgentName = browser?.name || ''
    agent.browserAgentPlatform = browser?.platform || ''
    agent.browserAgentCapabilities = browser?.capabilities || []
    agent.androidAgentConnected = !!android
    agent.androidAgentId = android?.id || ''
    agent.androidAgentName = android?.name || ''
    agent.androidAgentPlatform = android?.platform || ''
    agent.androidAgentCapabilities = android?.capabilities || []
  }
}

function scheduledTasksFromRow(row: any, taskCurrent: AgentTaskSnapshot | null, taskCurrentOrRecent: AgentTaskSnapshot | null) {
  const taskScheduledTasks = Array.isArray(row.task_scheduled_tasks)
    ? row.task_scheduled_tasks.map(parseTaskSnapshot).filter(Boolean) as AgentTaskSnapshot[]
    : []
  if (taskScheduledTasks.length === 0) {
    const fallbackScheduled = taskCurrentOrRecent
      && String(taskCurrentOrRecent.triggerType || '').toLowerCase() === 'schedule'
      && !taskCurrent
      ? taskCurrentOrRecent
      : null
    if (fallbackScheduled) taskScheduledTasks.push(fallbackScheduled)
  }
  return taskScheduledTasks
}

function emptyEndpointBindings() {
  return {
    desktopAgentConnected: false,
    desktopAgentId: '',
    desktopAgentName: '',
    desktopAgentPlatform: '',
    desktopAgentCapabilities: [] as string[],
    browserAgentConnected: false,
    browserAgentId: '',
    browserAgentName: '',
    browserAgentPlatform: '',
    browserAgentCapabilities: [] as string[],
    androidAgentConnected: false,
    androidAgentId: '',
    androidAgentName: '',
    androidAgentPlatform: '',
    androidAgentCapabilities: [] as string[],
  }
}

function botFieldsFromRow(row: any) {
  return {
    botChannel: row.bot_channel === 'wechat' ? 'wechat' as const : (row.bot_channel === 'qq' ? 'qq' as const : 'feishu' as const),
    botEnabled: !!row.bot_enabled,
    botStatus: row.bot_status || undefined,
    feishuEnabled: !!row.bot_configs?.feishu?.enabled,
    feishuWebhookUrl: row.bot_configs?.feishu?.webhook_url || '',
    feishuAppId: row.bot_configs?.feishu?.app_id || '',
    feishuDefaultReceiveId: row.bot_configs?.feishu?.default_receive_id || '',
    feishuDefaultReceiveIdType: row.bot_configs?.feishu?.default_receive_id_type || 'chat_id',
    feishuStatus: row.bot_statuses?.feishu || undefined,
    qqEnabled: !!row.bot_configs?.qq?.enabled,
    qqAppId: row.bot_configs?.qq?.app_id || '',
    qqSandbox: row.bot_configs?.qq?.sandbox !== false,
    qqDefaultTargetId: row.bot_configs?.qq?.default_target_id || '',
    qqDefaultTargetType: row.bot_configs?.qq?.default_target_type || 'c2c',
    qqStatus: row.bot_statuses?.qq || undefined,
    wechatEnabled: !!row.bot_configs?.wechat?.enabled,
    wechatStatus: row.bot_statuses?.wechat || undefined,
  }
}

export function mapAiCardToAgent(
  row: any,
  unassignedProjectId: string,
  getProjectName: (projectId: string, fallbackName?: string) => string,
  runtimeTool: string,
): Agent {
  const parsedConfigId = Number(row.id)
  const configId = Number.isFinite(parsedConfigId) ? parsedConfigId : undefined
  const projectId = row.project_id || unassignedProjectId
  const aiRole = 'digital_member' as const
  const digitalMemberRole = (row.digital_member_role === 'manager' ? 'manager' : 'member') as 'manager' | 'member'
  const isCoreMember = digitalMemberRole === 'manager' || row.switch_key === 'assistant_default'
  const uiRole: AgentRole = isCoreMember ? 'admin' : 'worker'
  const defaultTokenLimit = uiRole === 'admin' ? TOKEN_LIMIT_DEFAULTS.admin : TOKEN_LIMIT_DEFAULTS.worker
  const parsedTokenLimit = Number(row.token_limit)
  const taskCurrent = parseTaskSnapshot(row.task_current)
  const taskCurrentOrRecent = parseTaskSnapshot(row.task_current_or_recent)
  const taskRecentCompleted = parseTaskSnapshot(row.task_recent_completed)
  return createAgent({
    id: `cfg-${row.id}`,
    name: row.name,
    avatar: row.avatar || undefined,
    role: uiRole,
    aiRole,
    digitalMemberRole,
    tokenLimit: Number.isFinite(parsedTokenLimit) ? parsedTokenLimit : defaultTokenLimit,
    generation: Math.max(1, Number(row.generation) || 1),
    status: normalizeLifecycleStatus(row.lifecycle_status),
    platform: row.platform || '服务器',
    currentTask: row.current_behavior || '等待指令...',
    projectId,
    projectName: getProjectName(projectId, row.project_name),
    parentAiConfigId: Number.isFinite(Number(row.parent_ai_config_id)) ? Number(row.parent_ai_config_id) : null,
    managementScope: row.management_scope || 'self',
    workspaceRoot: row.workspace_root || row.workspaceRoot || '',
    tokensUsed: row.token_used || 0,
    aiConfigId: configId,
    enabled: !!row.enabled,
    mcpEnabled: !!row.mcp_enabled,
    mcpTools: row.mcp_tools || '[]',
    ...botFieldsFromRow(row),
    ...emptyEndpointBindings(),
    runtimeStatus: normalizeRuntimeStatus(row.runtime_status),
    runtimeTool,
    activeRunStatus: String(row.active_run_status || ''),
    activeRunPhase: String(row.active_run_phase || 'idle'),
    activeRunSessionId: String(row.active_run_session_id || ''),
    userChatActive: !!row.user_chat_active,
    recentUserChatActive: !!row.recent_user_chat_active,
    recentUserChatAt: Number.isFinite(Number(row.recent_user_chat_at)) ? Number(row.recent_user_chat_at) : undefined,
    model: row.model || '',
    currentTaskTitle: row.current_task_title || '',
    currentTaskStatus: row.current_task_status || 'idle',
    taskCurrent,
    taskCurrentOrRecent,
    taskRecentCompleted,
    taskScheduledTasks: scheduledTasksFromRow(row, taskCurrent, taskCurrentOrRecent),
    latestThinking: row.latest_thinking || '',
  })
}
