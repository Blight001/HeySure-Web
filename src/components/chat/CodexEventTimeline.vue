<script setup lang="ts">
import { computed } from 'vue'
import type { CodexEventRecord } from '@/types/chat'

const props = defineProps<{ events: CodexEventRecord[] }>()
const visible = computed(() => props.events.slice(-40))
const summarize = (payload: unknown) => {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  try {
    const value = payload as any
    return String(value?.text || value?.message || value?.name || JSON.stringify(payload))
  } catch {
    return String(payload)
  }
}
</script>

<template>
  <details v-if="visible.length" class="mx-auto mb-2 w-[min(52rem,calc(100%_-_1rem))] rounded-xl border border-sky-200/80 bg-sky-50/70 text-[11px] dark:border-sky-900/60 dark:bg-sky-950/20">
    <summary class="cursor-pointer px-3 py-2 font-semibold text-sky-700 dark:text-sky-300">
      Codex 活动记录（{{ events.length }}）
    </summary>
    <div class="max-h-44 space-y-1 overflow-y-auto border-t border-sky-100 px-3 py-2 font-mono dark:border-sky-900/50">
      <div v-for="(event, index) in visible" :key="`${event.sessionId}-${event.sequence ?? index}`" class="flex gap-2 text-zinc-600 dark:text-zinc-300">
        <span class="shrink-0 text-sky-600 dark:text-sky-400">{{ event.type }}</span>
        <span class="min-w-0 truncate" :title="summarize(event.payload)">{{ summarize(event.payload) }}</span>
      </div>
    </div>
  </details>
</template>
