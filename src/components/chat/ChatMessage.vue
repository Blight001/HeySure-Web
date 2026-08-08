<script setup lang="ts">
import ChatCollapsible from './ChatCollapsible.vue'
import InlineContent from './InlineContent.vue'
import type { InlineContent as InlineContentType } from '@/utils/chatParser'
import { computed, nextTick, ref } from 'vue'
import { stripMarkdownFormatting } from '@/utils/chatMarkdown'
import { copyTextToClipboard } from '@/utils/clipboard'
import { parseMcpToolBubbleDetails } from '@/utils/mcpFormat'
import { usePopupZIndex } from '@/composables/usePopupZIndex'

const emit = defineEmits<{
  (e: 'delete', idx: number): void
  (e: 'recall', idx: number): void
  (e: 'apply', msgIdx: number, blockIdx: number): void
  (e: 'revert', msgIdx: number, blockIdx: number): void
}>()

const props = defineProps<{
  message: {
    role: 'user' | 'assistant' | 'system'
    content: string
    think?: string
    display_text?: string
    inlineContent?: InlineContentType[]
    front_prompt_details?: string
    id?: number
    tags?: string
    created_at?: number
  }
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
  timeLabel?: string
  taskDurationLabel?: string
}>()

const isFrontPromptMessage = computed(() => {
  if (props.message.role !== 'system') return false
  const text = String(props.message.display_text || props.message.content || '')
  return text.startsWith('[前置 Prompt]')
})

const isSystemNoticeMessage = computed(() => {
  if (props.message.role !== 'user' && props.message.role !== 'system') return false
  const text = String(props.message.display_text || props.message.content || '').trim()
  return text.startsWith('[系统提示]') || text.startsWith('【任务完成回执】')
})

const isUserMessageBubble = computed(() => {
  return props.message.role === 'user' && !isSystemNoticeMessage.value
})

const isCollapsibleSystemNotice = computed(() => {
  if (props.message.role !== 'user' && props.message.role !== 'system') return false
  const text = String(props.message.display_text || props.message.content || '').trim()
  return text.startsWith('[系统提示]')
})

const systemNoticeBody = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  return text.replace(/^\[系统提示\]\s*/, '').trim()
})

const systemNoticeTitle = computed(() => {
  const firstLine = systemNoticeBody.value
    .split(/\r?\n/)
    .map(line => line.replace(/^[-#>*\s]+/, '').trim())
    .find(Boolean) || '通知详情'
  const normalized = firstLine
    .replace(/^\[(?:系统提示|提示|通知)\]\s*/, '')
    .replace(/[：:]$/, '')
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized
})

const phaseSummaryMatch = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  return text.match(/^\[系统提示\s*·\s*阶段\s*(\d+)\s+(?:已完成|未达成(?:\(failed\))?)\]\s*(.*)$/m)
})

const isPhaseSummary = computed(() => props.message.role === 'system' && !!phaseSummaryMatch.value)

const phaseSummaryNumber = computed(() => String(phaseSummaryMatch.value?.[1] || ''))
const phaseSummaryTitle = computed(() => String(phaseSummaryMatch.value?.[2] || '').trim() || `阶段 ${phaseSummaryNumber.value}`)

const phaseSummaryMarkdown = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  const match = phaseSummaryMatch.value
  if (!match) return text
  const title = String(match[2] || '').trim()
  const body = text.slice(match[0].length).trim()
  return [`### ${title || `阶段 ${phaseSummaryNumber.value} 小结`}`, body]
    .filter(Boolean)
    .join('\n\n')
})

const isTaskCompleteNotice = computed(() => {
  if (props.message.role !== 'system') return false
  const text = String(props.message.display_text || props.message.content || '').trim()
  // Only dedicated terminal receipts may close a task. Never infer completion
  // from phrases inside MCP parameters/results or an intermediate phase summary.
  return text.startsWith('【任务完成回执】')
    || text.startsWith('【计划完成 ·')
})

const isRunErrorNotice = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  return props.message.role === 'system' && text.startsWith('[AI 对话出错]')
})

const isMcpToolMessage = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  return props.message.role === 'system' && text.startsWith('[MCP工具]')
})

const isPlainAssistantMessage = computed(() => {
  return props.message.role === 'assistant'
})

const DOMESTIC_SERVER_TOOL_NAMESPACES = new Set([
  'console',
  'disk',
  'file',
  'journal',
  'network',
  'package',
  'process',
  'service',
  'shell',
  'system',
])

const getMcpProviderName = (tool: string) => {
  const namespace = String(tool || '').trim().split(/[.+]/, 1)[0]?.toLowerCase() || ''
  return DOMESTIC_SERVER_TOOL_NAMESPACES.has(namespace) ? '国内 HeySure 服务器' : '工具箱'
}

const mcpToolSummary = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  const tool = String(text.match(/^工具[：:]\s*(.+)$/m)?.[1] || 'MCP 工具').trim()
  const status = String(text.match(/^状态[：:]\s*(.+)$/m)?.[1] || '').trim()
  return { tool, status, provider: getMcpProviderName(tool) }
})

// Trailing "[截图] <url>" marker the backend appends to screenshot MCP bubbles.
const SCREENSHOT_MARKER_RE = /\n*\[截图\]\s*\n\s*(\S+)\s*$/

const mcpImageUrl = computed(() => {
  const text = String(props.message.display_text || props.message.content || '')
  return String(text.match(SCREENSHOT_MARKER_RE)?.[1] || '').trim()
})

const mcpToolSections = computed(() => {
  const text = String(props.message.display_text || props.message.content || '').trim()
  return parseMcpToolBubbleDetails(text, mcpToolSummary.value.tool)
})

const isTaskStart = computed(() => {
  if (!isMcpToolMessage.value || mcpToolSummary.value.status === '失败') return false
  if (mcpToolSummary.value.tool !== 'todo.manage') return false
  return /["']?action["']?\s*[:=]\s*["']create["']/.test(mcpToolSections.value.params)
})

const copiedTarget = ref('')
const frontPromptDetailsOpen = ref(false)
const frontPromptDetailsZIndex = usePopupZIndex(frontPromptDetailsOpen)
const imagePreviewOpen = ref(false)
const imagePreviewDialog = ref<HTMLElement | null>(null)
const imagePreviewZIndex = usePopupZIndex(imagePreviewOpen)
let imagePreviewTrigger: HTMLElement | null = null

const openImagePreview = async (event: MouseEvent) => {
  imagePreviewTrigger = event.currentTarget as HTMLElement | null
  imagePreviewOpen.value = true
  await nextTick()
  imagePreviewDialog.value?.focus()
}

const closeImagePreview = async () => {
  imagePreviewOpen.value = false
  await nextTick()
  imagePreviewTrigger?.focus()
}

const userMessageCopyText = computed(() => {
  return String(props.message.display_text || props.message.content || '')
})

const copyText = async (text: string, target: string, event?: Event) => {
  const value = String(text || '')
  if (!value) return
  // 传入触发按钮定位真实所在窗口：面板可能在 Document PiP 小窗里
  const contextEl = (event?.currentTarget || event?.target) as Element | null
  if (!(await copyTextToClipboard(value, contextEl))) {
    console.warn('copy failed')
    return
  }
  copiedTarget.value = target
  window.setTimeout(() => {
    if (copiedTarget.value === target) copiedTarget.value = ''
  }, 1200)
}

const normalizedInlineContent = computed<InlineContentType[]>(() => {
  if (isPhaseSummary.value) {
    return [{ type: 'text', content: phaseSummaryMarkdown.value }]
  }
  if (Array.isArray(props.message.inlineContent) && props.message.inlineContent.length > 0) {
    return props.message.inlineContent
  }
  const text = String(props.message.display_text || props.message.content || '')
  if (!text) return []
  return [{ type: 'text', content: text }]
})

const frontPromptDetailsText = computed(() => {
  return String(props.message.front_prompt_details || '')
})

const renderedThinkText = computed(() => {
  const think = String(props.message.think || '')
  if (!props.plainTextMode) return think
  return stripMarkdownFormatting(think)
})

const segmentTimeLabel = computed(() => String(props.timeLabel || '').trim())

const ATTACHMENTS_PREFIX = '__HS_ATTACHMENTS__='

const decodeTagSegment = (prefix: string): unknown => {
  const tags = String(props.message.tags || '')
  const idx = tags.indexOf(prefix)
  if (idx < 0) return null
  const raw = tags.slice(idx + prefix.length).split(/\s*\|\s*/)[0]?.trim()
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
}

const attachedFiles = computed(() => {
  const parsed = decodeTagSegment(ATTACHMENTS_PREFIX)
  return Array.isArray(parsed)
    ? parsed.map(item => String(item || '').trim()).filter(Boolean)
    : []
})

const attachedPathLabel = (path: string) =>
  String(path || '').trim().endsWith('/') ? `${String(path || '').trim()}（文件夹）` : String(path || '').trim()

</script>

<template>
  <div
    class="flex w-full flex-col gap-1.5"
    :class="[
      (isFrontPromptMessage || isTaskCompleteNotice) ? 'items-center' : ((props.message.role === 'user' && !isSystemNoticeMessage) ? 'items-end' : 'items-start'),
      isMcpToolMessage ? '!mt-0.5' : '',
      props.embedded ? '!gap-1' : ''
    ]"
  >
    <div
      class="group relative"
      :class="[
        props.embedded ? 'w-full max-w-full' : (isPlainAssistantMessage ? 'max-w-[95%] sm:max-w-[92%]' : 'max-w-[95%] sm:max-w-[85%]'),
        isUserMessageBubble ? 'ml-auto w-full min-w-0' : ''
      ]"
    >
      <!-- Think Block — Codex-style: dim/italic body on a quiet left rail -->
      <div v-if="renderedThinkText && !props.hideThink" class="mb-1">
        <ChatCollapsible
          details-class="group/think"
          summary-class="flex items-center gap-1 py-0.5 text-[11px] leading-4 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer select-none transition-colors"
          body-class="mt-1 ml-1 pl-2.5 border-l border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed italic whitespace-pre-wrap"
        >
          <template #summary>
            <span class="chat-collapsible-arrow text-[10px] leading-none">➣</span>
            <span class="font-medium tracking-wide">深度思考</span>
            <span v-if="segmentTimeLabel" class="segment-time-badge">{{ segmentTimeLabel }}</span>
          </template>
          {{ renderedThinkText }}
        </ChatCollapsible>
      </div>
      
      <div
        v-if="isTaskStart"
        class="task-boundary mb-2"
        aria-label="任务开始"
      >
        <span class="task-boundary-wave"></span>
        <strong>任务开始</strong>
        <span class="task-boundary-wave"></span>
      </div>

      <!-- Main Content -->
      <div
        v-if="!props.thinkOnly"
        :class="[
          (isPlainAssistantMessage || isPhaseSummary)
            ? 'px-0 py-1 border-0 bg-transparent text-zinc-800 shadow-none hover:shadow-none dark:text-zinc-200'
          : (props.message.role === 'user' && !isSystemNoticeMessage)
            ? 'bg-transparent border-indigo-500 text-indigo-700 rounded-tr-sm shadow-none dark:border-indigo-400 dark:text-indigo-300'
            : isTaskCompleteNotice
              ? 'bg-transparent border-emerald-500 text-emerald-700 rounded-xl shadow-none dark:border-emerald-400 dark:text-emerald-300'
            : isSystemNoticeMessage
              ? 'bg-transparent border-slate-400 text-slate-700 rounded-tl-sm shadow-none dark:border-slate-500 dark:text-slate-300'
            : isFrontPromptMessage
              ? 'bg-violet-50 border-violet-200 text-zinc-800 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-zinc-100'
            : isRunErrorNotice
              ? 'bg-rose-50 border-rose-300 text-rose-800 rounded-tl-sm dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200'
            : isMcpToolMessage
              ? 'text-sky-700 dark:text-sky-300'
            : props.message.role === 'system'
                ? 'bg-zinc-100/60 border-zinc-200 text-zinc-700 font-mono text-xs dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300'
                : 'bg-white/75 border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-200',
          (isPlainAssistantMessage || isMcpToolMessage || isPhaseSummary) ? '' : 'px-4 py-3 rounded-2xl border hover:shadow-md',
          isFrontPromptMessage ? 'front-prompt-bubble' : '',
          isUserMessageBubble ? 'user-message-bubble' : ''
        ]"
      >
        
        <button
          v-if="isFrontPromptMessage && frontPromptDetailsText"
          class="front-prompt-detail-button"
          @click.stop="frontPromptDetailsOpen = true"
        >
          详情
        </button>

        <!-- Delete & Recall Buttons (hover 显示) -->
        <div v-if="!props.readonly && props.message.role === 'user' && !isSystemNoticeMessage" class="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Copy Button -->
          <button
            @click.stop="copyText(userMessageCopyText, `user-${props.idx}`, $event)"
            class="w-6 h-6 rounded-full bg-zinc-600 text-white flex items-center justify-center shadow-md hover:bg-zinc-700 transition-colors"
            :title="copiedTarget === `user-${props.idx}` ? '已复制' : '复制用户消息'"
          >
            <svg v-if="copiedTarget !== `user-${props.idx}`" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8h10v10H8z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <!-- Recall Button (仅用户消息显示) -->
          <button 
            @click.stop="emit('recall', props.idx)"
            class="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md hover:bg-amber-600 transition-colors"
            title="撤回此消息及之后所有对话"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <!-- Delete Button -->
          <button 
            @click.stop="emit('delete', props.idx)"
            class="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
            title="删除此消息"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <ChatCollapsible
          v-if="isCollapsibleSystemNotice"
          details-class="group/system-notice"
          summary-class="flex items-center gap-2 cursor-pointer select-none text-[12px] font-medium leading-5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          body-class="mt-2 border-t border-slate-300/70 pt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600 dark:border-slate-600/70 dark:text-slate-400"
        >
          <template #summary>
            <span class="chat-collapsible-arrow text-[10px] leading-none">➣</span>
            <span class="shrink-0">系统提示</span>
            <span class="text-slate-300 dark:text-slate-600">·</span>
            <span class="min-w-0 truncate font-normal text-slate-500 dark:text-slate-400" :title="systemNoticeTitle">{{ systemNoticeTitle }}</span>
            <span v-if="segmentTimeLabel" class="segment-time-badge ml-auto">{{ segmentTimeLabel }}</span>
          </template>
          {{ systemNoticeBody }}
        </ChatCollapsible>

        <div
          v-else-if="isMcpToolMessage"
          class="text-[13px] leading-snug"
        >
          <button
            v-if="mcpImageUrl"
            type="button"
            class="mcp-screenshot-link"
            title="点击放大图片"
            aria-label="放大查看截图"
            @click="openImagePreview"
          >
            <img :src="mcpImageUrl" alt="截图" class="mcp-screenshot" loading="lazy" />
          </button>
          <ChatCollapsible
            details-class="mcp-details group/mcp"
            summary-class="flex items-center gap-2 whitespace-nowrap cursor-pointer select-none leading-5 py-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            body-class="relative mt-1 ml-0.5 pl-2.5 border-l border-zinc-200 dark:border-zinc-700/80"
          >
            <template #summary>
              <span
                class="chat-collapsible-status-dot shrink-0 h-1.5 w-1.5 rounded-full"
                :class="mcpToolSummary.status === '失败' ? 'bg-rose-500' : 'bg-emerald-500'"
              ></span>
              <span class="shrink-0 text-[11px] font-medium text-inherit">{{ mcpToolSummary.status === '失败' ? '调用失败' : '调用' }}</span>
              <span class="shrink-0 text-[11px] font-medium text-inherit">{{ mcpToolSummary.provider }}</span>
              <span class="min-w-0 truncate font-mono text-[11px] text-inherit">{{ mcpToolSummary.tool }}</span>
              <span v-if="segmentTimeLabel" class="segment-time-badge ml-auto">{{ segmentTimeLabel }}</span>
              </template>
              <button
                class="absolute right-0 top-0 w-6 h-6 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center justify-center transition-colors"
                :title="copiedTarget === `mcp-${props.idx}` ? '已复制' : '复制全部 MCP 信息'"
                @click.stop.prevent="copyText(mcpToolSections.copyText, `mcp-${props.idx}`, $event)"
              >
                <svg v-if="copiedTarget !== `mcp-${props.idx}`" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8h10v10H8z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <div class="mcp-detail-doc max-h-96 overflow-y-auto pr-8 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                <template v-if="mcpToolSections.command">
                  <div class="mcp-command-card">
                    <div class="mcp-command-meta">
                      <span v-if="mcpToolSections.command.cwd" class="mcp-command-cwd" :title="mcpToolSections.command.cwd">
                        {{ mcpToolSections.command.cwd }}
                      </span>
                      <span v-if="mcpToolSections.command.timeoutSeconds" class="mcp-command-timeout">
                        超时 {{ mcpToolSections.command.timeoutSeconds }}s
                      </span>
                    </div>
                    <div class="mcp-command-code-wrap">
                      <span class="mcp-command-prompt" aria-hidden="true">$</span>
                      <pre class="mcp-command-code">{{ mcpToolSections.command.command }}</pre>
                      <button
                        type="button"
                        class="mcp-command-copy"
                        :title="copiedTarget === `mcp-command-${props.idx}` ? '已复制' : '复制命令'"
                        @click.stop.prevent="copyText(mcpToolSections.command.command, `mcp-command-${props.idx}`, $event)"
                      >
                        {{ copiedTarget === `mcp-command-${props.idx}` ? '已复制' : '复制' }}
                      </button>
                    </div>
                  </div>

                  <div class="mcp-result-card" :class="mcpToolSections.command.success === false ? 'mcp-result-card-error' : ''">
                    <div class="mcp-result-heading">
                      <span>{{ mcpToolSections.command.success === false ? '执行失败' : '执行完成' }}</span>
                      <span v-if="mcpToolSections.command.exitCode !== null" class="mcp-result-code">
                        退出码 {{ mcpToolSections.command.exitCode }}
                      </span>
                      <span v-if="mcpToolSections.command.timedOut" class="mcp-result-code">已超时</span>
                    </div>
                    <p v-if="mcpToolSections.command.summary" class="mcp-result-summary">{{ mcpToolSections.command.summary }}</p>
                    <pre v-if="mcpToolSections.command.stdout" class="mcp-output">{{ mcpToolSections.command.stdout }}</pre>
                    <pre v-if="mcpToolSections.command.stderr" class="mcp-output mcp-output-error">{{ mcpToolSections.command.stderr }}</pre>
                    <p
                      v-if="!mcpToolSections.command.summary && !mcpToolSections.command.stdout && !mcpToolSections.command.stderr"
                      class="mcp-result-empty"
                    >命令未返回文本输出</p>
                  </div>

                  <details class="mcp-raw-details">
                    <summary>查看原始调用数据</summary>
                    <div class="mcp-detail-line">参数</div>
                    <pre class="mcp-detail-body">{{ mcpToolSections.params }}</pre>
                    <div class="mcp-detail-line">结果</div>
                    <pre class="mcp-detail-body">{{ mcpToolSections.result }}</pre>
                  </details>
                </template>
                <template v-else>
                  <template v-if="mcpToolSections.params">
                    <div class="mcp-detail-line">参数</div>
                    <pre class="mcp-detail-body mcp-json-body">{{ mcpToolSections.params }}</pre>
                  </template>
                  <template v-if="mcpToolSections.result">
                    <div class="mcp-detail-line">结果</div>
                    <pre class="mcp-detail-body mcp-json-body">{{ mcpToolSections.result }}</pre>
                  </template>
                </template>
                <template v-if="mcpToolSections.error">
                  <div class="mcp-detail-line mcp-detail-line-error">错误</div>
                  <pre class="mcp-detail-body mcp-detail-body-error">{{ mcpToolSections.error }}</pre>
                </template>
              </div>
          </ChatCollapsible>
        </div>
        <div
          v-else
          class="whitespace-pre-wrap text-[13px] leading-relaxed"
          :class="[
            (props.message.role === 'user' && !isSystemNoticeMessage) ? 'text-indigo-700 dark:text-indigo-300' : '',
            isFrontPromptMessage ? 'text-left w-full front-prompt-content' : '',
            isUserMessageBubble ? 'user-message-text' : ''
          ]"
        >
          <template v-if="normalizedInlineContent.length > 0">
            <InlineContent 
              :content="normalizedInlineContent"
              :mcpIcon="props.mcpIcon"
              :appliedEdits="props.appliedEdits"
              :appliedSignatures="props.appliedSignatures"
              :actionResults="props.actionResults"
              :actionResultsBySignature="props.actionResultsBySignature"
              :plainTextMode="props.plainTextMode"
              @apply="(blockIdx) => emit('apply', props.idx, blockIdx)"
              @revert="(blockIdx) => emit('revert', props.idx, blockIdx)"
            />
          </template>
        </div>
      </div>

      <div
        v-if="isPhaseSummary"
        class="mt-3 flex w-full items-center gap-3 text-[10px] font-medium tracking-[0.16em] text-zinc-400 dark:text-zinc-500"
        :aria-label="`${phaseSummaryTitle} · 阶段 ${phaseSummaryNumber} 末`"
      >
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
        <span class="min-w-0 truncate" :title="phaseSummaryTitle">{{ phaseSummaryTitle }}</span>
        <span class="shrink-0">· 阶段 {{ phaseSummaryNumber }} 末</span>
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
      </div>

      <div
        v-if="isTaskCompleteNotice"
        class="task-boundary mt-3"
        aria-label="任务结束"
      >
        <span class="task-boundary-wave"></span>
        <strong>任务结束</strong>
        <span v-if="props.taskDurationLabel" class="task-boundary-duration">{{ props.taskDurationLabel }}</span>
        <span class="task-boundary-wave"></span>
      </div>

      <div
        v-if="props.message.role === 'user' && !isSystemNoticeMessage && attachedFiles.length > 0"
        class="mt-1.5 flex max-w-full flex-wrap justify-end gap-1"
      >
        <span
          v-for="file in attachedFiles"
          :key="file"
          class="user-attachment-pill"
          :title="file"
        >
          {{ attachedPathLabel(file) }}
        </span>
      </div>

    </div>

    <div
      v-if="isFrontPromptMessage && frontPromptDetailsOpen"
      :style="{ zIndex: frontPromptDetailsZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
      @click.self="frontPromptDetailsOpen = false"
    >
      <div class="front-prompt-detail-modal">
        <div class="front-prompt-detail-header">
          <div>
            <div class="text-sm font-bold text-zinc-900 dark:text-zinc-100">MCP 工具目录</div>
            <div class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">按工作区与端侧设备分组的 MCP 工具简表。</div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="front-prompt-detail-action"
              :title="copiedTarget === `front-prompt-details-${props.idx}` ? '已复制' : '复制详情'"
              @click.stop="copyText(frontPromptDetailsText, `front-prompt-details-${props.idx}`, $event)"
            >
              {{ copiedTarget === `front-prompt-details-${props.idx}` ? '已复制' : '复制' }}
            </button>
            <button class="front-prompt-detail-close" @click="frontPromptDetailsOpen = false">×</button>
          </div>
        </div>
        <pre class="front-prompt-detail-pre">{{ frontPromptDetailsText }}</pre>
      </div>
    </div>

    <div
      v-if="mcpImageUrl && imagePreviewOpen"
      :style="{ zIndex: imagePreviewZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-3 sm:p-6"
      @click.self="closeImagePreview"
    >
      <div
        ref="imagePreviewDialog"
        class="image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeImagePreview"
      >
        <img :src="mcpImageUrl" alt="截图大图预览" class="image-preview-full" draggable="false" />
        <button
          type="button"
          class="image-preview-close"
          aria-label="关闭图片预览"
          title="关闭"
          @click="closeImagePreview"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-boundary {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  color: rgb(113 113 122);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.task-boundary strong {
  flex: none;
  font-weight: 700;
  color: rgb(63 63 70);
}



.task-boundary-wave {
  height: 7px;
  flex: 1;
  min-width: 2rem;
  opacity: 0.45;
  background: radial-gradient(circle at 4px -1px, transparent 4px, currentColor 4.5px, transparent 5px) 0 0 / 10px 7px repeat-x;
}

.dark .task-boundary {
  color: rgb(113 113 122);
}

.dark .task-boundary strong {
  color: rgb(212 212 216);
}

.front-prompt-bubble {
  position: relative;
  height: 14rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.front-prompt-content {
  min-height: 100%;
}

.user-message-bubble {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-left: auto;
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

.mcp-detail-doc {
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-command-card,
.mcp-result-card {
  overflow: hidden;
  margin-bottom: 0.5rem;
  border: 1px solid rgb(228 228 231);
  border-radius: 8px;
  background: rgb(250 250 250);
}

.mcp-command-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  border-bottom: 1px solid rgb(228 228 231);
  color: rgb(113 113 122);
}

.mcp-command-cwd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.mcp-command-cwd::before {
  content: '目录  ';
  color: rgb(161 161 170);
}

.mcp-command-timeout {
  flex: none;
  margin-left: auto;
  color: rgb(161 161 170);
}

.mcp-command-code-wrap {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.55rem 3.25rem 0.55rem 0.6rem;
  background: rgb(24 24 27);
}

.mcp-command-prompt {
  flex: none;
  color: rgb(74 222 128);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}

.mcp-command-code,
.mcp-output {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.mcp-command-code {
  color: rgb(244 244 245);
}

.mcp-command-copy {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid rgb(82 82 91);
  border-radius: 5px;
  color: rgb(161 161 170);
  background: rgb(39 39 42);
}

.mcp-command-copy:hover {
  color: white;
  border-color: rgb(113 113 122);
}

.mcp-result-card {
  padding: 0.5rem 0.6rem;
  border-color: rgb(187 247 208);
  background: rgb(240 253 244);
}

.mcp-result-card-error {
  border-color: rgb(254 205 211);
  background: rgb(255 241 242);
}

.mcp-result-heading {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(21 128 61);
  font-weight: 700;
}

.mcp-result-card-error .mcp-result-heading {
  color: rgb(190 18 60);
}

.mcp-result-code {
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.7);
  color: rgb(113 113 122);
  font-size: 10px;
  font-weight: 500;
}

.mcp-result-summary,
.mcp-result-empty {
  margin: 0.25rem 0 0;
  color: rgb(82 82 91);
}

.mcp-output {
  max-height: 16rem;
  overflow: auto;
  margin-top: 0.4rem;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.75);
  color: rgb(63 63 70);
}

.mcp-output-error {
  color: rgb(190 18 60);
}

.mcp-raw-details {
  margin-top: 0.25rem;
}

.mcp-raw-details > summary {
  width: fit-content;
  cursor: pointer;
  color: rgb(113 113 122);
  user-select: none;
}

.mcp-raw-details[open] > summary {
  margin-bottom: 0.35rem;
}

.mcp-json-body {
  padding: 0.4rem 0.5rem;
  border: 1px solid rgb(228 228 231);
  border-radius: 6px;
  background: rgb(250 250 250);
}

.dark .mcp-command-card,
.dark .mcp-result-card,
.dark .mcp-json-body {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27 / 0.72);
}

.dark .mcp-command-meta {
  border-color: rgb(63 63 70);
}

.dark .mcp-result-card {
  border-color: rgb(20 83 45);
  background: rgb(20 83 45 / 0.18);
}

.dark .mcp-result-card-error {
  border-color: rgb(136 19 55);
  background: rgb(136 19 55 / 0.16);
}

.dark .mcp-result-heading {
  color: rgb(74 222 128);
}

.dark .mcp-result-card-error .mcp-result-heading,
.dark .mcp-output-error {
  color: rgb(251 113 133);
}

.dark .mcp-result-code,
.dark .mcp-output {
  background: rgb(9 9 11 / 0.65);
}

.dark .mcp-result-summary,
.dark .mcp-result-empty,
.dark .mcp-output {
  color: rgb(161 161 170);
}

.mcp-detail-line {
  margin: 0;
  font-weight: 500;
  color: rgb(82 82 91);
}

.mcp-detail-line-error {
  color: rgb(190 18 60);
}

.dark .mcp-detail-line {
  color: rgb(212 212 216);
}

.dark .mcp-detail-line-error {
  color: rgb(251 113 133);
}

.mcp-detail-body {
  margin: 0 0 0.35rem;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-detail-body-error {
  color: rgb(190 18 60);
}

.dark .mcp-detail-body {
  color: rgb(161 161 170);
}

.dark .mcp-detail-body-error {
  color: rgb(251 113 133);
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

.image-preview-dialog {
  position: relative;
  display: flex;
  max-width: calc(100vw - 1.5rem);
  max-height: calc(100dvh - 1.5rem);
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgb(9 9 11 / 0.96);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
  outline: none;
  overflow: hidden;
}

.image-preview-full {
  display: block;
  max-width: calc(100vw - 1.5rem);
  max-height: calc(100dvh - 1.5rem);
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
}

.image-preview-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 999px;
  background: rgb(9 9 11 / 0.72);
  color: white;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
  transition: background-color 150ms ease, transform 150ms ease;
}

.image-preview-close:hover {
  background: rgb(39 39 42 / 0.92);
  transform: scale(1.04);
}

.image-preview-close:focus-visible {
  outline: 2px solid rgb(165 180 252);
  outline-offset: 2px;
}

.segment-time-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.8);
  color: rgb(100 116 139);
  font-size: 10px;
  line-height: 1.3;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

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

.user-mcp-panel {
  max-width: min(24rem, 100%);
  border: 1px solid rgb(224 231 255);
  border-radius: 12px;
  background: rgb(238 242 255 / 0.6);
  padding: 4px 10px;
}

.dark .user-mcp-panel {
  border-color: rgba(129, 140, 248, 0.25);
  background: rgba(79, 70, 229, 0.1);
}

.dark .segment-time-badge {
  border-color: rgba(71, 85, 105, 0.65);
  background: rgba(24, 24, 27, 0.85);
  color: rgb(148 163 184);
}

.front-prompt-detail-button {
  position: sticky;
  top: 0;
  float: right;
  z-index: 2;
  margin: -2px -2px 8px 12px;
  padding: 3px 8px;
  border: 1px solid rgba(124, 58, 237, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: rgb(109 40 217);
  font-size: 11px;
  font-weight: 700;
}

.dark .front-prompt-detail-button {
  background: rgba(24, 24, 27, 0.92);
  border-color: rgba(167, 139, 250, 0.35);
  color: rgb(196 181 253);
}

.front-prompt-detail-modal {
  width: min(860px, 94vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(228 228 231);
  border-radius: 14px;
  background: white;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
}

.dark .front-prompt-detail-modal {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27);
}

.front-prompt-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgb(228 228 231);
}

.dark .front-prompt-detail-header {
  border-bottom-color: rgb(63 63 70);
}

.front-prompt-detail-action,
.front-prompt-detail-close {
  border: 1px solid rgb(228 228 231);
  border-radius: 8px;
  background: rgb(250 250 250);
  color: rgb(63 63 70);
  font-size: 12px;
  font-weight: 700;
}

.front-prompt-detail-action {
  padding: 6px 10px;
}

.front-prompt-detail-close {
  width: 30px;
  height: 30px;
  font-size: 20px;
  line-height: 1;
}

.dark .front-prompt-detail-action,
.dark .front-prompt-detail-close {
  border-color: rgb(63 63 70);
  background: rgb(39 39 42);
  color: rgb(228 228 231);
}

.front-prompt-detail-pre {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 14px 16px;
  background: rgb(9 9 11);
  color: rgb(244 244 245);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
