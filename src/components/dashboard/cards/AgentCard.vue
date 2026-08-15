<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { Agent } from '@/types'
import { resolveAiAvatarUrl } from '@/utils/aiAvatar'
import {
  agentCardBorderClass,
  agentCardGlowClass,
  agentRoleBadge,
  agentStatusDisplay,
  agentSyncedMcpText,
  agentTitleHoverClass,
  formatTaskSchedule,
  listBotConnections,
  scheduledTaskSnapshots,
} from './agentCardDisplay'
import { useAgentCardThinking } from './useAgentCardThinking'

const RemoteControlModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteControlModal.vue'))

interface AgentProps {
  focused?: boolean
  focusSignal?: number
  agent: Agent
}

const props = defineProps<AgentProps>()
const emit = defineEmits<{
  (e: 'chat', agent: Agent): void
  (e: 'show-tasks', agent: Agent): void
  (e: 'show-task-detail', payload: { agent: Agent; jobId: string }): void
  (e: 'settings', agent: Agent): void
}>()

const cardRootRef = ref<HTMLElement | null>(null)

watch(
  () => [props.focused, props.focusSignal] as const,
  async ([focused]) => {
    if (!focused) return
    await nextTick()
    cardRootRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  },
  { immediate: true },
)

const aiAvatarUrl = computed(() => resolveAiAvatarUrl(props.agent.avatar))
const statusDisplay = computed(() => agentStatusDisplay(props.agent))
const showStatusDisplay = computed(() => !statusDisplay.value.text.startsWith('空闲中')
  && !statusDisplay.value.text.startsWith('与用户沟通中'))
const cardBorderClass = computed(() => agentCardBorderClass(props.agent))
const cardGlowClass = computed(() => agentCardGlowClass(props.agent))
const titleHoverClass = computed(() => agentTitleHoverClass(props.agent))
const canControl = computed(() => typeof props.agent.aiConfigId === 'number')
const isAssistantAdmin = computed(() => props.agent.aiRole === 'assistant_admin')
const showRecentUserChatBadge = computed(() => !!props.agent.recentUserChatActive)
const taskSnapshotDisplay = computed(() => props.agent.taskCurrent || null)
const scheduledSnapshots = computed(() => scheduledTaskSnapshots(props.agent))
const showTaskSnapshotBlock = computed(() => {
  if (props.agent.aiRole !== 'digital_member') return false
  return Boolean(taskSnapshotDisplay.value || scheduledSnapshots.value.length > 0)
})
const roleBadge = computed(() => agentRoleBadge(props.agent))
const botConnections = computed(() => listBotConnections(props.agent))
const syncedMcpText = computed(() => agentSyncedMcpText(props.agent))
const { thinkingPreview, thinkingViewportRef, thinkingTextRef } = useAgentCardThinking(() => props.agent)

const rcTarget = ref<{ deviceId: string; name: string; mode: 'android' | 'desktop' | 'browser' } | null>(null)
const DOUBLE_TAP_DELAY = 320
let lastTouchTapAt = 0

const isInteractiveCardTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return !!element?.closest('button,a,input,textarea,select,label,[role="button"],[data-card-action]')
}

const onCardDblClick = (event: MouseEvent) => {
  if (isInteractiveCardTarget(event.target)) return
  emit('chat', props.agent)
}

const onCardPointerUp = (event: PointerEvent) => {
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
  if (isInteractiveCardTarget(event.target)) return
  const now = Date.now()
  if (now - lastTouchTapAt > DOUBLE_TAP_DELAY) {
    lastTouchTapAt = now
    return
  }
  lastTouchTapAt = 0
  emit('chat', props.agent)
}

const openRemote = (mode: 'android' | 'desktop' | 'browser', deviceId?: string, name?: string) => {
  rcTarget.value = { deviceId: deviceId || '', name: name || props.agent.name, mode }
}

const openTaskDetail = () => {
  if (taskSnapshotDisplay.value?.jobId) {
    emit('show-task-detail', { agent: props.agent, jobId: taskSnapshotDisplay.value.jobId })
    return
  }
  emit('show-tasks', props.agent)
}
</script>

<template>
  <div 
    ref="cardRootRef"
    class="agent-card-shell relative acrylic-panel rounded-xl p-4 transition-all duration-300 border shadow-sm hover:shadow-lg hover:-translate-y-1 w-full min-w-0 dark:bg-zinc-900/90 dark:border-zinc-700/50 backdrop-blur-sm group cursor-pointer touch-manipulation"
    :class="[cardBorderClass, cardGlowClass, { 'agent-card-world-focus': focused }]"
    @dblclick="onCardDblClick"
    @pointerup="onCardPointerUp"
  >
    <!-- AI 头像背景；触屏端由 scoped CSS 关闭实时模糊，降低滚动时的 GPU 重绘。 -->
    <div 
      v-if="aiAvatarUrl"
      class="agent-card-avatar-layer absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0"
    >
      <img
        :src="aiAvatarUrl"
        class="agent-card-avatar-image w-full h-full object-cover select-none blur scale-[1.03]"
        alt=""
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        draggable="false"
      />
    </div>

    <div
      v-if="roleBadge"
      class="absolute top-2 right-12 text-xs px-2 py-1 rounded-full border shadow-sm flex items-center gap-1 z-20"
      :class="roleBadge.class"
    >
      <AppIcon :name="roleBadge.icon" class="w-3 h-3" /> {{ roleBadge.text }}
    </div>

    <div class="relative z-10">
    <div class="flex justify-between items-start mb-3">
      <div class="min-w-0 flex-1 pr-2">
        <h3 class="font-bold text-zinc-900 flex items-center gap-2 text-base dark:text-zinc-100 transition-colors min-w-0" :class="titleHoverClass">
          <span class="truncate transition-all group-hover:scale-[1.1] group-hover:origin-left group-hover:[text-shadow:0_0_3px_var(--agent-glow-color),0_0_6px_var(--agent-glow-color)]">{{ agent.name }}</span>
          <span class="shrink-0 text-xs font-mono font-normal text-zinc-400 dark:text-zinc-500">
            ID: {{ agent.id.slice(-4) }}
          </span>
          <span
            class="min-w-0 inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50/60 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
            :title="agent.platform"
          >
            <span class="agent-card-online-dot inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" title="在线"></span>
            <span class="truncate">{{ agent.platform }}</span>
          </span>
        </h3>
        <div class="mt-2 flex flex-wrap items-center justify-start gap-1.5">
          <span
            v-for="botConnection in botConnections"
            :key="botConnection.text"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            :class="botConnection.class"
            :title="botConnection.title"
          >
            {{ botConnection.text }}
          </span>
        </div>
      </div>
      <button
        v-if="canControl"
        class="w-8 h-8 sm:w-7 sm:h-7 rounded-full border border-zinc-200 text-zinc-500 active:text-indigo-600 hover:text-indigo-600 active:border-indigo-300 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-indigo-300 flex items-center justify-center"
        title="AI 设置"
        @click.stop="emit('settings', agent)"
      >
        <AppIcon name="gear" class="w-4 h-4 sm:w-3.5 sm:h-3.5" />
      </button>
    </div>

    <div v-if="!isAssistantAdmin && (showStatusDisplay || showRecentUserChatBadge)" class="mb-3 flex items-start gap-2 min-w-0">
      <div class="flex flex-wrap items-start gap-1.5 min-w-0">
        <span
          v-if="showStatusDisplay"
          class="agent-card-status px-2 py-1 rounded text-xs font-medium border break-words"
          :class="statusDisplay.class"
        >
          {{ statusDisplay.text }}
        </span>
        <span
          v-if="showRecentUserChatBadge"
          class="px-2 py-1 rounded text-xs font-medium border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300"
          title="最近 1 分钟内收到用户对话数据"
        >
          最近1分钟内用户沟通
        </span>
      </div>
    </div>
    <div v-else-if="showRecentUserChatBadge" class="mb-3 flex items-start gap-2 min-w-0">
      <span
        class="px-2 py-1 rounded text-xs font-medium border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300"
        title="最近 1 分钟内收到用户对话数据"
      >
        最近1分钟内用户沟通
      </span>
    </div>

    <div class="min-h-[3.5rem] bg-transparent text-xs text-zinc-700 dark:text-zinc-300">
      <p class="leading-relaxed text-zinc-600 dark:text-zinc-400">
        {{ syncedMcpText }}
      </p>
      <div
        ref="thinkingViewportRef"
        class="mt-1 leading-relaxed text-zinc-500 dark:text-zinc-400 task-thinking-viewport"
        :title="thinkingPreview"
      >
        <p ref="thinkingTextRef" class="task-thinking-content">
          {{ thinkingPreview }}
        </p>
      </div>
      <div v-if="showTaskSnapshotBlock" class="mt-2 space-y-1.5">
        <div
          v-if="taskSnapshotDisplay"
          class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/50 p-2"
        >
          <div class="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">当前任务</div>
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{{ taskSnapshotDisplay.title }}</div>
            </div>
            <button
              class="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
              @click.stop="openTaskDetail"
            >
              对话详情
            </button>
          </div>
        </div>

        <div
          v-for="task in scheduledSnapshots"
          :key="task.jobId"
          class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/50 p-2"
        >
          <div class="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">定时任务</div>
          <div class="min-w-0">
            <div class="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">{{ task.title }}</div>
            <div v-if="formatTaskSchedule(task)" class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {{ formatTaskSchedule(task) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canControl" class="flex justify-end gap-2 mt-3 pt-2 border-t border-zinc-50 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity dark:border-zinc-800">
      <button v-if="!isAssistantAdmin" class="text-xs text-zinc-500 hover:text-indigo-600 px-2 py-1 hover:bg-zinc-50 rounded transition-colors dark:text-zinc-400 dark:hover:text-indigo-300 dark:hover:bg-zinc-800" @click.stop="emit('show-tasks', agent)">
        任务列表
      </button>
      <button v-if="agent.androidAgentConnected" class="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 hover:bg-teal-50 rounded transition-colors dark:text-teal-300 dark:hover:text-teal-200 dark:hover:bg-teal-500/10" title="实时查看并控制该安卓设备" @click.stop="openRemote('android', agent.androidAgentId, agent.androidAgentName || agent.name)">
        远程控制
      </button>
      <button v-if="agent.desktopAgentConnected" class="text-xs text-sky-600 hover:text-sky-700 px-2 py-1 hover:bg-sky-50 rounded transition-colors dark:text-sky-300 dark:hover:text-sky-200 dark:hover:bg-sky-500/10" title="实时查看并控制该桌面设备" @click.stop="openRemote('desktop', agent.desktopAgentId, agent.desktopAgentName || agent.name)">
        桌面控制
      </button>
      <button v-if="agent.browserAgentConnected" class="text-xs text-violet-600 hover:text-violet-700 px-2 py-1 hover:bg-violet-50 rounded transition-colors dark:text-violet-300 dark:hover:text-violet-200 dark:hover:bg-violet-500/10" title="实时查看并控制该浏览器" @click.stop="openRemote('browser', agent.browserAgentId, agent.browserAgentName || agent.name)">
        浏览器控制
      </button>
      <button class="text-xs text-red-400 hover:text-red-600 px-2 py-1 hover:bg-red-50 rounded transition-colors dark:text-red-300 dark:hover:text-red-200 dark:hover:bg-red-500/10" @click.stop="emit('chat', agent)">
        与此 AI 对话
      </button>
    </div>

    <RemoteControlModal
      v-if="rcTarget"
      :device-id="rcTarget.deviceId"
      :device-name="rcTarget.name"
      :mode="rcTarget.mode"
      @close="rcTarget = null"
    />
    </div>
  </div>
</template>

<style scoped src="./agentCard.css"></style>
