<script setup lang="ts">
import { computed } from 'vue'
import { WEEKDAY_OPTIONS, type TaskCreateForm } from '@/utils/taskSystem'
import { getMcpToolZhLabel, groupMcpToolGroupsByParent, groupMcpToolsByZhTag } from '@/utils/mcpTools'
import {
  applyScheduleEnabled,
  applyScheduleLoopEnabled,
  applyScheduleLoopMode,
  applyScheduleTimeMode,
  applyWeeklyDayChange,
} from './taskModalHelpers'

const props = defineProps<{
  targetName: string
  taskEditingJobId: string
  taskCreateSubmitting: boolean
  taskCreateForm: TaskCreateForm
  availableMcpTools: string[]
  defaultMcpTools: string[]
  editingRunningTask: boolean
  zIndex: number
  onClose: () => void
  onSubmit: () => void
  onTaskCreateToolChange: (tool: string, event: Event) => void
}>()

const taskMcpToolGroups = computed(() =>
  groupMcpToolsByZhTag(props.availableMcpTools.length ? props.availableMcpTools : props.defaultMcpTools),
)
const taskMcpToolParentGroups = computed(() => groupMcpToolGroupsByParent(taskMcpToolGroups.value))

const onScheduleEnabledChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  applyScheduleEnabled(props.taskCreateForm, !!target?.checked)
}

const onScheduleLoopEnabledChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  applyScheduleLoopEnabled(props.taskCreateForm, !!target?.checked)
}

const onScheduleTimeModeChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  applyScheduleTimeMode(props.taskCreateForm, target?.value === 'datetime' ? 'datetime' : 'duration')
}

const onScheduleLoopModeChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  applyScheduleLoopMode(props.taskCreateForm, target?.value || '')
}

const onWeeklyDayChange = (day: number, event: Event) => {
  const target = event.target as HTMLInputElement | null
  props.taskCreateForm.schedule_weekly_days = applyWeeklyDayChange(
    props.taskCreateForm.schedule_weekly_days,
    day,
    !!target?.checked,
  )
}
</script>

<template>
  <div :style="{ zIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click="onClose">
    <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-3xl max-h-[86vh] overflow-y-auto p-5" @click.stop>
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ taskEditingJobId ? '编辑定时任务' : '新建任务' }}</div>
          <div class="text-xs text-zinc-500 dark:text-zinc-400">
            {{ taskEditingJobId ? `修改 ${targetName} 的任务规则` : `为 ${targetName} 创建任务并立即加入执行队列` }}
          </div>
        </div>
        <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onClose">关闭</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] text-zinc-500 mb-1">任务名称</label>
          <input
            v-model="taskCreateForm.title"
            class="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
            placeholder="例如：整理今日迭代计划"
          />
          <div v-if="!taskEditingJobId" class="text-[10px] text-zinc-400 mt-1">入库时会自动追加时间后缀，避免名称重复。</div>
        </div>
        <div>
          <label class="block text-[11px] text-zinc-500 mb-1">优先级</label>
          <input
            v-model.number="taskCreateForm.priority"
            type="number"
            min="1"
            max="10"
            class="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
          />
        </div>
        <div class="md:col-span-2">
          <label class="block text-[11px] text-zinc-500 mb-1">任务具体内容</label>
          <textarea
            v-model="taskCreateForm.instruction"
            rows="4"
            class="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
            placeholder="描述目标、验收标准、约束条件"
          />
        </div>
      </div>

      <div
        v-if="editingRunningTask"
        class="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      >
        当前轮次已经开始，标题、内容及调度规则的修改从下一次调度生效。
      </div>

      <div class="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
        <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            :checked="taskCreateForm.schedule_enabled"
            @change="onScheduleEnabledChange"
          />
          <span>定时任务</span>
        </label>
        <div v-if="taskCreateForm.schedule_enabled" class="space-y-3">
          <label
            class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2 mb-2"
          >
            <input
              type="checkbox"
              :checked="taskCreateForm.schedule_loop_enabled"
              :disabled="!taskCreateForm.schedule_enabled"
              @change="onScheduleLoopEnabledChange"
            />
            <span>循环运行（每轮完成后原任务自动续期，仍可编辑或暂停）</span>
          </label>
          <label
            v-if="taskCreateForm.schedule_enabled && taskCreateForm.schedule_loop_enabled"
            class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2 mb-2"
          >
            <input type="checkbox" v-model="taskCreateForm.schedule_run_immediately" />
            <span>首次立即执行</span>
          </label>

          <div v-if="taskCreateForm.schedule_loop_enabled" class="space-y-3">
            <div>
              <label class="block text-[11px] text-zinc-500 mb-1">循环方式</label>
              <div class="flex flex-wrap items-center gap-3">
                <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="task-schedule-loop-mode"
                    value="interval"
                    :checked="taskCreateForm.schedule_loop_mode === 'interval'"
                    @change="onScheduleLoopModeChange"
                  />
                  <span>按间隔</span>
                </label>
                <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="task-schedule-loop-mode"
                    value="daily"
                    :checked="taskCreateForm.schedule_loop_mode === 'daily'"
                    @change="onScheduleLoopModeChange"
                  />
                  <span>每天定时</span>
                </label>
                <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="task-schedule-loop-mode"
                    value="weekly"
                    :checked="taskCreateForm.schedule_loop_mode === 'weekly'"
                    @change="onScheduleLoopModeChange"
                  />
                  <span>每周定时</span>
                </label>
              </div>
            </div>

            <div v-if="taskCreateForm.schedule_loop_mode === 'interval'">
              <label class="block text-[11px] text-zinc-500 mb-1">循环间隔（分钟，每轮完成后计时）</label>
              <input
                v-model.number="taskCreateForm.schedule_duration_minutes"
                type="number"
                min="1"
                class="w-full md:w-72 px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
              />
            </div>

            <div v-else>
              <label class="block text-[11px] text-zinc-500 mb-1">触发时刻</label>
              <input
                v-model="taskCreateForm.schedule_daily_time"
                type="time"
                class="w-full md:w-72 px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
              />
            </div>

            <div v-if="taskCreateForm.schedule_loop_mode === 'weekly'">
              <label class="block text-[11px] text-zinc-500 mb-1">每周触发的星期</label>
              <div class="flex flex-wrap items-center gap-3">
                <label
                  v-for="day in WEEKDAY_OPTIONS"
                  :key="day.value"
                  class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    :checked="taskCreateForm.schedule_weekly_days.includes(day.value)"
                    @change="onWeeklyDayChange(day.value, $event)"
                  />
                  <span>{{ day.label }}</span>
                </label>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] text-zinc-500 mb-1">循环轮数上限（0 = 不限）</label>
                <input
                  v-model.number="taskCreateForm.schedule_max_runs"
                  type="number"
                  min="0"
                  class="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                />
              </div>
              <div>
                <label class="block text-[11px] text-zinc-500 mb-1">循环截止日期（可选）</label>
                <input
                  v-model="taskCreateForm.schedule_end_at"
                  type="date"
                  class="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div>
              <label class="block text-[11px] text-zinc-500 mb-1">定时方式</label>
              <div class="flex flex-wrap items-center gap-3">
                <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="task-schedule-time-mode"
                    value="duration"
                    :checked="taskCreateForm.schedule_time_mode === 'duration'"
                    :disabled="!taskCreateForm.schedule_enabled"
                    @change="onScheduleTimeModeChange"
                  />
                  <span>定时时长</span>
                </label>
                <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="task-schedule-time-mode"
                    value="datetime"
                    :checked="taskCreateForm.schedule_time_mode === 'datetime'"
                    :disabled="!taskCreateForm.schedule_enabled"
                    @change="onScheduleTimeModeChange"
                  />
                  <span>定时日期</span>
                </label>
              </div>
            </div>

            <div v-if="taskCreateForm.schedule_time_mode === 'duration'">
              <label class="block text-[11px] text-zinc-500 mb-1">定时时长（分钟）</label>
              <input
                v-model.number="taskCreateForm.schedule_duration_minutes"
                type="number"
                min="1"
                class="w-full md:w-72 px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                :disabled="!taskCreateForm.schedule_enabled"
              />
            </div>

            <div v-else>
              <label class="block text-[11px] text-zinc-500 mb-1">定时日期</label>
              <input
                v-model="taskCreateForm.schedule_at"
                type="datetime-local"
                class="w-full md:w-72 px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                :disabled="!taskCreateForm.schedule_enabled"
                @keydown.prevent
                @paste.prevent
                @drop.prevent
                @beforeinput.prevent
              />
            </div>
          </div>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-1 gap-3">
        <div class="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
          <label class="text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2 mb-2">
            <input type="checkbox" v-model="taskCreateForm.override_mcp_tools_enabled" />
            <span>修改默认 MCP 使用范围</span>
          </label>
          <div
            v-if="taskCreateForm.override_mcp_tools_enabled"
            class="space-y-2 max-h-44 overflow-y-auto pr-1"
          >
            <details
              v-for="parent in taskMcpToolParentGroups"
              :key="`task-create-mcp-parent-${parent.title}`"
              class="rounded-lg border border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-between">
                <span>{{ parent.title }}</span>
                <span class="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                  {{ parent.tools.filter(tool => taskCreateForm.mcp_tools_override.includes(tool)).length }} / {{ parent.tools.length }}
                </span>
              </summary>
              <div class="space-y-2 px-2 pb-2">
                <div
                  v-if="parent.groups.length === 1"
                  class="grid grid-cols-1 md:grid-cols-2 gap-1.5"
                >
                  <label
                    v-for="tool in parent.groups[0].tools"
                    :key="`task-create-tool-${tool}`"
                    class="text-[11px] text-zinc-600 dark:text-zinc-300 flex items-start gap-2"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5"
                      :checked="taskCreateForm.mcp_tools_override.includes(tool)"
                      @change="onTaskCreateToolChange(tool, $event)"
                    />
                    <span class="min-w-0">
                      <span class="block">{{ getMcpToolZhLabel(tool) }}</span>
                      <span class="block font-mono text-[10px] text-zinc-400 dark:text-zinc-500 break-all">{{ tool }}</span>
                    </span>
                  </label>
                </div>
                <details
                  v-else
                  v-for="group in parent.groups"
                  :key="`task-create-mcp-${parent.title}-${group.tag}`"
                  class="rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-700 dark:bg-zinc-950/50"
                >
                  <summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-between">
                    <span>{{ group.tag }}</span>
                    <span class="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                      {{ group.tools.filter(tool => taskCreateForm.mcp_tools_override.includes(tool)).length }} / {{ group.tools.length }}
                    </span>
                  </summary>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5 px-2 pb-2">
                    <label
                      v-for="tool in group.tools"
                      :key="`task-create-tool-${tool}`"
                      class="text-[11px] text-zinc-600 dark:text-zinc-300 flex items-start gap-2"
                    >
                      <input
                        type="checkbox"
                        class="mt-0.5"
                        :checked="taskCreateForm.mcp_tools_override.includes(tool)"
                        @change="onTaskCreateToolChange(tool, $event)"
                      />
                      <span class="min-w-0">
                        <span class="block">{{ getMcpToolZhLabel(tool) }}</span>
                        <span class="block font-mono text-[10px] text-zinc-400 dark:text-zinc-500 break-all">{{ tool }}</span>
                      </span>
                    </label>
                  </div>
                </details>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button class="text-xs px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onClose">取消</button>
        <button
          class="text-xs px-3 py-1.5 rounded border border-indigo-200 text-indigo-600 bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300 dark:bg-indigo-500/10"
          :disabled="taskCreateSubmitting"
          @click="onSubmit"
        >
          {{ taskCreateSubmitting ? (taskEditingJobId ? '保存中...' : '创建中...') : (taskEditingJobId ? '保存修改' : '提交任务') }}
        </button>
      </div>
    </div>
  </div>
</template>
