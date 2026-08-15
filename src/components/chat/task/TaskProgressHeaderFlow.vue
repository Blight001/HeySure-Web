<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TaskPlanPhase, TaskPlanProgress, TaskPlanStage } from '@/api/task'
import TaskProgressHoverCard from './TaskProgressHoverCard.vue'
import {
  endTitleClass,
  headerEndDotClass,
  isFlowRunning,
  phaseDotClass,
  phaseTitleClass,
  progressRingStyle,
  refreshHoveredPhase,
  sameHoverTarget,
  type TaskHoverKind,
  type TaskHoverState,
} from '@/utils/taskProgressFormat'

const props = defineProps<{
  plan: TaskPlanProgress | null
  phases: TaskPlanPhase[]
  stage: TaskPlanStage | string
  finished: boolean
  outcome: string
  progressPercent: number
}>()

const flowRunning = computed(() => isFlowRunning(props.stage))
const ringStyle = computed(() => progressRingStyle(props.progressPercent))
const hovered = ref<TaskHoverState | null>(null)
let hoverClearTimer: ReturnType<typeof setTimeout> | null = null
const flowScrollRef = ref<HTMLDivElement | null>(null)
const phaseEls = ref<Record<number, HTMLElement>>({})
const lastUserScroll = ref(0)
const pointerInFlow = ref(false)
let returnTimer: ReturnType<typeof setTimeout> | null = null

const cancelHoverClear = () => {
  if (hoverClearTimer != null) {
    clearTimeout(hoverClearTimer)
    hoverClearTimer = null
  }
}

const showHover = (kind: TaskHoverKind, phase?: TaskPlanPhase) => {
  cancelHoverClear()
  hovered.value = { kind, phase }
}

const clearHover = () => {
  cancelHoverClear()
  hovered.value = null
}

const scheduleHoverClear = () => {
  cancelHoverClear()
  hoverClearTimer = setTimeout(() => {
    hoverClearTimer = null
    hovered.value = null
  }, 160)
}

const toggleHover = (kind: TaskHoverKind, phase?: TaskPlanPhase) => {
  if (sameHoverTarget(hovered.value, kind, phase)) clearHover()
  else showHover(kind, phase)
}

const onDocPointerDown = () => clearHover()

const setPhaseEl = (seq: number, el: any) => {
  if (el) phaseEls.value[seq] = el as HTMLElement
  else delete phaseEls.value[seq]
}

const markUserInteraction = () => {
  lastUserScroll.value = Date.now()
}

const scrollActiveToCenter = () => {
  const container = flowScrollRef.value
  if (!container) return
  const active = props.phases.find(phase => phase.status === 'active')
  const el = active ? phaseEls.value[active.seq] : undefined
  let target = 0
  if (el) target = Math.max(0, el.offsetTop + el.offsetHeight / 2 - container.clientHeight / 2)
  else if (props.finished || props.stage === 'finishing') target = container.scrollHeight
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const boundedTarget = Math.min(target, maxTop)
  if (Math.abs(container.scrollTop - boundedTarget) < 4) return
  container.scrollTo({ top: boundedTarget, behavior: 'smooth' })
}

const requestAutoCenterIfIdle = () => {
  if (pointerInFlow.value) return
  if (Date.now() - lastUserScroll.value <= 3000) return
  nextTick(() => nextTick(scrollActiveToCenter))
}

const onFlowMouseEnter = () => {
  pointerInFlow.value = true
  if (returnTimer != null) {
    clearTimeout(returnTimer)
    returnTimer = null
  }
}

const onFlowMouseLeave = () => {
  pointerInFlow.value = false
  scheduleHoverClear()
  if (returnTimer != null) clearTimeout(returnTimer)
  returnTimer = setTimeout(() => {
    returnTimer = null
    lastUserScroll.value = 0
    scrollActiveToCenter()
  }, 500)
}

const flowSignature = computed(() => `${props.stage}|${props.phases.map(phase => `${phase.seq}:${phase.status}`).join(',')}`)

watch(() => props.phases, (phases) => {
  hovered.value = refreshHoveredPhase(hovered.value, phases)
  requestAutoCenterIfIdle()
})

watch(flowSignature, () => {
  requestAutoCenterIfIdle()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  cancelHoverClear()
  if (returnTimer != null) {
    clearTimeout(returnTimer)
    returnTimer = null
  }
})
</script>

<template>
  <div
    class="relative flex h-11 min-w-0 items-center gap-1.5 sm:gap-2"
    :class="{ 'task-flow-running': flowRunning }"
    @mouseenter="onFlowMouseEnter"
    @mouseleave="onFlowMouseLeave"
  >
    <div
      class="task-progress-ring relative h-7 w-7 shrink-0 rounded-full p-[2px] sm:h-8 sm:w-8"
      :style="ringStyle"
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
          :class="endTitleClass(finished, outcome, stage)"
          @mouseenter="showHover('finish')"
          @mouseleave="scheduleHoverClear"
          @pointerdown.stop
          @click.stop="toggleHover('finish')"
        ><span class="task-flow-dot border" :class="headerEndDotClass(finished, outcome)"></span><span>结束</span></button>
      </div>

      <TaskProgressHoverCard
        v-if="hovered"
        :hovered="hovered"
        :plan="plan"
        :phases="phases"
        :stage="stage"
        :finished="finished"
        :outcome="outcome"
        @keep="cancelHoverClear"
        @leave="scheduleHoverClear"
      />
    </div>
  </div>
</template>

<style scoped>
.task-progress-ring {
  box-shadow: 0 0 0 1px rgb(59 130 246 / 0.12), 0 2px 8px rgb(59 130 246 / 0.16);
  transition: background 300ms ease;
}

.task-flow-vertical {
  height: 2.7rem;
  max-height: 2.7rem;
  overscroll-behavior: contain;
  scrollbar-width: none;
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
</style>
