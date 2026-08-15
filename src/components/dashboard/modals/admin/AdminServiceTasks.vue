<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { AdminTask } from '@/api/admin'
import { ADMIN_TASK_STATUS_CLS } from '@/constants/admin'
import { formatOptionalDateTime } from '@/utils/adminFormat'

const { alert, confirm } = useMessage()

const tasks = ref<AdminTask[]>([])
const tasksLoading = ref(false)
const busyRun = ref('')
const TASK_STATUS_CLS = ADMIN_TASK_STATUS_CLS
const fmtTime = formatOptionalDateTime

const load = async () => {
  tasksLoading.value = true
  try {
    const res = await adminApi.listTasks(50)
    tasks.value = res.tasks
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    tasksLoading.value = false
  }
}

const stopTask = async (task: AdminTask) => {
  const ok = await confirm({ message: `确认停止子任务 ${task.run_id}？`, type: 'warning' })
  if (!ok) return
  busyRun.value = task.run_id
  try {
    await adminApi.stopTask(task.run_id)
    await load()
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    busyRun.value = ''
  }
}

defineExpose({ load })
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">子任务运行状态</h3>
      <button
        class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
        :disabled="tasksLoading"
        @click="load"
      >{{ tasksLoading ? '刷新中…' : '↻ 刷新' }}</button>
    </div>
    <div class="border border-zinc-200 rounded-xl overflow-x-auto dark:border-zinc-800">
      <table class="w-full text-xs">
        <thead class="bg-zinc-50/60 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          <tr>
            <th class="text-left px-3 py-2 font-medium">运行 ID</th>
            <th class="text-left px-3 py-2 font-medium">用户</th>
            <th class="text-left px-3 py-2 font-medium">状态</th>
            <th class="text-left px-3 py-2 font-medium hidden md:table-cell">更新时间</th>
            <th class="text-right px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!tasks.length">
            <td colspan="5" class="px-3 py-6 text-center text-zinc-400">暂无子任务</td>
          </tr>
          <tr
            v-for="task in tasks"
            :key="task.run_id"
            class="border-t border-zinc-100 dark:border-zinc-800"
          >
            <td class="px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]" :title="task.run_id">{{ task.run_id }}</td>
            <td class="px-3 py-2 text-zinc-600 dark:text-zinc-400">{{ task.user_name || task.user_account || ('#' + task.user_id) }}</td>
            <td class="px-3 py-2 font-semibold" :class="TASK_STATUS_CLS[task.status] || 'text-zinc-500'">
              {{ task.status }}<span v-if="task.stop_requested" class="text-[10px] text-zinc-400">（已请求停止）</span>
            </td>
            <td class="px-3 py-2 text-zinc-400 hidden md:table-cell">{{ fmtTime(task.updated_at) }}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button
                v-if="task.status === 'running' || task.status === 'queued'"
                class="text-[11px] px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                :disabled="busyRun === task.run_id"
                @click="stopTask(task)"
              >停止</button>
              <span v-else class="text-[11px] text-zinc-300 dark:text-zinc-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
