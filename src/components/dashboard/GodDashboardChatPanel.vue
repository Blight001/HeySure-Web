<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import ChatTokenUsageBar from '@/components/chat/ChatTokenUsageBar.vue'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'
import { BACKGROUND_POPUP_Z_INDEX, PINNED_POPUP_Z_INDEX } from '@/composables/usePopupZIndex'
import type { Agent } from '@/types'
import type { ChatDeviceHint } from './godDashboardAgents'
import type { ChatResizeEdge } from './godDashboardChatGeometry'
import { CHAT_FLOAT_CONSTRAINTS } from './godDashboardChatGeometry'

const ChatInterface = defineAsyncComponent(() => import('@/components/chat/ChatInterface.vue'))
const TaskProgressPanel = defineAsyncComponent(() => import('@/components/chat/TaskProgressPanel.vue'))
const MessageDialog = defineAsyncComponent(() => import('@/components/common/MessageDialog.vue'))

const props = defineProps<{
  chatTarget: Agent
  chatFloating: boolean
  chatPipActive: boolean
  chatPipContainer: HTMLElement | null
  chatPipSupported: boolean
  chatSwitchAgents: Agent[]
  chatLiveTokenUsed: number
  chatCurrentSessionId: string
  chatTaskPlanRefreshSignal: number
  chatInitialSessionId: string
  mcpDynamicRule: string
  mcpCatalogRefreshKey: string
  selectedFiles: string[]
  allFiles: string[]
  selectableFileRoot: string
  currentUserId?: number
  connectedDevices: ChatDeviceHint[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-float'): void
  (e: 'toggle-pip'): void
  (e: 'header-pointer-down', event: PointerEvent): void
  (e: 'resize-pointer-down', edge: ChatResizeEdge, event: PointerEvent): void
  (e: 'switch-target', agent: Agent): void
  (e: 'update:selectedFiles', files: string[]): void
  (e: 'update:currentSessionId', sessionId: string): void
  (e: 'taskPlanRefresh', signal: number): void
  (e: 'open-settings'): void
  (e: 'totalChatTokensUpdate', value: number): void
  (e: 'refreshFiles'): void
  (e: 'modelChanged', payload: { aiConfigId: number; model: string }): void
}>()

const panelRef = ref<HTMLElement | null>(null)
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
    zIndex: (props.chatFloating || props.chatPipActive)
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

const switchChatTarget = (agent: Agent) => {
  closeChatMemberMenu()
  emit('switch-target', agent)
}

useDismissibleLayer({
  open: chatMemberMenuOpen,
  roots: [chatMemberSwitcherRef, chatMemberMenuRef],
  onDismiss: closeChatMemberMenu,
})

const onViewportResize = () => {
  if (chatMemberMenuOpen.value) positionChatMemberMenu()
}

defineExpose({ panelEl: panelRef, closeChatMemberMenu, onViewportResize })

const chatTargetAiKind = computed<'core'>(() => 'core')

const resizeEdges: ChatResizeEdge[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']
const resizeClass: Record<ChatResizeEdge, string> = {
  n: 'absolute inset-x-3 top-0 z-[100] h-2 cursor-n-resize touch-none',
  e: 'absolute inset-y-3 right-0 z-[100] w-2 cursor-e-resize touch-none',
  s: 'absolute inset-x-3 bottom-0 z-[100] h-2 cursor-s-resize touch-none',
  w: 'absolute inset-y-3 left-0 z-[100] w-2 cursor-w-resize touch-none',
  ne: 'absolute right-0 top-0 z-[101] h-3 w-3 cursor-ne-resize touch-none',
  se: 'absolute bottom-0 right-0 z-[101] h-3 w-3 cursor-se-resize touch-none',
  sw: 'absolute bottom-0 left-0 z-[101] h-3 w-3 cursor-sw-resize touch-none',
  nw: 'absolute left-0 top-0 z-[101] h-3 w-3 cursor-nw-resize touch-none',
}
</script>

<template>
  <Teleport :to="chatPipContainer ?? 'body'" :disabled="!chatPipActive">
    <div
      ref="panelRef"
      class="acrylic-modal shadow-xl flex flex-col"
      :class="chatPipActive
        ? 'relative h-full w-full overflow-hidden rounded-none !border-0'
        : chatFloating
          ? 'pointer-events-auto fixed overflow-hidden rounded-2xl'
          : 'overflow-hidden rounded-none sm:rounded-2xl !border-0 sm:!border w-full h-full max-w-none sm:max-w-[960px] sm:h-[88vh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0'"
      :style="chatFloating ? CHAT_FLOAT_CONSTRAINTS : undefined"
      @click.stop
    >
      <template v-if="chatFloating">
        <span
          v-for="edge in resizeEdges"
          :key="edge"
          :class="resizeClass[edge]"
          aria-hidden="true"
          @pointerdown="emit('resize-pointer-down', edge, $event)"
        />
      </template>
      <div
        class="flex h-14 shrink-0 items-center gap-2 bg-white/40 px-2 py-1 backdrop-blur dark:bg-zinc-900/40 sm:gap-3 sm:px-3"
        :class="chatFloating ? 'cursor-move select-none' : ''"
        @pointerdown="emit('header-pointer-down', $event)"
      >
        <div class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <button
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="退出对话"
            @click="emit('close')"
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
        <div class="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          <button
            v-if="!chatPipActive"
            class="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            :title="chatFloating ? '还原为弹窗' : '缩小为页面内悬浮窗'"
            @click="emit('toggle-float')"
          >
            <svg v-if="!chatFloating" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h4" />
              <rect x="12" y="12" width="9" height="7" rx="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
            </svg>
          </button>
          <button
            v-if="chatPipSupported"
            class="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
            :class="chatPipActive
              ? 'text-indigo-500 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'"
            :title="chatPipActive ? '退出桌面置顶，还原为弹窗' : '桌面置顶（跨应用悬浮小窗）'"
            @click="emit('toggle-pip')"
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
          :currentUserId="currentUserId"
          :initialSessionId="chatInitialSessionId || undefined"
          :mcpDynamicRule="mcpDynamicRule"
          :mcp-catalog-refresh-key="mcpCatalogRefreshKey"
          :floating-layer="chatFloating && !chatPipActive"
          :embedded-dialogs="chatFloating || chatPipActive"
          dialog-host="chat-main"
          :selectedFiles="selectedFiles"
          :allFiles="allFiles"
          :selectable-file-root="selectableFileRoot"
          :remote-screen-devices="connectedDevices"
          @update:selectedFiles="emit('update:selectedFiles', $event)"
          @update:currentSessionId="emit('update:currentSessionId', $event)"
          @taskPlanRefresh="emit('taskPlanRefresh', $event)"
          @open-settings="emit('open-settings')"
          @totalChatTokensUpdate="emit('totalChatTokensUpdate', $event)"
          @refreshFiles="emit('refreshFiles')"
          @modelChanged="emit('modelChanged', $event)"
        />
      </div>
      <MessageDialog v-if="chatFloating || chatPipActive" host="chat-main" inline />
    </div>
  </Teleport>
</template>
