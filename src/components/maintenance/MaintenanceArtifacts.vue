<script setup lang="ts">
import type { MaintenanceArtifact } from '@/api/maintenance'

defineProps<{ items: MaintenanceArtifact[]; kind: string }>()

const emptyLabel = (kind: string) => ({
  diff: '尚未产生代码变更', test: '尚未上报测试结果', commit: '尚未创建提交',
  release: '尚未进入发布流程', audit: '暂无审计记录',
}[kind] || '暂无记录')
</script>

<template>
  <div v-if="!items.length" class="py-12 text-center text-sm text-zinc-500">{{ emptyLabel(kind) }}</div>
  <div v-else class="space-y-3">
    <article v-for="item in items" :key="item.id" class="rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
      <div class="flex items-center justify-between gap-3">
        <h4 class="text-sm font-semibold">{{ item.title }}</h4>
        <time class="text-[10px] text-zinc-400">{{ new Date(item.created_at).toLocaleString() }}</time>
      </div>
      <p v-if="item.summary" class="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{{ item.summary }}</p>
      <pre v-if="item.content" class="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200">{{ item.content }}</pre>
    </article>
  </div>
</template>
