<script setup lang="ts">
import { computed } from 'vue'
import ChatCollapsible from '../ChatCollapsible.vue'
import ChatMessageMcpDetails from './ChatMessageMcpDetails.vue'
import RemoteScreenBubble from './RemoteScreenBubble.vue'
import { buildMcpToolSummary, mcpImageUrlFromText } from '@/utils/chatMessageView'
import { useCopiedTarget } from '@/utils/chatMessageCopy'

const props = defineProps<{
  idx: number
  text: string
  tokenLabel: string
  tokenTitle: string
  timeLabel: string
}>()

const summary = computed(() => buildMcpToolSummary(props.text))
const mcpImageUrl = computed(() => mcpImageUrlFromText(props.text))
const { copiedTarget, copyTarget } = useCopiedTarget()
</script>

<template>
  <div class="text-[13px] leading-snug">
    <RemoteScreenBubble
      v-if="mcpImageUrl"
      :src="mcpImageUrl"
      title="远程画面"
      alt="设备远程画面"
    />
    <ChatCollapsible
      details-class="mcp-details group/mcp"
      summary-class="flex w-full items-center gap-2 whitespace-nowrap cursor-pointer select-none leading-5 py-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
      body-class="relative mt-1 ml-0.5 pl-2.5 border-l border-zinc-200 dark:border-zinc-700/80"
    >
      <template #summary>
        <span
          class="chat-collapsible-status-dot shrink-0 h-1.5 w-1.5 rounded-full"
          :class="summary.status === '失败' ? 'bg-rose-500' : 'bg-emerald-500'"
        ></span>
        <span class="shrink-0 text-[11px] font-medium text-inherit">{{ summary.status === '失败' ? '调用失败' : '调用' }}</span>
        <span
          class="max-w-28 shrink-0 truncate text-[11px] font-medium text-inherit sm:max-w-44"
          :title="summary.deviceId ? `${summary.provider} · 设备号 ${summary.deviceId}` : summary.provider"
        >{{ summary.provider }}</span>
        <span class="min-w-0 truncate font-mono text-[11px] text-inherit">{{ summary.tool }}</span>
        <span class="segment-metrics ml-auto">
          <span class="segment-token-badge" :title="tokenTitle">{{ tokenLabel }}</span>
          <span v-if="timeLabel" class="segment-time-badge">{{ timeLabel }}</span>
        </span>
      </template>
      <button
        class="absolute right-0 top-0 w-6 h-6 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center justify-center transition-colors"
        :title="copiedTarget === `mcp-${idx}` ? '已复制' : '复制全部 MCP 信息'"
        @click.stop.prevent="copyTarget(summary.sections.copyText, `mcp-${idx}`, $event)"
      >
        <svg v-if="copiedTarget !== `mcp-${idx}`" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8h10v10H8z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <ChatMessageMcpDetails
        :sections="summary.sections"
        :idx="idx"
        :copied-target="copiedTarget"
        @copy="copyTarget"
      />
    </ChatCollapsible>
  </div>
</template>

<style scoped>
.segment-metrics {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.3rem;
}

.segment-token-badge,
.segment-time-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: rgb(100 116 139);
  font-size: 10px;
  line-height: 1.3;
  font-weight: 400;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.segment-token-badge {
  color: rgb(99 102 241);
}

.dark .segment-token-badge,
.dark .segment-time-badge {
  color: rgb(148 163 184);
}

.dark .segment-token-badge {
  color: rgb(165 180 252);
}

</style>
