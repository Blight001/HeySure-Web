<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useMcpAndWorkspaceModal } from '@/composables/dashboard/useMcpAndWorkspaceModal'
import { useTaskManagement } from '@/composables/dashboard/useTaskManagement'
import { useAiConfigManagement } from '@/composables/dashboard/useAiConfigManagement'
import { useDashboardData } from '@/composables/dashboard/useDashboardData'
import { useDashboardUi } from '@/composables/dashboard/useDashboardUi'
import { useDashboardSystemSettings } from '@/composables/dashboard/useDashboardSystemSettings'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'
import { BACKGROUND_POPUP_Z_INDEX, PINNED_POPUP_Z_INDEX } from '@/composables/usePopupZIndex'
import {
  DASHBOARD_REFRESH_FAST_MS,
  DASHBOARD_REFRESH_HIDDEN_MS,
  DASHBOARD_REFRESH_MOBILE_STREAM_MS,
  DASHBOARD_REFRESH_NORMAL_MS,
  DASHBOARD_REFRESH_STREAM_MS,
  UNASSIGNED_PROJECT_ID,
} from '@/constants/dashboard'
import { DEFAULT_MCP_TOOLS } from '@/constants/mcp'
import type { Agent, McpRoleMeta, McpToolDefinition, User } from '@/types'

import logoUrl from '@/assets/logo/HeySure.png'
import AppIcon from '@/components/common/AppIcon.vue'
import AmbientBackground from '@/components/common/AmbientBackground.vue'
import ChatTokenUsageBar from '@/components/chat/ChatTokenUsageBar.vue'
import { resolveAvatarUrl } from '@/utils/avatar'

const SystemSettingsPanel = defineAsyncComponent(() => import('./panels/SystemSettingsPanel.vue'))
const GlobalNotificationLayer = defineAsyncComponent(() => import('@/components/common/GlobalNotificationLayer.vue'))
const LeftSidebarPanel = defineAsyncComponent(() => import('./panels/LeftSidebarPanel.vue'))
const WorldArenaPanel = defineAsyncComponent(() => import('./panels/WorldArenaPanel.vue'))
const ChatInterface = defineAsyncComponent(() => import('@/components/chat/ChatInterface.vue'))
const FloatingAgentChatWindow = defineAsyncComponent(() => import('./FloatingAgentChatWindow.vue'))
const TaskProgressPanel = defineAsyncComponent(() => import('@/components/chat/TaskProgressPanel.vue'))
const McpToolsModal = defineAsyncComponent(() => import('./modals/McpToolsModal.vue'))
const DeviceDynamicToolsModal = defineAsyncComponent(() => import('./modals/DeviceDynamicToolsModal.vue'))
const TaskManagementModal = defineAsyncComponent(() => import('./modals/TaskManagementModal.vue'))
const AiConfigModal = defineAsyncComponent(() => import('./modals/AiConfigModal.vue'))
const AdminModal = defineAsyncComponent(() => import('./modals/AdminModal.vue'))
const DeviceDevDocModal = defineAsyncComponent(() => import('./modals/DeviceDevDocModal.vue'))
const MessageDialog = defineAsyncComponent(() => import('@/components/common/MessageDialog.vue'))

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
// Automatic chat opening is decided from the initial viewport only. Resizing a
// desktop browser later must not unexpectedly open a conversation.
const autoOpenGovernorChatOnLoad = isMobile.value
// 移动端单窗格 Tab：console = 左侧控制台面板，arena = 社会显示（游戏画面）
const mobileTab = ref<'console' | 'arena'>('console')
// 社会显示 iframe 较重，移动端懒加载：首次切到该 Tab 才挂载，之后用 v-show 保活避免重载
const arenaActivated = ref(false)
const activateArenaTab = () => {
  mobileTab.value = 'arena'
  arenaActivated.value = true
}

const selectedFiles = ref<string[]>([])
const focusedAgentConfigId = ref<number | null>(null)
const agentFocusSignal = ref(0)
const focusedDeviceId = ref('')
const deviceFocusSignal = ref(0)
const knowledgeFocusSignal = ref(0)
const worldArenaPanelRef = ref<{ getBoundingRect: () => DOMRect | null } | null>(null)
const chatModalOpen = ref(false)
const chatTarget = ref<Agent | null>(null)
// 大对话是背景工作区，不遮挡普通业务弹窗；悬浮/PiP 小窗仍保持置顶，
// 设置类弹窗因此自然显示在小窗下方。
const agentChatZIndex = computed(() =>
  chatFloating.value || chatPipActive.value
    ? PINNED_POPUP_Z_INDEX
    : BACKGROUND_POPUP_Z_INDEX,
)
const chatInitialSessionId = ref('')
const chatCurrentSessionId = ref('')
const chatTaskPlanRefreshSignal = ref(0)
const chatLiveTokenUsed = ref(0)
type FloatingAgentChat = {
  windowId: string
  agent: Agent
  initialSessionId: string
  zIndex: number
}
const floatingAgentChats = ref<FloatingAgentChat[]>([])
let floatingChatSequence = 0
let floatingChatZIndex = PINNED_POPUP_Z_INDEX + 10
let defaultGovernorChatHandled = false
const adminModalOpen = ref(false)
const deviceDocOpen = ref(false)
const isAdminUser = computed(() => ['owner', 'admin'].includes(props.currentUser?.role || ''))
let dashboardRefreshTimer: number | null = null
let dashboardRefreshLoopActive = false

const mcpToolMetaByName = ref<Record<string, McpToolDefinition>>({})
const mcpRoleMeta = ref<McpRoleMeta>({ order: [], labels: {}, defaults: {}, options: {}, permissions: {} })

const {
  themeMode,
  fontSize,
  brainViewMode,
  tavilyApiKey,
  modelPresets,
  mcpMaxSteps,
  mcpHistoryResultMaxChars,
  conversationAutoCompressEnabled,
  globalMcpCallMethod,
  mcpNamespaceHints,
  mcpDynamicRule,
  globalMcpFormatErrorHint,
  defaultStartTaskPrompt,
  defaultResumeTaskPrompt,
  defaultSupervisionPrompt,
  defaultSupervisionIdleSeconds,
  defaultCompressionPrompt,
  promptAiMessageNotify,
  promptAiMessageInquiry,
  aiMessageInquiryReminderSeconds,
  promptAiMessageInquiryReminder,
  promptAiMessageReply,
  promptAiMessageChitchat,
  promptAiMessageReplySuccess,
  promptUserMessageNotice,
  normalizeSystemAutoControl,
  saveSystemSettings,
  saveBrainViewMode,
  roleMcpPermissions,
  toggleRoleTool,
  saveRoleMcpPermissions,
} = useDashboardSystemSettings({
  getCurrentUser: () => props.currentUser,
  alert,
  onRefreshUser: user => emit('refreshUser', user),
  mcpRoleMeta,
})

const {
  agents,
  connectedDevices,
  knowledgeBase,
  globalGeneration,
  allFiles,
  dashboardSocketConnected,
  syncChatTokensToAgents,
  loadProjectContext,
  loadAIAgents,
  createSeedData,
  refreshDashboardLive,
} = useDashboardData({
  unassignedProjectId: UNASSIGNED_PROJECT_ID,
  alert,
  confirm,
  getCurrentUserId: () => Number(props.currentUser?.id),
})

// Keep an already-open chat's MCP device groups in sync with live binding,
// presence and capability changes without remounting the conversation.
const chatMcpCatalogRefreshKey = computed(() => connectedDevices.value
  .map(device => [
    device.id,
    device.aiConfigId ?? '',
    ...(device.boundAiConfigIds || []),
    device.online === false ? 'offline' : 'online',
    ...(device.capabilities || []),
  ].join(':'))
  .sort()
  .join('|'))

const {
  settingsOpen,
  leftCollapsed,
  userMenuOpen,
  closeSettings,
  closeUserMenu,
  adminAgents,
  sidebarMemberAgents,
  activeAgents,
} = useDashboardUi({
  unassignedProjectId: UNASSIGNED_PROJECT_ID,
  agents,
})

const {
  toolModalOpen,
  toolModalTitle,
  toolModalItems,
  showAllServerMcpTools,
} = useMcpAndWorkspaceModal({ mcpToolMetaByName })

// Web-managed device dynamic MCP tools modal (opened from McpToolsModal).
const deviceToolsModalOpen = ref(false)
const deviceToolsInitialType = ref<'desktop' | 'browser' | 'android' | undefined>(undefined)

const defaultMcpTools = [...DEFAULT_MCP_TOOLS]

const {
  aiConfigModalOpen,
  aiConfigDeleteConfirm,
  aiConfigSettingsSection,
  aiConfigMode,
  aiConfigForm,
  availableMcpTools,
  configAvailableMcpTools,
  loadMcpTools,
  toggleAiConfigSettingsSection,
  openCreateAiConfig,
  openAgentSettings,
  saveAiConfig,
  deleteAiConfig,
  onToolCheckboxChange,
} = useAiConfigManagement({
  defaultMcpTools,
  mcpToolMetaByName,
  mcpRoleMeta,
  modelPresets,
  normalizeSystemAutoControl,
  alert,
  onReloadAgents: loadAIAgents,
})

const {
  taskListModalOpen,
  taskListTarget,
  taskListItems,
  taskJobs,
  selectedTaskJobIds,
  taskListLoading,
  taskCreatePanelOpen,
  taskCreateSubmitting,
  taskEditingJobId,
  taskCreateForm,
  fetchAgentTaskList,
  openAgentTaskList,
  closeAgentTaskList,
  toggleTaskCreatePanel,
  openTaskCreatePanelFromJob,
  openTaskEditPanel,
  closeTaskCreatePanel,
  onTaskCreateToolChange,
  submitTaskForAgent,
  pauseTaskJob,
  resumeTaskJob,
  deleteTaskJob,
  onTaskJobSelectChange,
  onSelectAllTaskJobsChange,
  batchDeleteTaskJobs,
  refreshOpenTaskPanel,
} = useTaskManagement({
  availableMcpTools,
  defaultMcpTools,
  alert,
  confirm,
  onReloadAgents: loadAIAgents,
})

const findFreshAgent = (agent: Agent | null) => {
  if (!agent) return null
  const configId = Number(agent.aiConfigId)
  if (Number.isFinite(configId)) {
    const byConfig = agents.value.find(item => Number(item.aiConfigId) === configId)
    if (byConfig) return byConfig
  }
  return agents.value.find(item => item.id === agent.id) || agent
}

watch(
  () => [chatTarget.value?.aiConfigId, chatTarget.value?.tokensUsed],
  () => {
    chatLiveTokenUsed.value = Math.max(0, Number(chatTarget.value?.tokensUsed) || 0)
  },
  { immediate: true },
)

const onMainChatTotalTokensUpdate = (value: number) => {
  chatLiveTokenUsed.value = Math.max(0, Number(value) || 0)
  syncChatTokensToAgents(value)
}

const syncOpenAgentReferences = () => {
  chatTarget.value = findFreshAgent(chatTarget.value)
  taskListTarget.value = findFreshAgent(taskListTarget.value)
  floatingAgentChats.value = floatingAgentChats.value.map(window => ({
    ...window,
    agent: findFreshAgent(window.agent) || window.agent,
  }))
}

const refreshDashboardAfterSave = async () => {
  await refreshDashboardLive(refreshOpenTaskPanel, { force: true })
  syncOpenAgentReferences()
}

const saveAiConfigAndRefresh = async () => {
  const saved = await saveAiConfig()
  if (saved) await refreshDashboardAfterSave()
}

const deleteAiConfigAndRefresh = async () => {
  await deleteAiConfig()
  await refreshDashboardAfterSave()
}

const openAllMcpToolsFromSystemSettings = async () => {
  if (Object.keys(mcpToolMetaByName.value || {}).length === 0) {
    await loadMcpTools()
  }
  showAllServerMcpTools('当前服务器所有的mcp接口')
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

const resolveActiveRunSessionId = (agent: Agent) => {
  const sid = String(agent.activeRunSessionId || '').trim()
  if (!sid) return ''
  const runStatus = String(agent.activeRunStatus || '').toLowerCase()
  // 有进行中的 run 时，打开角色直接跳到该对话；否则进入空白新对话。
  if (runStatus === 'running' || runStatus === 'queued') return sid
  if (String(agent.runtimeStatus || '').toLowerCase() === 'running') return sid
  return ''
}

const focusFloatingAgentChat = (windowId: string) => {
  const target = floatingAgentChats.value.find(window => window.windowId === windowId)
  if (!target) return
  floatingChatZIndex += 1
  target.zIndex = floatingChatZIndex
}

const closeFloatingAgentChat = (windowId: string) => {
  floatingAgentChats.value = floatingAgentChats.value.filter(window => window.windowId !== windowId)
}

const openFloatingAgentChat = (agent: Agent, initialSessionId = resolveActiveRunSessionId(agent)) => {
  const configId = Number(agent.aiConfigId)
  if (!Number.isFinite(configId) || configId <= 0) return
  const existing = floatingAgentChats.value.find(window => Number(window.agent.aiConfigId) === configId)
  if (existing) {
    focusFloatingAgentChat(existing.windowId)
    return
  }
  floatingChatSequence += 1
  floatingChatZIndex += 1
  floatingAgentChats.value.push({
    windowId: `ai-${configId}-${floatingChatSequence}`,
    agent,
    initialSessionId,
    zIndex: floatingChatZIndex,
  })
}

const openAgentChat = (agent: Agent, options: { floating?: boolean } = {}) => {
  if (!agent.aiConfigId) return
  const targetConfigId = Number(agent.aiConfigId)
  const existingFloating = floatingAgentChats.value.find(window => Number(window.agent.aiConfigId) === targetConfigId)
  if (existingFloating) {
    focusFloatingAgentChat(existingFloating.windowId)
    return
  }
  if (
    chatModalOpen.value
    && chatFloating.value
    && Number(chatTarget.value?.aiConfigId || 0) !== targetConfigId
  ) {
    openFloatingAgentChat(agent)
    return
  }
  defaultGovernorChatHandled = true
  chatTarget.value = agent
  selectedFiles.value = []
  chatInitialSessionId.value = resolveActiveRunSessionId(agent)
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  if (options.floating !== undefined) {
    chatFloating.value = options.floating && !isMobile.value
  }
  chatModalOpen.value = true
  if (chatFloating.value) void positionChatFloatAtBottomRight()
}

const expandFloatingAgentChat = (windowId: string) => {
  const target = floatingAgentChats.value.find(window => window.windowId === windowId)
  if (!target) return
  if (chatModalOpen.value && chatTarget.value?.aiConfigId && Number(chatTarget.value.aiConfigId) !== Number(target.agent.aiConfigId)) {
    openFloatingAgentChat(chatTarget.value, chatCurrentSessionId.value || chatInitialSessionId.value)
  }
  closeFloatingAgentChat(windowId)
  chatFloating.value = false
  closeChatPip()
  chatTarget.value = target.agent
  selectedFiles.value = []
  chatInitialSessionId.value = target.initialSessionId
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  chatModalOpen.value = true
}

const openDefaultGovernorChat = () => {
  if (!autoOpenGovernorChatOnLoad || defaultGovernorChatHandled || chatModalOpen.value) return
  const governor = agents.value.find(agent =>
    agent.aiRole === 'assistant_admin' || String(agent.name || '').trim() === '总督',
  )
  if (governor) openAgentChat(governor, { floating: true })
}

const chatSwitchAgents = computed(() => agents.value.filter(agent =>
  !!agent.aiConfigId && Number(agent.aiConfigId) !== Number(chatTarget.value?.aiConfigId || 0),
))

const chatMemberSwitcherRef = ref<HTMLElement | null>(null)
const chatMemberMenuRef = ref<HTMLElement | null>(null)
const chatMemberMenuOpen = ref(false)
const chatMemberMenuStyle = ref<Record<string, string | number>>({})

const closeChatMemberMenu = () => {
  chatMemberMenuOpen.value = false
}

const positionChatMemberMenu = () => {
  const trigger = chatMemberSwitcherRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const view = trigger.ownerDocument.defaultView || window
  const width = Math.min(224, Math.max(180, view.innerWidth - 24))
  const left = Math.max(12, Math.min(rect.left, view.innerWidth - width - 12))
  const spaceBelow = view.innerHeight - rect.bottom - 12
  const openUpward = spaceBelow < 180 && rect.top > spaceBelow
  chatMemberMenuStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    top: openUpward ? 'auto' : `${rect.bottom + 6}px`,
    bottom: openUpward ? `${view.innerHeight - rect.top + 6}px` : 'auto',
    zIndex: (chatFloating.value || chatPipActive.value)
      ? PINNED_POPUP_Z_INDEX + 300
      : BACKGROUND_POPUP_Z_INDEX + 300,
  }
}

const toggleChatMemberMenu = async () => {
  chatMemberMenuOpen.value = !chatMemberMenuOpen.value
  if (!chatMemberMenuOpen.value) return
  await nextTick()
  positionChatMemberMenu()
}

useDismissibleLayer({
  open: chatMemberMenuOpen,
  roots: [chatMemberSwitcherRef, chatMemberMenuRef],
  onDismiss: closeChatMemberMenu,
})

const switchChatTarget = (agent: Agent) => {
  closeChatMemberMenu()
  openAgentChat(agent)
}

// 社会显示点击人物：切到数字生命栏目、展开侧栏并定位突出对应成员卡片。
const onWorldFocusAgent = (aiConfigId: number) => {
  if (!agents.value.some(agent => Number(agent.aiConfigId) === aiConfigId)) return
  focusedAgentConfigId.value = aiConfigId
  agentFocusSignal.value += 1
  leftCollapsed.value = false
  if (isMobile.value) mobileTab.value = 'console'
}

const revealConsolePanel = () => {
  leftCollapsed.value = false
  if (isMobile.value) mobileTab.value = 'console'
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

const closeAgentChat = () => {
  closeChatMemberMenu()
  chatModalOpen.value = false
  chatInitialSessionId.value = ''
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  // v-if 卸载后内联几何样式随元素消失，标志位必须一并复位，
  // 否则下次打开会以"无定位的悬浮态"渲染
  chatFloating.value = false
  endChatDrag()
  endChatResize()
  closeChatPip()
}

// ── 聊天悬浮小窗（桌面端）────────────────────────────────────
// 把居中弹窗切换为右下角可拖拽/可缩放的悬浮面板，去掉遮罩层以便同时操作
// 仪表盘。同一 DOM 节点只切换 class，ChatInterface 不会重挂载、会话不丢。
// 几何（left/top/width/height）全部命令式写到 el.style：宽高由浏览器原生
// resize 拖角改写，交给 Vue 绑定会在重渲染时被覆盖（同 RemoteControlModal）。
const chatFloating = ref(false)
const chatPanelRef = ref<HTMLElement | null>(null)
const chatFloatConstraints = { minWidth: '320px', minHeight: '380px', maxWidth: '96vw', maxHeight: '92vh' }
const CHAT_FLOAT_MARGIN = 16

const positionChatFloatAtBottomRight = async () => {
  await nextTick()
  const el = chatPanelRef.value
  if (!el || !chatFloating.value) return
  const socialRect = worldArenaPanelRef.value?.getBoundingRect()
  const bounds = socialRect && socialRect.width > 0 && socialRect.height > 0
    ? socialRect
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const w = Math.min(420, Math.max(320, bounds.width - CHAT_FLOAT_MARGIN * 2))
  const h = Math.min(620, Math.max(380, bounds.height - CHAT_FLOAT_MARGIN * 2))
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  el.style.left = `${Math.max(CHAT_FLOAT_MARGIN, bounds.right - w - CHAT_FLOAT_MARGIN)}px`
  el.style.top = `${Math.max(CHAT_FLOAT_MARGIN, bounds.bottom - h - CHAT_FLOAT_MARGIN)}px`
}

// 异步加载的社会显示若晚于默认总督对话挂载，待其真实边界可用后再校准一次。
watch(worldArenaPanelRef, panel => {
  if (panel && chatFloating.value) void positionChatFloatAtBottomRight()
}, { flush: 'post' })

const toggleChatFloating = async () => {
  chatFloating.value = !chatFloating.value
  if (chatFloating.value) {
    await positionChatFloatAtBottomRight()
  } else {
    await nextTick()
    const el = chatPanelRef.value
    if (!el) return
    endChatDrag()
    endChatResize()
    el.style.width = ''
    el.style.height = ''
    el.style.left = ''
    el.style.top = ''
  }
}

const clampChatFloatIntoView = () => {
  const el = chatPanelRef.value
  if (!el || !chatFloating.value) return
  const rect = el.getBoundingClientRect()
  el.style.left = `${Math.min(Math.max(rect.left, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerWidth - rect.width - CHAT_FLOAT_MARGIN))}px`
  el.style.top = `${Math.min(Math.max(rect.top, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerHeight - rect.height - CHAT_FLOAT_MARGIN))}px`
}

let chatResizeObserver: ResizeObserver | null = null
watch(
  chatPanelRef,
  el => {
    chatResizeObserver?.disconnect()
    chatResizeObserver = null
    if (!el || typeof ResizeObserver === 'undefined') return
    chatResizeObserver = new ResizeObserver(clampChatFloatIntoView)
    chatResizeObserver.observe(el)
  },
  { flush: 'post' },
)

let chatDragOffset: { dx: number; dy: number } | null = null
let chatDragCapture: { element: HTMLElement; pointerId: number } | null = null
const onChatDragMove = (e: PointerEvent) => {
  const el = chatPanelRef.value
  if (!el || !chatDragOffset) return
  const rect = el.getBoundingClientRect()
  el.style.left = `${Math.min(Math.max(e.clientX - chatDragOffset.dx, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerWidth - rect.width - CHAT_FLOAT_MARGIN))}px`
  el.style.top = `${Math.min(Math.max(e.clientY - chatDragOffset.dy, CHAT_FLOAT_MARGIN), Math.max(CHAT_FLOAT_MARGIN, window.innerHeight - rect.height - CHAT_FLOAT_MARGIN))}px`
}
const endChatDrag = () => {
  chatDragOffset = null
  const capture = chatDragCapture
  chatDragCapture = null
  if (capture?.element.hasPointerCapture(capture.pointerId)) {
    capture.element.releasePointerCapture(capture.pointerId)
  }
  window.removeEventListener('pointermove', onChatDragMove)
  window.removeEventListener('pointerup', endChatDrag)
  window.removeEventListener('pointercancel', endChatDrag)
}
const onChatHeaderPointerDown = (e: PointerEvent) => {
  if (!chatFloating.value || e.button !== 0) return
  // 头部里的按钮/任务进度等可交互元素不触发拖动
  if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [data-chat-drag-ignore]')) return
  const el = chatPanelRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  chatDragOffset = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
  const captureElement = e.currentTarget as HTMLElement
  captureElement.setPointerCapture(e.pointerId)
  chatDragCapture = { element: captureElement, pointerId: e.pointerId }
  window.addEventListener('pointermove', onChatDragMove)
  window.addEventListener('pointerup', endChatDrag)
  window.addEventListener('pointercancel', endChatDrag)
  e.preventDefault()
}

type ChatResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type ChatResizeState = {
  edge: ChatResizeEdge
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
}

let chatResizeState: ChatResizeState | null = null
let chatResizeCapture: { element: HTMLElement; pointerId: number } | null = null
let previousResizeCursor = ''
let previousResizeUserSelect = ''

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const onChatResizeMove = (e: PointerEvent) => {
  const el = chatPanelRef.value
  const state = chatResizeState
  if (!el || !state) return

  const dx = e.clientX - state.startX
  const dy = e.clientY - state.startY
  const startRight = state.left + state.width
  const startBottom = state.top + state.height
  const minWidth = Math.min(320, window.innerWidth - CHAT_FLOAT_MARGIN * 2)
  const minHeight = Math.min(380, window.innerHeight - CHAT_FLOAT_MARGIN * 2)
  const maxWidth = Math.max(minWidth, Math.min(window.innerWidth * 0.96, window.innerWidth - CHAT_FLOAT_MARGIN * 2))
  const maxHeight = Math.max(minHeight, Math.min(window.innerHeight * 0.92, window.innerHeight - CHAT_FLOAT_MARGIN * 2))

  let left = state.left
  let right = startRight
  let top = state.top
  let bottom = startBottom

  if (state.edge.includes('e')) {
    right = clampNumber(startRight + dx, state.left + minWidth, Math.min(window.innerWidth - CHAT_FLOAT_MARGIN, state.left + maxWidth))
  }
  if (state.edge.includes('w')) {
    left = clampNumber(state.left + dx, Math.max(CHAT_FLOAT_MARGIN, startRight - maxWidth), startRight - minWidth)
  }
  if (state.edge.includes('s')) {
    bottom = clampNumber(startBottom + dy, state.top + minHeight, Math.min(window.innerHeight - CHAT_FLOAT_MARGIN, state.top + maxHeight))
  }
  if (state.edge.includes('n')) {
    top = clampNumber(state.top + dy, Math.max(CHAT_FLOAT_MARGIN, startBottom - maxHeight), startBottom - minHeight)
  }

  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.width = `${right - left}px`
  el.style.height = `${bottom - top}px`
  e.preventDefault()
}

function endChatResize() {
  if (!chatResizeState) return
  chatResizeState = null
  const capture = chatResizeCapture
  chatResizeCapture = null
  if (capture?.element.hasPointerCapture(capture.pointerId)) {
    capture.element.releasePointerCapture(capture.pointerId)
  }
  window.removeEventListener('pointermove', onChatResizeMove)
  window.removeEventListener('pointerup', endChatResize)
  window.removeEventListener('pointercancel', endChatResize)
  document.documentElement.style.cursor = previousResizeCursor
  document.body.style.userSelect = previousResizeUserSelect
}

const onChatResizePointerDown = (edge: ChatResizeEdge, e: PointerEvent) => {
  if (!chatFloating.value || e.button !== 0) return
  const el = chatPanelRef.value
  if (!el) return
  endChatDrag()
  const rect = el.getBoundingClientRect()
  chatResizeState = {
    edge,
    startX: e.clientX,
    startY: e.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
  const captureElement = e.currentTarget as HTMLElement
  captureElement.setPointerCapture(e.pointerId)
  chatResizeCapture = { element: captureElement, pointerId: e.pointerId }
  previousResizeCursor = document.documentElement.style.cursor
  previousResizeUserSelect = document.body.style.userSelect
  document.documentElement.style.cursor = `${edge}-resize`
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onChatResizeMove, { passive: false })
  window.addEventListener('pointerup', endChatResize)
  window.addEventListener('pointercancel', endChatResize)
  e.preventDefault()
  e.stopPropagation()
}

// ── 聊天桌面置顶小窗（Document Picture-in-Picture，Chrome/Edge 116+）────
// 与页面内悬浮窗不同：这是操作系统级的置顶窗口，切到其他应用也悬浮在最前。
// 只把面板 DOM Teleport 进 PiP 文档展示，逻辑仍运行在主页面（Socket/会话不断）。
// 该 API 要求安全上下文（https 或 localhost），不满足时按钮自动隐藏。
const chatPipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window
const chatPipContainer = ref<HTMLElement | null>(null)
const chatPipActive = computed(() => !!chatPipContainer.value)
let chatPipWindow: Window | null = null

const closeChatPip = () => {
  const win = chatPipWindow
  chatPipWindow = null
  chatPipContainer.value = null
  if (win && !win.closed) win.close()
}

const openChatPip = async () => {
  if (!chatPipSupported || chatPipWindow) return
  // 从页面内悬浮态进入时先复位其内联几何，避免 left/top/resize 带进 PiP
  if (chatFloating.value) {
    chatFloating.value = false
    endChatDrag()
    endChatResize()
    const panel = chatPanelRef.value
    if (panel) {
      panel.style.width = ''
      panel.style.height = ''
      panel.style.left = ''
      panel.style.top = ''
    }
  }
  try {
    const pip: Window = await (window as unknown as {
      documentPictureInPicture: { requestWindow(options: { width: number; height: number }): Promise<Window> }
    }).documentPictureInPicture.requestWindow({ width: 420, height: 640 })
    // PiP 是一份空白文档：把主页面样式表整份同步过去，Tailwind 类才会生效
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = pip.document.createElement('style')
        style.textContent = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
        pip.document.head.appendChild(style)
      } catch {
        // 跨域样式表读不了 cssRules，退回 <link> 引用
        if (sheet.href) {
          const link = pip.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          pip.document.head.appendChild(link)
        }
      }
    }
    // 同步主题（暗色模式靠 <html> 上的 class）与底色
    pip.document.documentElement.className = document.documentElement.className
    pip.document.documentElement.style.height = '100%'
    pip.document.body.className = 'overflow-hidden bg-zinc-50 dark:bg-zinc-950'
    pip.document.body.style.height = '100%'
    pip.document.body.style.margin = '0'
    const host = pip.document.createElement('div')
    host.style.height = '100%'
    pip.document.body.appendChild(host)
    // 用户点 PiP 窗口自带的关闭/返回按钮时，面板自动还原为页面内弹窗
    pip.addEventListener('pagehide', () => {
      chatPipWindow = null
      chatPipContainer.value = null
    })
    chatPipWindow = pip
    chatPipContainer.value = host
  } catch (err) {
    console.warn('打开桌面置顶小窗失败', err)
  }
}

const chatTargetAiKind = computed<'assistant' | 'core'>(() => {
  return chatTarget.value?.aiRole === 'assistant_admin' ? 'assistant' : 'core'
})

const aiWorkspaceDirname = (agent: Agent | null) => {
  if (!agent?.aiConfigId) return ''
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') return ''
  const raw = String(agent.name || '').trim().toLowerCase()
  const slug = raw
    .replace(/[^0-9a-z\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'ai'
  return `${agent.aiConfigId}-${slug}`
}

const openAgentTaskDetail = (agent: Agent, jobId: string, sessionId?: string) => {
  if (!agent.aiConfigId || !jobId) return
  chatTarget.value = agent
  selectedFiles.value = []
  chatInitialSessionId.value = String(sessionId || `session_task_${jobId}`).trim()
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  chatModalOpen.value = true
}

const openAgentTaskDetailFromCard = async (payload: { agent: Agent; jobId: string }) => {
  const agent = payload?.agent
  if (!agent?.aiConfigId) return
  // 代际详情已移除：从卡片点击直接打开该 AI 的任务列表。
  await openAgentTaskList(agent)
}

const openAgentTaskDetailFromTaskJob = (job: { job_id: string; session_id?: string }, agent: Agent | null) => {
  if (!agent?.aiConfigId || !job?.job_id) return
  openAgentTaskDetail(agent, job.job_id, job.session_id)
}

const stopDashboardRefreshLoop = () => {
  dashboardRefreshLoopActive = false
  if (!dashboardRefreshTimer) return
  window.clearTimeout(dashboardRefreshTimer)
  dashboardRefreshTimer = null
}

const hasLiveThinking = computed(() => {
  return agents.value.some(agent => {
    const liveText = String(agent.latestThinking || '').trim()
    return !!liveText
  })
})

const getDashboardRefreshInterval = () => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return DASHBOARD_REFRESH_HIDDEN_MS
  if (hasLiveThinking.value) {
    return isMobile.value ? DASHBOARD_REFRESH_MOBILE_STREAM_MS : DASHBOARD_REFRESH_STREAM_MS
  }
  if (taskListModalOpen.value) return DASHBOARD_REFRESH_FAST_MS
  return dashboardSocketConnected.value ? DASHBOARD_REFRESH_NORMAL_MS : DASHBOARD_REFRESH_FAST_MS
}

const startDashboardRefreshLoop = () => {
  dashboardRefreshLoopActive = true
  stopDashboardRefreshLoop()
  dashboardRefreshLoopActive = true
  const scheduleNext = () => {
    if (!dashboardRefreshLoopActive) return
    const delay = getDashboardRefreshInterval()
    dashboardRefreshTimer = window.setTimeout(async () => {
      if (!dashboardRefreshLoopActive) return
      try {
        await refreshDashboardLive(refreshOpenTaskPanel)
      } finally {
        scheduleNext()
      }
    }, delay)
  }
  scheduleNext()
}

const handleDashboardVisibilityChange = () => {
  if (document.visibilityState !== 'visible') return
  void refreshDashboardLive(refreshOpenTaskPanel)
}

const handleDashboardResize = () => {
  clampChatFloatIntoView()
  if (chatMemberMenuOpen.value) positionChatMemberMenu()
}

watch(
  () => dashboardSocketConnected.value,
  (connected, previous) => {
    if (connected && !previous) {
      void refreshDashboardLive(refreshOpenTaskPanel)
    }
  }
)

watch(
  agents,
  () => {
    syncOpenAgentReferences()
    openDefaultGovernorChat()
  },
  { flush: 'post' }
)

onMounted(async () => {
  // MCP 完整目录只用于配置弹窗，不阻塞控制台首屏；进入后在后台预取。
  void loadMcpTools()
  try {
    await createSeedData()
  } finally {
    // 即使初始化部分失败，也通知外层撤下加载遮罩，避免界面卡在加载态
    emit('ready')
  }
  openDefaultGovernorChat()
  startDashboardRefreshLoop()
  document.addEventListener('visibilitychange', handleDashboardVisibilityChange)
  window.addEventListener('resize', handleDashboardResize)
})

onUnmounted(() => {
  stopDashboardRefreshLoop()
  document.removeEventListener('visibilitychange', handleDashboardVisibilityChange)
  window.removeEventListener('resize', handleDashboardResize)
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
  endChatDrag()
  endChatResize()
  closeChatPip()
})
</script>

<template>
  <div class="relative isolate h-app-viewport flex flex-col bg-zinc-50/60 text-zinc-900 overflow-hidden overflow-x-hidden font-sans dark:bg-zinc-950/60 dark:text-zinc-100 bg-gradient-to-br from-zinc-50 via-zinc-100 to-indigo-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/20 animate-gradient" @click="closeSettings(); closeUserMenu()">
    <div class="app-background-glow pointer-events-none absolute inset-0"></div>
    <div class="pointer-events-none absolute inset-0 opacity-60">
      <div class="app-background-orb app-background-orb-left"></div>
      <div class="app-background-orb app-background-orb-right"></div>
    </div>
    <!-- 粒子星座 + 鼠标光晕：必须在本页不透明背景之上、内容之下 -->
    <AmbientBackground />

    <div class="relative z-[1] flex h-full flex-col">
    <!-- 顶部导航栏 -->
    <header class="glass border-b border-zinc-200/50 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 flex justify-between items-center shadow-sm z-10 h-14 sm:h-16 shrink-0 dark:border-zinc-800/50 backdrop-blur-md">
      <div class="flex items-center gap-2 md:gap-4 overflow-hidden">
        <img :src="logoUrl" alt="HeySure Logo" class="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 object-contain hover:scale-110 active:scale-95 transition-transform duration-300 shrink-0" />
        <div class="overflow-hidden">
          <h1 class="text-sm sm:text-base md:text-lg font-bold text-zinc-900 tracking-tight dark:text-zinc-100 truncate">HeySure<span class="hidden sm:inline">-数字社会控制台</span> <span class="text-zinc-400 font-normal ml-2 dark:text-zinc-500 hidden lg:inline">HeySure-Digital Society Console</span></h1>
          <p class="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 truncate">进化引擎已启动</p>
        </div>
      </div>
      <div class="flex gap-1.5 sm:gap-2 md:gap-4 text-sm items-center relative shrink-0">
        <div class="hidden sm:flex flex-col items-end">
           <span class="text-xs text-zinc-400 uppercase font-semibold">AI成员</span>
           <span class="text-lg font-bold text-indigo-600 leading-none">{{ agents.length }}</span>
        </div>
        <div class="hidden sm:block w-px h-8 bg-zinc-200 dark:bg-zinc-700/70"></div>
        <div class="hidden sm:flex flex-col items-end">
           <span class="text-xs text-zinc-400 uppercase font-semibold">文明代数</span>
           <span class="text-lg font-bold text-emerald-600 leading-none">Gen {{ globalGeneration }}</span>
        </div>
        <button
          v-if="isAdminUser"
          class="ml-1 sm:ml-2 w-8 h-8 md:w-9 md:h-9 rounded-full border border-amber-200/70 bg-white/60 backdrop-blur-sm text-amber-600 active:bg-amber-100 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/70 transition-colors dark:bg-zinc-800/60 dark:border-amber-700/60 dark:text-amber-300 dark:hover:text-amber-200 shadow-sm hover:shadow-md flex items-center justify-center"
          title="管理员控制台"
          @click.stop="adminModalOpen = true"
        >
          <AppIcon name="shield" class="w-4 h-4 md:w-[18px] md:h-[18px]" />
        </button>
        <GlobalNotificationLayer />
        <button
          class="ml-1 sm:ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-colors active:bg-zinc-100 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800 dark:hover:text-indigo-300 md:h-9 md:w-9"
          title="系统设置"
          @click.stop="settingsOpen = true"
        >
          <AppIcon name="gear" class="w-4 h-4 md:w-[18px] md:h-[18px]" />
        </button>

        <!-- User Profile -->
        <div class="ml-1.5 sm:ml-2 md:ml-4 flex items-center gap-2 sm:gap-3 pl-2 md:pl-4 border-l border-zinc-200 dark:border-zinc-700 relative">
          <template v-if="currentUser">
            <button class="flex items-center gap-2 hover:bg-zinc-50 active:bg-zinc-100 p-1 rounded-lg transition-colors dark:hover:bg-zinc-800" @click.stop="userMenuOpen = !userMenuOpen">
              <img :src="resolveAvatarUrl(currentUser.avatar) || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.name"
                   class="w-7 h-7 md:w-8 md:h-8 rounded-full border border-zinc-200 bg-zinc-50/60 object-cover" />
              <div class="hidden md:flex flex-col items-start text-left">
                <span class="text-sm font-bold text-zinc-700 dark:text-zinc-200 leading-none mb-1">{{ currentUser.name }}</span>
                <span class="text-[10px] text-zinc-400 leading-none">ID: {{ currentUser.account }}</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-zinc-400 ml-1 transition-transform duration-200 hidden md:block" :class="{ 'rotate-180': userMenuOpen }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- User Dropdown Menu -->
            <Transition name="fade">
              <div v-if="userMenuOpen" class="absolute right-0 top-12 w-48 acrylic-modal rounded-xl shadow-lg py-1 z-50" @click.stop>
                <button @click="$emit('updateProfile'); userMenuOpen = false" class="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-white/60 flex items-center gap-2 dark:text-zinc-300 dark:hover:bg-zinc-800/70">
                  <AppIcon name="pen" class="w-4 h-4" /> 修改资料
                </button>
                <div class="h-px bg-zinc-100/60 my-1 dark:bg-zinc-800/60"></div>
                <button @click="$emit('logout'); userMenuOpen = false" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 dark:text-red-400 dark:hover:bg-red-900/20">
                  <AppIcon name="exit" class="w-4 h-4" /> 退出登录
                </button>
              </div>
            </Transition>
          </template>
          <button v-else @click="$emit('login')" class="text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors dark:text-indigo-400 dark:hover:bg-indigo-900/20">
            登录 / 注册
          </button>
        </div>
      </div>
    </header>

    <!-- 主体内容区域 -->
    <main
      class="flex-1 overflow-hidden flex flex-col lg:flex-row p-2 sm:p-4 lg:p-6"
      :class="leftCollapsed ? 'lg:gap-4' : 'lg:gap-6'"
    >

      <!-- 右侧：数字生命、知识库与设备（移动端仍为「控制台」Tab） -->
      <section
        class="flex flex-col gap-4 sm:gap-6 transition-all duration-300 relative w-full min-h-0 flex-1 lg:order-2 lg:flex-none lg:h-full"
        :class="[
          leftCollapsed ? 'lg:w-10 lg:min-w-[40px]' : 'lg:w-[20%] lg:min-w-[280px]',
          mobileTab !== 'console' ? 'max-lg:hidden' : '',
        ]"
      >
        <button class="hidden lg:block absolute -left-3 top-4 w-6 h-6 rounded-full acrylic-chip backdrop-blur-sm text-zinc-500 text-xs shadow hover:text-indigo-600 hover:border-indigo-200 dark:text-zinc-300 dark:hover:text-indigo-300 z-10 transition-transform hover:scale-110" @click="leftCollapsed = !leftCollapsed">
          {{ leftCollapsed ? '⟨' : '⟩' }}
        </button>
        <div v-if="leftCollapsed" class="hidden lg:flex flex-1 items-center justify-center text-zinc-400 text-xs dark:text-zinc-500">
          数字生命
        </div>
        <div v-else class="h-full min-h-0 overflow-y-auto lg:overflow-visible">
          <LeftSidebarPanel
            :admin-agents="adminAgents"
            :member-agents="sidebarMemberAgents"
            :active-agents="activeAgents"
            :connected-devices="connectedDevices"
            :knowledge-items="knowledgeBase"
            :knowledge-total-count="knowledgeBase.length"
            :brain-view-mode="brainViewMode"
            :focused-ai-config-id="focusedAgentConfigId"
            :focus-signal="agentFocusSignal"
            :knowledge-focus-signal="knowledgeFocusSignal"
            :focused-device-id="focusedDeviceId"
            :device-focus-signal="deviceFocusSignal"
            :mcp-role-meta="mcpRoleMeta"
            :role-mcp-permissions="roleMcpPermissions"
            @update:brain-view-mode="saveBrainViewMode"
            @toggle-role-tool="payload => toggleRoleTool(payload.role, payload.tool, payload.checked)"
            @save-role-mcp-permissions="saveRoleMcpPermissions"
            @show-tasks="openAgentTaskList"
            @show-task-detail="openAgentTaskDetailFromCard"
            @chat="openAgentChat"
            @settings="openAgentSettings"
            @create-ai="openCreateAiConfig('worker')"
            @refresh-user="emit('refreshUser', $event)"
            @view-all-mcp="openAllMcpToolsFromSystemSettings"
            @manage-device-tools="onManageDeviceTools"
            @open-device-doc="deviceDocOpen = true"
          />
        </div>
      </section>

      <!-- 左侧主体：社会显示（游戏世界实时画面）。移动端懒挂载：首次切到该 Tab 才加载 iframe -->
      <WorldArenaPanel
        ref="worldArenaPanelRef"
        v-if="!isMobile || arenaActivated"
        v-show="!isMobile || mobileTab === 'arena'"
        class="w-full min-h-0 flex-1 lg:order-1 lg:h-full lg:min-h-0 lg:min-w-0"
        :chat-ai-config-id="chatModalOpen ? chatTarget?.aiConfigId : null"
        @focus-agent="onWorldFocusAgent"
        @open-knowledge="onWorldOpenKnowledge"
        @focus-device="onWorldFocusDevice"
      />

    </main>

    <!-- 移动端底部 Tab 栏 -->
    <nav class="lg:hidden shrink-0 z-20 flex items-stretch border-t border-zinc-200/50 acrylic-modal !border-x-0 !border-b-0 rounded-none dark:border-zinc-800/50 pb-[env(safe-area-inset-bottom)]">
      <button
        class="flex-1 flex flex-col items-center justify-center gap-0 py-1.5 active:bg-zinc-100 dark:active:bg-zinc-800 text-[10px] font-medium transition-colors touch-manipulation"
        :class="mobileTab === 'console' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'"
        @click="mobileTab = 'console'"
      >
        <AppIcon name="brain" class="w-4 h-4" />
        控制台
      </button>
      <button
        class="flex-1 flex flex-col items-center justify-center gap-0 py-1.5 active:bg-zinc-100 dark:active:bg-zinc-800 text-[10px] font-medium transition-colors touch-manipulation"
        :class="mobileTab === 'arena' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'"
        @click="activateArenaTab"
      >
        <AppIcon name="globe" class="w-4 h-4" />
        社会显示
      </button>
    </nav>

    <McpToolsModal
      :show="toolModalOpen"
      :title="toolModalTitle"
      :items="toolModalItems"
      @close="toolModalOpen = false"
    />

    <DeviceDynamicToolsModal
      :show="deviceToolsModalOpen"
      :initial-device-type="deviceToolsInitialType"
      @close="closeDeviceToolsModal"
    />

    <TaskManagementModal
      :show="taskListModalOpen && !!taskListTarget"
      :target="taskListTarget"
      :task-list-items="taskListItems"
      :task-jobs="taskJobs"
      :selected-task-job-ids="selectedTaskJobIds"
      :task-list-loading="taskListLoading"
      :task-create-panel-open="taskCreatePanelOpen"
      :task-create-submitting="taskCreateSubmitting"
      :task-editing-job-id="taskEditingJobId"
      :task-create-form="taskCreateForm"
      :available-mcp-tools="availableMcpTools"
      :default-mcp-tools="defaultMcpTools"
      :on-close="closeAgentTaskList"
      :on-refresh="() => taskListTarget && fetchAgentTaskList(taskListTarget)"
      :on-toggle-task-create-panel="() => taskListTarget && toggleTaskCreatePanel(taskListTarget)"
      :on-close-task-create-panel="closeTaskCreatePanel"
      :on-submit-task="() => submitTaskForAgent(taskListTarget)"
      :on-task-create-tool-change="onTaskCreateToolChange"
      :on-reuse-task-template="(job) => taskListTarget && openTaskCreatePanelFromJob(taskListTarget, job)"
      :on-edit-task-job="(job) => taskListTarget && openTaskEditPanel(taskListTarget, job)"
      :on-show-task-detail="(job) => openAgentTaskDetailFromTaskJob(job, taskListTarget)"
      :on-pause-task-job="(job) => taskListTarget && pauseTaskJob(taskListTarget, job)"
      :on-resume-task-job="(job) => taskListTarget && resumeTaskJob(taskListTarget, job)"
      :on-delete-task-job="(job) => taskListTarget && deleteTaskJob(taskListTarget, job)"
      :on-toggle-all-task-jobs-selection="onSelectAllTaskJobsChange"
      :on-task-job-select-change="onTaskJobSelectChange"
      :on-batch-delete-task-jobs="() => batchDeleteTaskJobs(taskListTarget)"
    />
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="chatTarget && chatModalOpen"
          :style="{ zIndex: agentChatZIndex }"
          class="fixed inset-0"
          :class="(chatFloating || chatPipActive) ? 'pointer-events-none' : 'modal-overlay flex items-center justify-center p-0 sm:p-4'"
          @click="(chatFloating || chatPipActive) ? undefined : closeAgentChat()"
        >
          <!-- 手机比例：对话界面覆盖整个页面（无圆角/无边框/无外边距）；≥sm 恢复居中弹窗；
               悬浮模式（仅桌面）：可拖拽/可缩放的固定定位小窗，几何由 el.style 命令式管理；
               桌面置顶模式：面板 Teleport 进 Document PiP 窗口，占满整个 PiP 文档 -->
          <Teleport :to="chatPipContainer ?? 'body'" :disabled="!chatPipActive">
          <div
            ref="chatPanelRef"
            class="acrylic-modal shadow-xl flex flex-col"
            :class="chatPipActive
              ? 'relative h-full w-full overflow-hidden rounded-none !border-0'
              : chatFloating
                ? 'pointer-events-auto fixed overflow-hidden rounded-2xl'
                : 'overflow-hidden rounded-none sm:rounded-2xl !border-0 sm:!border w-full h-full max-w-none sm:max-w-[960px] sm:h-[88vh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0'"
            :style="chatFloating ? chatFloatConstraints : undefined"
            @click.stop
          >
            <!-- 八方向缩放热区：四条边与四个角均可拖拽，角部热区覆盖边部交叉区域。 -->
            <template v-if="chatFloating">
              <span class="absolute inset-x-3 top-0 z-[100] h-2 cursor-n-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('n', $event)" />
              <span class="absolute inset-y-3 right-0 z-[100] w-2 cursor-e-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('e', $event)" />
              <span class="absolute inset-x-3 bottom-0 z-[100] h-2 cursor-s-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('s', $event)" />
              <span class="absolute inset-y-3 left-0 z-[100] w-2 cursor-w-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('w', $event)" />
              <span class="absolute right-0 top-0 z-[101] h-3 w-3 cursor-ne-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('ne', $event)" />
              <span class="absolute bottom-0 right-0 z-[101] h-3 w-3 cursor-se-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('se', $event)" />
              <span class="absolute bottom-0 left-0 z-[101] h-3 w-3 cursor-sw-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('sw', $event)" />
              <span class="absolute left-0 top-0 z-[101] h-3 w-3 cursor-nw-resize touch-none" aria-hidden="true" @pointerdown="onChatResizePointerDown('nw', $event)" />
            </template>
            <div
              class="flex h-14 shrink-0 items-center gap-2 bg-white/40 px-2 py-1 backdrop-blur dark:bg-zinc-900/40 sm:gap-3 sm:px-3"
              :class="chatFloating ? 'cursor-move select-none' : ''"
              @pointerdown="onChatHeaderPointerDown"
            >
              <!-- 左侧组优先保留成员名称空间；任务进度使用独立紧凑宽度，不再强制左右等宽。 -->
              <div class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
                <!-- 脱出按钮：左上角，返回上一页面 -->
                <button
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  title="退出对话"
                  @click="closeAgentChat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <div
                  ref="chatMemberSwitcherRef"
                  class="relative w-fit min-w-0 max-w-[clamp(7rem,28vw,18rem)] shrink-0"
                  data-chat-drag-ignore
                  @pointerdown.stop
                >
                  <button
                    type="button"
                    class="flex w-fit max-w-full cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80"
                    title="点击切换数字成员"
                    :aria-expanded="chatMemberMenuOpen"
                    @click.stop="toggleChatMemberMenu"
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ chatTarget.name }}</span>
                      <span class="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ chatTarget.model || '未设置' }}</span>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform" :class="chatMemberMenuOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <Teleport :to="chatPipContainer ?? 'body'">
                  <div
                    v-if="chatMemberMenuOpen"
                    ref="chatMemberMenuRef"
                    class="fixed max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg acrylic-modal p-1 shadow-2xl"
                    :style="chatMemberMenuStyle"
                    data-chat-drag-ignore
                    @pointerdown.stop
                  >
                    <div class="max-h-64 overflow-y-auto">
                      <button
                        v-for="agent in chatSwitchAgents"
                        :key="agent.aiConfigId"
                        type="button"
                        class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        @click="switchChatTarget(agent)"
                      >
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{{ agent.name }}</span>
                          <span class="block truncate text-[10px] text-zinc-400 dark:text-zinc-500">{{ agent.model || '未设置模型' }}</span>
                        </span>
                      </button>
                      <div v-if="chatSwitchAgents.length === 0" class="px-2 py-3 text-center text-xs text-zinc-400">暂无其他成员</div>
                    </div>
                  </div>
                </Teleport>
              </div>
              <div class="min-w-0 flex-1 self-center" data-chat-drag-ignore>
                <TaskProgressPanel
                  :configId="chatTarget.aiConfigId"
                  :sessionId="chatCurrentSessionId"
                  :refreshSignal="chatTaskPlanRefreshSignal"
                  header
                />
              </div>
              <!-- 右侧操作按钮按实际宽度占位，避免反向挤压成员名称。 -->
              <div class="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                <!-- 悬浮小窗切换：仅桌面端（移动端聊天固定全屏）；桌面置顶时隐藏 -->
                <button
                  v-if="!chatPipActive"
                  class="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  :title="chatFloating ? '还原为弹窗' : '缩小为页面内悬浮窗'"
                  @click="toggleChatFloating"
                >
                  <svg v-if="!chatFloating" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h4" />
                    <rect x="12" y="12" width="9" height="7" rx="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
                  </svg>
                </button>
                <!-- 桌面置顶：Document PiP，系统级置顶小窗，跨应用悬浮（Chrome/Edge 且 https/localhost 才显示） -->
                <button
                  v-if="chatPipSupported"
                  class="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
                  :class="chatPipActive
                    ? 'text-indigo-500 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
                  :title="chatPipActive ? '退出桌面置顶，还原为弹窗' : '桌面置顶（跨应用悬浮小窗）'"
                  @click="chatPipActive ? closeChatPip() : openChatPip()"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 17v4M8 21h8" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v5M9.5 8.5L12 11l2.5-2.5" />
                  </svg>
                </button>
              </div>
            </div>
            <ChatTokenUsageBar :used="chatLiveTokenUsed" :limit="chatTarget.tokenLimit" />
            <div class="flex-1 min-h-0 p-2">
              <ChatInterface
                :key="`unified-chat-${chatTarget.aiConfigId}-${chatInitialSessionId || 'blank'}`"
                :aiConfigId="chatTarget.aiConfigId"
                :aiKind="chatTargetAiKind"
                :currentUserId="Number(currentUser?.id) || undefined"
                :initialSessionId="chatInitialSessionId || undefined"
                :mcpDynamicRule="mcpDynamicRule"
                :mcp-catalog-refresh-key="chatMcpCatalogRefreshKey"
                :floating-layer="chatFloating && !chatPipActive"
                :embedded-dialogs="chatFloating || chatPipActive"
                dialog-host="chat-main"
                :selectedFiles="selectedFiles"
                :allFiles="allFiles"
                :selectable-file-root="aiWorkspaceDirname(chatTarget)"
                @update:selectedFiles="selectedFiles = $event"
                @update:currentSessionId="chatCurrentSessionId = $event"
                @taskPlanRefresh="chatTaskPlanRefreshSignal = $event"
                @open-settings="chatTarget && openAgentSettings(chatTarget)"
                @totalChatTokensUpdate="onMainChatTotalTokensUpdate"
                @refreshFiles="loadProjectContext"
              />
            </div>
            <!-- 悬浮/PiP 对话使用独立的 chat 弹窗宿主：确认、提示和输入框只覆盖
                 当前聊天面板；页面级设置弹窗仍留在小窗下方。 -->
            <MessageDialog v-if="chatFloating || chatPipActive" host="chat-main" inline />
          </div>
          </Teleport>
        </div>
      </Transition>
    </Teleport>

    <FloatingAgentChatWindow
      v-for="(window, index) in floatingAgentChats"
      :key="window.windowId"
      :window-id="window.windowId"
      :agent="window.agent"
      :initial-session-id="window.initialSessionId || undefined"
      :current-user-id="Number(currentUser?.id) || undefined"
      :mcp-dynamic-rule="mcpDynamicRule"
      :mcp-catalog-refresh-key="chatMcpCatalogRefreshKey"
      :all-files="allFiles"
      :selectable-file-root="aiWorkspaceDirname(window.agent)"
      :cascade-index="index + 1"
      :z-index="window.zIndex"
      @focus="focusFloatingAgentChat(window.windowId)"
      @close="closeFloatingAgentChat(window.windowId)"
      @expand="expandFloatingAgentChat(window.windowId)"
      @open-settings="openAgentSettings(window.agent)"
      @refresh-files="loadProjectContext"
      @total-chat-tokens-update="syncChatTokensToAgents"
    />

    <AiConfigModal
      :show="aiConfigModalOpen"
      :mode="aiConfigMode"
      :form="aiConfigForm"
      :delete-confirm="aiConfigDeleteConfirm"
      :settings-section="aiConfigSettingsSection"
      :available-mcp-tools="configAvailableMcpTools"
      :connected-devices="connectedDevices"
      :model-presets="modelPresets"
      :on-close="() => aiConfigModalOpen = false"
      :on-toggle-settings-section="toggleAiConfigSettingsSection"
      :on-tool-checkbox-change="onToolCheckboxChange"
      :on-toggle-delete-confirm="() => aiConfigDeleteConfirm = !aiConfigDeleteConfirm"
      :on-save="saveAiConfigAndRefresh"
      :on-delete="deleteAiConfigAndRefresh"
    />
    <SystemSettingsPanel
      v-model:show="settingsOpen"
      v-model:globalMcpCallMethod="globalMcpCallMethod"
      v-model:mcpNamespaceHints="mcpNamespaceHints"
      v-model:mcpDynamicRule="mcpDynamicRule"
      v-model:globalMcpFormatErrorHint="globalMcpFormatErrorHint"
      v-model:defaultStartTaskPrompt="defaultStartTaskPrompt"
      v-model:defaultResumeTaskPrompt="defaultResumeTaskPrompt"
      v-model:defaultSupervisionPrompt="defaultSupervisionPrompt"
      v-model:defaultSupervisionIdleSeconds="defaultSupervisionIdleSeconds"
      v-model:defaultCompressionPrompt="defaultCompressionPrompt"
      v-model:promptAiMessageNotify="promptAiMessageNotify"
      v-model:promptAiMessageInquiry="promptAiMessageInquiry"
      v-model:aiMessageInquiryReminderSeconds="aiMessageInquiryReminderSeconds"
      v-model:promptAiMessageInquiryReminder="promptAiMessageInquiryReminder"
      v-model:promptAiMessageReply="promptAiMessageReply"
      v-model:promptAiMessageChitchat="promptAiMessageChitchat"
      v-model:promptAiMessageReplySuccess="promptAiMessageReplySuccess"
      v-model:promptUserMessageNotice="promptUserMessageNotice"
      v-model:themeMode="themeMode"
      v-model:fontSize="fontSize"
      v-model:tavilyApiKey="tavilyApiKey"
      v-model:modelPresets="modelPresets"
      v-model:mcpMaxSteps="mcpMaxSteps"
      v-model:mcpHistoryResultMaxChars="mcpHistoryResultMaxChars"
      v-model:conversationAutoCompressEnabled="conversationAutoCompressEnabled"
      @save="saveSystemSettings"
    />

    <AdminModal
      :show="adminModalOpen"
      :current-user="currentUser"
      @close="adminModalOpen = false"
    />

    <DeviceDevDocModal
      :show="deviceDocOpen"
      @close="deviceDocOpen = false"
    />

    </div>
  </div>
</template>

<style scoped>
.task-running-border {
  animation: taskRunningPulse 1.6s ease-in-out infinite;
}

@keyframes taskRunningPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}
</style>
