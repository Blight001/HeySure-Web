<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ChatMessageList from './ChatMessageList.vue'
import { getSystemPromptPreview } from '@/api/chat'
import { listMcpTools } from '@/api/mcp'
import { mergeRecoveredActionState, recoverActionStateFromMessages } from '@/utils/chatMessageActionRecovery'
import {
  buildFrontPromptCatalogText,
  buildFrontPromptMessage,
  emptyFrontPromptToolState,
  parseFrontPromptToolResponse,
  resolveEffectiveFrontPrompt,
  type FrontPromptToolState,
} from '@/utils/chatMessageFrontPrompt'
import {
  buildLiveAssistantMessage,
  buildLiveThinkingMessage,
  computeDisplayedLiveThinking,
  latestRecordedSystemPrompt,
  mergeRenderMessages,
  normalizeConversationMessages,
  type ConversationInputMessage,
  type ConversationMessage,
} from '@/utils/chatMessageNormalize'

const DEFAULT_MCP_DYNAMIC_RULE = `系统提示的[动态 MCP 说明]目录会一次性列出全部可调用工具的名称与简介，模型据此直接定位。需要参数时用 mcp.describe+tool（支持 tool 单个、tools 批量或 query 关键词搜索）取 schema；被加载的目标工具会在随后轮次直接可调用。

browser_tab 仅 7 种动作：list 获取全部页面（id/url/title/active）及 activeTab；switch+tab_id 切换到已有页；replace+url 在当前页覆盖跳转；navigate+url 新标签打开；close 关闭；back/forward 历史导航。流程：先 list，已开则 switch，当前页改址用 replace，并行任务用 navigate。`

const props = withDefaults(defineProps<{
  baseMessages: ConversationInputMessage[]
  sessionActive?: boolean
  showFrontPrompt?: boolean
  showFrontPromptPlaceholder?: boolean
  frontPromptText?: string
  frontPromptPlaceholder?: string
  mcpIcon?: string
  mcpDynamicRule?: string
  aiConfigId?: number
  aiKind?: 'assistant' | 'core'
  sessionId?: string
  liveText?: string
  liveTargetText?: string
  liveThinking?: string
  livePhase?: 'idle' | 'generating' | 'waiting_mcp'
  typingStatusText?: string
  typingStatusDetails?: string
  nowTimestamp?: number
  liveSegmentStartedAt?: number | null
  collapseLiveThinking?: boolean
  isTyping?: boolean
  stripMarkdownSymbols?: boolean
  readonly?: boolean
  appliedEdits?: string[]
  appliedSignatures?: string[]
  actionResults?: Record<string, string>
  actionResultsBySignature?: Record<string, string>
  recoverActionStateFromTags?: boolean
}>(), {
  sessionActive: false,
  showFrontPrompt: true,
  showFrontPromptPlaceholder: true,
  frontPromptText: '',
  frontPromptPlaceholder: '（当前会话尚未记录系统提示词，发送首条消息后显示实际 Prompt）',
  mcpIcon: '',
  mcpDynamicRule: DEFAULT_MCP_DYNAMIC_RULE,
  aiKind: 'assistant',
  sessionId: '',
  liveText: '',
  liveTargetText: '',
  liveThinking: '',
  livePhase: 'idle',
  typingStatusText: '',
  typingStatusDetails: '',
  nowTimestamp: 0,
  liveSegmentStartedAt: null,
  collapseLiveThinking: false,
  isTyping: false,
  stripMarkdownSymbols: false,
  readonly: false,
  appliedEdits: () => [],
  appliedSignatures: () => [],
  actionResults: () => ({}),
  actionResultsBySignature: () => ({}),
  recoverActionStateFromTags: false,
})

const emit = defineEmits<{
  (e: 'delete', renderIdx: number, message: ConversationMessage | null): void
  (e: 'recall', renderIdx: number, message: ConversationMessage | null): void
  (e: 'apply', renderIdx: number, blockIdx: number, message: ConversationMessage | null): void
  (e: 'revert', renderIdx: number, blockIdx: number, message: ConversationMessage | null): void
}>()

const normalizedMessages = computed(() => normalizeConversationMessages(props.baseMessages || []))

const recoveredActionState = computed(() => recoverActionStateFromMessages(
  normalizedMessages.value,
  !!props.recoverActionStateFromTags,
))

const mergedActionState = computed(() => mergeRecoveredActionState({
  appliedEdits: props.appliedEdits,
  appliedSignatures: props.appliedSignatures,
  actionResults: props.actionResults,
  actionResultsBySignature: props.actionResultsBySignature,
}, recoveredActionState.value))

const effectiveSystemPromptPreview = ref('')
const frontPromptToolState = ref<FrontPromptToolState>(emptyFrontPromptToolState())

const effectiveFrontPrompt = computed(() => resolveEffectiveFrontPrompt(
  props.frontPromptText,
  latestRecordedSystemPrompt(normalizedMessages.value),
  effectiveSystemPromptPreview.value,
))

const loadEffectiveSystemPromptPreview = async () => {
  effectiveSystemPromptPreview.value = ''
  try {
    const data = await getSystemPromptPreview(
      { aiKind: props.aiKind, aiConfigId: props.aiConfigId },
      { sessionId: String(props.sessionId || '').trim() || undefined },
    )
    effectiveSystemPromptPreview.value = String(data?.prompt || '').trim()
  } catch {
    effectiveSystemPromptPreview.value = ''
  }
}

const loadFrontPromptToolSchemas = async () => {
  try {
    frontPromptToolState.value = parseFrontPromptToolResponse(
      await listMcpTools({ aiConfigId: props.aiConfigId }),
      props.aiConfigId,
    )
  } catch (error: any) {
    frontPromptToolState.value = emptyFrontPromptToolState(error?.message || 'MCP schema 加载失败')
  }
}

onMounted(() => {
  void loadFrontPromptToolSchemas()
  void loadEffectiveSystemPromptPreview()
})

watch(() => [props.aiConfigId, props.sessionId, props.aiKind] as const, () => {
  void loadFrontPromptToolSchemas()
  void loadEffectiveSystemPromptPreview()
})

const liveCreatedAt = computed(() => props.liveSegmentStartedAt ?? props.nowTimestamp)
const displayedLiveThinking = computed(() => computeDisplayedLiveThinking(props.liveThinking, normalizedMessages.value))
const liveAssistantMessage = computed(() => buildLiveAssistantMessage(props.liveText, liveCreatedAt.value))
const liveThinkingMessage = computed(() => buildLiveThinkingMessage(displayedLiveThinking.value, liveCreatedAt.value))
const activeLiveThinking = computed(() => Boolean(
  liveThinkingMessage.value
  && props.livePhase === 'generating'
  && !liveAssistantMessage.value,
))

const frontPromptMessage = computed(() => buildFrontPromptMessage(
  props.sessionActive,
  props.showFrontPrompt,
  props.showFrontPromptPlaceholder,
  effectiveFrontPrompt.value,
  props.frontPromptPlaceholder,
  buildFrontPromptCatalogText(frontPromptToolState.value),
))

const renderMessages = computed(() => mergeRenderMessages(
  normalizedMessages.value,
  frontPromptMessage.value,
  liveThinkingMessage.value,
  liveAssistantMessage.value,
  props.liveTargetText,
))

const onDelete = (idx: number) => emit('delete', idx, renderMessages.value[idx] || null)
const onRecall = (idx: number) => emit('recall', idx, renderMessages.value[idx] || null)
const onApply = (msgIdx: number, blockIdx: number) => emit('apply', msgIdx, blockIdx, renderMessages.value[msgIdx] || null)
const onRevert = (msgIdx: number, blockIdx: number) => emit('revert', msgIdx, blockIdx, renderMessages.value[msgIdx] || null)
</script>

<template>
  <ChatMessageList
    :messages="renderMessages"
    :appliedEdits="mergedActionState.appliedEdits"
    :appliedSignatures="mergedActionState.appliedSignatures"
    :actionResults="mergedActionState.actionResults"
    :actionResultsBySignature="mergedActionState.actionResultsBySignature"
  :isTyping="isTyping && !liveThinkingMessage"
  thinkingText=""
  :statusText="typingStatusText"
  :statusDetails="typingStatusDetails"
  :collapseThinking="collapseLiveThinking"
  :stripMarkdownSymbols="stripMarkdownSymbols"
  :isEmpty="renderMessages.length === 0"
  :readonly="readonly"
  :mcpIcon="mcpIcon"
  :nowTimestamp="nowTimestamp"
  :activeLiveThinking="activeLiveThinking"
  @delete="onDelete"
  @recall="onRecall"
  @apply="onApply"
  @revert="onRevert"
/>
</template>
