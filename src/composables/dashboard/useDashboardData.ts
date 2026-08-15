import { onUnmounted, ref, watch } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type {
  Agent,
  KnowledgeItem,
  McpStatusPayload,
  ProjectItem,
} from '@/types'
import { listEntries, type KnowledgeEntryItem } from '@/api/librarian'
import { formatDate } from '@/utils/datetime'
import { listAiCards } from '@/api/ai'
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  listProjects,
  updateProject as apiUpdateProject,
  type UpsertProjectPayload,
} from '@/api/projects'
import { listConnectedDevices } from '@/api/devices'
import { listWorkspaceFiles } from '@/api/workspace'
import { getAuthToken } from '@/api/http'
import {
  decorateAgentsWithEndpointConnections,
  mapAiCardToAgent,
  normalizeConnectedDevice,
  normalizeProjectStatus,
  normalizeRuntimeStatus,
  rememberLatestRuntimeTool,
  type ConnectedDevice,
} from './dashboardDataNormalize'

export type { ConnectedDevice }

type MessageType = 'info' | 'success' | 'warning' | 'error'
type AlertFn = (options: string | { message: string; type?: MessageType }) => Promise<void>
type ConfirmFn = (options: string | { message: string; type?: MessageType }) => Promise<boolean>

interface UseDashboardDataOptions {
  unassignedProjectId: string
  alert: AlertFn
  confirm: ConfirmFn
  getCurrentUserId: () => number
}

export const useDashboardData = (options: UseDashboardDataOptions) => {
  const { unassignedProjectId, alert, confirm, getCurrentUserId } = options

  const agents = ref<Agent[]>([])
  const connectedDevices = ref<ConnectedDevice[]>([])
  const knowledgeBase = ref<KnowledgeItem[]>([])
  const projects = ref<ProjectItem[]>([])
  const globalGeneration = ref(1)
  const allFiles = ref<string[]>([])
  const dashboardSocketConnected = ref(false)

  let dashboardRefreshing = false
  let dashboardSocket: Socket | null = null
  const latestRuntimeToolByConfig = new Map<number, string>()

  const rememberRuntimeTool = (configId?: number, tool?: string) =>
    rememberLatestRuntimeTool(latestRuntimeToolByConfig, configId, tool)

  const getProjectName = (projectId: string, fallbackName?: string) => {
    if (projectId === unassignedProjectId) return '学习中'
    const match = projects.value.find(project => project.id === projectId)
    return match?.name ?? fallbackName ?? projectId
  }

  const addKnowledge = (title: string, author: string, tags: string[]) => {
    knowledgeBase.value.unshift({
      id: `k-${Date.now()}`,
      title,
      author,
      time: new Date().toLocaleTimeString(),
      tags,
    })
  }

  const loadProjectContext = async () => {
    if (!getAuthToken()) return
    try {
      allFiles.value = await listWorkspaceFiles()
    } catch (err) {
      console.error('Failed to load project context:', err)
    }
  }

  const loadProjects = async () => {
    if (!getAuthToken()) return
    let rows
    try {
      rows = await listProjects()
    } catch {
      return
    }
    projects.value = (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: normalizeProjectStatus(row.status),
      aiMemberIds: Array.isArray(row.ai_member_ids)
        ? row.ai_member_ids.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v))
        : [],
    }))
  }

  const loadAIAgents = async () => {
    if (!getAuthToken()) return
    let rows
    try {
      rows = await listAiCards()
    } catch {
      return
    }
    agents.value = (Array.isArray(rows) ? rows : []).map((row: any) => {
      const parsedConfigId = Number(row.id)
      const configId = Number.isFinite(parsedConfigId) ? parsedConfigId : undefined
      const runtimeTool = rememberRuntimeTool(configId, row.latest_mcp_tool || row.runtime_tool || '')
      return mapAiCardToAgent(row, unassignedProjectId, getProjectName, runtimeTool)
    })
    decorateAgentsWithEndpointConnections(agents.value, connectedDevices.value)
    const maxGeneration = agents.value.reduce((max, agent) => Math.max(max, Number(agent.generation) || 1), 1)
    globalGeneration.value = Math.max(1, maxGeneration)
  }

  const createProject = async (payload: UpsertProjectPayload) => {
    if (!getAuthToken()) return
    try {
      await apiCreateProject(payload)
    } catch (err: any) {
      void alert({ message: err?.message || '项目创建失败', type: 'error' })
      return
    }
    void alert({ message: '项目已创建', type: 'success' })
    await loadProjects()
    await loadAIAgents()
  }

  const updateProject = async (payload: { id: string; data: UpsertProjectPayload }) => {
    if (!getAuthToken()) return
    try {
      await apiUpdateProject(payload.id, payload.data)
    } catch (err: any) {
      void alert({ message: err?.message || '项目更新失败', type: 'error' })
      return
    }
    void alert({ message: '项目已更新', type: 'success' })
    await loadProjects()
    await loadAIAgents()
  }

  const deleteProject = async (projectId: string) => {
    if (!(await confirm({ message: '确认删除该项目？关联 AI 将转为未分配。', type: 'warning' }))) return
    if (!getAuthToken()) return
    try {
      await apiDeleteProject(projectId)
    } catch (err: any) {
      void alert({ message: err?.message || '项目删除失败', type: 'error' })
      return
    }
    void alert({ message: '项目已删除', type: 'success' })
    await loadProjects()
    await loadAIAgents()
  }

  const applyMcpStatusLive = (payload: McpStatusPayload) => {
    const currentUserId = Number(getCurrentUserId())
    const payloadUserId = Number(payload?.userId)
    if (!Number.isFinite(currentUserId) || !Number.isFinite(payloadUserId) || payloadUserId !== currentUserId) return
    const configId = Number(payload?.aiConfigId)
    if (!Number.isFinite(configId)) return
    const state = normalizeRuntimeStatus(String(payload?.state || '').toLowerCase())
    const tool = rememberRuntimeTool(configId, payload?.tool)
    const target = agents.value.find(agent => Number(agent.aiConfigId) === configId)
    if (!target) return
    target.runtimeStatus = state
    if (tool) target.runtimeTool = tool
  }

  const applyConnectedDevices = (rows: any) => {
    connectedDevices.value = (Array.isArray(rows) ? rows : []).map(normalizeConnectedDevice)
    decorateAgentsWithEndpointConnections(agents.value, connectedDevices.value)
  }

  const loadConnectedDevices = async () => {
    if (!getAuthToken()) return
    try {
      const data = await listConnectedDevices()
      applyConnectedDevices(data?.agents)
    } catch (err) {
      console.error('Failed to load connected agents:', err)
    }
  }

  const disconnectDashboardSocket = () => {
    if (!dashboardSocket) return
    dashboardSocket.off('connect')
    dashboardSocket.off('disconnect')
    dashboardSocket.off('connect_error')
    dashboardSocket.off('mcp:status')
    dashboardSocket.off('device:list')
    dashboardSocket.disconnect()
    dashboardSocket = null
    dashboardSocketConnected.value = false
  }

  const connectDashboardSocket = (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) return
    if (dashboardSocket) return
    const token = getAuthToken()
    if (!token) return
    dashboardSocket = io('/', {
      transports: ['websocket', 'polling'],
      auth: { token },
    })
    dashboardSocket.on('connect', () => {
      dashboardSocketConnected.value = true
      dashboardSocket?.emit('ui:join')
      void loadConnectedDevices()
    })
    dashboardSocket.on('disconnect', () => {
      dashboardSocketConnected.value = false
    })
    dashboardSocket.on('connect_error', () => {
      dashboardSocketConnected.value = false
    })
    dashboardSocket.on('mcp:status', (payload: McpStatusPayload) => {
      applyMcpStatusLive(payload)
    })
    dashboardSocket.on('device:list', (rows: any) => {
      applyConnectedDevices(rows)
    })
    dashboardSocket.on('librarian:proposal_resolved', () => {
      loadKnowledgeEntries()
    })
  }

  const formatKnowledgeTime = (ts: number) => formatDate(ts, '')

  const scopeLabel = (entry: KnowledgeEntryItem) => {
    if (entry.scope === 'global') return '系统'
    if (entry.scope === 'project') return '业务'
    if (entry.scope === 'ai') return '传承'
    return entry.scope || '知识'
  }

  const loadKnowledgeEntries = async () => {
    const token = getAuthToken()
    if (!token) return
    try {
      const data = await listEntries(token, { status: 'active' })
      knowledgeBase.value = (data.items || []).map(entry => {
        const tags = [
          scopeLabel(entry),
          ...entry.triggers.slice(0, 3),
        ].filter(Boolean)
        return {
          id: entry.memory_id,
          title: entry.title,
          author: entry.memory_id.startsWith('builtin.')
            ? '系统内置'
            : (entry.source_job_id ? `任务传承 · 第 ${entry.source_generation || 1} 代` : '图书管理员'),
          time: formatKnowledgeTime(entry.updated_at || entry.created_at),
          tags: tags.length ? tags : ['知识'],
        }
      })
    } catch {
      // best-effort
    }
  }

  const refreshDashboardLive = async (
    onRefreshOpenTaskPanel: () => Promise<void>,
    options: { force?: boolean } = {},
  ) => {
    if (dashboardRefreshing && !options.force) return
    dashboardRefreshing = true
    try {
      await Promise.all([
        loadAIAgents(),
        loadConnectedDevices(),
        loadKnowledgeEntries(),
        onRefreshOpenTaskPanel(),
      ])
    } finally {
      dashboardRefreshing = false
    }
  }

  const ensureKnowledgeFallback = () => {
    if (knowledgeBase.value.length === 0) {
      knowledgeBase.value = [
        { id: 'k1', title: '学习总结数据库规范 v1.0', author: '阿尔法', time: '2026-03-01', tags: ['记忆', '规范'] },
        { id: 'k2', title: '多 Agent 端接入与行为准则', author: '阿尔法', time: '2026-03-05', tags: ['接入', '治理'] },
      ]
    }
  }

  const createSeedData = async () => {
    // 项目影响成员归属展示，先读取项目；成员完成后即可展示控制台。
    await loadProjects()
    await loadAIAgents()

    // 设备与知识体积更大，但并非首屏骨架必需，后台加载以缩短遮罩停留时间。
    void Promise.all([
      loadConnectedDevices(),
      loadKnowledgeEntries(),
    ]).then(ensureKnowledgeFallback)
  }

  watch(
    () => getCurrentUserId(),
    (value) => {
      disconnectDashboardSocket()
      const userId = Number(value)
      if (Number.isFinite(userId) && userId > 0) connectDashboardSocket(userId)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    disconnectDashboardSocket()
  })

  return {
    agents,
    connectedDevices,
    knowledgeBase,
    projects,
    globalGeneration,
    allFiles,
    dashboardSocketConnected,
    loadProjectContext,
    loadProjects,
    loadAIAgents,
    loadKnowledgeEntries,
    loadConnectedDevices,
    createProject,
    updateProject,
    deleteProject,
    addKnowledge,
    createSeedData,
    refreshDashboardLive,
  }
}
