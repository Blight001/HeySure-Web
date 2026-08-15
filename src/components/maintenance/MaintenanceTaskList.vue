<script setup lang="ts">
import type { MaintenanceTask } from '@/api/maintenance'
import { formatElapsed, PHASE_LABELS, STATUS_LABELS } from '@/utils/maintenanceFormat'

defineProps<{ tasks: MaintenanceTask[]; selectedId?: string; loading: boolean }>()
const emit = defineEmits<{ (e: 'select', task: MaintenanceTask): void }>()

const severityClass = (severity: string) => ({
  critical: 'bg-red-500/15 text-red-500', high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600', low: 'bg-sky-500/15 text-sky-500',
}[severity] || 'bg-zinc-500/15 text-zinc-500')
</script>

<template>
  <div class="space-y-2 p-3">
    <div v-if="loading" class="py-10 text-center text-sm text-zinc-500">正在加载维护任务…</div>
    <div v-else-if="!tasks.length" class="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <div class="text-sm font-medium">暂无维护任务</div>
      <div class="mt-1 text-xs text-zinc-500">成员发现问题后会在这里形成可追踪工单</div>
    </div>
    <button
      v-for="task in tasks" :key="task.id"
      class="w-full rounded-xl border p-3 text-left transition-colors"
      :class="selectedId === task.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-zinc-200 bg-white/60 hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900/60'"
      @click="emit('select', task)"
    >
      <div class="flex items-start justify-between gap-2">
        <span class="line-clamp-2 text-sm font-semibold">{{ task.title }}</span>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="severityClass(task.severity)">{{ task.severity }}</span>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span>{{ STATUS_LABELS[task.status] || task.status }}</span>
        <span>·</span><span>{{ PHASE_LABELS[task.phase] || task.phase }}</span>
        <span>·</span><span>{{ formatElapsed(task.started_at || task.created_at, task.completed_at) }}</span>
      </div>
      <div class="mt-2 flex items-center gap-1.5 text-[11px]">
        <span class="h-1.5 w-1.5 rounded-full" :class="task.device_online ? 'bg-emerald-500' : 'bg-zinc-400'"></span>
        <span :class="task.device_online ? 'text-emerald-600' : 'text-zinc-500'">{{ task.device_name || task.device_id || '等待设备' }} · {{ task.device_online ? '在线' : '离线' }}</span>
      </div>
    </button>
  </div>
</template>
