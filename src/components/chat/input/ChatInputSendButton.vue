<script setup lang="ts">
defineProps<{
  showStop: boolean
  canSend: boolean
  submitting?: boolean
  queueMode?: boolean
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <button
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
    :class="submitting
      ? 'cursor-wait bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
      : showStop
      ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30 hover:bg-rose-500 active:scale-95'
      : canSend
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 hover:bg-indigo-500 active:scale-95'
        : 'cursor-not-allowed bg-zinc-100/60 text-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-600'"
    @click="$emit('click')"
    :disabled="submitting || (!showStop && !canSend)"
    :title="submitting ? '正在处理' : (showStop ? '终止生成' : (queueMode ? '加入聊天队列' : '发送'))"
  >
    <svg v-if="submitting" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle class="opacity-30" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
      <path class="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <svg v-else-if="showStop" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
    <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 -translate-x-px">
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
    </svg>
  </button>
</template>
