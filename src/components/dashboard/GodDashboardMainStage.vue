<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { Agent, KnowledgeItem, User } from '@/types'

const LeftSidebarPanel = defineAsyncComponent(() => import('./panels/LeftSidebarPanel.vue'))
const WorldArenaPanel = defineAsyncComponent(() => import('./panels/WorldArenaPanel.vue'))

defineProps<{
  leftCollapsed: boolean
  isMobile: boolean
  mobileTab: 'console' | 'arena'
  arenaActivated: boolean
  adminAgents: Agent[]
  memberAgents: Agent[]
  activeAgents: Agent[]
  connectedDevices: ConnectedDevice[]
  knowledgeItems: KnowledgeItem[]
  knowledgeTotalCount: number
  brainViewMode: 'sections' | 'all'
  focusedAiConfigId: number | null
  focusSignal: number
  knowledgeFocusSignal: number
  focusedDeviceId: string
  deviceFocusSignal: number
  chatAiConfigId?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:leftCollapsed', value: boolean): void
  (e: 'update:mobileTab', value: 'console' | 'arena'): void
  (e: 'activate-arena'): void
  (e: 'update:brain-view-mode', value: 'sections' | 'all'): void
  (e: 'show-tasks', agent: Agent): void
  (e: 'show-task-detail', payload: { agent: Agent; jobId: string }): void
  (e: 'chat', agent: Agent): void
  (e: 'settings', agent: Agent): void
  (e: 'create-ai'): void
  (e: 'refresh-user', user: User): void
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
  (e: 'open-device-doc'): void
  (e: 'focus-agent', aiConfigId: number): void
  (e: 'open-knowledge'): void
  (e: 'focus-device', deviceId: string): void
  (e: 'social-ready'): void
}>()

const worldArenaPanelRef = ref<{ getBoundingRect: () => DOMRect | null } | null>(null)

watch(worldArenaPanelRef, panel => {
  if (panel) emit('social-ready')
}, { flush: 'post' })

const getSocialRect = () => worldArenaPanelRef.value?.getBoundingRect() ?? null
defineExpose({ getSocialRect })
</script>

<template>
  <main
    class="flex-1 overflow-hidden flex flex-col lg:flex-row p-2 sm:p-4 lg:p-6"
    :class="leftCollapsed ? 'lg:gap-4' : 'lg:gap-6'"
  >
    <section
      class="flex flex-col gap-4 sm:gap-6 transition-all duration-300 relative w-full min-h-0 flex-1 lg:order-2 lg:flex-none lg:h-full"
      :class="[
        leftCollapsed ? 'lg:w-10 lg:min-w-[40px]' : 'lg:w-[20%] lg:min-w-[280px]',
        mobileTab !== 'console' ? 'max-lg:hidden' : '',
      ]"
    >
      <button
        class="hidden lg:block absolute -left-3 top-4 w-6 h-6 rounded-full acrylic-chip backdrop-blur-sm text-zinc-500 text-xs shadow hover:text-indigo-600 hover:border-indigo-200 dark:text-zinc-300 dark:hover:text-indigo-300 z-10 transition-transform hover:scale-110"
        @click="emit('update:leftCollapsed', !leftCollapsed)"
      >
        {{ leftCollapsed ? '⟨' : '⟩' }}
      </button>
      <div v-if="leftCollapsed" class="hidden lg:flex flex-1 items-center justify-center text-zinc-400 text-xs dark:text-zinc-500">
        数字生命
      </div>
      <div v-else class="h-full min-h-0 overflow-y-auto lg:overflow-visible">
        <LeftSidebarPanel
          :admin-agents="adminAgents"
          :member-agents="memberAgents"
          :active-agents="activeAgents"
          :connected-devices="connectedDevices"
          :knowledge-items="knowledgeItems"
          :knowledge-total-count="knowledgeTotalCount"
          :brain-view-mode="brainViewMode"
          :focused-ai-config-id="focusedAiConfigId"
          :focus-signal="focusSignal"
          :knowledge-focus-signal="knowledgeFocusSignal"
          :focused-device-id="focusedDeviceId"
          :device-focus-signal="deviceFocusSignal"
          @update:brain-view-mode="emit('update:brain-view-mode', $event)"
          @show-tasks="emit('show-tasks', $event)"
          @show-task-detail="emit('show-task-detail', $event)"
          @chat="emit('chat', $event)"
          @settings="emit('settings', $event)"
          @create-ai="emit('create-ai')"
          @refresh-user="emit('refresh-user', $event)"
          @view-all-mcp="emit('view-all-mcp')"
          @manage-device-tools="emit('manage-device-tools', $event)"
          @open-device-doc="emit('open-device-doc')"
        />
      </div>
    </section>

    <WorldArenaPanel
      ref="worldArenaPanelRef"
      v-if="!isMobile || arenaActivated"
      v-show="!isMobile || mobileTab === 'arena'"
      class="w-full min-h-0 flex-1 lg:order-1 lg:h-full lg:min-h-0 lg:min-w-0"
      :chat-ai-config-id="chatAiConfigId"
      @focus-agent="emit('focus-agent', $event)"
      @open-knowledge="emit('open-knowledge')"
      @focus-device="emit('focus-device', $event)"
    />
  </main>

  <nav class="lg:hidden shrink-0 z-20 flex items-stretch border-t border-zinc-200/50 acrylic-modal !border-x-0 !border-b-0 rounded-none dark:border-zinc-800/50 pb-[env(safe-area-inset-bottom)]">
    <button
      class="flex-1 flex flex-col items-center justify-center gap-0 py-1.5 active:bg-zinc-100 dark:active:bg-zinc-800 text-[10px] font-medium transition-colors touch-manipulation"
      :class="mobileTab === 'console' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'"
      @click="emit('update:mobileTab', 'console')"
    >
      <AppIcon name="brain" class="w-4 h-4" />
      控制台
    </button>
    <button
      class="flex-1 flex flex-col items-center justify-center gap-0 py-1.5 active:bg-zinc-100 dark:active:bg-zinc-800 text-[10px] font-medium transition-colors touch-manipulation"
      :class="mobileTab === 'arena' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'"
      @click="emit('activate-arena')"
    >
      <AppIcon name="globe" class="w-4 h-4" />
      社会显示
    </button>
  </nav>
</template>
