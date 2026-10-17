<script setup lang="ts">
import type { MentionCandidate } from '@/utils/chatInputMentions'

defineProps<{
  candidates: MentionCandidate[]
  activeIndex: number
}>()

defineEmits<{
  (e: 'hover', index: number): void
  (e: 'select', candidate: MentionCandidate): void
}>()
</script>

<template>
  <div class="absolute bottom-full left-10 right-10 z-[110] mb-2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
    <div class="flex items-center justify-between px-2 py-1 text-[10px] text-zinc-400">
      <span>@ 引用 Skill、MCP 或文件</span>
      <span class="hidden sm:inline">Tab 选择首项 · ↑↓ 切换</span>
    </div>
    <button
      v-for="(candidate, index) in candidates"
      :key="candidate.key"
      type="button"
      class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
      :class="index === activeIndex ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800'"
      @mouseenter="$emit('hover', index)"
      @mousedown.prevent
      @click.prevent.stop="$emit('select', candidate)"
    >
      <span
        class="flex h-5 min-w-9 shrink-0 items-center justify-center rounded-md px-1 text-[9px] font-medium"
        :class="candidate.type === 'tool' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : candidate.type === 'skill' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'"
      >{{ candidate.type === 'tool' ? 'MCP' : candidate.type === 'skill' ? 'Skill' : '文件' }}</span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-mono text-[11px]">{{ candidate.label }}</span>
        <span class="block truncate text-[10px] font-normal text-zinc-400">{{ candidate.detail }}</span>
      </span>
    </button>
  </div>
</template>
