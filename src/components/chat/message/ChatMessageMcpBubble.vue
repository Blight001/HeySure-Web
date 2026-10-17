<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ChatAttachment } from '@/api/chat'
import ChatCollapsible from '../ChatCollapsible.vue'
import ChatMessageImagePreview from './ChatMessageImagePreview.vue'
import ChatMessageMcpDetails from './ChatMessageMcpDetails.vue'
import RemoteScreenBubble from './RemoteScreenBubble.vue'
import { buildMcpToolSummary, mcpImageUrlFromText, mcpMediaRefsFromText, type McpMediaRef } from '@/utils/chatMessageView'
import { useCopiedTarget } from '@/utils/chatMessageCopy'

const props = defineProps<{
  idx: number
  text: string
  tokenLabel: string
  tokenTitle: string
  timeLabel: string
  attachments?: ChatAttachment[]
}>()

const summary = computed(() => buildMcpToolSummary(props.text))
const mcpImageUrl = computed(() => mcpImageUrlFromText(props.text))
const inlineMedia = computed(() => mcpMediaRefsFromText(props.text))
const attachmentMedia = computed<McpMediaRef[]>(() => (props.attachments || [])
  .map((item) => ({ item, mime: String(item.mime_type || '').toLowerCase() }))
  .filter(({ item, mime }) => item?.url && (item.is_image || item.is_video || mime.startsWith('video/') || mime.startsWith('image/')))
  .map(({ item, mime }) => ({
    url: String(item.url),
    type: item.is_video || mime.startsWith('video/') ? 'video' : 'image',
    name: item.file_name,
  })))
const mediaRefs = computed(() => {
  if (attachmentMedia.value.length) return attachmentMedia.value
  const refs = [...attachmentMedia.value, ...inlineMedia.value]
  const seen = new Set<string>()
  return refs.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
})
const imagePreviewUrl = ref('')
const { copiedTarget, copyTarget } = useCopiedTarget()
const imagePreviewOpen = ref(false)
let imagePreviewTrigger: HTMLElement | null = null

const openImagePreview = async (url: string, event: MouseEvent) => {
  imagePreviewTrigger = event.currentTarget as HTMLElement | null
  imagePreviewUrl.value = url
  imagePreviewOpen.value = true
}

const closeImagePreview = async () => {
  imagePreviewOpen.value = false
  imagePreviewUrl.value = ''
  await nextTick()
  imagePreviewTrigger?.focus()
}
</script>

<template>
  <div class="text-[13px] leading-snug">
    <RemoteScreenBubble
      v-if="mcpImageUrl && !mediaRefs.some((media) => media.url === mcpImageUrl)"
      :src="mcpImageUrl"
      title="远程画面"
      alt="设备远程画面"
    />
    <div v-if="mediaRefs.length" class="mcp-media-list">
      <template v-for="(media, mediaIdx) in mediaRefs" :key="`${media.url}-${mediaIdx}`">
        <button
          v-if="media.type === 'image'"
          type="button"
          class="mcp-screenshot-link"
          :title="media.name ? `点击放大 ${media.name}` : '点击放大图片'"
          :aria-label="media.name ? `放大查看 ${media.name}` : '放大查看图片'"
          @click="openImagePreview(media.url, $event)"
        >
          <img :src="media.url" :alt="media.name || '生成图片'" class="mcp-screenshot" loading="lazy" />
        </button>
        <video
          v-else
          class="mcp-generated-video"
          :title="media.name || '生成视频'"
          controls
          playsinline
          preload="metadata"
          :src="media.url"
        ></video>
      </template>
    </div>
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
    <ChatMessageImagePreview :open="imagePreviewOpen" :src="imagePreviewUrl" @close="closeImagePreview" />
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

.mcp-screenshot-link {
  display: inline-block;
  margin-bottom: 6px;
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgb(228 228 231);
  background: rgb(244 244 245);
  line-height: 0;
  cursor: zoom-in;
}

.mcp-media-list {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.45rem;
  margin-bottom: 6px;
}

.dark .mcp-screenshot-link {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27);
}

.mcp-screenshot {
  display: block;
  max-width: min(420px, 100%);
  max-height: 320px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.mcp-generated-video {
  display: block;
  width: min(560px, 100%);
  max-height: 360px;
  border: 1px solid rgb(228 228 231);
  border-radius: 10px;
  background: rgb(9 9 11);
  object-fit: contain;
}

.dark .mcp-generated-video {
  border-color: rgb(63 63 70);
}
</style>\n