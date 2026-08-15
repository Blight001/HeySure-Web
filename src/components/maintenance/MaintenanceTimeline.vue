<script setup lang="ts">
import type { MaintenanceEvent } from '@/api/maintenance'
import { eventIcon } from '@/utils/maintenanceFormat'

defineProps<{ events: MaintenanceEvent[] }>()

const isReasoning = (kind: string) => kind.toLowerCase().includes('reason')
const displayKind = (kind: string) => ({
  command: '命令', tool: '工具', mcp: 'MCP', file_change: '文件变更', plan: '计划',
  reasoning_summary: '推理摘要', message: '沟通', error: '错误',
}[kind] || kind)
</script>

<template>
  <section>
    <div class="mb-3 rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">
      此处展示可审计的工作摘要、命令和工具事件；不会展示模型隐藏思维链。
    </div>
    <div v-if="!events.length" class="py-10 text-center text-sm text-zinc-500">暂无运行事件</div>
    <ol v-else class="space-y-3">
      <li v-for="event in events" :key="event.id" class="flex gap-3">
        <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-xs dark:bg-zinc-800">{{ eventIcon(event.kind) }}</span>
        <div class="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-semibold" :class="isReasoning(event.kind) ? 'text-indigo-600 dark:text-indigo-300' : ''">{{ displayKind(event.kind) }}</span>
            <time class="text-[10px] text-zinc-400">{{ new Date(event.created_at).toLocaleString() }}</time>
          </div>
          <p class="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{{ event.summary }}</p>
          <details v-if="event.detail" class="mt-2">
            <summary class="cursor-pointer text-xs text-zinc-500">查看脱敏详情</summary>
            <pre class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs text-zinc-200">{{ event.detail }}</pre>
          </details>
          <div v-if="event.actor" class="mt-2 text-[10px] text-zinc-400">来源：{{ event.actor }}</div>
        </div>
      </li>
    </ol>
  </section>
</template>
