<script setup lang="ts">
import { formatAttachmentBytes } from '@/utils/chatMessageView'
import type { UploadAttachmentItem } from '@/utils/chatInputMentions'

defineProps<{
  items: UploadAttachmentItem[]
}>()

defineEmits<{
  (e: 'remove', clientId: string): void
}>()
</script>

<template>
  <div
    v-if="items.length > 0"
    class="mb-2 flex max-w-full justify-end gap-1.5 overflow-x-auto px-1 pb-1"
  >
    <div
      v-for="item in items"
      :key="item.client_id"
      class="relative flex w-[132px] shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/85 px-2 py-1.5 pr-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/85"
      :title="`${item.file_name}\n${item.status === 'uploading' ? '正在上传…' : formatAttachmentBytes(item.bytes)}`"
    >
      <img
        v-if="item.is_image && item.preview_url"
        :src="item.preview_url"
        :alt="item.file_name"
        class="h-8 w-8 shrink-0 rounded-md object-cover"
      />
      <div v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25H6A2.25 2.25 0 0 0 3.75 4.5v15A2.25 2.25 0 0 0 6 21.75h12A2.25 2.25 0 0 0 20.25 19.5V6.75L15.75 2.25Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25V6.75H20.25" />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{{ item.file_name }}</div>
        <div class="mt-0.5 text-[10px] text-zinc-400">
          {{ item.status === 'uploading' ? '正在上传…' : formatAttachmentBytes(item.bytes) }}
        </div>
      </div>
      <button
        type="button"
        class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
        title="移除附件"
        @click="$emit('remove', item.client_id)"
      >×</button>
    </div>
  </div>
</template>
