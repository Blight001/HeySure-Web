<script setup lang="ts">
import { useCopiedTarget } from '@/utils/chatMessageCopy'

const props = defineProps<{
  idx: number
  copyText: string
}>()

const emit = defineEmits<{
  (e: 'delete', idx: number): void
  (e: 'recall', idx: number): void
}>()

const { copiedTarget, copyTarget } = useCopiedTarget()
const copyKey = () => `user-${props.idx}`
</script>

<template>
  <div class="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    <button
      @click.stop="copyTarget(copyText, copyKey(), $event)"
      class="w-6 h-6 rounded-full bg-zinc-600 text-white flex items-center justify-center shadow-md hover:bg-zinc-700 transition-colors"
      :title="copiedTarget === copyKey() ? '已复制' : '复制用户消息'"
    >
      <svg v-if="copiedTarget !== copyKey()" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8h10v10H8z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </button>
    <button
      @click.stop="emit('recall', idx)"
      class="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md hover:bg-amber-600 transition-colors"
      title="撤回此消息及之后所有对话"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    </button>
    <button
      @click.stop="emit('delete', idx)"
      class="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
      title="删除此消息"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
