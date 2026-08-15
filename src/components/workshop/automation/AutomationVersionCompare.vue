<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowCardVersion, WorkflowDefinition } from '@/api/workflowCards'
import WorkflowCanvasEditor from './WorkflowCanvasEditor.vue'
import { definitionPositions, definitionSteps } from './automationDefinition'
import { comparisonStatuses } from './automationStatus'

const props = defineProps<{
  open: boolean
  zIndex: number
  versionPreview: WorkflowCardVersion | null
  comparisonDraft: WorkflowDefinition | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const versionSteps = computed(() => definitionSteps(props.versionPreview?.definition || null))
const draftSteps = computed(() => definitionSteps(props.comparisonDraft))
const versionPositions = computed(() => definitionPositions(props.versionPreview?.definition || null))
const draftPositions = computed(() => definitionPositions(props.comparisonDraft))
const statuses = computed(() => comparisonStatuses(
  props.versionPreview?.definition?.steps || {},
  props.comparisonDraft?.steps || {},
))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && versionPreview?.definition && comparisonDraft"
      class="fixed inset-0 flex items-center justify-center overflow-auto bg-zinc-950/55 p-3 backdrop-blur-sm"
      :style="{ zIndex }"
      @click.self="emit('close')"
    >
      <section class="automation-diff-modal w-full max-w-[1800px] rounded-xl border bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold">版本画布对比 · v{{ versionPreview.version_number }}</div>
            <div class="mt-1 text-[10px] text-zinc-500">节点内容或连线目标变化均标记为“已修改”</div>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-[10px]">
            <span class="text-emerald-500">● 新增</span>
            <span class="text-rose-500">● 删除</span>
            <span class="text-amber-500">● 修改</span>
            <span class="text-zinc-400">● 未变化</span>
            <button class="rounded border px-2 py-1" @click="emit('close')">关闭</button>
          </div>
        </header>
        <div class="mt-3 grid gap-3 xl:grid-cols-2">
          <div>
            <div class="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">历史版本 v{{ versionPreview.version_number }}</div>
            <WorkflowCanvasEditor readonly :steps="versionSteps" :start-step-id="versionPreview.definition.startStepId" selected-step-id="" :positions="versionPositions" :node-statuses="statuses.version" />
          </div>
          <div>
            <div class="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">当前未保存修改</div>
            <WorkflowCanvasEditor readonly :steps="draftSteps" :start-step-id="comparisonDraft.startStepId" selected-step-id="" :positions="draftPositions" :node-statuses="statuses.current" />
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
