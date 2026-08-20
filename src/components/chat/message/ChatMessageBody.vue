<script setup lang="ts">
import InlineContent from '../InlineContent.vue'
import type { InlineContent as InlineContentType } from '@/utils/chatParser'
import type { ChatMessageKind } from '@/utils/chatMessageView'
import ChatMessageFrontPromptModal from './ChatMessageFrontPromptModal.vue'
import ChatMessageSystemNotice from './ChatMessageSystemNotice.vue'
import ChatMessageUserActions from './ChatMessageUserActions.vue'

defineProps<{
  kind: ChatMessageKind
  idx: number
  readonly?: boolean
  userCopyText: string
  frontPromptDetails: string
  timeLabel: string
  inlineContent: InlineContentType[]
  mcpIcon?: string
  appliedEdits: string[]
  appliedSignatures: string[]
  actionResults: Record<string, string>
  actionResultsBySignature: Record<string, string>
  plainTextMode?: boolean
  mentionTokens: Array<{ token: string; type: 'mcp' | 'file'; detail?: string }>
}>()

const emit = defineEmits<{
  (e: 'delete', idx: number): void
  (e: 'recall', idx: number): void
  (e: 'apply', blockIdx: number): void
  (e: 'revert', blockIdx: number): void
}>()
</script>

<template>
  <ChatMessageFrontPromptModal
    v-if="kind.isFrontPrompt"
    :details-text="frontPromptDetails"
    :idx="idx"
  />

  <ChatMessageUserActions
    v-if="!readonly && kind.isUserBubble"
    :idx="idx"
    :copy-text="userCopyText"
    @delete="emit('delete', $event)"
    @recall="emit('recall', $event)"
  />

  <ChatMessageSystemNotice
    v-if="kind.isCollapsibleNotice"
    :title="kind.noticeTitle"
    :body="kind.noticeBody"
    :time-label="timeLabel"
  />

  <div
    v-else
    class="min-w-0 max-w-full whitespace-pre-wrap break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]"
    :class="[
      kind.isUserBubble ? 'text-indigo-700 dark:text-indigo-300' : '',
      kind.isFrontPrompt ? 'text-left w-full front-prompt-content' : '',
      kind.isUserBubble ? 'user-message-text' : ''
    ]"
  >
    <template v-if="inlineContent.length > 0">
      <InlineContent
        :content="inlineContent"
        :mcpIcon="mcpIcon"
        :appliedEdits="appliedEdits"
        :appliedSignatures="appliedSignatures"
        :actionResults="actionResults"
        :actionResultsBySignature="actionResultsBySignature"
        :plainTextMode="plainTextMode"
        :mentionTokens="mentionTokens"
        @apply="emit('apply', $event)"
        @revert="emit('revert', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.front-prompt-content {
  min-height: 100%;
}

.user-message-text {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.user-message-text :deep(.inline-content-wrapper),
.user-message-text :deep(.markdown-text) {
  max-width: 100%;
}

.user-message-text :deep(.markdown-text) {
  width: fit-content;
}
</style>
