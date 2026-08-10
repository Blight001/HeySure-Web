<script setup lang="ts">
import { computed } from 'vue'
import ChatActivityGroup from './ChatActivityGroup.vue'
import ChatMessage from './ChatMessage.vue'
import TypingIndicator from './TypingIndicator.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { InlineContent as InlineContentType } from '@/utils/chatParser'
import { buildChatRenderItems } from '@/utils/chatMessageGroups'
import { formatDurationMs } from '@/utils/datetime'
import type { ChatAttachment } from '@/api/chat'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  think?: string
  display_text?: string
  inlineContent?: InlineContentType[]
  front_prompt_details?: string
  id?: number
  tags?: string
  created_at?: number
  latency?: number
  attachments?: ChatAttachment[]
}

const props = defineProps<{
  messages: Message[]
  appliedEdits: string[]
  appliedSignatures: string[]
  actionResults: Record<string, string>
  actionResultsBySignature: Record<string, string>
  isTyping: boolean
  thinkingText?: string
  statusText?: string
  collapseThinking?: boolean
  stripMarkdownSymbols?: boolean
  isEmpty: boolean
  readonly?: boolean
  mcpIcon?: string
  nowTimestamp?: number
}>()

const renderItems = computed(() => buildChatRenderItems(props.messages))

// Persisted messages carry created_at stamped when the message is SAVED, i.e.
// at the END of the work it represents (thinking finishes → assistant message
// saved; tool finishes → MCP bubble saved). So a message's segment duration is
// its own created_at minus the previous message's created_at — never "until the
// next message", which would attribute the following segment (e.g. an MCP run)
// to this bubble. Only the live (unsaved) bubble counts up against `now`, and
// its created_at is the segment start.
const messageTimeLabels = computed<Record<number, string>>(() => {
  const labels: Record<number, string> = {}
  const now = Number(props.nowTimestamp || 0) || null

  const getMessageTimeMs = (message?: Message) => {
    const ts = Number(message?.created_at || 0)
    if (ts <= 0) return null
    // Backend timestamps are epoch seconds; the live bubble passes epoch ms.
    return ts > 1e12 ? ts : ts * 1000
  }

  let prevEnd: number | null = null
  for (let idx = 0; idx < props.messages.length; idx += 1) {
    const current = props.messages[idx]
    const ts = getMessageTimeMs(current)
    if (ts == null) continue

    if (current.id === -1) {
      // Live streaming bubble: created_at is the current segment's start.
      if (now != null && now > ts) labels[idx] = formatDurationMs(now - ts)
      continue
    }

    // Prefer the server-measured, persisted duration when present: the
    // assistant message carries its whole-turn model latency (deep thinking +
    // generation) and each MCP bubble carries its own tool-execution time.
    // These survive a reload and are precise, unlike the created_at gap below
    // (which also folds in queue/overhead time). Fall back to the gap for
    // legacy messages saved before latency was recorded.
    const persisted = Number(current.latency || 0)
    if (Number.isFinite(persisted) && persisted > 0) {
      const duration = formatDurationMs(persisted * 1000)
      if (duration) labels[idx] = duration
    } else if (prevEnd != null && ts > prevEnd) {
      const duration = formatDurationMs(ts - prevEnd)
      if (duration) labels[idx] = duration
    }
    prevEnd = ts
  }

  return labels
})

const messageText = (message?: Message) =>
  String(message?.display_text || message?.content || '').trim()

const messageTimeMs = (message?: Message) => {
  const timestamp = Number(message?.created_at || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  return timestamp > 1e12 ? timestamp : timestamp * 1000
}

const isTaskStartMessage = (message?: Message) => {
  const text = messageText(message)
  return message?.role === 'system'
    && text.startsWith('[MCP工具]')
    && /^工具[：:]\s*todo\.manage\s*$/m.test(text)
    && /^状态[：:]\s*(?!失败).+$/m.test(text)
    && /["']?action["']?\s*[:=]\s*["']create["']/.test(text)
}

const isTaskEndMessage = (message?: Message) => {
  const text = messageText(message)
  return message?.role === 'system'
    && (text.startsWith('【任务完成回执】') || text.startsWith('【计划完成 ·'))
}

const taskDurationLabels = computed<Record<number, string>>(() => {
  const labels: Record<number, string> = {}
  let taskStartedAt: number | null = null
  for (let idx = 0; idx < props.messages.length; idx += 1) {
    const message = props.messages[idx]
    if (isTaskStartMessage(message)) {
      taskStartedAt = messageTimeMs(message)
      continue
    }
    if (!isTaskEndMessage(message)) continue
    const endedAt = messageTimeMs(message)
    if (taskStartedAt != null && endedAt != null && endedAt >= taskStartedAt) {
      labels[idx] = formatDurationMs(endedAt - taskStartedAt)
    }
    taskStartedAt = null
  }
  return labels
})

const emit = defineEmits<{
  (e: 'delete', idx: number): void
  (e: 'recall', idx: number): void
  (e: 'apply', msgIdx: number, blockIdx: number): void
  (e: 'revert', msgIdx: number, blockIdx: number): void
}>()
</script>

<template>
  <div class="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar min-h-[300px]">
    <div v-if="isEmpty" class="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 gap-2 opacity-60">
      <AppIcon name="chat" class="w-10 h-10" />
      <span class="text-sm">开始一场智慧的碰撞吧...</span>
    </div>

    <div class="space-y-4">
      <template v-for="(item, itemIdx) in renderItems" :key="item.kind === 'message' ? (item.hideThink ? `msg-content-${item.index}` : (messages[item.index]?.id !== undefined ? `msg-${messages[item.index].id}` : `tmp-${item.index}`)) : `activity-start-${item.members[0]?.index ?? itemIdx}`">
        <ChatActivityGroup
          v-if="item.kind === 'activity-group'"
          :members="item.members"
          :think-count="item.thinkCount"
          :mcp-count="item.mcpCount"
          :messages="messages"
          :applied-edits="appliedEdits"
          :applied-signatures="appliedSignatures"
          :action-results="actionResults"
          :action-results-by-signature="actionResultsBySignature"
          :readonly="readonly"
          :plain-text-mode="stripMarkdownSymbols"
          :mcp-icon="mcpIcon"
          :member-time-labels="item.kind === 'activity-group' ? item.members.map((member) => messageTimeLabels[member.index] || '') : undefined"
          @delete="(i) => emit('delete', i)"
          @recall="(i) => emit('recall', i)"
          @apply="(msgIdx, blockIdx) => emit('apply', msgIdx, blockIdx)"
          @revert="(msgIdx, blockIdx) => emit('revert', msgIdx, blockIdx)"
        />
        <ChatMessage
          v-else
          :message="messages[item.index]"
          :applied-edits="appliedEdits"
          :applied-signatures="appliedSignatures"
          :action-results="actionResults"
          :action-results-by-signature="actionResultsBySignature"
          :idx="item.index"
          :readonly="readonly"
          :plain-text-mode="stripMarkdownSymbols"
          :mcp-icon="mcpIcon"
          :time-label="String(messages[item.index]?.display_text || messages[item.index]?.content || '').startsWith('[前置 Prompt]') ? '' : (messageTimeLabels[item.index] || '')"
          :task-duration-label="taskDurationLabels[item.index] || ''"
          :hide-think="item.hideThink"
          @delete="(i) => emit('delete', i)"
          @recall="(i) => emit('recall', i)"
          @apply="(msgIdx, blockIdx) => emit('apply', msgIdx, blockIdx)"
          @revert="(msgIdx, blockIdx) => emit('revert', msgIdx, blockIdx)"
        />
      </template>
    </div>

    <TypingIndicator
      :isTyping="isTyping"
      :thinkingText="thinkingText"
      :statusText="statusText"
      :plainTextMode="stripMarkdownSymbols"
      :collapsed="collapseThinking"
    />
  </div>
</template>
