<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { AppIconName } from '@/components/common/AppIcon.vue'
import { resolveAiAvatarUrl } from '@/utils/aiAvatar'

// 远程画面弹窗懒加载，避免拖进侧栏首屏
const RemoteControlModal = defineAsyncComponent(() => import('@/components/dashboard/RemoteControlModal.vue'))

interface AgentTaskSnapshot {
  jobId: string
  title: string
  status: string
  effectiveStatus: string
  runStatus: string
  triggerType: string
  scheduleEnabled?: boolean
  scheduleAt?: number
  scheduleLoopEnabled?: boolean
  scheduleDurationMinutes?: number
  taskTokenUsed: number
  taskTokenLimit: number
  createdAt?: number
  updatedAt?: number
  startedAt?: number
  finishedAt?: number
}

interface AgentProps {
  focused?: boolean
  focusSignal?: number
  agent: {
    id: string
    name: string
    avatar?: string
    role: 'admin' | 'worker'
    tokensUsed: number
    tokenLimit: number
    generation: number
    status: 'learning' | 'working' | 'reproducing' | 'dead'
    platform: string
    currentTask?: string
    summary?: string // 遗言/总结
    projectId?: string
    projectName?: string
    aiConfigId?: number
    enabled?: boolean
    mcpEnabled?: boolean
    mcpTools?: string
    botChannel?: 'feishu' | 'qq' | 'wechat'
    botEnabled?: boolean
    botStatus?: {
      status?: string
      mode?: string
      label?: string
      message?: string
    }
    feishuEnabled?: boolean
    feishuWebhookUrl?: string
    feishuAppId?: string
    feishuDefaultReceiveId?: string
    feishuDefaultReceiveIdType?: string
    feishuStatus?: {
      status?: string
      mode?: string
      label?: string
      message?: string
    }
    qqEnabled?: boolean
    qqAppId?: string
    qqSandbox?: boolean
    qqDefaultTargetId?: string
    qqDefaultTargetType?: string
    qqStatus?: {
      status?: string
      mode?: string
      label?: string
      message?: string
    }
    wechatEnabled?: boolean
    wechatStatus?: {
      status?: string
      mode?: string
      label?: string
      message?: string
    }
    desktopAgentConnected?: boolean
    desktopAgentId?: string
    desktopAgentName?: string
    desktopAgentPlatform?: string
    desktopAgentCapabilities?: string[]
    browserAgentConnected?: boolean
    browserAgentId?: string
    browserAgentName?: string
    browserAgentPlatform?: string
    browserAgentCapabilities?: string[]
    androidAgentConnected?: boolean
    androidAgentId?: string
    androidAgentName?: string
    androidAgentPlatform?: string
    androidAgentCapabilities?: string[]
    runtimeStatus?: string
    runtimeTool?: string
    activeRunStatus?: string
    activeRunPhase?: string
    activeRunSessionId?: string
    userChatActive?: boolean
    recentUserChatActive?: boolean
    recentUserChatAt?: number
    aiRole?: 'assistant_admin' | 'digital_member' | 'admin' | 'worker'
    digitalMemberRole?: 'manager' | 'member'
    parentAiConfigId?: number | null
    managementScope?: string
    currentTaskTitle?: string
    currentTaskStatus?: string
    taskCurrent?: AgentTaskSnapshot | null
    taskCurrentOrRecent?: AgentTaskSnapshot | null
    taskRecentCompleted?: AgentTaskSnapshot | null
    taskScheduledTasks?: AgentTaskSnapshot[]
    latestThinking?: string
  }
}

const props = defineProps<AgentProps>()
const emit = defineEmits<{
  (e: 'chat', agent: AgentProps['agent']): void
  (e: 'show-tasks', agent: AgentProps['agent']): void
  (e: 'show-task-detail', payload: { agent: AgentProps['agent']; jobId: string }): void
  (e: 'settings', agent: AgentProps['agent']): void
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

const statusDisplay = computed(() => {
  const lifecycleSuffix = props.agent.enabled ? '' : ' · 已停止'

  const taskStatus = String(props.agent.currentTaskStatus || '').toLowerCase()
  const isTaskRunning = taskStatus === 'running' || props.agent.runtimeStatus === 'running'
  const isTaskWaiting = ['queued', 'paused', 'scheduled', 'next'].includes(taskStatus)
  const isUserChatActive = !!props.agent.userChatActive

  switch (props.agent.status) {
    case 'learning': return { text: `学习中 (下载记忆)${lifecycleSuffix}`, class: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/30' }
    case 'working':
      if (isUserChatActive) return { text: `与用户沟通中${lifecycleSuffix}`, class: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/30' }
      if (isTaskRunning) return { text: `工作中${lifecycleSuffix}`, class: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30' }
      if (isTaskWaiting) return { text: `等待中${lifecycleSuffix}`, class: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30' }
      return { text: `空闲中${lifecycleSuffix}`, class: 'text-zinc-600 bg-zinc-100/60 border-zinc-200 dark:text-zinc-300 dark:bg-zinc-800/80 dark:border-zinc-700' }
    case 'reproducing': return { text: '传宗接代 (总结任务)', class: 'text-purple-600 bg-purple-50 border-purple-200 animate-pulse dark:text-purple-300 dark:bg-purple-500/10 dark:border-purple-500/30' }
    case 'dead': return { text: '已枯竭', class: 'text-zinc-500 bg-zinc-100/60 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800/60 dark:border-zinc-700' }
    default: return { text: '未知', class: 'text-gray-500' }
  }
})
const showStatusDisplay = computed(() => !statusDisplay.value.text.startsWith('空闲中')
  && !statusDisplay.value.text.startsWith('与用户沟通中'))

const cardBorderClass = computed(() => {
  if (props.agent.aiRole === 'assistant_admin') return 'border-2 border-violet-300 ring-1 ring-inset ring-violet-200/80 shadow-[0_0_14px_rgba(196,181,253,0.5)] dark:border-violet-400/70 dark:ring-violet-500/35 dark:shadow-[0_0_16px_rgba(139,92,246,0.22)]'
  if (props.agent.aiRole === 'digital_member' && props.agent.digitalMemberRole === 'manager') return 'border-2 border-amber-300 ring-1 ring-inset ring-amber-200/80 shadow-[0_0_14px_rgba(252,211,77,0.5)] dark:border-amber-400/70 dark:ring-amber-500/35 dark:shadow-[0_0_16px_rgba(245,158,11,0.22)]'
  if (props.agent.aiRole === 'digital_member') return 'border-2 border-sky-300 ring-1 ring-inset ring-sky-200/80 shadow-[0_0_14px_rgba(125,211,252,0.5)] hover:border-sky-400 dark:border-sky-400/70 dark:ring-sky-500/35 dark:shadow-[0_0_16px_rgba(14,165,233,0.22)]'
  if (props.agent.status === 'dead') return 'border-zinc-200 opacity-75 grayscale'
  return 'border-zinc-200 hover:border-indigo-300'
})

const cardGlowClass = computed(() => {
  if (props.agent.status === 'dead') return 'agent-card-glow-dead'
  if (props.agent.aiRole === 'assistant_admin') return 'agent-card-glow-assistant'
  if (props.agent.aiRole === 'digital_member' && props.agent.digitalMemberRole === 'manager') return 'agent-card-glow-manager'
  if (props.agent.aiRole === 'digital_member') return 'agent-card-glow-member'
  return 'agent-card-glow-default'
})

const titleHoverClass = computed(() => {
  if (props.agent.status === 'dead') return 'group-hover:text-zinc-500'
  if (props.agent.aiRole === 'assistant_admin') return 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  if (props.agent.aiRole === 'digital_member' && props.agent.digitalMemberRole === 'manager') return 'group-hover:text-amber-600 dark:group-hover:text-amber-400'
  if (props.agent.aiRole === 'digital_member') return 'group-hover:text-sky-600 dark:group-hover:text-sky-400'
  return 'group-hover:text-indigo-600'
})

const canControl = computed(() => typeof props.agent.aiConfigId === 'number')
const isAssistantAdmin = computed(() => props.agent.aiRole === 'assistant_admin')
const showRecentUserChatBadge = computed(() => !!props.agent.recentUserChatActive)
const taskSnapshotDisplay = computed(() => props.agent.taskCurrent || null)
const scheduledTaskSnapshots = computed(() => {
  const currentJobId = props.agent.taskCurrent?.jobId || ''
  const scheduled = Array.isArray(props.agent.taskScheduledTasks)
    ? props.agent.taskScheduledTasks
    : []
  return scheduled.filter(task => task && task.jobId !== currentJobId)
})
const showTaskSnapshotBlock = computed(() => {
  if (props.agent.aiRole !== 'digital_member') return false
  return Boolean(taskSnapshotDisplay.value || scheduledTaskSnapshots.value.length > 0)
})

const roleBadge = computed(() => {
  if (props.agent.aiRole === 'assistant_admin') {
    return {
      text: '辅助管理员',
      icon: 'sparkles' as AppIconName,
      class: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40',
    }
  }
  if (props.agent.aiRole === 'digital_member' && props.agent.digitalMemberRole === 'manager') {
    return {
      text: '数字社会管理员',
      icon: 'crown' as AppIconName,
      class: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
    }
  }
  if (props.agent.aiRole === 'digital_member') {
    return {
      text: '数字成员',
      icon: 'robot' as AppIconName,
      class: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/40',
    }
  }
  return null
})

const botConnection = computed(() => {
  const channel = props.agent.botChannel === 'wechat' ? 'wechat' : (props.agent.botChannel === 'qq' ? 'qq' : 'feishu')
  const enabled = channel === 'wechat' ? props.agent.wechatEnabled : (channel === 'qq' ? props.agent.qqEnabled : props.agent.feishuEnabled)
  if (!enabled) return null
  const botStatus = channel === 'wechat' ? props.agent.wechatStatus : (channel === 'qq' ? props.agent.qqStatus : props.agent.feishuStatus)
  const status = String(botStatus?.status || '').trim()
  const mode = String(botStatus?.mode || '').trim()
  const message = String(botStatus?.message || '').trim()
  const receiveId = channel === 'qq'
    ? String(props.agent.qqDefaultTargetId || '').trim()
    : String(props.agent.feishuDefaultReceiveId || '').trim()
  const name = channel === 'wechat' ? '微信' : (channel === 'qq' ? 'QQ' : '飞书')
  const modeText = channel === 'wechat' ? 'iLink' : channel === 'qq'
    ? (mode === 'long_connection' ? '长连接' : mode === 'sandbox_webhook' ? '沙箱仅通知' : mode === 'webhook' ? '仅通知' : '未配置')
    : (mode === 'long_connection' ? '长连接' : mode === 'webhook' ? '仅通知' : '未配置')
  const botName = `${name}机器人`
  if (status === 'success') {
    return {
      text: `${botName} · ${modeText}`,
      class: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
      title: [message || `${name}机器人状态成功`, receiveId ? `默认接收：${receiveId}` : ''].filter(Boolean).join('；'),
    }
  }
  if (status === 'pending') {
    return {
      text: `${botName}待回调 · ${modeText}`,
      class: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
      title: [message || `${name}机器人等待回调`, receiveId ? `默认接收：${receiveId}` : ''].filter(Boolean).join('；'),
    }
  }
  return {
    text: `${botName}失败 · ${modeText}`,
    class: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300',
    title: message || `${name}机器人状态失败`,
  }
})

const desktopConnection = computed(() => {
  if (!props.agent.desktopAgentConnected) return null
  const name = String(props.agent.desktopAgentName || props.agent.name || '').trim()
  const platform = String(props.agent.desktopAgentPlatform || 'Windows Desktop').trim()
  const id = String(props.agent.desktopAgentId || '').trim()
  return {
    text: '桌面已连接',
    class: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300',
    title: [name ? `桌面 Agent：${name}` : '', platform ? `平台：${platform}` : '', id ? `ID：${id}` : ''].filter(Boolean).join('；') || '桌面 Agent 已连接',
  }
})

const browserConnection = computed(() => {
  if (!props.agent.browserAgentConnected) return null
  const name = String(props.agent.browserAgentName || props.agent.name || '').trim()
  const platform = String(props.agent.browserAgentPlatform || 'Browser Extension').trim()
  const id = String(props.agent.browserAgentId || '').trim()
  return {
    text: '浏览器已连接',
    class: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300',
    title: [name ? `浏览器 Agent：${name}` : '', platform ? `平台：${platform}` : '', id ? `ID：${id}` : ''].filter(Boolean).join('；') || '浏览器 Agent 已连接',
  }
})

const androidConnection = computed(() => {
  if (!props.agent.androidAgentConnected) return null
  const name = String(props.agent.androidAgentName || props.agent.name || '').trim()
  const platform = String(props.agent.androidAgentPlatform || 'Android Mobile').trim()
  const id = String(props.agent.androidAgentId || '').trim()
  return {
    text: '安卓已连接',
    class: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-300',
    title: [name ? `安卓 Agent：${name}` : '', platform ? `平台：${platform}` : '', id ? `ID：${id}` : ''].filter(Boolean).join('；') || '安卓 Agent 已连接',
  }
})

const syncedMcpText = computed(() => {
  if (!props.agent.enabled) return 'AI 已停止'
  const activeCalling = props.agent.runtimeStatus === 'running'
    || (props.agent.currentTaskStatus === 'running' && !!props.agent.runtimeTool)
  if (activeCalling) {
    return props.agent.runtimeTool ? `MCP 调用中: ${props.agent.runtimeTool}` : 'MCP 调用中: 等待返回'
  }
  if (props.agent.runtimeStatus === 'error') return 'MCP 调用失败'
  return props.agent.runtimeTool ? `最近 MCP: ${props.agent.runtimeTool}` : '最近 MCP: 暂无调用'
})

const IDLE_THINKING_TEXT = '空闲中'
const thinkingPreview = ref(IDLE_THINKING_TEXT)
const isConversationRunActive = computed(() => {
  const runStatus = String(props.agent.activeRunStatus || '').toLowerCase()
  const runPhase = String(props.agent.activeRunPhase || '').toLowerCase()
  return props.agent.userChatActive
    || props.agent.runtimeStatus === 'running'
    || ['running', 'queued'].includes(runStatus)
    || (!!runStatus && !['completed', 'failed', 'cancelled', 'canceled'].includes(runStatus)
      && !['', 'idle', 'completed', 'failed', 'cancelled', 'canceled'].includes(runPhase))
})

const thinkingFallbackText = () => {
  if (props.agent.runtimeStatus === 'running') {
    return props.agent.runtimeTool ? `正在调用 ${props.agent.runtimeTool}…` : '正在调用 MCP…'
  }
  return isConversationRunActive.value ? '等待 AI 回复…' : IDLE_THINKING_TEXT
}

// 手机/平板与“减少动态效果”设备不为每张卡片启动独立的逐帧滚动。
// 多个 AI 同时流式思考时，每卡一个 rAF 会叠加布局读写，明显拖慢列表滚动。
const reduceCardMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce), (hover: none) and (pointer: coarse)').matches

const thinkingViewportRef = ref<HTMLElement | null>(null)
const thinkingTextRef = ref<HTMLElement | null>(null)
let thinkingRaf = 0
let thinkingOffset = 0
let thinkingMaxScroll = 0
let thinkingIdleTimer = 0
let lastLiveThinking = ''

const stopThinkingMotion = () => {
  if (thinkingRaf) {
    window.cancelAnimationFrame(thinkingRaf)
    thinkingRaf = 0
  }
}

const clearThinkingIdleTimer = () => {
  if (thinkingIdleTimer) {
    window.clearTimeout(thinkingIdleTimer)
    thinkingIdleTimer = 0
  }
}

const thinkingScrollSpeed = (textLength: number, maxScroll: number) => {
  const lengthFactor = Math.min(3.0, Math.max(0, textLength / 220))
  const distanceFactor = Math.min(3.5, Math.max(0, maxScroll / 180))
  return 0.8 + lengthFactor + distanceFactor
}

const stepThinkingMotion = () => {
  const viewport = thinkingViewportRef.value
  if (!viewport) return
  if (thinkingMaxScroll <= 1) {
    thinkingOffset = 0
    viewport.scrollTop = 0
    return
  }

  const speed = thinkingScrollSpeed(thinkingPreview.value.length, thinkingMaxScroll)
  thinkingOffset = Math.min(thinkingMaxScroll, thinkingOffset + speed)
  viewport.scrollTop = thinkingOffset

  if (thinkingOffset >= thinkingMaxScroll - 0.5) {
    stopThinkingMotion()
    return
  }

  thinkingRaf = window.requestAnimationFrame(stepThinkingMotion)
}

const startThinkingMotion = (reset = true) => {
  stopThinkingMotion()
  const viewport = thinkingViewportRef.value
  const text = thinkingTextRef.value
  if (!viewport || !text) return

  thinkingMaxScroll = Math.max(0, text.scrollHeight - viewport.clientHeight)
  thinkingOffset = reset
    ? 0
    : Math.max(0, Math.min(viewport.scrollTop, thinkingMaxScroll))
  viewport.scrollTop = thinkingOffset
  if (thinkingMaxScroll <= 1) return
  thinkingRaf = window.requestAnimationFrame(stepThinkingMotion)
}

const showIdleThinking = async () => {
  thinkingPreview.value = thinkingFallbackText()
  lastLiveThinking = ''
  await nextTick()
  stopThinkingMotion()
  const viewport = thinkingViewportRef.value
  thinkingOffset = 0
  if (viewport) viewport.scrollTop = 0
}

const scheduleIdleThinking = () => {
  clearThinkingIdleTimer()
  thinkingIdleTimer = window.setTimeout(() => {
    void showIdleThinking()
  }, 5000)
}

const syncThinkingFromLive = async () => {
  const liveThinking = String(props.agent.latestThinking || '').trim()
  if (!liveThinking) {
    if (isConversationRunActive.value) {
      clearThinkingIdleTimer()
      await showIdleThinking()
    } else {
      scheduleIdleThinking()
    }
    return
  }

  clearThinkingIdleTimer()
  const shouldContinue = !!lastLiveThinking
    && liveThinking.length >= lastLiveThinking.length
    && liveThinking.startsWith(lastLiveThinking)
  thinkingPreview.value = liveThinking
  await nextTick()
  if (reduceCardMotion) {
    stopThinkingMotion()
    const viewport = thinkingViewportRef.value
    // 只在文本更新时定位到最新内容，避免手机端持续逐帧写 scrollTop。
    if (viewport) viewport.scrollTop = viewport.scrollHeight
    lastLiveThinking = liveThinking
    return
  }
  if (shouldContinue) {
    const viewport = thinkingViewportRef.value
    const text = thinkingTextRef.value
    if (viewport && text) {
      const maxScroll = Math.max(0, text.scrollHeight - viewport.clientHeight)
      thinkingOffset = Math.max(0, Math.min(viewport.scrollTop, maxScroll))
    }
    if (!thinkingRaf) {
      startThinkingMotion(false)
    }
  } else {
    startThinkingMotion(true)
  }
  lastLiveThinking = liveThinking
}

watch(
  () => [
    props.agent.latestThinking,
    props.agent.activeRunStatus,
    props.agent.activeRunPhase,
    props.agent.userChatActive,
    props.agent.runtimeStatus,
    props.agent.runtimeTool,
  ],
  () => {
    void syncThinkingFromLive()
  }
)

onMounted(async () => {
  await nextTick()
  await syncThinkingFromLive()
})

onUnmounted(() => {
  stopThinkingMotion()
  clearThinkingIdleTimer()
})

const rcTarget = ref<{ deviceId: string; name: string; mode: 'android' | 'desktop' | 'browser' } | null>(null)

const DOUBLE_TAP_DELAY = 320
let lastTouchTapAt = 0

const isInteractiveCardTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return !!element?.closest('button,a,input,textarea,select,label,[role="button"],[data-card-action]')
}

const formatTaskSchedule = (task?: AgentTaskSnapshot | null) => {
  if (!task) return ''
  if (task.scheduleAt) {
    const date = new Date(task.scheduleAt * 1000)
    if (!Number.isNaN(date.getTime())) {
      return `下次执行：${date.toLocaleDateString()}`
    }
  }
  return ''
}

const onCardDblClick = (event: MouseEvent) => {
  if (isInteractiveCardTarget(event.target)) {
    return
  }
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

    <!-- 角色徽章 -->
    <div
      v-if="roleBadge"
      class="absolute top-2 right-12 text-xs px-2 py-1 rounded-full border shadow-sm flex items-center gap-1 z-20"
      :class="roleBadge.class"
    >
      <AppIcon :name="roleBadge.icon" class="w-3 h-3" /> {{ roleBadge.text }}
    </div>

    <!-- 内容层：确保位于头像背景之上 -->
    <div class="relative z-10">
    <!-- 头部信息 -->
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
            v-if="botConnection"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            :class="botConnection.class"
            :title="botConnection.title"
          >
            {{ botConnection.text }}
          </span>
          <span
            v-if="desktopConnection"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            :class="desktopConnection.class"
            :title="desktopConnection.title"
          >
            {{ desktopConnection.text }}
          </span>
          <span
            v-if="browserConnection"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            :class="browserConnection.class"
            :title="browserConnection.title"
          >
            {{ browserConnection.text }}
          </span>
          <span
            v-if="androidConnection"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            :class="androidConnection.class"
            :title="androidConnection.title"
          >
            {{ androidConnection.text }}
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

    <!-- 状态标签 -->
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

    <!-- 当前任务/行为 -->
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
              @click.stop="taskSnapshotDisplay.jobId
                ? emit('show-task-detail', { agent, jobId: taskSnapshotDisplay.jobId })
                : emit('show-tasks', agent)"
            >
              对话详情
            </button>
          </div>
        </div>

        <div
          v-for="task in scheduledTaskSnapshots"
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

    <!-- 底部操作栏。触屏无 hover，移动端常显 -->
    <div v-if="canControl" class="flex justify-end gap-2 mt-3 pt-2 border-t border-zinc-50 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity dark:border-zinc-800">
      <button v-if="!isAssistantAdmin" class="text-xs text-zinc-500 hover:text-indigo-600 px-2 py-1 hover:bg-zinc-50 rounded transition-colors dark:text-zinc-400 dark:hover:text-indigo-300 dark:hover:bg-zinc-800" @click.stop="emit('show-tasks', agent)">
        任务列表
      </button>
      <button v-if="agent.androidAgentConnected" class="text-xs text-teal-600 hover:text-teal-700 px-2 py-1 hover:bg-teal-50 rounded transition-colors dark:text-teal-300 dark:hover:text-teal-200 dark:hover:bg-teal-500/10" title="实时查看并控制该安卓设备" @click.stop="rcTarget = { deviceId: agent.androidAgentId || '', name: agent.androidAgentName || agent.name, mode: 'android' }">
        远程控制
      </button>
      <button v-if="agent.desktopAgentConnected" class="text-xs text-sky-600 hover:text-sky-700 px-2 py-1 hover:bg-sky-50 rounded transition-colors dark:text-sky-300 dark:hover:text-sky-200 dark:hover:bg-sky-500/10" title="实时查看并控制该桌面设备" @click.stop="rcTarget = { deviceId: agent.desktopAgentId || '', name: agent.desktopAgentName || agent.name, mode: 'desktop' }">
        桌面控制
      </button>
      <button v-if="agent.browserAgentConnected" class="text-xs text-violet-600 hover:text-violet-700 px-2 py-1 hover:bg-violet-50 rounded transition-colors dark:text-violet-300 dark:hover:text-violet-200 dark:hover:bg-violet-500/10" title="实时查看并控制该浏览器" @click.stop="rcTarget = { deviceId: agent.browserAgentId || '', name: agent.browserAgentName || agent.name, mode: 'browser' }">
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
    </div> <!-- /z-10 content wrapper -->
  </div>
</template>

<style scoped>
.agent-card-shell {
  isolation: isolate;
}

.agent-card-avatar-layer {
  opacity: 0.15;
}

.agent-card-world-focus {
  z-index: 30;
  transform: scale(1.035);
  border-color: rgb(99 102 241) !important;
  box-shadow: 0 0 0 3px rgb(165 180 252 / 0.65), 0 18px 42px rgb(49 46 129 / 0.28) !important;
}

.agent-card-world-focus::before {
  opacity: 0.92;
  filter: blur(10px);
  animation-duration: 1.4s;
}

.agent-card-shell::before {
  content: "";
  position: absolute;
  inset: -4px;
  z-index: -1;
  border-radius: 1rem;
  background: transparent;
  border: 2px solid var(--agent-glow-color, rgba(99, 102, 241, 0.34));
  box-shadow: 0 0 16px var(--agent-glow-color, rgba(99, 102, 241, 0.34));
  filter: blur(7px);
  opacity: 0.42;
  transform: scale(0.985);
  animation: agent-card-glow-pulse 3.4s ease-in-out infinite;
  pointer-events: none;
}

.agent-card-shell:hover::before {
  opacity: 0.72;
  filter: blur(9px);
  box-shadow: 0 0 22px var(--agent-glow-color, rgba(99, 102, 241, 0.34));
  animation-duration: 2.2s;
}

.agent-card-glow-assistant {
  --agent-glow-color: rgba(139, 92, 246, 0.5);
}

.agent-card-glow-manager {
  --agent-glow-color: rgba(245, 158, 11, 0.5);
}

.agent-card-glow-member {
  --agent-glow-color: rgba(14, 165, 233, 0.48);
}

.agent-card-glow-default {
  --agent-glow-color: rgba(99, 102, 241, 0.42);
}

.agent-card-glow-dead::before {
  opacity: 0.14;
  animation: none;
  --agent-glow-color: rgba(113, 113, 122, 0.32);
}

@keyframes agent-card-glow-pulse {
  0%, 100% {
    opacity: 0.32;
    transform: scale(0.985);
  }

  50% {
    opacity: 0.66;
    transform: scale(1.018);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-card-shell::before {
    animation: none;
  }
}

/*
 * 卡片级触屏降载：全局已关闭 backdrop-filter，但 scoped 的光晕、头像 blur、
 * 状态脉冲和生命条过渡仍会在每张卡片上独立合成/重绘，这里统一静态化。
 */
@media (hover: none) and (pointer: coarse), (prefers-reduced-motion: reduce) {
  .agent-card-shell {
    content-visibility: auto;
    contain-intrinsic-size: auto 22rem;
    background-image: none;
    transition: none;
  }

  .agent-card-shell::before,
  .agent-card-world-focus::before {
    inset: -1px;
    animation: none;
    filter: none;
    box-shadow: none;
    opacity: 0.5;
    transform: none;
  }

  .agent-card-avatar-layer {
    opacity: 0.1;
  }

  .agent-card-avatar-image {
    filter: none;
    transform: none;
  }

  .agent-card-online-dot,
  .agent-card-status {
    animation: none !important;
  }

}

.task-thinking-viewport {
  min-height: 4.25em;
  max-height: 4.25em;
  overflow: hidden;
}

.task-thinking-content {
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
