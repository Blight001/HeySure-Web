<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Agent } from '@/types'
import type { ChatDeviceHint } from './godDashboardAgents'
import ChatInterface from '@/components/chat/ChatInterface.vue'
import ChatTokenUsageBar from '@/components/chat/ChatTokenUsageBar.vue'
import TaskProgressPanel from '@/components/chat/TaskProgressPanel.vue'
import MessageDialog from '@/components/common/MessageDialog.vue'

const props = defineProps<{
  windowId: string
  agent: Agent
  initialSessionId?: string
  currentUserId?: number
  mcpDynamicRule?: string
  mcpCatalogRefreshKey?: string | number
  allFiles: string[]
  selectableFileRoot?: string
  cascadeIndex: number
  zIndex: number
  connectedDevices: ChatDeviceHint[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'focus'): void
  (e: 'expand'): void
  (e: 'open-settings'): void
  (e: 'refresh-files'): void
  (e: 'model-changed', payload: { aiConfigId: number; model: string; modelPresetId: string }): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const selectedFiles = ref<string[]>([])
const currentSessionId = ref('')
const taskPlanRefreshSignal = ref(0)
const liveTokenUsed = ref(0)
const dialogHost = computed(() => `chat-${props.windowId}`)
const aiKind = computed<'core'>(() => 'core')

const onTotalTokensUpdate = (value: number) => {
  liveTokenUsed.value = Math.max(0, Number(value) || 0)
}

const MARGIN = 16
const clampIntoViewport = () => {
  const panel = panelRef.value
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  const width = Math.min(rect.width, window.innerWidth - MARGIN * 2)
  const height = Math.min(rect.height, window.innerHeight - MARGIN * 2)
  panel.style.width = `${Math.max(320, width)}px`
  panel.style.height = `${Math.max(380, height)}px`
  panel.style.left = `${Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN))}px`
  panel.style.top = `${Math.min(Math.max(rect.top, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN))}px`
}

const positionInitial = async () => {
  await nextTick()
  const panel = panelRef.value
  if (!panel) return
  const width = Math.min(420, Math.max(320, window.innerWidth - MARGIN * 2))
  const height = Math.min(620, Math.max(380, window.innerHeight - MARGIN * 2))
  const offset = (props.cascadeIndex % 6) * 30
  panel.style.width = `${width}px`
  panel.style.height = `${height}px`
  panel.style.left = `${Math.max(MARGIN, window.innerWidth - width - MARGIN - offset)}px`
  panel.style.top = `${Math.max(MARGIN, window.innerHeight - height - MARGIN - offset)}px`
}

let dragOffset: { x: number; y: number } | null = null
let dragCapture: { element: HTMLElement; pointerId: number } | null = null

const onDragMove = (event: PointerEvent) => {
  const panel = panelRef.value
  if (!panel || !dragOffset) return
  const rect = panel.getBoundingClientRect()
  panel.style.left = `${Math.min(Math.max(event.clientX - dragOffset.x, MARGIN), Math.max(MARGIN, window.innerWidth - rect.width - MARGIN))}px`
  panel.style.top = `${Math.min(Math.max(event.clientY - dragOffset.y, MARGIN), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN))}px`
}

const endDrag = () => {
  dragOffset = null
  const capture = dragCapture
  dragCapture = null
  if (capture?.element.hasPointerCapture(capture.pointerId)) {
    capture.element.releasePointerCapture(capture.pointerId)
  }
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

const startDrag = (event: PointerEvent) => {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [data-chat-drag-ignore]')) return
  const panel = panelRef.value
  if (!panel) return
  emit('focus')
  const rect = panel.getBoundingClientRect()
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  const element = event.currentTarget as HTMLElement
  element.setPointerCapture(event.pointerId)
  dragCapture = { element, pointerId: event.pointerId }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  event.preventDefault()
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  void positionInitial()
  window.addEventListener('resize', clampIntoViewport)
  if (panelRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(clampIntoViewport)
    resizeObserver.observe(panelRef.value)
  }
})

onBeforeUnmount(() => {
  endDrag()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', clampIntoViewport)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="panelRef"
      class="acrylic-modal fixed flex min-h-[380px] min-w-[320px] resize overflow-hidden rounded-2xl shadow-2xl"
      :style="{ zIndex, maxWidth: '96vw', maxHeight: '92vh' }"
      @pointerdown="emit('focus')"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="flex h-14 shrink-0 cursor-move select-none items-center gap-2 bg-white/40 px-3 py-1 backdrop-blur dark:bg-zinc-900/40"
          @pointerdown="startDrag"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ agent.name }}</div>
            <div class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ agent.model || '未设置模型' }}</div>
          </div>
          <div class="min-w-0 flex-1" data-chat-drag-ignore>
            <TaskProgressPanel
              :configId="agent.aiConfigId"
              :sessionId="currentSessionId"
              :refreshSignal="taskPlanRefreshSignal"
              header
            />
          </div>
          <button class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" title="还原为主对话框" @click="emit('expand')">□</button>
          <button class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-950/30" title="关闭该对话" @click="emit('close')">✕</button>
        </div>
        <ChatTokenUsageBar :used="liveTokenUsed" :limit="agent.tokenLimit" />
        <div class="min-h-0 flex-1 p-2">
          <ChatInterface
            :key="`floating-chat-${windowId}-${initialSessionId || 'blank'}`"
            :aiConfigId="agent.aiConfigId"
            :aiKind="aiKind"
            :currentUserId="currentUserId"
            :initialSessionId="initialSessionId"
            :mcpDynamicRule="mcpDynamicRule"
            :mcp-catalog-refresh-key="mcpCatalogRefreshKey"
            floating-layer
            embedded-dialogs
            :dialog-host="dialogHost"
            :selectedFiles="selectedFiles"
            :allFiles="allFiles"
            :selectable-file-root="selectableFileRoot"
            :remote-screen-devices="connectedDevices"
            @update:selectedFiles="selectedFiles = $event"
            @update:currentSessionId="currentSessionId = $event"
            @taskPlanRefresh="taskPlanRefreshSignal = $event"
            @open-settings="emit('open-settings')"
            @totalChatTokensUpdate="onTotalTokensUpdate"
            @refreshFiles="emit('refresh-files')"
            @modelChanged="emit('model-changed', $event)"
          />
        </div>
        <MessageDialog :host="dialogHost" inline />
      </div>
    </div>
  </Teleport>
</template>
