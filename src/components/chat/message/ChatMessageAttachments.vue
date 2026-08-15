<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { ChatAttachment } from '@/api/chat'
import { attachedPathLabel, formatAttachmentBytes } from '@/utils/chatMessageView'
import WorkspaceFilePreviewDialog from '../WorkspaceFilePreviewDialog.vue'

defineProps<{
  attachments: ChatAttachment[]
  files: string[]
}>()

const attachmentPreview = ref<ChatAttachment | null>(null)
let attachmentPreviewTrigger: HTMLElement | null = null

const openAttachmentPreview = (attachment: ChatAttachment, event: MouseEvent) => {
  attachmentPreviewTrigger = event.currentTarget as HTMLElement | null
  attachmentPreview.value = attachment
}

const closeAttachmentPreview = async () => {
  attachmentPreview.value = null
  await nextTick()
  attachmentPreviewTrigger?.focus()
}
</script>

<template>
  <div
    v-if="attachments.length > 0"
    class="mt-2 flex max-w-full flex-wrap justify-end gap-2"
  >
    <button
      v-for="attachment in attachments"
      :key="attachment.id || attachment.file_ref"
      type="button"
      class="group/attachment relative flex shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50/60 p-1.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 dark:border-indigo-700/60 dark:bg-indigo-950/25 dark:hover:border-indigo-600"
      :aria-label="`查看附件 ${attachment.file_name}`"
      @click="openAttachmentPreview(attachment, $event)"
    >
      <img
        v-if="attachment.is_image && attachment.url"
        :src="attachment.url"
        :alt="attachment.file_name"
        class="h-16 w-16 shrink-0 rounded-lg object-cover"
        loading="lazy"
      />
      <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 text-indigo-500 dark:bg-zinc-900/70 dark:text-indigo-300">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25H6A2.25 2.25 0 0 0 3.75 4.5v15A2.25 2.25 0 0 0 6 21.75h12A2.25 2.25 0 0 0 20.25 19.5V6.75L15.75 2.25Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25V6.75H20.25" />
        </svg>
      </span>
      <span class="attachment-hover-info" aria-hidden="true">
        <strong>{{ attachment.file_name }}</strong>
        <span>{{ formatAttachmentBytes(attachment.bytes) }}</span>
        <span>{{ attachment.workspace_path }}</span>
      </span>
    </button>
  </div>

  <div
    v-if="files.length > 0"
    class="mt-1.5 flex max-w-full flex-wrap justify-end gap-1"
  >
    <span
      v-for="file in files"
      :key="file"
      class="user-attachment-pill"
      :title="file"
    >
      {{ attachedPathLabel(file) }}
    </span>
  </div>

  <WorkspaceFilePreviewDialog
    :open="!!attachmentPreview"
    :path="attachmentPreview?.workspace_path || ''"
    :display-name="attachmentPreview?.file_name || ''"
    :size="attachmentPreview?.bytes || 0"
    :source-url="attachmentPreview?.url || ''"
    @close="closeAttachmentPreview"
  />
</template>

<style scoped>
.user-attachment-pill {
  max-width: min(20rem, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgb(199 210 254);
  background: rgb(238 242 255);
  padding: 2px 8px;
  color: rgb(79 70 229);
  font-size: 11px;
  line-height: 1.45;
  font-weight: 600;
}

.dark .user-attachment-pill {
  border-color: rgba(129, 140, 248, 0.35);
  background: rgba(79, 70, 229, 0.16);
  color: rgb(199 210 254);
}

.attachment-hover-info {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.45rem);
  z-index: 20;
  display: flex;
  width: max-content;
  max-width: min(20rem, calc(100vw - 2rem));
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid rgb(212 212 216);
  border-radius: 0.65rem;
  background: rgba(255, 255, 255, 0.97);
  color: rgb(82 82 91);
  box-shadow: 0 10px 28px rgba(24, 24, 27, 0.16);
  font-size: 10px;
  line-height: 1.35;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(0.2rem);
  transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
}

.attachment-hover-info strong,
.attachment-hover-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-hover-info strong {
  color: rgb(63 63 70);
  font-weight: 500;
}

.group\/attachment:hover .attachment-hover-info,
.group\/attachment:focus-visible .attachment-hover-info {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dark .attachment-hover-info {
  border-color: rgb(63 63 70);
  background: rgba(24, 24, 27, 0.97);
  color: rgb(161 161 170);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
}

.dark .attachment-hover-info strong {
  color: rgb(228 228 231);
}
</style>
