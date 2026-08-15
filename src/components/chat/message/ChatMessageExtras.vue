<script setup lang="ts">
import type { ChatAttachment } from '@/api/chat'
import type { ChatMessageKind } from '@/utils/chatMessageView'
import ChatMessageAttachments from './ChatMessageAttachments.vue'
import ChatMessageTaskBoundary from './ChatMessageTaskBoundary.vue'

defineProps<{
  kind: ChatMessageKind
  taskDurationLabel?: string
  attachments: ChatAttachment[]
  files: string[]
}>()
</script>

<template>
  <div
    v-if="kind.isPhaseSummary"
    class="mt-3 flex w-full items-center gap-3 text-[10px] font-medium tracking-[0.16em] text-zinc-400 dark:text-zinc-500"
    :aria-label="`${kind.phaseTitle} · 阶段 ${kind.phaseNumber} 末`"
  >
    <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
    <span class="min-w-0 truncate" :title="kind.phaseTitle">{{ kind.phaseTitle }}</span>
    <span class="shrink-0">· 阶段 {{ kind.phaseNumber }} 末</span>
    <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
  </div>

  <ChatMessageTaskBoundary
    v-if="kind.isTaskComplete"
    class="mt-3"
    spacing-class="mt-3"
    label="任务结束"
    aria-label="任务结束"
    :duration="taskDurationLabel"
  />

  <ChatMessageAttachments
    v-if="kind.isUserBubble"
    :attachments="attachments"
    :files="files"
  />
</template>
