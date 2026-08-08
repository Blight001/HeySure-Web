<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAuthToken } from '@/api/http'
import { fetchTaskPlan, type TaskPlanPhase, type TaskPlanResponse } from '@/api/task'

/**
 * Task-mode progress panel.
 * - Default/compact: full vertical sidebar with details.
 * - header=true: minimal left-to-right flow using *colored titles* only (no badges/"完成" text).
 *   安排 = blue, phases colored by status (active=blue, completed=green, failed=red), 结束 = green/red.
 * Renders nothing for ordinary conversations.
 */
const props = withDefaults(defineProps<{
  configId?: number
  sessionId?: string
  /** Bump to force a refetch (e.g. when a run finishes / history reloads). */
  refreshSignal?: number
  /** Use tighter spacing when placed as sidebar inside chat dialog. */
  compact?: boolean
  /** Render as a minimal horizontal flow next to the chat title. */
  header?: boolean
}>(), {
  configId: undefined,
  sessionId: '',
  refreshSignal: 0,
  compact: false,
  header: false,
})

const emit = defineEmits<{
  (e: 'visibility-change', value: boolean): void
}>()

const data = ref<TaskPlanResponse | null>(null)
const loading = ref(false)

const visible = computed(() => !!data.value && data.value.stage !== 'none')

watch(visible, (v) => emit('visibility-change', v), { immediate: true })
const stage = computed(() => data.value?.stage ?? 'none')
const plan = computed(() => data.value?.plan ?? null)
const phases = computed<TaskPlanPhase[]>(() => plan.value?.phases ?? [])

const planningDone = computed(() => !!data.value?.has_plan)
const finished = computed(() => stage.value === 'finished')
const outcome = computed(() => data.value?.outcome ?? '')

// 轮询结果与上次一致时跳过赋值，避免每 2s 重渲染 + 重复触发自动居中造成流程条抖动
let lastPayloadJson = ''

const refresh = async () => {
  const token = getAuthToken()
  const sid = String(props.sessionId || '').trim()
  if (!token || props.configId === undefined || props.configId === null || !sid) {
    data.value = null
    lastPayloadJson = ''
    return
  }
  loading.value = true
  try {
    const next = await fetchTaskPlan(props.configId, sid, token)
    const json = JSON.stringify(next)
    if (json !== lastPayloadJson) {
      lastPayloadJson = json
      data.value = next
      // 悬停详情卡片打开时，把 phase 换成最新对象，保持内容实时
      if (hovered.value?.kind === 'phase' && hovered.value.phase) {
        const seq = hovered.value.phase.seq
        const fresh = (next.plan?.phases ?? []).find(p => p.seq === seq)
        if (fresh) hovered.value = { kind: 'phase', phase: fresh }
      }
      if (props.header) {
        nextTick(() => {
          updateEdgeState()
          requestAutoCenterIfIdle()
        })
      }
    }
  } catch {
    data.value = null
    lastPayloadJson = ''
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.configId, props.sessionId, props.refreshSignal] as const,
  () => { void refresh() },
  { immediate: true },
)

const phaseStatusLabel: Record<string, string> = {
  pending: '待执行',
  active: '进行中',
  completed: '已完成',
  failed: '未达成',
}

const phaseDotClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'bg-emerald-500 border-emerald-500'
    case 'failed':
      return 'bg-rose-500 border-rose-500'
    case 'active':
      return 'bg-sky-500 border-sky-500 animate-pulse'
    default:
      return 'bg-transparent border-zinc-300 dark:border-zinc-600'
  }
}

const phaseBadgeClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30'
    case 'failed':
      return 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/30'
    case 'active':
      return 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-900/30'
    default:
      return 'text-zinc-500 bg-zinc-100/60 dark:text-zinc-400 dark:bg-zinc-800/60'
  }
}

const phaseTitleClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'failed':
      return 'text-rose-600 dark:text-rose-400'
    case 'active':
      return 'text-blue-600 dark:text-blue-400'
    default:
      return 'text-zinc-500 dark:text-zinc-400'
  }
}

const endTitleClass = computed(() => {
  if (finished.value) {
    return outcome.value === 'failure'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-600 dark:text-emerald-400'
  }
  if (stage.value === 'finishing') {
    return 'text-indigo-600 dark:text-indigo-400'
  }
  return 'text-zinc-400 dark:text-zinc-500'
})

const flowRunning = computed(() => ['planning', 'executing', 'finishing'].includes(stage.value))
const completedPhaseCount = computed(() => phases.value.filter(phase => phase.status === 'completed').length)
const progressPercent = computed(() => {
  if (finished.value) return 100
  const totalSteps = phases.value.length + 2
  if (totalSteps <= 2) return stage.value === 'planning' ? 8 : 0
  const completedSteps = (planningDone.value ? 1 : 0) + completedPhaseCount.value
  const activeFraction = phases.value.some(phase => phase.status === 'active') ? 0.5 : 0
  return Math.min(99, Math.max(0, Math.round(((completedSteps + activeFraction) / totalSteps) * 100)))
})
const progressRingStyle = computed(() => ({
  background: `conic-gradient(rgb(59 130 246) ${progressPercent.value}%, rgb(228 228 231) 0)`,
}))


// Hover details state (for header mode tooltips)
const hovered = ref<null | { kind: 'arrange' | 'phase' | 'finish'; phase?: TaskPlanPhase }>(null)
let hoverClearTimer: ReturnType<typeof setTimeout> | null = null
const cancelHoverClear = () => {
  if (hoverClearTimer != null) {
    clearTimeout(hoverClearTimer)
    hoverClearTimer = null
  }
}
const showHover = (kind: 'arrange' | 'phase' | 'finish', phase?: TaskPlanPhase) => {
  cancelHoverClear()
  hovered.value = { kind, phase }
}
const clearHover = () => {
  cancelHoverClear()
  hovered.value = null
}
// 延迟关闭：鼠标从标题移向详情卡片会跨过间隙，立即关闭会导致卡片闪烁
const scheduleHoverClear = () => {
  cancelHoverClear()
  hoverClearTimer = setTimeout(() => {
    hoverClearTimer = null
    hovered.value = null
  }, 160)
}

// 触屏无 hover：点按切换详情卡片（再次点同一项则关闭），点击页面其它位置关闭
const toggleHover = (kind: 'arrange' | 'phase' | 'finish', phase?: TaskPlanPhase) => {
  if (hovered.value && hovered.value.kind === kind && hovered.value.phase?.seq === phase?.seq) {
    clearHover()
  } else {
    showHover(kind, phase)
  }
}
const onDocPointerDown = () => clearHover()

// --- Header mode enhancements: real-time updates, horizontal scroll, auto-center active ---
const flowScrollRef = ref<HTMLDivElement | null>(null)
const phaseEls = ref<Record<number, HTMLElement>>({})

const lastUserScroll = ref(0)
const pointerInFlow = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const setPhaseEl = (seq: number, el: any) => {
  if (el) {
    phaseEls.value[seq] = el as HTMLElement
  } else {
    delete phaseEls.value[seq]
  }
}

const markUserInteraction = () => {
  lastUserScroll.value = Date.now()
}

const updateEdgeState = () => {
  const c = flowScrollRef.value
  if (!c) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = c.scrollLeft > 2
  canScrollRight.value = c.scrollLeft < c.scrollWidth - c.clientWidth - 2
}

const onStripScroll = () => updateEdgeState()

// 垂直滚轮转为横向滚动，方便在流程条上直接滚动定位
const onStripWheel = (e: WheelEvent) => {
  markUserInteraction()
  const c = flowScrollRef.value
  if (!c) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) c.scrollLeft += e.deltaY
}

const scrollActiveToCenter = () => {
  const container = flowScrollRef.value
  if (!container) return
  const active = phases.value.find(p => p.status === 'active')
  const el = active ? phaseEls.value[active.seq] : undefined
  let target: number
  if (el) {
    target = Math.max(0, el.offsetTop + el.offsetHeight / 2 - container.clientHeight / 2)
  } else if (finished.value || stage.value === 'finishing') {
    target = container.scrollHeight
  } else {
    target = 0
  }
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const boundedTarget = Math.min(target, maxTop)
  // 状态轮询不重复打断用户滚动；仅在当前任务变化时平滑居中。
  if (Math.abs(container.scrollTop - boundedTarget) < 4) return
  container.scrollTo({ top: boundedTarget, behavior: 'smooth' })
}

const requestAutoCenterIfIdle = () => {
  if (pointerInFlow.value) return
  if (Date.now() - lastUserScroll.value <= 3000) return
  nextTick(() => nextTick(scrollActiveToCenter))
}

// 悬浮左右边缘时连续滚动（快速定位），点按则整页翻动
let edgeScrollRaf: number | null = null
let edgeScrollDir = 0
const edgeScrollStep = () => {
  const c = flowScrollRef.value
  if (!c || edgeScrollDir === 0) {
    edgeScrollRaf = null
    return
  }
  const before = c.scrollLeft
  c.scrollLeft = before + edgeScrollDir * 3.5
  updateEdgeState()
  if (c.scrollLeft === before) {
    edgeScrollDir = 0
    edgeScrollRaf = null
    return
  }
  edgeScrollRaf = requestAnimationFrame(edgeScrollStep)
}
const startEdgeScroll = (dir: number) => {
  markUserInteraction()
  edgeScrollDir = dir
  if (edgeScrollRaf == null) edgeScrollRaf = requestAnimationFrame(edgeScrollStep)
}
const stopEdgeScroll = () => {
  edgeScrollDir = 0
}
const jumpScroll = (dir: number) => {
  markUserInteraction()
  const c = flowScrollRef.value
  if (!c) return
  c.scrollBy({ left: dir * c.clientWidth * 0.6, behavior: 'smooth' })
}

// 鼠标在流程条上时暂停自动居中；移开后自动回到当前任务阶段
let returnTimer: ReturnType<typeof setTimeout> | null = null
const onFlowMouseEnter = () => {
  pointerInFlow.value = true
  if (returnTimer != null) {
    clearTimeout(returnTimer)
    returnTimer = null
  }
}
const onFlowMouseLeave = () => {
  pointerInFlow.value = false
  stopEdgeScroll()
  scheduleHoverClear()
  if (returnTimer != null) clearTimeout(returnTimer)
  returnTimer = setTimeout(() => {
    returnTimer = null
    lastUserScroll.value = 0
    scrollActiveToCenter()
  }, 500)
}

// 流程条尺寸变化（弹窗缩放 / 悬浮窗拖拽调整）时刷新边缘渐隐状态
let stripResizeObserver: ResizeObserver | null = null
void [onStripScroll, onStripWheel, startEdgeScroll, jumpScroll]

watch(flowScrollRef, (el) => {
  stripResizeObserver?.disconnect()
  stripResizeObserver = null
  if (el && typeof ResizeObserver !== 'undefined') {
    stripResizeObserver = new ResizeObserver(() => updateEdgeState())
    stripResizeObserver.observe(el)
    nextTick(updateEdgeState)
  }
})

// Polling for real-time plan status when displayed as header (top of chat)
let headerPollInterval: ReturnType<typeof setInterval> | null = null
const startPolling = () => {
  stopPolling()
  if (!props.header || props.configId == null || !props.sessionId) return
  headerPollInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refresh()
  }, 2000)
}
const stopPolling = () => {
  if (headerPollInterval != null) {
    clearInterval(headerPollInterval)
    headerPollInterval = null
  }
}

watch(() => [props.header, props.configId, props.sessionId] as const, () => {
  if (props.header && props.configId != null && props.sessionId) {
    startPolling()
  } else {
    stopPolling()
  }
}, { immediate: true })

// 仅在阶段状态真正变化（而非每次轮询）时尝试自动居中
const flowSignature = computed(() => `${stage.value}|${phases.value.map(p => `${p.seq}:${p.status}`).join(',')}`)
watch(flowSignature, () => {
  requestAutoCenterIfIdle()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('pointerdown', onDocPointerDown)
  stripResizeObserver?.disconnect()
  stripResizeObserver = null
  if (edgeScrollRaf != null) {
    cancelAnimationFrame(edgeScrollRaf)
    edgeScrollRaf = null
  }
  edgeScrollDir = 0
  cancelHoverClear()
  if (returnTimer != null) {
    clearTimeout(returnTimer)
    returnTimer = null
  }
})
</script>

<template>
  <!-- Header mode: vertical task flow beside the model name. -->
  <div
    v-if="visible && props.header"
    class="relative flex h-11 min-w-0 items-center gap-1.5 sm:gap-2"
    :class="{ 'task-flow-running': flowRunning }"
    @mouseenter="onFlowMouseEnter"
    @mouseleave="onFlowMouseLeave"
  >
    <div
      class="task-progress-ring relative h-7 w-7 shrink-0 rounded-full p-[2px] sm:h-8 sm:w-8"
      :style="progressRingStyle"
      role="progressbar"
      aria-label="任务完成进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progressPercent"
    >
      <div class="flex h-full w-full items-center justify-center rounded-full bg-white text-[8px] font-medium tabular-nums text-blue-600 dark:bg-zinc-900 dark:text-blue-400">
        {{ progressPercent }}%
      </div>
    </div>

    <div class="relative min-w-0 flex-1">
      <div
        ref="flowScrollRef"
        class="task-flow-vertical min-w-0 w-full overflow-y-auto pr-1 text-[10px] font-medium sm:pr-2 sm:text-[11px]"
        @scroll.passive="markUserInteraction"
        @wheel.passive="markUserInteraction"
        @touchstart.passive="markUserInteraction"
      >
        <button
          type="button"
          class="task-flow-step text-blue-600 dark:text-blue-400"
          @mouseenter="showHover('arrange')"
          @mouseleave="scheduleHoverClear"
          @pointerdown.stop
          @click.stop="toggleHover('arrange')"
        ><span class="task-flow-dot bg-blue-500"></span><span>安排</span></button>

        <button
          v-for="phase in phases"
          :key="phase.seq"
          type="button"
          class="task-flow-step"
          :class="phaseTitleClass(phase)"
          :ref="el => setPhaseEl(phase.seq, el)"
          @mouseenter="showHover('phase', phase)"
          @mouseleave="scheduleHoverClear"
          @pointerdown.stop
          @click.stop="toggleHover('phase', phase)"
        ><span class="task-flow-dot border" :class="phaseDotClass(phase)"></span><span class="truncate">{{ phase.title }}</span></button>

        <button
          type="button"
          class="task-flow-step"
          :class="endTitleClass"
          @mouseenter="showHover('finish')"
          @mouseleave="scheduleHoverClear"
          @pointerdown.stop
          @click.stop="toggleHover('finish')"
        ><span class="task-flow-dot border" :class="finished ? (outcome === 'failure' ? 'bg-rose-500 border-rose-500' : 'bg-emerald-500 border-emerald-500') : 'bg-transparent border-zinc-300 dark:border-zinc-600'"></span><span>结束</span></button>
      </div>

      <div
        v-if="hovered"
        class="absolute left-1/2 top-full z-[130] mt-2 min-w-[210px] max-w-[min(280px,80vw)] max-h-[60vh] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-2 text-[11px] leading-snug text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        @mouseenter="cancelHoverClear"
        @mouseleave="scheduleHoverClear"
        @pointerdown.stop
      >
        <template v-if="hovered.kind === 'arrange'">
          <div class="mb-1 font-semibold text-blue-700 dark:text-blue-400">安排</div>
          <div v-if="plan?.goal">目标：{{ plan.goal }}</div>
          <div class="mt-0.5">共 {{ plan?.phase_count ?? phases.length }} 个阶段</div>
          <div v-if="stage === 'planning'" class="mt-1 text-[10px] text-amber-600 dark:text-amber-400">正在制定分阶段计划…</div>
        </template>
        <template v-else-if="hovered.kind === 'phase' && hovered.phase">
          <div class="mb-1 font-semibold">阶段 {{ hovered.phase.seq + 1 }}：{{ hovered.phase.title }}</div>
          <div v-if="hovered.phase.goal" class="mt-0.5">目标：{{ hovered.phase.goal }}</div>
          <div v-if="hovered.phase.done_signal" class="mt-0.5 text-zinc-500 dark:text-zinc-400">结束标志：{{ hovered.phase.done_signal }}</div>
          <ul v-if="hovered.phase.actions?.length" class="mt-1 ml-3 list-disc space-y-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
            <li v-for="(action, i) in hovered.phase.actions" :key="i">{{ action.goal }}<span v-if="action.done_signal" class="text-[9px] text-zinc-400">（{{ action.done_signal }}）</span></li>
          </ul>
          <div v-if="hovered.phase.summary" class="mt-1 line-clamp-2 text-[10px] text-zinc-500 dark:text-zinc-400">{{ hovered.phase.summary }}</div>
          <div class="mt-1 text-[10px]" :class="phaseTitleClass(hovered.phase)">状态：{{ phaseStatusLabel[hovered.phase.status] || hovered.phase.status }}</div>
        </template>
        <template v-else-if="hovered.kind === 'finish'">
          <div class="mb-1 font-semibold">结束</div>
          <div v-if="finished">{{ outcome === 'failure' ? '任务失败，已写入失败日志' : '任务完成，已写入成功日志' }}</div>
          <div v-else-if="stage === 'finishing'">所有阶段完成，正在总结收尾…</div>
          <div v-else>待所有阶段完成后总结</div>
        </template>
      </div>
    </div>
  </div>

  <!-- Original sidebar / default mode -->
  <div
    v-if="visible && !props.header"
    :class="[
      'rounded-lg border border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/60',
      props.compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-2 text-[11px]'
    ]"
  >
    <div :class="props.compact ? 'mb-1 flex items-center justify-between gap-1' : 'mb-2 flex items-center justify-between gap-2'">
      <div class="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-200">
        <span>任务流程</span>
        <span
          v-if="stage === 'planning'"
          class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >安排中</span>
        <span
          v-else-if="stage === 'executing'"
          class="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
        >实施中</span>
        <span
          v-else-if="stage === 'finishing'"
          class="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
        >收尾中</span>
        <span
          v-else-if="finished"
          :class="outcome === 'failure'
            ? 'rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            : 'rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'"
        >{{ outcome === 'failure' ? '已失败' : '已完成' }}</span>
      </div>
      <button
        class="text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-200"
        :disabled="loading"
        title="刷新进度"
        @click="refresh"
      >↻</button>
    </div>

    <p v-if="plan?.goal" :class="props.compact ? 'mb-1 line-clamp-2 text-zinc-600 dark:text-zinc-300' : 'mb-2 line-clamp-2 text-zinc-600 dark:text-zinc-300'">
      目标：{{ plan.goal }}
    </p>

    <ol :class="props.compact ? 'space-y-1' : 'space-y-1.5'">
      <!-- 安排 -->
      <li class="flex items-start gap-2">
        <span
          class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
          :class="planningDone ? 'bg-emerald-500 border-emerald-500' : 'bg-amber-500 border-amber-500 animate-pulse'"
        />
        <div class="min-w-0">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">安排</span>
          <span class="ml-1 text-zinc-500 dark:text-zinc-400">
            {{ planningDone ? `已制定计划（共 ${plan?.phase_count ?? phases.length} 个阶段）` : '正在制定分阶段计划…' }}
          </span>
        </div>
      </li>

      <!-- 各阶段 + 子任务 -->
      <li v-for="phase in phases" :key="phase.seq" class="flex items-start gap-2">
        <span class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border" :class="phaseDotClass(phase)" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="font-medium text-zinc-700 dark:text-zinc-200">
              阶段 {{ phase.seq + 1 }}：{{ phase.title }}
            </span>
            <span class="rounded px-1.5 py-0.5 text-[10px]" :class="phaseBadgeClass(phase)">
              {{ phaseStatusLabel[phase.status] || phase.status }}
            </span>
          </div>
          <div v-if="phase.status === 'active'" class="mt-1 space-y-1 text-zinc-500 dark:text-zinc-400">
            <div v-if="phase.goal">目标：{{ phase.goal }}</div>
            <div v-if="phase.done_signal">结束标志：{{ phase.done_signal }}</div>
            <ul v-if="phase.actions?.length" class="ml-3 list-disc space-y-0.5">
              <li v-for="(action, idx) in phase.actions" :key="idx">
                {{ action.goal }}
                <span v-if="action.done_signal" class="text-zinc-400 dark:text-zinc-500">
                  （{{ action.done_signal }}）
                </span>
              </li>
            </ul>
          </div>
          <div v-else-if="phase.summary" class="mt-0.5 line-clamp-1 text-zinc-400 dark:text-zinc-500">
            {{ phase.summary }}
          </div>
        </div>
      </li>

      <!-- 结束 -->
      <li class="flex items-start gap-2">
        <span
          class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
          :class="finished
            ? (outcome === 'failure' ? 'bg-rose-500 border-rose-500' : 'bg-emerald-500 border-emerald-500')
            : (stage === 'finishing' ? 'bg-indigo-500 border-indigo-500 animate-pulse' : 'bg-transparent border-zinc-300 dark:border-zinc-600')"
        />
        <div class="min-w-0">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">结束</span>
          <span class="ml-1 text-zinc-500 dark:text-zinc-400">
            <template v-if="finished">{{ outcome === 'failure' ? '任务失败，已写入失败日志' : '任务完成，已写入成功日志' }}</template>
            <template v-else-if="stage === 'finishing'">所有阶段完成，正在总结收尾…</template>
            <template v-else>待所有阶段完成后总结</template>
          </span>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.task-progress-ring {
  box-shadow: 0 0 0 1px rgb(59 130 246 / 0.12), 0 2px 8px rgb(59 130 246 / 0.16);
  transition: background 300ms ease;
}

.task-flow-vertical {
  /* 固定展示约三行；其余阶段可上下滚动查看。 */
  height: 2.7rem;
  max-height: 2.7rem;
  overscroll-behavior: contain;
  scrollbar-width: none;
  /* 上下边缘轻微渐隐，提示仍有前后任务，同时避免硬裁切。 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 86%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 86%, transparent 100%);
  scroll-behavior: smooth;
}

.task-flow-vertical::-webkit-scrollbar {
  display: none;
  height: 0;
  width: 0;
}

.task-flow-step {
  align-items: center;
  display: flex;
  gap: 0.45rem;
  min-height: 1.35rem;
  position: relative;
  text-align: left;
  width: 100%;
}

.task-flow-step:not(:last-child)::after {
  background: rgb(212 212 216);
  content: '';
  height: calc(100% - 0.6rem);
  left: 0.22rem;
  position: absolute;
  top: calc(50% + 0.3rem);
  width: 1px;
}

.dark .task-flow-step:not(:last-child)::after {
  background: rgb(82 82 91);
}

.task-flow-dot {
  border-radius: 9999px;
  display: inline-block;
  height: 0.5rem;
  position: relative;
  width: 0.5rem;
  z-index: 1;
  flex: 0 0 auto;
}

.task-flow-strip {
  scrollbar-width: none;
}

.task-flow-strip::-webkit-scrollbar {
  display: none;
}

/* 溢出方向的边缘渐隐（虚化），提示被裁切的文字不完整、避免误读 */
.task-flow-strip.task-flow-fade-l {
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 30px);
  mask-image: linear-gradient(90deg, transparent 0, #000 30px);
}

.task-flow-strip.task-flow-fade-r {
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 30px), transparent 100%);
  mask-image: linear-gradient(90deg, #000 calc(100% - 30px), transparent 100%);
}

.task-flow-strip.task-flow-fade-l.task-flow-fade-r {
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%);
}

/* 左右边缘悬浮快速定位按钮 */
.task-flow-edge {
  align-items: center;
  background: transparent;
  border: none;
  bottom: 4px;
  color: rgb(37 99 235 / 0.7);
  cursor: pointer;
  display: flex;
  font-size: 15px;
  font-weight: 700;
  justify-content: center;
  line-height: 1;
  padding: 0;
  position: absolute;
  top: 0;
  width: 18px;
  z-index: 5;
}

.task-flow-edge:hover {
  color: rgb(37 99 235);
}

.dark .task-flow-edge {
  color: rgb(96 165 250 / 0.8);
}

.dark .task-flow-edge:hover {
  color: rgb(147 197 253);
}

.task-flow-edge-l {
  left: -2px;
}

.task-flow-edge-r {
  right: -2px;
}

.task-flow-running .task-flow-strip {
  position: relative;
}

.task-flow-running .task-flow-strip::after {
  animation: taskFlowSweep 1.8s linear infinite;
  background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.55), transparent);
  border-radius: 999px;
  bottom: 0;
  content: '';
  height: 1px;
  left: 0;
  pointer-events: none;
  position: absolute;
  width: 42%;
}

.task-flow-running .task-flow-arrow {
  animation: taskFlowArrow 1.15s ease-in-out infinite;
}

.task-flow-arrow {
  display: inline-block;
}

@keyframes taskFlowSweep {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(260%);
  }
}

@keyframes taskFlowArrow {
  0%,
  100% {
    opacity: 0.35;
    transform: translateX(0);
  }
  50% {
    opacity: 0.95;
    transform: translateX(2px);
  }
}
</style>
