<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import FileSelector from './FileSelector.vue'
import ChatMentionTooltip from './ChatMentionTooltip.vue'
import ChatInputAttachmentChips from './input/ChatInputAttachmentChips.vue'
import ChatInputMentionList from './input/ChatInputMentionList.vue'
import ChatInputSendButton from './input/ChatInputSendButton.vue'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'
import { useChatMentionTooltip } from '@/composables/useChatMentionTooltip'
import type { ChatMention } from '@/utils/chatMentions'
import {
  editorMentionTokens,
  expectedMentionTokens,
  findTypedMentionRange,
  insertMentionAtRange,
  mentionFromCandidate,
  mentionRangeFromSelection,
  renderEditorValue,
  serializeEditor,
} from '@/utils/chatInputEditor'
import { buildMentionCandidates, type SkillMentionCandidate, type UploadAttachmentItem } from '@/utils/chatInputMentions'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

interface ChatModelOption {
  id: string
  name: string
  model: string
}

const props = defineProps<{
  modelValue: string
  isTyping: boolean
  isSubmitting?: boolean
  queueMode?: boolean
  isFileSelectorOpen: boolean
  allFiles: string[]
  selectedFiles: string[]
  currentPath: string
  selectableFileRoot?: string
  toolGroups?: McpCatalogToolGroup[]
  skills?: SkillMentionCandidate[]
  selectedToolGroups?: string[]
  selectedToolNames?: string[]
  mentions?: ChatMention[]
  uploadedAttachments?: UploadAttachmentItem[]
  uploadingCount?: number
  modelOptions?: ChatModelOption[]
  selectedModelId?: string
  modelSwitching?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'toggleFileSelector'): void
  (e: 'closeFileSelector'): void
  (e: 'navigateTo', path: string): void
  (e: 'navigatePath', path: string): void
  (e: 'navigateBack'): void
  (e: 'toggleFile', file: string): void
  (e: 'clearFiles'): void
  (e: 'refreshFiles'): void
  (e: 'toggleToolGroup', groupKey: string): void
  (e: 'toggleTool', toolName: string): void
  (e: 'uploadFiles', files: File[]): void
  (e: 'removeUpload', clientId: string): void
  (e: 'selectModel', modelId: string): void
  (e: 'addMention', mention: ChatMention): void
  (e: 'refreshMentions'): void
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const attachCount = computed(() => props.selectedFiles.length
  + (props.selectedToolGroups?.length || 0)
  + (props.uploadedAttachments?.length || 0))

const hasContent = computed(() => !!inputValue.value.trim())
const hasReadyUpload = computed(() => (props.uploadedAttachments || []).some(item => item.status === 'ready'))
const showStop = computed(() => !props.isSubmitting && props.isTyping && !hasContent.value && !hasReadyUpload.value)
const canSend = computed(() => !props.isSubmitting && (hasContent.value || hasReadyUpload.value) && !props.uploadingCount)
const editorRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const isDraggingFiles = ref(false)
const activeMentionIndex = ref(0)
const mentionDismissed = ref(false)
const mentionQuery = ref('')
const mentionDomRange = ref<Range | null>(null)
let lastMentionRefreshAt = 0
const TEXTAREA_MIN_HEIGHT = 36
const TEXTAREA_MAX_HEIGHT = 256
const { mentionTooltip, showMentionTooltip, hideMentionTooltip, keepMentionTooltip } = useChatMentionTooltip()

const mentionCandidates = computed(() => buildMentionCandidates(
  !!mentionDomRange.value && !mentionDismissed.value,
  props.toolGroups,
  props.allFiles,
  props.selectableFileRoot,
  mentionQuery.value,
  props.skills,
))
const mentionOpen = computed(() => !!mentionDomRange.value && mentionCandidates.value.length > 0)

const updateMentionState = () => {
  if (mentionDismissed.value) return
  const resolved = mentionRangeFromSelection(editorRef.value)
  mentionQuery.value = resolved?.query || ''
  mentionDomRange.value = resolved?.range || null
  if (resolved && Date.now() - lastMentionRefreshAt > 1000) {
    lastMentionRefreshAt = Date.now()
    emit('refreshMentions')
  }
}

const selectMention = async (candidate = mentionCandidates.value[activeMentionIndex.value]) => {
  const range = findTypedMentionRange(editorRef.value) || mentionDomRange.value
  const document = editorRef.value?.ownerDocument
  if (!candidate || !range || !document) return
  const mention = mentionFromCandidate(candidate)
  insertMentionAtRange(document, range, mention)
  emit('addMention', mention)
  if (candidate.type === 'tool' && !(props.selectedToolNames || []).includes(candidate.label)) {
    emit('toggleTool', candidate.label)
  }
  if (candidate.type === 'file' && !props.selectedFiles.includes(candidate.detail)) {
    emit('toggleFile', candidate.detail)
  }
  mentionDismissed.value = true
  mentionDomRange.value = null
  emit('update:modelValue', serializeEditor(editorRef.value))
  await nextTick()
  editorRef.value?.focus()
  resizeTextarea()
}

const isCoarsePointer = typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches

const resizeTextarea = (target = editorRef.value) => {
  if (!target) return
  const currentHeight = target.offsetHeight || TEXTAREA_MIN_HEIGHT
  target.style.height = `${currentHeight}px`
  target.style.height = 'auto'
  const nextHeight = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(target.scrollHeight, TEXTAREA_MAX_HEIGHT))
  target.style.height = `${currentHeight}px`
  void target.offsetHeight
  window.requestAnimationFrame(() => {
    target.style.height = `${nextHeight}px`
  })
  target.style.overflowY = target.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
}

const handleMentionKey = (e: KeyboardEvent) => {
  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault()
    void selectMention()
    return true
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const direction = e.key === 'ArrowDown' ? 1 : -1
    const count = mentionCandidates.value.length
    activeMentionIndex.value = (activeMentionIndex.value + direction + count) % count
    return true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    mentionDismissed.value = true
    return true
  }
  return false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (mentionOpen.value && handleMentionKey(e)) return
  if (isCoarsePointer) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (hasContent.value) emit('send')
  }
}

const handlePrimaryAction = () => {
  if (props.isSubmitting) return
  if (showStop.value) {
    emit('stop')
    return
  }
  if (canSend.value) emit('send')
}

const focusEditor = async () => {
  await nextTick()
  editorRef.value?.focus()
}

defineExpose({ focusEditor })

const handleInput = (e: Event) => {
  mentionDismissed.value = false
  activeMentionIndex.value = 0
  emit('update:modelValue', serializeEditor(editorRef.value))
  updateMentionState()
  resizeTextarea(e.target as HTMLDivElement)
}

const emitFiles = (files: File[]) => {
  const valid = files.filter(file => file.size > 0)
  if (valid.length) emit('uploadFiles', valid)
}

const handleFileInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  emitFiles(Array.from(input.files || []))
  input.value = ''
}

const handleDrop = (event: DragEvent) => {
  isDraggingFiles.value = false
  emitFiles(Array.from(event.dataTransfer?.files || []))
}

const handlePaste = (event: ClipboardEvent) => {
  const files = Array.from(event.clipboardData?.files || [])
  if (files.length) {
    event.preventDefault()
    emitFiles(files)
    return
  }
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text) return
  event.preventDefault()
  const selection = editorRef.value?.ownerDocument.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = editorRef.value?.ownerDocument.createTextNode(text)
  if (!node) return
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  emit('update:modelValue', serializeEditor(editorRef.value))
  updateMentionState()
}

onMounted(() => {
  renderEditorValue(editorRef.value, props.modelValue, props.mentions || [])
  resizeTextarea()
})

useDismissibleLayer({
  open: () => props.isFileSelectorOpen,
  roots: [rootRef],
  onDismiss: () => emit('closeFileSelector'),
})

watch(() => [props.modelValue, props.mentions] as const, async ([value]) => {
  await nextTick()
  const expected = expectedMentionTokens(value, props.mentions || [])
  const rendered = editorMentionTokens(editorRef.value)
  if (editorRef.value && (serializeEditor(editorRef.value) !== value || expected.join('\n') !== rendered.join('\n'))) {
    renderEditorValue(editorRef.value, value, props.mentions || [])
  }
  resizeTextarea()
}, { deep: true })
</script>

<template>
  <div
    ref="rootRef"
    class="pt-2"
    @dragenter.prevent="isDraggingFiles = true"
    @dragover.prevent="isDraggingFiles = true"
    @dragleave.self="isDraggingFiles = false"
    @drop.prevent="handleDrop"
  >
    <ChatInputAttachmentChips
      :items="uploadedAttachments || []"
      @remove="emit('removeUpload', $event)"
    />
    <div
      class="relative flex items-end gap-1.5 rounded-2xl acrylic-input px-1.5 py-1.5 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900/60"
      :class="isDraggingFiles ? 'ring-2 ring-indigo-500 border-indigo-400' : ''"
    >
      <ChatInputMentionList
        v-if="mentionOpen"
        :candidates="mentionCandidates"
        :active-index="activeMentionIndex"
        @hover="activeMentionIndex = $event"
        @select="selectMention"
      />

      <button
        @click="emit('toggleFileSelector')"
        class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
        :class="isFileSelectorOpen
          ? 'rotate-45 bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
          : 'text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-300'"
        :title="isFileSelectorOpen ? '关闭附加面板' : '附加文件与选择 MCP 范围'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span
          v-if="attachCount > 0 && !isFileSelectorOpen"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm"
        >{{ attachCount }}</span>
      </button>

      <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput" />

      <FileSelector
        :isOpen="isFileSelectorOpen"
        :allFiles="allFiles"
        :selectedFiles="selectedFiles"
        :currentPath="currentPath"
        :selectable-file-root="selectableFileRoot"
        :toolGroups="toolGroups"
        :selectedToolGroups="selectedToolGroups"
        :selectedToolNames="selectedToolNames"
        :modelOptions="modelOptions"
        :selectedModelId="selectedModelId"
        :modelSwitching="modelSwitching"
        @close="emit('closeFileSelector')"
        @navigate="emit('navigateTo', $event)"
        @navigatePath="emit('navigatePath', $event)"
        @navigateBack="emit('navigateBack')"
        @toggle="emit('toggleFile', $event)"
        @clear="emit('clearFiles')"
        @refresh="emit('refreshFiles')"
        @pickLocalFiles="fileInputRef?.click()"
        @toggleToolGroup="emit('toggleToolGroup', $event)"
        @toggleTool="emit('toggleTool', $event)"
        @selectModel="emit('selectModel', $event)"
      />

      <div
        ref="editorRef"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        data-placeholder="给主脑发送指令..."
        class="chat-input-textarea box-border h-9 max-h-64 min-h-[36px] flex-1 overflow-hidden border-0 bg-transparent px-1.5 py-[7px] text-sm leading-[22px] text-zinc-800 transition-[height] duration-300 ease-linear focus:outline-none focus:ring-0 dark:text-zinc-100"
        @keydown="handleKeydown"
        @input="handleInput"
        @click="updateMentionState"
        @keyup="updateMentionState"
        @paste="handlePaste"
        @pointerover="showMentionTooltip"
        @pointerout="hideMentionTooltip"
      ></div>

      <ChatInputSendButton
        :show-stop="showStop"
        :can-send="canSend"
        :submitting="!!isSubmitting"
        :queue-mode="!!queueMode"
        @click="handlePrimaryAction"
      />
    </div>
    <ChatMentionTooltip :state="mentionTooltip" @keep="keepMentionTooltip" @hide="hideMentionTooltip" />
  </div>
</template>

<style scoped>
.chat-input-textarea {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chat-input-textarea::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.chat-input-textarea:empty::before {
  color: rgb(161 161 170);
  content: attr(data-placeholder);
  pointer-events: none;
}

.chat-input-textarea :deep(.chat-input-mention) {
  display: inline;
  font-weight: 650;
  white-space: nowrap;
}

.chat-input-textarea :deep(.chat-input-mention-mcp) {
  color: rgb(5 150 105);
}

.chat-input-textarea :deep(.chat-input-mention-file) {
  color: rgb(2 132 199);
}

.chat-input-textarea :deep(.chat-input-mention-skill) {
  color: rgb(124 58 237);
}

.dark .chat-input-textarea :deep(.chat-input-mention-mcp) {
  color: rgb(110 231 183);
}

.dark .chat-input-textarea :deep(.chat-input-mention-file) {
  color: rgb(125 211 252);
}

.dark .chat-input-textarea :deep(.chat-input-mention-skill) {
  color: rgb(196 181 253);
}
</style>
