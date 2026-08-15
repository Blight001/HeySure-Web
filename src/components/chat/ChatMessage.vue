<script setup lang="ts">
import { computed } from 'vue'
import ChatMentionTooltip from './ChatMentionTooltip.vue'
import ChatMessageBody from './message/ChatMessageBody.vue'
import ChatMessageExtras from './message/ChatMessageExtras.vue'
import ChatMessageMcpBubble from './message/ChatMessageMcpBubble.vue'
import ChatMessageTaskBoundary from './message/ChatMessageTaskBoundary.vue'
import ChatMessageThinkBlock from './message/ChatMessageThinkBlock.vue'
import { useChatMentionTooltip } from '@/composables/useChatMentionTooltip'
import { stripMarkdownFormatting } from '@/utils/chatMarkdown'
import {
  buildMcpToolSummary,
  chatMessageAlignClass,
  chatMessageBubbleClasses,
  chatMessageWidthClass,
  describeChatMessage,
  describeMessageExtras,
  isTaskStartMcp,
  normalizeMessageInlineContent,
  type ChatMessageViewModel,
} from '@/utils/chatMessageView'
import { estimateTokenCount, formatTokenCount } from '@/utils/formatTokenCount'

const emit = defineEmits<{
  (e: 'delete', idx: number): void
  (e: 'recall', idx: number): void
  (e: 'apply', msgIdx: number, blockIdx: number): void
  (e: 'revert', msgIdx: number, blockIdx: number): void
}>()

const { mentionTooltip, showMentionTooltip, hideMentionTooltip, keepMentionTooltip } = useChatMentionTooltip()

const props = defineProps<{
  message: ChatMessageViewModel
  appliedEdits: string[]
  appliedSignatures: string[]
  actionResults: Record<string, string>
  actionResultsBySignature: Record<string, string>
  idx: number
  readonly?: boolean
  plainTextMode?: boolean
  mcpIcon?: string
  embedded?: boolean
  thinkOnly?: boolean
  hideThink?: boolean
  expandThinkByDefault?: boolean
  timeLabel?: string
  taskDurationLabel?: string
}>()

const kind = computed(() => describeChatMessage(props.message))
const extras = computed(() => describeMessageExtras(props.message))
const mcpSummary = computed(() => kind.value.isMcp ? buildMcpToolSummary(kind.value.text) : null)
const isTaskStart = computed(() => {
  const summary = mcpSummary.value
  if (!kind.value.isMcp || !summary) return false
  return isTaskStartMcp(summary.status, summary.tool, summary.sections.params)
})

const renderedThinkText = computed(() => {
  const think = String(props.message.think || '')
  if (!props.plainTextMode) return think
  return stripMarkdownFormatting(think)
})

const segmentTimeLabel = computed(() => String(props.timeLabel || '').trim())
const toolEstimatedTokens = computed(() => estimateTokenCount([
  mcpSummary.value?.sections.tool,
  mcpSummary.value?.sections.copyText,
].filter(Boolean).join('\n')))
const thinkingEstimatedTokens = computed(() => estimateTokenCount(renderedThinkText.value))
const segmentTokenLabel = computed(() => `Token ${formatTokenCount(
  kind.value.isMcp ? toolEstimatedTokens.value : thinkingEstimatedTokens.value,
)}`)
const segmentTokenTitle = computed(() => {
  if (kind.value.isMcp) return '工具名称、参数与结果的上下文 Token 估算值'
  return '本段深度思考文本的 Token 估算值'
})

const normalizedInlineContent = computed(() => normalizeMessageInlineContent(props.message, kind.value))
const frontPromptDetailsText = computed(() => String(props.message.front_prompt_details || ''))
const userMessageCopyText = computed(() => kind.value.text)
</script>

<template>
  <div
    class="flex w-full flex-col gap-1.5"
    @pointerover="showMentionTooltip"
    @pointerout="hideMentionTooltip"
    :class="[
      chatMessageAlignClass(kind),
      kind.isMcp ? (props.embedded ? '!mt-0' : '!mt-0.5') : '',
      props.embedded ? '!gap-1' : ''
    ]"
  >
    <div
      class="group relative"
      :class="[
        chatMessageWidthClass(!!props.embedded, kind),
        kind.isUserBubble ? 'ml-auto w-full min-w-0' : ''
      ]"
    >
      <ChatMessageThinkBlock
        v-if="renderedThinkText && !props.hideThink"
        :text="renderedThinkText"
        :embedded="props.embedded"
        :think-only="props.thinkOnly"
        :expand-by-default="props.expandThinkByDefault"
        :token-label="segmentTokenLabel"
        :token-title="segmentTokenTitle"
        :time-label="segmentTimeLabel"
      />

      <ChatMessageTaskBoundary
        v-if="isTaskStart"
        class="mb-2"
        spacing-class="mb-2"
        label="任务开始"
        aria-label="任务开始"
      />

      <div
        v-if="!props.thinkOnly"
        :class="chatMessageBubbleClasses(kind)"
      >
        <ChatMessageMcpBubble
          v-if="kind.isMcp && !kind.isCollapsibleNotice"
          :idx="props.idx"
          :text="kind.text"
          :token-label="segmentTokenLabel"
          :token-title="segmentTokenTitle"
          :time-label="segmentTimeLabel"
        />
        <ChatMessageBody
          v-else
          :kind="kind"
          :idx="props.idx"
          :readonly="props.readonly"
          :user-copy-text="userMessageCopyText"
          :front-prompt-details="frontPromptDetailsText"
          :time-label="segmentTimeLabel"
          :inline-content="normalizedInlineContent"
          :mcp-icon="props.mcpIcon"
          :applied-edits="props.appliedEdits"
          :applied-signatures="props.appliedSignatures"
          :action-results="props.actionResults"
          :action-results-by-signature="props.actionResultsBySignature"
          :plain-text-mode="props.plainTextMode"
          :mention-tokens="extras.mentionTokens"
          @delete="emit('delete', $event)"
          @recall="emit('recall', $event)"
          @apply="emit('apply', props.idx, $event)"
          @revert="emit('revert', props.idx, $event)"
        />
      </div>

      <ChatMessageExtras
        :kind="kind"
        :task-duration-label="props.taskDurationLabel"
        :attachments="extras.uploads"
        :files="extras.visibleFiles"
      />
    </div>

    <ChatMentionTooltip :state="mentionTooltip" @keep="keepMentionTooltip" @hide="hideMentionTooltip" />
  </div>
</template>

<style scoped>
.front-prompt-bubble {
  position: relative;
  height: 14rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.user-message-bubble {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-left: auto;
}
</style>
