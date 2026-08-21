<script setup lang="ts">
import type { QueuedChatMessage } from '@/types/chat'

defineProps<{
  items: QueuedChatMessage[]
  runActive?: boolean
}>()

const emit = defineEmits<{
  (e: 'send-now', itemId: string): void
  (e: 'edit', itemId: string): void
  (e: 'move-up', itemId: string): void
  (e: 'delete', itemId: string): void
}>()
</script>

<template>
  <section
    v-if="items.length"
    class="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white/90 dark:border-zinc-700 dark:bg-zinc-900/90"
    aria-label="聊天队列"
  >
    <div class="max-h-32 overflow-y-auto overflow-x-hidden">
      <article
        v-for="(item, index) in items"
        :key="item.id"
        class="min-w-0 border-b border-zinc-100 px-2.5 py-1.5 last:border-b-0 dark:border-zinc-800"
      >
        <div class="flex min-w-0 items-center gap-1.5">
            <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-zinc-300 text-[9px] text-zinc-500 dark:border-zinc-600 dark:text-zinc-400" aria-hidden="true">−</span>
            <p class="min-w-0 flex-1 truncate text-xs leading-4 text-zinc-600 dark:text-zinc-300" :title="item.content">
              {{ item.content || `已添加 ${item.attachments.length} 个附件` }}
            </p>
            <div class="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                :title="runActive ? '终止当前任务并提前发送' : '直接发送这条消息'"
                :aria-label="runActive ? '提前发送' : '直接发送'"
                @click="emit('send-now', item.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.27 3.13A59.77 59.77 0 0 1 21.49 12 59.77 59.77 0 0 1 3.27 20.87L6 12Zm0 0h7.5" />
                </svg>
              </button>
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                title="回到输入框编辑"
                aria-label="编辑队列消息"
                @click="emit('edit', item.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m16.86 4.49 1.65-1.65a2.25 2.25 0 0 1 3.18 3.18L10.58 17.13a4.5 4.5 0 0 1-1.9 1.13l-3.18.95.95-3.18a4.5 4.5 0 0 1 1.13-1.9L16.86 4.5Zm0 0 3.18 3.18M19.5 13.5v4.75A2.25 2.25 0 0 1 17.25 20.5h-11.5a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 5.75 4.5h4.75" />
                </svg>
              </button>
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                :disabled="index === 0"
                title="向上调整顺序"
                aria-label="向上调整顺序"
                @click="emit('move-up', item.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 10.5 7.5-7.5 7.5 7.5M12 3v18" />
                </svg>
              </button>
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                title="从队列删除"
                aria-label="从队列删除"
                @click="emit('delete', item.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.1 1.01.16M19.23 5.79 18 19.67A2.25 2.25 0 0 1 15.76 21H8.24A2.25 2.25 0 0 1 6 19.67L4.77 5.79m14.46 0a48.1 48.1 0 0 0-3.48-.4m-10.98.4c-.34.05-.68.1-1.01.16m1.01-.16a48.1 48.1 0 0 1 3.48-.4m7.5 0V4.48c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 0 0-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.91m7.5 0a48.67 48.67 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
        </div>
        <div v-if="item.attachments.length || item.selectedFiles.length" class="mt-0.5 truncate pl-5 text-[9px] leading-3 text-zinc-400 dark:text-zinc-500">
          {{ item.attachments.length ? `${item.attachments.length} 个附件` : '' }}
          {{ item.attachments.length && item.selectedFiles.length ? ' · ' : '' }}
          {{ item.selectedFiles.length ? `${item.selectedFiles.length} 个工作区文件` : '' }}
        </div>
      </article>
    </div>
  </section>
</template>
