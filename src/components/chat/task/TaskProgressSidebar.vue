<script setup lang="ts">
import type { TaskPlanPhase, TaskPlanProgress, TaskPlanStage } from '@/api/task'
import { computed } from 'vue'
import {
  endDotClass,
  finishStatusText,
  phaseBadgeClass,
  phaseDotClass,
  phaseStatusLabel,
  planningDotClass,
  stageBadge,
} from '@/utils/taskProgressFormat'

const props = defineProps<{
  compact?: boolean
  loading?: boolean
  plan: TaskPlanProgress | null
  phases: TaskPlanPhase[]
  stage: TaskPlanStage | string
  planningDone: boolean
  finished: boolean
  outcome: string
}>()

defineEmits<{
  (e: 'refresh'): void
}>()

const badge = computed(() => stageBadge(props.stage, props.finished, props.outcome))
</script>

<template>
  <div
    :class="[
      'rounded-lg border border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/60',
      compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-2 text-[11px]'
    ]"
  >
    <div :class="compact ? 'mb-1 flex items-center justify-between gap-1' : 'mb-2 flex items-center justify-between gap-2'">
      <div class="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-200">
        <span>任务流程</span>
        <span v-if="badge" :class="badge.className">{{ badge.label }}</span>
      </div>
      <button
        class="text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-200"
        :disabled="loading"
        title="刷新进度"
        @click="$emit('refresh')"
      >↻</button>
    </div>

    <p v-if="plan?.goal" :class="compact ? 'mb-1 line-clamp-2 text-zinc-600 dark:text-zinc-300' : 'mb-2 line-clamp-2 text-zinc-600 dark:text-zinc-300'">
      目标：{{ plan.goal }}
    </p>

    <ol :class="compact ? 'space-y-1' : 'space-y-1.5'">
      <li class="flex items-start gap-2">
        <span
          class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
          :class="planningDotClass(planningDone)"
        />
        <div class="min-w-0">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">安排</span>
          <span class="ml-1 text-zinc-500 dark:text-zinc-400">
            {{ planningDone ? `已制定计划（共 ${plan?.phase_count ?? phases.length} 个阶段）` : '正在制定分阶段计划…' }}
          </span>
        </div>
      </li>

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

      <li class="flex items-start gap-2">
        <span
          class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
          :class="endDotClass(finished, outcome, stage)"
        />
        <div class="min-w-0">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">结束</span>
          <span class="ml-1 text-zinc-500 dark:text-zinc-400">{{ finishStatusText(finished, outcome, stage) }}</span>
        </div>
      </li>
    </ol>
  </div>
</template>
