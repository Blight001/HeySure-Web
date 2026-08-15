<script setup lang="ts">
import type { TaskPlanPhase, TaskPlanProgress, TaskPlanStage } from '@/api/task'
import {
  finishStatusText,
  phaseStatusLabel,
  phaseTitleClass,
  type TaskHoverState,
} from '@/utils/taskProgressFormat'

defineProps<{
  hovered: TaskHoverState
  plan: TaskPlanProgress | null
  phases: TaskPlanPhase[]
  stage: TaskPlanStage | string
  finished: boolean
  outcome: string
}>()

defineEmits<{
  (e: 'keep'): void
  (e: 'leave'): void
}>()
</script>

<template>
  <div
    class="absolute left-1/2 top-full z-[130] mt-2 min-w-[210px] max-w-[min(280px,80vw)] max-h-[60vh] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-2 text-[11px] leading-snug text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
    @mouseenter="$emit('keep')"
    @mouseleave="$emit('leave')"
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
      <div>{{ finishStatusText(finished, outcome, stage) }}</div>
    </template>
  </div>
</template>
