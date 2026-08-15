<script setup lang="ts">
import { formatTime } from '@/composables/knowledge/knowledgeFormat'
import type { KnowledgePanelApi } from '@/composables/knowledge/types'

defineProps<{ kb: KnowledgePanelApi }>()
</script>

<template>
  <div v-if="kb.currentDetail">
    <div class="mb-3 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">范围：{{ kb.currentDetail.scope }}</span>
      <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">置信度：{{ Math.round(kb.currentDetail.confidence * 100) }}%</span>
      <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">使用：{{ kb.currentDetail.use_count }} 次</span>
      <span class="px-2 py-1 rounded bg-zinc-100/60 dark:bg-zinc-800/60">更新：{{ formatTime(kb.currentDetail.updated_at) }}</span>
    </div>

    <div v-if="kb.currentDetail.summary" class="mb-4">
      <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">摘要</div>
      <div class="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
        {{ kb.currentDetail.summary }}
      </div>
    </div>

    <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">具体内容</div>
    <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 bg-zinc-50/60 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">{{ kb.detailContent }}</pre>
  </div>
</template>
