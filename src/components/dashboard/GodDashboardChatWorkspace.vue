<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { BACKGROUND_POPUP_Z_INDEX, PINNED_POPUP_Z_INDEX } from '@/composables/usePopupZIndex'
import type { Agent, User } from '@/types'
import {
  aiWorkspaceDirname,
  applyConversationModel,
  chatMcpCatalogKey,
  findFreshAgent,
  resolveActiveRunSessionId,
  type ChatDeviceHint,
} from './godDashboardAgents'
import {
  applyChatDragMove,
  applyChatFloatPosition,
  applyChatResizeMove,
  clampChatFloatIntoView,
  createPipHost,
  isChatDragIgnored,
  requestChatPipWindow,
  resetChatPanelGeometry,
  syncStylesToPipDocument,
  type ChatResizeEdge,
  type ChatResizeState,
} from './godDashboardChatGeometry'
import GodDashboardChatPanel from './GodDashboardChatPanel.vue'

const FloatingAgentChatWindow = defineAsyncComponent(() => import('./FloatingAgentChatWindow.vue'))

type FloatingAgentChat = {
  windowId: string
  agent: Agent
  initialSessionId: string
  zIndex: number
}

type ChatPanelHandle = {
  panelEl: HTMLElement | null
  closeChatMemberMenu: () => void
  onViewportResize: () => void
}

const props = defineProps<{
  agents: Agent[]
  currentUser?: User | null
  allFiles: string[]
  connectedDevices: ChatDeviceHint[]
  mcpDynamicRule: string
  getSocialRect: () => DOMRect | null
}>()

const emit = defineEmits<{
  (e: 'open-settings', agent: Agent): void
  (e: 'refresh-files'): void
  (e: 'model-changed', payload: { aiConfigId: number; model: string }): void
  (e: 'update:activeAiConfigId', value: number | null): void
}>()

const { isMobile } = useBreakpoint()
const selectedFiles = ref<string[]>([])
const chatModalOpen = ref(false)
const chatTarget = ref<Agent | null>(null)
const agentChatZIndex = computed(() =>
  chatFloating.value || chatPipActive.value ? PINNED_POPUP_Z_INDEX : BACKGROUND_POPUP_Z_INDEX,
)
const chatInitialSessionId = ref('')
const chatCurrentSessionId = ref('')
const chatTaskPlanRefreshSignal = ref(0)
const chatLiveTokenUsed = ref(0)
const floatingAgentChats = ref<FloatingAgentChat[]>([])
let floatingChatSequence = 0
let floatingChatZIndex = PINNED_POPUP_Z_INDEX + 10
const chatPanel = ref<ChatPanelHandle | null>(null)
const chatFloating = ref(false)
const chatPipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window
const chatPipContainer = ref<HTMLElement | null>(null)
const chatPipActive = computed(() => !!chatPipContainer.value)
let chatPipWindow: Window | null = null
let chatResizeObserver: ResizeObserver | null = null
let chatDragOffset: { dx: number; dy: number } | null = null
let chatDragCapture: { element: HTMLElement; pointerId: number } | null = null
let chatResizeState: ChatResizeState | null = null
let chatResizeCapture: { element: HTMLElement; pointerId: number } | null = null
let previousResizeCursor = ''
let previousResizeUserSelect = ''

const panelEl = () => chatPanel.value?.panelEl ?? null
const chatMcpCatalogRefreshKey = computed(() => chatMcpCatalogKey(props.connectedDevices || []))
const chatSwitchAgents = computed(() => props.agents.filter(agent =>
  !!agent.aiConfigId && Number(agent.aiConfigId) !== Number(chatTarget.value?.aiConfigId || 0),
))
const activeAiConfigId = computed(() => (
  chatModalOpen.value && chatTarget.value?.aiConfigId ? Number(chatTarget.value.aiConfigId) : null
))

watch(activeAiConfigId, value => emit('update:activeAiConfigId', value), { immediate: true })

const syncOpenAgentReferences = () => {
  chatTarget.value = findFreshAgent(props.agents, chatTarget.value)
  floatingAgentChats.value = floatingAgentChats.value.map(window => ({
    ...window,
    agent: findFreshAgent(props.agents, window.agent) || window.agent,
  }))
}

const onConversationModelChanged = (payload: { aiConfigId: number; model: string }) => {
  applyConversationModel(
    props.agents,
    [chatTarget.value, ...floatingAgentChats.value.map(window => window.agent)],
    payload,
  )
  emit('model-changed', payload)
}

const positionChatFloatAtBottomRight = async () => {
  await nextTick()
  const el = panelEl()
  if (!el || !chatFloating.value) return
  applyChatFloatPosition(el, props.getSocialRect())
}

const clampCurrentChatFloat = () => {
  const el = panelEl()
  if (!el || !chatFloating.value) return
  clampChatFloatIntoView(el)
}

function endChatDrag() {
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

function onChatDragMove(event: PointerEvent) {
  const el = panelEl()
  if (!el || !chatDragOffset) return
  applyChatDragMove(el, event, chatDragOffset)
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

function onChatResizeMove(event: PointerEvent) {
  const el = panelEl()
  if (!el || !chatResizeState) return
  applyChatResizeMove(el, chatResizeState, event)
  event.preventDefault()
}

function closeChatPip() {
  const win = chatPipWindow
  chatPipWindow = null
  chatPipContainer.value = null
  if (win && !win.closed) win.close()
}

const closeAgentChat = () => {
  chatPanel.value?.closeChatMemberMenu()
  chatModalOpen.value = false
  chatInitialSessionId.value = ''
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  chatFloating.value = false
  endChatDrag()
  endChatResize()
  closeChatPip()
}

const toggleChatFloating = async () => {
  chatFloating.value = !chatFloating.value
  if (chatFloating.value) {
    await positionChatFloatAtBottomRight()
    return
  }
  await nextTick()
  endChatDrag()
  endChatResize()
  resetChatPanelGeometry(panelEl())
}

const onChatHeaderPointerDown = (event: PointerEvent) => {
  if (!chatFloating.value || event.button !== 0 || isChatDragIgnored(event.target)) return
  const el = panelEl()
  if (!el) return
  const rect = el.getBoundingClientRect()
  chatDragOffset = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
  const captureElement = event.currentTarget as HTMLElement
  captureElement.setPointerCapture(event.pointerId)
  chatDragCapture = { element: captureElement, pointerId: event.pointerId }
  window.addEventListener('pointermove', onChatDragMove)
  window.addEventListener('pointerup', endChatDrag)
  window.addEventListener('pointercancel', endChatDrag)
  event.preventDefault()
}

const onChatResizePointerDown = (edge: ChatResizeEdge, event: PointerEvent) => {
  if (!chatFloating.value || event.button !== 0) return
  const el = panelEl()
  if (!el) return
  endChatDrag()
  const rect = el.getBoundingClientRect()
  chatResizeState = {
    edge,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
  const captureElement = event.currentTarget as HTMLElement
  captureElement.setPointerCapture(event.pointerId)
  chatResizeCapture = { element: captureElement, pointerId: event.pointerId }
  previousResizeCursor = document.documentElement.style.cursor
  previousResizeUserSelect = document.body.style.userSelect
  document.documentElement.style.cursor = `${edge}-resize`
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onChatResizeMove, { passive: false })
  window.addEventListener('pointerup', endChatResize)
  window.addEventListener('pointercancel', endChatResize)
  event.preventDefault()
  event.stopPropagation()
}

const openChatPip = async () => {
  if (!chatPipSupported || chatPipWindow) return
  if (chatFloating.value) {
    chatFloating.value = false
    endChatDrag()
    endChatResize()
    resetChatPanelGeometry(panelEl())
  }
  try {
    const pip = await requestChatPipWindow()
    syncStylesToPipDocument(pip)
    const host = createPipHost(pip)
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
  chatTarget.value = agent
  chatLiveTokenUsed.value = 0
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
  chatLiveTokenUsed.value = 0
  selectedFiles.value = []
  chatInitialSessionId.value = target.initialSessionId
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  chatModalOpen.value = true
}

const openAgentTaskDetail = (agent: Agent, jobId: string, sessionId?: string) => {
  if (!agent.aiConfigId || !jobId) return
  chatTarget.value = agent
  chatLiveTokenUsed.value = 0
  selectedFiles.value = []
  chatInitialSessionId.value = String(sessionId || `session_task_${jobId}`).trim()
  chatCurrentSessionId.value = ''
  chatTaskPlanRefreshSignal.value = 0
  chatModalOpen.value = true
}

const repositionFloat = () => {
  if (chatFloating.value) void positionChatFloatAtBottomRight()
}

const onViewportResize = () => {
  clampCurrentChatFloat()
  chatPanel.value?.onViewportResize()
}

watch(() => chatPanel.value?.panelEl ?? null, el => {
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  chatResizeObserver = new ResizeObserver(clampCurrentChatFloat)
  chatResizeObserver.observe(el)
}, { flush: 'post' })

watch(() => props.agents, () => {
  syncOpenAgentReferences()
}, { flush: 'post' })

watch(chatFloating, value => {
  if (value) void positionChatFloatAtBottomRight()
})

onMounted(() => {
  window.addEventListener('resize', onViewportResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportResize)
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
  endChatDrag()
  endChatResize()
  closeChatPip()
})

defineExpose({
  openAgentChat,
  openAgentTaskDetail,
  syncOpenAgentReferences,
  repositionFloat,
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="chatTarget && chatModalOpen"
        :style="{ zIndex: agentChatZIndex }"
        class="fixed inset-0"
        :class="(chatFloating || chatPipActive) ? 'pointer-events-none' : 'modal-overlay flex items-center justify-center p-0 sm:p-4'"
        @click="(chatFloating || chatPipActive) ? undefined : closeAgentChat()"
      >
        <GodDashboardChatPanel
          ref="chatPanel"
          :chat-target="chatTarget"
          :chat-floating="chatFloating"
          :chat-pip-active="chatPipActive"
          :chat-pip-container="chatPipContainer"
          :chat-pip-supported="chatPipSupported"
          :chat-switch-agents="chatSwitchAgents"
          :chat-live-token-used="chatLiveTokenUsed"
          :chat-current-session-id="chatCurrentSessionId"
          :chat-task-plan-refresh-signal="chatTaskPlanRefreshSignal"
          :chat-initial-session-id="chatInitialSessionId"
          :mcp-dynamic-rule="mcpDynamicRule"
          :mcp-catalog-refresh-key="chatMcpCatalogRefreshKey"
          :selected-files="selectedFiles"
          :all-files="allFiles"
          :selectable-file-root="aiWorkspaceDirname(chatTarget)"
          :current-user-id="Number(currentUser?.id) || undefined"
          :connected-devices="connectedDevices"
          @close="closeAgentChat"
          @toggle-float="toggleChatFloating"
          @toggle-pip="chatPipActive ? closeChatPip() : openChatPip()"
          @header-pointer-down="onChatHeaderPointerDown"
          @resize-pointer-down="onChatResizePointerDown"
          @switch-target="openAgentChat"
          @update:selected-files="selectedFiles = $event"
          @update:current-session-id="chatCurrentSessionId = $event"
          @task-plan-refresh="chatTaskPlanRefreshSignal = $event"
          @open-settings="chatTarget && emit('open-settings', chatTarget)"
          @total-chat-tokens-update="chatLiveTokenUsed = Math.max(0, Number($event) || 0)"
          @refresh-files="emit('refresh-files')"
          @model-changed="onConversationModelChanged"
        />
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
    :connected-devices="connectedDevices"
    @focus="focusFloatingAgentChat(window.windowId)"
    @close="closeFloatingAgentChat(window.windowId)"
    @expand="expandFloatingAgentChat(window.windowId)"
    @open-settings="emit('open-settings', window.agent)"
    @refresh-files="emit('refresh-files')"
    @model-changed="onConversationModelChanged"
  />
</template>
