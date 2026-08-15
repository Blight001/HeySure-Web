<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useMcpAndWorkspaceModal } from '@/composables/dashboard/useMcpAndWorkspaceModal'
import { useTaskManagement } from '@/composables/dashboard/useTaskManagement'
import { useAiConfigManagement } from '@/composables/dashboard/useAiConfigManagement'
import { useDashboardData } from '@/composables/dashboard/useDashboardData'
import { useDashboardUi } from '@/composables/dashboard/useDashboardUi'
import { useDashboardSystemSettings } from '@/composables/dashboard/useDashboardSystemSettings'
import { useBreakpoint } from '@/composables/useBreakpoint'
import {
  DASHBOARD_REFRESH_FAST_MS,
  DASHBOARD_REFRESH_HIDDEN_MS,
  DASHBOARD_REFRESH_MOBILE_STREAM_MS,
  DASHBOARD_REFRESH_NORMAL_MS,
  DASHBOARD_REFRESH_STREAM_MS,
  UNASSIGNED_PROJECT_ID,
} from '@/constants/dashboard'
import { DEFAULT_MCP_TOOLS } from '@/constants/mcp'
import type { Agent, McpToolDefinition, User } from '@/types'
import GodDashboardChrome from './GodDashboardChrome.vue'
import GodDashboardMainStage from './GodDashboardMainStage.vue'
import GodDashboardChatWorkspace from './GodDashboardChatWorkspace.vue'

const GodDashboardModals = defineAsyncComponent(() => import('./GodDashboardModals.vue'))

const { alert, confirm } = useMessage()

const props = defineProps<{
  currentUser?: User | null
}>()

const emit = defineEmits<{
  (e: 'login'): void
  (e: 'logout'): void
  (e: 'updateProfile'): void
  (e: 'refreshUser', user: User): void
  (e: 'ready'): void
}>()

const { isMobile } = useBreakpoint()
const mobileTab = ref<'console' | 'arena'>('console')
const arenaActivated = ref(false)
const focusedAgentConfigId = ref<number | null>(null)
const agentFocusSignal = ref(0)
const focusedDeviceId = ref('')
const deviceFocusSignal = ref(0)
const knowledgeFocusSignal = ref(0)
const chatActiveAiConfigId = ref<number | null>(null)
const adminModalOpen = ref(false)
const deviceDocOpen = ref(false)
const deviceToolsModalOpen = ref(false)
const deviceToolsInitialType = ref<'desktop' | 'browser' | 'android' | undefined>(undefined)
const mcpToolMetaByName = ref<Record<string, McpToolDefinition>>({})
const defaultMcpTools = [...DEFAULT_MCP_TOOLS]
const isAdminUser = computed(() => ['owner', 'admin'].includes(props.currentUser?.role || ''))
let dashboardRefreshTimer: number | null = null
let dashboardRefreshLoopActive = false

const systemApi = useDashboardSystemSettings({
  getCurrentUser: () => props.currentUser,
  alert,
  onRefreshUser: user => emit('refreshUser', user),
})
const dataApi = useDashboardData({
  unassignedProjectId: UNASSIGNED_PROJECT_ID,
  alert,
  confirm,
  getCurrentUserId: () => Number(props.currentUser?.id),
})
const uiApi = useDashboardUi({
  unassignedProjectId: UNASSIGNED_PROJECT_ID,
  agents: dataApi.agents,
})
const mcpApi = useMcpAndWorkspaceModal({ mcpToolMetaByName })
const aiApi = useAiConfigManagement({
  defaultMcpTools,
  mcpToolMetaByName,
  modelPresets: systemApi.modelPresets,
  normalizeSystemAutoControl: systemApi.normalizeSystemAutoControl,
  alert,
  onReloadAgents: dataApi.loadAIAgents,
})
const taskApi = useTaskManagement({
  availableMcpTools: aiApi.availableMcpTools,
  defaultMcpTools,
  alert,
  confirm,
  onReloadAgents: dataApi.loadAIAgents,
})
const system = reactive(systemApi)
const data = reactive(dataApi)
const ui = reactive(uiApi)
const mcp = reactive(mcpApi)
const ai = reactive(aiApi)
const tasks = reactive(taskApi)

type ChatWorkspaceHandle = {
  openAgentChat: (agent: Agent, options?: { floating?: boolean }) => void
  openAgentTaskDetail: (agent: Agent, jobId: string, sessionId?: string) => void
  syncOpenAgentReferences: () => void
  repositionFloat: () => void
}

type MainStageHandle = {
  getSocialRect: () => DOMRect | null
}

const chatWorkspaceRef = ref<ChatWorkspaceHandle | null>(null)
const mainStageRef = ref<MainStageHandle | null>(null)
const getSocialRect = () => mainStageRef.value?.getSocialRect() ?? null

const activateArenaTab = () => {
  mobileTab.value = 'arena'
  arenaActivated.value = true
}

const revealConsolePanel = () => {
  ui.leftCollapsed = false
  if (isMobile.value) mobileTab.value = 'console'
}

const onWorldFocusAgent = (aiConfigId: number) => {
  if (!data.agents.some(agent => Number(agent.aiConfigId) === aiConfigId)) return
  focusedAgentConfigId.value = aiConfigId
  agentFocusSignal.value += 1
  revealConsolePanel()
}

const onWorldOpenKnowledge = () => {
  knowledgeFocusSignal.value += 1
  revealConsolePanel()
}

const onWorldFocusDevice = (deviceId: string) => {
  if (!deviceId) return
  focusedDeviceId.value = deviceId
  deviceFocusSignal.value += 1
  revealConsolePanel()
}

const refreshDashboardAfterSave = async () => {
  await data.refreshDashboardLive(tasks.refreshOpenTaskPanel, { force: true })
  chatWorkspaceRef.value?.syncOpenAgentReferences()
  const current = tasks.taskListTarget
  if (!current) return
  const configId = Number(current.aiConfigId)
  tasks.taskListTarget = (
    (Number.isFinite(configId) && data.agents.find(item => Number(item.aiConfigId) === configId))
    || data.agents.find(item => item.id === current.id)
    || current
  )
}

const saveAiConfigAndRefresh = async () => {
  const saved = await ai.saveAiConfig()
  if (saved) await refreshDashboardAfterSave()
}

const deleteAiConfigAndRefresh = async () => {
  await ai.deleteAiConfig()
  await refreshDashboardAfterSave()
}

const openAllMcpToolsFromSystemSettings = async () => {
  if (Object.keys(mcpToolMetaByName.value || {}).length === 0) {
    await ai.loadMcpTools()
  }
  mcp.showAllServerMcpTools('当前服务器所有的mcp接口')
}

const onManageDeviceTools = (payload?: { deviceType?: string }) => {
  if (payload?.deviceType && ['desktop', 'browser', 'android'].includes(payload.deviceType)) {
    deviceToolsInitialType.value = payload.deviceType as 'desktop' | 'browser' | 'android'
  } else {
    deviceToolsInitialType.value = undefined
  }
  deviceToolsModalOpen.value = true
}

const closeDeviceToolsModal = () => {
  deviceToolsModalOpen.value = false
  deviceToolsInitialType.value = undefined
}

const onSidebarChat = (agent: Agent) => chatWorkspaceRef.value?.openAgentChat(agent)
const onOpenAgentTaskDetailFromCard = async (payload: { agent: Agent; jobId: string }) => {
  if (payload?.agent?.aiConfigId) await tasks.openAgentTaskList(payload.agent)
}
const onShowTaskDetail = (job: { job_id: string; session_id?: string }) => {
  const agent = tasks.taskListTarget
  if (!agent?.aiConfigId || !job?.job_id) return
  chatWorkspaceRef.value?.openAgentTaskDetail(agent, job.job_id, job.session_id)
}

const hasLiveThinking = computed(() => data.agents.some(agent => !!String(agent.latestThinking || '').trim()))

const getDashboardRefreshInterval = () => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return DASHBOARD_REFRESH_HIDDEN_MS
  if (hasLiveThinking.value) {
    return isMobile.value ? DASHBOARD_REFRESH_MOBILE_STREAM_MS : DASHBOARD_REFRESH_STREAM_MS
  }
  if (tasks.taskListModalOpen) return DASHBOARD_REFRESH_FAST_MS
  return data.dashboardSocketConnected ? DASHBOARD_REFRESH_NORMAL_MS : DASHBOARD_REFRESH_FAST_MS
}

const stopDashboardRefreshLoop = () => {
  dashboardRefreshLoopActive = false
  if (!dashboardRefreshTimer) return
  window.clearTimeout(dashboardRefreshTimer)
  dashboardRefreshTimer = null
}

const startDashboardRefreshLoop = () => {
  stopDashboardRefreshLoop()
  dashboardRefreshLoopActive = true
  const scheduleNext = () => {
    if (!dashboardRefreshLoopActive) return
    dashboardRefreshTimer = window.setTimeout(async () => {
      if (!dashboardRefreshLoopActive) return
      try {
        await data.refreshDashboardLive(tasks.refreshOpenTaskPanel)
      } finally {
        scheduleNext()
      }
    }, getDashboardRefreshInterval())
  }
  scheduleNext()
}

const handleDashboardVisibilityChange = () => {
  if (document.visibilityState !== 'visible') return
  void data.refreshDashboardLive(tasks.refreshOpenTaskPanel)
}

watch(() => data.dashboardSocketConnected, (connected, previous) => {
  if (connected && !previous) void data.refreshDashboardLive(tasks.refreshOpenTaskPanel)
})

watch(() => data.agents, () => {
  const current = tasks.taskListTarget
  if (!current) return
  const configId = Number(current.aiConfigId)
  tasks.taskListTarget = (
    (Number.isFinite(configId) && data.agents.find(item => Number(item.aiConfigId) === configId))
    || data.agents.find(item => item.id === current.id)
    || current
  )
}, { flush: 'post' })

onMounted(async () => {
  void ai.loadMcpTools()
  try {
    await data.createSeedData()
  } finally {
    emit('ready')
  }
  startDashboardRefreshLoop()
  document.addEventListener('visibilitychange', handleDashboardVisibilityChange)
})

onUnmounted(() => {
  stopDashboardRefreshLoop()
  document.removeEventListener('visibilitychange', handleDashboardVisibilityChange)
})
</script>

<template>
  <GodDashboardChrome
    :agent-count="data.agents.length"
    :global-generation="data.globalGeneration"
    :is-admin-user="isAdminUser"
    :current-user="currentUser"
    :user-menu-open="ui.userMenuOpen"
    @background-click="ui.closeSettings(); ui.closeUserMenu()"
    @open-admin="adminModalOpen = true"
    @open-settings="ui.settingsOpen = true"
    @toggle-user-menu="ui.userMenuOpen = !ui.userMenuOpen"
    @update-profile="emit('updateProfile'); ui.userMenuOpen = false"
    @logout="emit('logout'); ui.userMenuOpen = false"
    @login="emit('login')"
  >
    <GodDashboardMainStage
      ref="mainStageRef"
      :left-collapsed="ui.leftCollapsed"
      :is-mobile="isMobile"
      :mobile-tab="mobileTab"
      :arena-activated="arenaActivated"
      :admin-agents="ui.adminAgents"
      :member-agents="ui.sidebarMemberAgents"
      :active-agents="ui.activeAgents"
      :connected-devices="data.connectedDevices"
      :knowledge-items="data.knowledgeBase"
      :knowledge-total-count="data.knowledgeBase.length"
      :brain-view-mode="system.brainViewMode"
      :focused-ai-config-id="focusedAgentConfigId"
      :focus-signal="agentFocusSignal"
      :knowledge-focus-signal="knowledgeFocusSignal"
      :focused-device-id="focusedDeviceId"
      :device-focus-signal="deviceFocusSignal"
      :chat-ai-config-id="chatActiveAiConfigId"
      @update:left-collapsed="ui.leftCollapsed = $event"
      @update:mobile-tab="mobileTab = $event"
      @activate-arena="activateArenaTab"
      @update:brain-view-mode="system.saveBrainViewMode"
      @show-tasks="tasks.openAgentTaskList"
      @show-task-detail="onOpenAgentTaskDetailFromCard"
      @chat="onSidebarChat"
      @settings="ai.openAgentSettings"
      @create-ai="ai.openCreateAiConfig('worker')"
      @refresh-user="emit('refreshUser', $event)"
      @view-all-mcp="openAllMcpToolsFromSystemSettings"
      @manage-device-tools="onManageDeviceTools"
      @open-device-doc="deviceDocOpen = true"
      @focus-agent="onWorldFocusAgent"
      @open-knowledge="onWorldOpenKnowledge"
      @focus-device="onWorldFocusDevice"
      @social-ready="chatWorkspaceRef?.repositionFloat()"
    />

    <GodDashboardChatWorkspace
      ref="chatWorkspaceRef"
      :agents="data.agents"
      :current-user="currentUser"
      :all-files="data.allFiles"
      :connected-devices="data.connectedDevices"
      :mcp-dynamic-rule="system.mcpDynamicRule"
      :get-social-rect="getSocialRect"
      @update:active-ai-config-id="chatActiveAiConfigId = $event"
      @open-settings="ai.openAgentSettings"
      @refresh-files="data.loadProjectContext"
    />

    <GodDashboardModals
      :mcp="mcp"
      :tasks="tasks"
      :ai="ai"
      :system="system"
      :ui="ui"
      :connected-devices="data.connectedDevices"
      :default-mcp-tools="defaultMcpTools"
      :admin-open="adminModalOpen"
      :device-doc-open="deviceDocOpen"
      :device-tools-open="deviceToolsModalOpen"
      :device-tools-initial-type="deviceToolsInitialType"
      :current-user="currentUser"
      :model-presets="system.modelPresets"
      @update:admin-open="adminModalOpen = $event"
      @update:device-doc-open="deviceDocOpen = $event"
      @close-device-tools="closeDeviceToolsModal"
      @save-ai="saveAiConfigAndRefresh"
      @delete-ai="deleteAiConfigAndRefresh"
      @show-task-detail="onShowTaskDetail"
    />
  </GodDashboardChrome>
</template>
