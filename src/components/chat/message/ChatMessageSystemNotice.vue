<script setup lang="ts">
import ChatCollapsible from '../ChatCollapsible.vue'

defineProps<{
  title: string
  body: string
  timeLabel: string
}>()
</script>

<template>
  <ChatCollapsible
    details-class="group/system-notice"
    summary-class="flex items-center gap-2 cursor-pointer select-none text-[12px] font-medium leading-5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
    body-class="mt-2 border-t border-slate-300/70 pt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600 dark:border-slate-600/70 dark:text-slate-400"
  >
    <template #summary="{ open }">
      <span
        class="chat-collapsible-arrow text-[10px] leading-none"
        :style="{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }"
      >➣</span>
      <span class="shrink-0">系统提示</span>
      <span class="text-slate-300 dark:text-slate-600">·</span>
      <span class="min-w-0 truncate font-normal text-slate-500 dark:text-slate-400" :title="title">{{ title }}</span>
      <span v-if="timeLabel" class="segment-time-badge ml-auto">{{ timeLabel }}</span>
    </template>
    {{ body }}
  </ChatCollapsible>
</template>

<style scoped>
.segment-time-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: rgb(100 116 139);
  font-size: 10px;
  line-height: 1.3;
  font-weight: 400;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dark .segment-time-badge {
  color: rgb(148 163 184);
}
</style>
