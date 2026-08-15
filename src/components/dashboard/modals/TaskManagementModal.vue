<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDateTime } from '@/utils/datetime'
import {
  canEditScheduledTaskJob,
  canPauseTaskJob,
  canResumeTaskJob,
  getTaskPayloadTags,
  getTaskStateClass,
  getTaskStateLabel,
  isCompletedTaskJob,
} from '@/utils/taskSystem'
import type {
  AITaskJobItem,
  AITaskListItem,
  TaskCreateForm,
} from '@/utils/taskSystem'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import type { Agent } from '@/types'
import TaskCreatePanel from './task/TaskCreatePanel.vue'
import {
  getJobVisualState,
  isJobStateMatched,
  sortTaskJobs,
  taskStateFilterButtonClass,
  type JobStateFilter,
} from './task/taskModalHelpers'

interface Props {
  show: boolean
  target: Agent | null
  taskListItems: AITaskListItem[]
  taskJobs: AITaskJobItem[]
  selectedTaskJobIds: string[]
  taskListLoading: boolean
  taskCreatePanelOpen: boolean
  taskCreateSubmitting: boolean
  taskEditingJobId: string
  taskCreateForm: TaskCreateForm
  availableMcpTools: string[]
  defaultMcpTools: string[]
  onClose: () => void
  onRefresh: () => void
  onToggleTaskCreatePanel: () => void
  onCloseTaskCreatePanel: () => void
  onSubmitTask: () => void
  onTaskCreateToolChange: (tool: string, event: Event) => void
  onReuseTaskTemplate: (job: AITaskJobItem) => void
  onEditTaskJob: (job: AITaskJobItem) => void
  onShowTaskDetail: (job: AITaskJobItem) => void
  onPauseTaskJob: (job: AITaskJobItem) => void
  onResumeTaskJob: (job: AITaskJobItem) => void
  onDeleteTaskJob: (job: AITaskJobItem) => void
  onToggleAllTaskJobsSelection: (event: Event) => void
  onTaskJobSelectChange: (jobId: string, event: Event) => void
  onBatchDeleteTaskJobs: () => void
}

const props = defineProps<Props>()

const mainZIndex = usePopupZIndex(() => props.show && !!props.target)
const taskCreateZIndex = usePopupZIndex(() => props.show && props.taskCreatePanelOpen && !!props.target)

const selectedJobStateFilter = ref<JobStateFilter | null>(null)
const completedTaskJobs = computed(() => props.taskJobs.filter(isCompletedTaskJob))
const sortedTaskJobs = computed(() => sortTaskJobs(props.taskJobs))
const filteredSortedTaskJobs = computed(() =>
  sortedTaskJobs.value.filter(job => isJobStateMatched(job, selectedJobStateFilter.value)),
)
const filteredCompletedTaskJobs = computed(() => filteredSortedTaskJobs.value.filter(isCompletedTaskJob))
const selectedTaskJobsCount = computed(() => props.selectedTaskJobIds.length)
const allTaskJobsSelected = computed(() => {
  if (filteredCompletedTaskJobs.value.length === 0) return false
  const selected = new Set(props.selectedTaskJobIds)
  return filteredCompletedTaskJobs.value.every(job => selected.has(job.job_id))
})
const formatTs = (value?: number) => formatDateTime(value, '--')
const editingJob = computed(() => props.taskJobs.find(job => job.job_id === props.taskEditingJobId) || null)
const editingRunningTask = computed(() => {
  const job = editingJob.value
  return !!job && String(job.effective_status || job.status || '').toLowerCase() === 'running'
})

const toggleJobStateFilter = (state: JobStateFilter) => {
  selectedJobStateFilter.value = selectedJobStateFilter.value === state ? null : state
}

const filterButtonClass = (state: JobStateFilter) =>
  taskStateFilterButtonClass(state, selectedJobStateFilter.value === state)
</script>

<template>
  <Transition name="fade">
    <div v-if="show && target" :style="{ zIndex: mainZIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-2 sm:p-4" @click="onClose">
      <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-2xl min-h-[72vh] max-h-[90vh] overflow-y-auto p-3 sm:p-5" @click.stop>
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ target.name }} 的任务列表</div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">按优先级从高到低排列</div>
          </div>
          <div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            <button class="whitespace-nowrap text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onToggleTaskCreatePanel">
              创建任务
            </button>
            <button class="whitespace-nowrap text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onRefresh">刷新</button>
            <button class="whitespace-nowrap text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onClose">关闭</button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <button class="px-2 py-0.5 rounded border transition-colors" :class="filterButtonClass('running')" @click="toggleJobStateFilter('running')">执行中</button>
          <button class="px-2 py-0.5 rounded border transition-colors" :class="filterButtonClass('next')" @click="toggleJobStateFilter('next')">等待执行</button>
          <button class="px-2 py-0.5 rounded border transition-colors" :class="filterButtonClass('scheduled')" @click="toggleJobStateFilter('scheduled')">定时任务</button>
          <button class="px-2 py-0.5 rounded border transition-colors" :class="filterButtonClass('completed')" @click="toggleJobStateFilter('completed')">已完成</button>
          <button
            v-if="selectedJobStateFilter"
            class="px-2 py-0.5 rounded border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
            @click="selectedJobStateFilter = null"
          >
            取消筛选
          </button>
          <div class="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <label class="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <input type="checkbox" :checked="allTaskJobsSelected" @change="onToggleAllTaskJobsSelection($event)" />
              <span>全选已完成</span>
            </label>
            <button
              class="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="selectedTaskJobsCount === 0"
              @click="onBatchDeleteTaskJobs"
            >
              批量删除 ({{ selectedTaskJobsCount }})
            </button>
          </div>
        </div>

        <div v-if="taskListLoading" class="text-xs text-zinc-500 dark:text-zinc-400 py-8 text-center">正在加载任务列表...</div>
        <div v-else class="space-y-4">
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
            <div class="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">任务执行列表（状态排序）</div>
              <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
                共 {{ taskJobs.length }} 条 · 已完成 {{ completedTaskJobs.length }} 条
              </div>
            </div>
            <div v-if="filteredSortedTaskJobs.length === 0" class="text-xs text-zinc-500 dark:text-zinc-400 py-3 text-center">
              {{ selectedJobStateFilter ? '当前筛选下暂无任务记录' : '暂无任务记录' }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="job in filteredSortedTaskJobs"
                :key="job.job_id"
                class="rounded-lg border p-3 transition-all"
                :class="getTaskStateClass(getJobVisualState(job))"
              >
                <div class="flex min-w-0 items-start gap-2">
                  <label v-if="isCompletedTaskJob(job)" class="pt-1" title="选择该任务记录">
                    <input
                      type="checkbox"
                      :checked="selectedTaskJobIds.includes(job.job_id)"
                      @change="onTaskJobSelectChange(job.job_id, $event)"
                    />
                  </label>
                  <span v-else class="inline-block w-3.5 mt-1"></span>
                  <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 flex-1">
                      <div class="break-words text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ job.title }}</div>
                      <div class="mt-1 break-words text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        状态: {{ job.effective_status || job.status }} · {{ getTaskStateLabel(getJobVisualState(job)) }} · P{{ job.priority }}
                        <span> · 类型: {{ job.trigger_type }}</span>
                        <span v-if="job.run_status"> · run: {{ job.run_status }}</span>
                        <span> · 创建: {{ formatTs(job.created_at) }}</span>
                      </div>
                      <div v-if="getTaskPayloadTags(job.task_payload).length > 0" class="mt-1 flex flex-wrap gap-1">
                        <span
                          v-for="tag in getTaskPayloadTags(job.task_payload)"
                          :key="`${job.job_id}-${tag}`"
                          class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100/60 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>
                    <div class="flex w-full flex-wrap items-center justify-start gap-1 sm:w-auto sm:shrink-0 sm:justify-end">
                      <button class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-sky-200 text-sky-700 dark:border-sky-500/40 dark:text-sky-300" @click="onShowTaskDetail(job)">对话详情</button>
                      <button v-if="isCompletedTaskJob(job)" class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300" @click="onReuseTaskTemplate(job)">使用模板新建</button>
                      <button v-if="canEditScheduledTaskJob(job)" class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300" @click="onEditTaskJob(job)">编辑</button>
                      <button v-if="canPauseTaskJob(job)" class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-amber-200 text-amber-700 dark:border-amber-500/40 dark:text-amber-300" @click="onPauseTaskJob(job)">暂停</button>
                      <button v-if="canResumeTaskJob(job)" class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300" @click="onResumeTaskJob(job)">恢复</button>
                      <button class="whitespace-nowrap text-[11px] px-2 py-1 rounded border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300" @click="onDeleteTaskJob(job)">删除</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="taskListItems.length === 0" class="text-xs text-zinc-500 dark:text-zinc-400 py-4 text-center">
            暂无任务模板。
          </div>
          <div v-else>
            <div class="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">任务模板（优先级）</div>
            <div class="space-y-2">
              <div
                v-for="task in taskListItems"
                :key="task.id"
                class="rounded-lg border p-3 transition-all"
                :class="getTaskStateClass(task.runtime_state)"
              >
                <div class="mb-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div class="min-w-0 break-words text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ task.title }}</div>
                  <div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    <span class="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">P{{ task.priority }}</span>
                    <span class="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{{ getTaskStateLabel(task.runtime_state) }}</span>
                  </div>
                </div>
                <div class="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{{ task.instruction || '暂无任务说明' }}</div>
                <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span class="px-2 py-0.5 rounded bg-zinc-100/60 dark:bg-zinc-800/60">启用: {{ task.enabled ? '是' : '否' }}</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100/60 dark:bg-zinc-800/60">定时: {{ task.schedule_enabled ? `是 (${task.interval_minutes} 分钟)` : '否' }}</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100/60 dark:bg-zinc-800/60">排队: {{ task.queued_count }}</span>
                  <span class="px-2 py-0.5 rounded bg-zinc-100/60 dark:bg-zinc-800/60">运行: {{ task.running_count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <Transition name="fade">
    <TaskCreatePanel
      v-if="show && taskCreatePanelOpen && target"
      :target-name="target.name"
      :task-editing-job-id="taskEditingJobId"
      :task-create-submitting="taskCreateSubmitting"
      :task-create-form="taskCreateForm"
      :available-mcp-tools="availableMcpTools"
      :default-mcp-tools="defaultMcpTools"
      :editing-running-task="editingRunningTask"
      :z-index="taskCreateZIndex"
      :on-close="onCloseTaskCreatePanel"
      :on-submit="onSubmitTask"
      :on-task-create-tool-change="onTaskCreateToolChange"
    />
  </Transition>
</template>
