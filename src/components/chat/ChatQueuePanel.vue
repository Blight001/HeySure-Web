<script setup lang="ts">
import { ref } from 'vue'
import type { QueuedChatMessage } from '@/types/chat'

defineProps<{
  items: QueuedChatMessage[]
}>()

const emit = defineEmits<{
  (e: 'update', itemId: string, content: string): void
  (e: 'delete', itemId: string): void
}>()

const editingId = ref('')
const editingContent = ref('')

const startEditing = (item: QueuedChatMessage) => {
  editingId.value = item.id
  editingContent.value = item.content
}

const cancelEditing = () => {
  editingId.value = ''
  editingContent.value = ''
}

const saveEditing = () => {
  const content = editingContent.value.trim()
  if (editingId.value && content) emit('update', editingId.value, content)
  cancelEditing()
}
</script>

<template>
  <section
    v-if="items.length"
    class="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90"
    aria-label="聊天队列"
  >
    <div class="max-h-48 overflow-y-auto overflow-x-hidden">
      <article
        v-for="item in items"
        :key="item.id"
        class="min-w-0 border-b border-zinc-100 px-3 py-2 last:border-b-0 dark:border-zinc-800"
      >
        <template v-if="editingId === item.id">
          <textarea
            v-model="editingContent"
            rows="2"
            class="block w-full min-w-0 resize-none rounded-lg border border-indigo-300 bg-white px-2.5 py-2 text-sm text-zinc-800 outline-none ring-2 ring-indigo-500/15 dark:border-indigo-600 dark:bg-zinc-950 dark:text-zinc-100"
            aria-label="调整队列消息"
            @keydown.ctrl.enter.prevent="saveEditing"
          ></textarea>
          <div class="mt-2 flex justify-end gap-2">
            <button type="button" class="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200" @click="cancelEditing">取消</button>
            <button type="button" class="rounded-md bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-500" @click="saveEditing">保存</button>
          </div>
        </template>

        <template v-else>
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-300 text-[10px] text-zinc-500 dark:border-zinc-600 dark:text-zinc-400" aria-hidden="true">−</span>
            <p class="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-zinc-700 dark:text-zinc-200" :title="item.content">
              {{ item.content || `已添加 ${item.attachments.length} 个附件` }}
            </p>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                title="调整这条消息"
                @click="startEditing(item)"
              >
                ↪ 调整方向
              </button>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
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
          <div v-if="item.attachments.length || item.selectedFiles.length" class="mt-1 truncate pl-6 text-[10px] text-zinc-400 dark:text-zinc-500">
            {{ item.attachments.length ? `${item.attachments.length} 个附件` : '' }}
            {{ item.attachments.length && item.selectedFiles.length ? ' · ' : '' }}
            {{ item.selectedFiles.length ? `${item.selectedFiles.length} 个工作区文件` : '' }}
          </div>
        </template>
      </article>
    </div>
  </section>
</template>
