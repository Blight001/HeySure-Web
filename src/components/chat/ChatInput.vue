<script setup lang="ts">
import FileSelector from './FileSelector.vue'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'
import { activeChatMentions, mentionToken, type ChatMention } from '@/utils/chatMentions'
import ChatMentionTooltip from './ChatMentionTooltip.vue'
import { useChatMentionTooltip } from '@/composables/useChatMentionTooltip'

interface UploadAttachmentItem {
  client_id: string
  file_ref?: string
  file_name: string
  mime_type: string
  bytes: number
  is_image: boolean
  preview_url?: string
  status: 'uploading' | 'ready'
}

interface ChatModelOption {
  id: string
  name: string
  model: string
}

const props = defineProps<{
  modelValue: string
  isTyping: boolean
  isFileSelectorOpen: boolean
  allFiles: string[]
  selectedFiles: string[]
  currentPath: string
  selectableFileRoot?: string
  toolGroups?: McpCatalogToolGroup[]
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
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const attachCount = computed(() => props.selectedFiles.length
  + (props.selectedToolGroups?.length || 0)
  + (props.uploadedAttachments?.length || 0))

const hasContent = computed(() => !!inputValue.value.trim())
const hasReadyUpload = computed(() => (props.uploadedAttachments || []).some(item => item.status === 'ready'))
// 参考 Claude Code：AI 生成中且输入框有内容时，发送按钮保持「发送」——点击会把这条
// 消息排队，等本轮结束后自动接上，不打断当前生成。只有生成中且输入框为空时，按钮
// 才切换成「停止」。空闲无内容时禁用。
const showStop = computed(() => props.isTyping && !hasContent.value && !hasReadyUpload.value)
const canSend = computed(() => (hasContent.value || hasReadyUpload.value) && !props.uploadingCount)
const editorRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const isDraggingFiles = ref(false)
const activeMentionIndex = ref(0)
const mentionDismissed = ref(false)
const mentionQuery = ref('')
const mentionDomRange = ref<Range | null>(null)
const TEXTAREA_MIN_HEIGHT = 36
const TEXTAREA_MAX_HEIGHT = 256
const { mentionTooltip, showMentionTooltip, hideMentionTooltip, keepMentionTooltip } = useChatMentionTooltip()

const createMentionElement = (document: Document, mention: ChatMention) => {
  const element = document.createElement('span')
  element.contentEditable = 'false'
  element.dataset.mentionToken = mentionToken(mention)
  element.dataset.mentionLabel = mention.label
  element.dataset.mentionType = mention.type
  element.dataset.mentionDetail = mention.type === 'mcp'
    ? `${mention.reference}\n${mention.detail}`
    : mention.detail
  element.className = mention.type === 'mcp'
    ? 'chat-input-mention chat-input-mention-mcp'
    : 'chat-input-mention chat-input-mention-file'
  element.textContent = mention.label
  return element
}

const renderEditorValue = (value: string) => {
  const editor = editorRef.value
  if (!editor) return
  const document = editor.ownerDocument
  const mentions = activeChatMentions(value, props.mentions || [])
  const occurrences = mentions
    .map(mention => ({ mention, index: value.indexOf(mentionToken(mention)) }))
    .filter(item => item.index >= 0)
    .sort((left, right) => left.index - right.index)
  editor.replaceChildren()
  let offset = 0
  for (const item of occurrences) {
    if (item.index > offset) editor.append(document.createTextNode(value.slice(offset, item.index)))
    editor.append(createMentionElement(document, item.mention))
    offset = item.index + mentionToken(item.mention).length
  }
  if (offset < value.length) editor.append(document.createTextNode(value.slice(offset)))
}

interface MentionCandidate {
  key: string
  type: 'tool' | 'file'
  label: string
  detail: string
  groupKey?: string
}

const mentionCandidates = computed<MentionCandidate[]>(() => {
  if (!mentionDomRange.value || mentionDismissed.value) return []
  const query = mentionQuery.value
  const seenTools = new Set<string>()
  const tools: MentionCandidate[] = []
  for (const group of props.toolGroups || []) {
    if (group.disabled) continue
    for (const tool of group.tools || []) {
      const name = String(tool.name || '').trim()
      if (!name || seenTools.has(name)) continue
      const searchable = `${name} ${tool.description || ''} ${group.groupLabel || ''}`.toLowerCase()
      if (query && !searchable.includes(query)) continue
      seenTools.add(name)
      tools.push({
        key: `tool:${name}`,
        type: 'tool',
        label: name,
        detail: [group.groupDescription, tool.description || group.groupLabel || 'MCP 工具']
          .map(item => String(item || '').trim())
          .filter(Boolean)
          .join('；'),
        groupKey: group.groupKey,
      })
    }
  }

  const selectableRoot = String(props.selectableFileRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const files = props.allFiles
    .map(path => String(path || '').replace(/\\/g, '/'))
    .filter(path => path && !path.endsWith('/'))
    .filter(path => !selectableRoot || path === selectableRoot || path.startsWith(`${selectableRoot}/`))
    .filter(path => !query || path.toLowerCase().includes(query))
    .map<MentionCandidate>(path => ({
      key: `file:${path}`,
      type: 'file',
      label: path.split('/').pop() || path,
      detail: path,
    }))

  return [...tools, ...files].slice(0, 10)
})

const mentionOpen = computed(() => !!mentionDomRange.value && mentionCandidates.value.length > 0)

const findTypedMentionRange = () => {
  const root = editorRef.value
  if (!root) return null
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  let resolved: Range | null = null
  while (node) {
    const text = String(node.textContent || '')
    const match = text.match(/(^|\s)@([^\s@]*)$/)
    if (match) {
      const queryLength = String(match[2] || '').length
      const range = root.ownerDocument.createRange()
      range.setStart(node, text.length - queryLength - 1)
      range.setEnd(node, text.length)
      resolved = range
    }
    node = walker.nextNode()
  }
  return resolved
}

const serializeEditor = () => {
  const root = editorRef.value
  if (!root) return ''
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (!(node instanceof HTMLElement)) return ''
    const mention = node.dataset.mentionToken
    if (mention) return mention
    if (node.tagName === 'BR') return '\n'
    const body = Array.from(node.childNodes).map(serialize).join('')
    return ['DIV', 'P'].includes(node.tagName) ? `${body}\n` : body
  }
  return Array.from(root.childNodes).map(serialize).join('').replace(/\n$/, '')
}

const updateMentionState = () => {
  if (mentionDismissed.value) return
  const root = editorRef.value
  const selection = root?.ownerDocument.getSelection()
  if (!root || !selection?.rangeCount || !selection.isCollapsed) {
    mentionDomRange.value = null
    return
  }
  const range = selection.getRangeAt(0)
  let node = range.startContainer
  let offset = range.startOffset
  // Some browsers expose a caret after the last text child as
  // (contenteditable root, child index) instead of (text node, text offset).
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const previous = node.childNodes[offset - 1]
    if (previous?.nodeType === Node.TEXT_NODE) {
      node = previous
      offset = String(previous.textContent || '').length
    }
  }
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) {
    mentionDomRange.value = null
    return
  }
  const before = String(node.textContent || '').slice(0, offset)
  const match = before.match(/(^|\s)@([^\s@]*)$/)
  if (!match) {
    mentionDomRange.value = null
    return
  }
  const query = String(match[2] || '')
  const tokenRange = root.ownerDocument.createRange()
  tokenRange.setStart(node, offset - query.length - 1)
  tokenRange.setEnd(node, offset)
  mentionQuery.value = query.toLowerCase()
  mentionDomRange.value = tokenRange
}

const selectMention = async (candidate = mentionCandidates.value[activeMentionIndex.value]) => {
  const range = findTypedMentionRange() || mentionDomRange.value
  if (!candidate || !range) return
  const document = editorRef.value?.ownerDocument
  if (!document) return
  const mention = createMentionElement(document, {
    type: candidate.type === 'tool' ? 'mcp' : 'file',
    label: candidate.label,
    reference: candidate.type === 'tool' ? candidate.label : candidate.detail,
    detail: candidate.detail,
  })
  const spacer = document.createTextNode(' ')
  range.deleteContents()
  range.insertNode(spacer)
  range.insertNode(mention)
  const selection = document.getSelection()
  const caret = document.createRange()
  caret.setStartAfter(spacer)
  caret.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(caret)
  emit('addMention', {
    type: candidate.type === 'tool' ? 'mcp' : 'file',
    label: candidate.label,
    reference: candidate.type === 'tool' ? candidate.label : candidate.detail,
    detail: candidate.detail,
  })
  if (candidate.type === 'tool' && !(props.selectedToolNames || []).includes(candidate.label)) {
    emit('toggleTool', candidate.label)
  }
  if (candidate.type === 'file' && !props.selectedFiles.includes(candidate.detail)) {
    emit('toggleFile', candidate.detail)
  }
  mentionDismissed.value = true
  mentionDomRange.value = null
  emit('update:modelValue', serializeEditor())
  await nextTick()
  editorRef.value?.focus()
  resizeTextarea()
}

// 触屏设备（手机/平板）上回车应换行，由发送按钮触发发送，避免软键盘回车误发
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

const handleKeydown = (e: KeyboardEvent) => {
  if (mentionOpen.value) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      void selectMention()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const direction = e.key === 'ArrowDown' ? 1 : -1
      const count = mentionCandidates.value.length
      activeMentionIndex.value = (activeMentionIndex.value + direction + count) % count
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      mentionDismissed.value = true
      return
    }
  }
  if (isCoarsePointer) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    // 回车只负责发送，且永远不触发停止：有内容才发（生成中则排队），
    // 空内容（此时按钮为停止态）直接忽略，避免回车误停当前生成。
    if (hasContent.value) emit('send')
  }
}

const handlePrimaryAction = () => {
  if (showStop.value) {
    emit('stop')
    return
  }
  if (canSend.value) emit('send')
}

const handleInput = (e: Event) => {
  const target = e.target as HTMLDivElement
  mentionDismissed.value = false
  activeMentionIndex.value = 0
  emit('update:modelValue', serializeEditor())
  updateMentionState()
  resizeTextarea(target)
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
  emit('update:modelValue', serializeEditor())
  updateMentionState()
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => {
  renderEditorValue(props.modelValue)
  resizeTextarea()
})

useDismissibleLayer({
  open: () => props.isFileSelectorOpen,
  roots: [rootRef],
  onDismiss: () => emit('closeFileSelector'),
})

watch(() => [props.modelValue, props.mentions] as const, async ([value]) => {
  await nextTick()
  const expectedTokens = activeChatMentions(value, props.mentions || []).map(mentionToken)
  const renderedTokens = Array.from(editorRef.value?.querySelectorAll<HTMLElement>('[data-mention-token]') || [])
    .map(element => String(element.dataset.mentionToken || ''))
  if (editorRef.value && (serializeEditor() !== value || expectedTokens.join('\n') !== renderedTokens.join('\n'))) {
    renderEditorValue(value)
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
    <div
      v-if="(uploadedAttachments?.length || 0) > 0"
      class="mb-2 flex max-w-full justify-end gap-1.5 overflow-x-auto px-1 pb-1"
    >
      <div
        v-for="item in uploadedAttachments"
        :key="item.client_id"
        class="relative flex w-[132px] shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/85 px-2 py-1.5 pr-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/85"
        :title="`${item.file_name}\n${item.status === 'uploading' ? '正在上传…' : formatBytes(item.bytes)}`"
      >
        <img
          v-if="item.is_image && item.preview_url"
          :src="item.preview_url"
          :alt="item.file_name"
          class="h-8 w-8 shrink-0 rounded-md object-cover"
        />
        <div v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25H6A2.25 2.25 0 0 0 3.75 4.5v15A2.25 2.25 0 0 0 6 21.75h12A2.25 2.25 0 0 0 20.25 19.5V6.75L15.75 2.25Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 2.25V6.75H20.25" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{{ item.file_name }}</div>
          <div class="mt-0.5 text-[10px] text-zinc-400">
            {{ item.status === 'uploading' ? '正在上传…' : formatBytes(item.bytes) }}
          </div>
        </div>
        <button
          type="button"
          class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
          title="移除附件"
          @click="emit('removeUpload', item.client_id)"
        >×</button>
      </div>
    </div>
    <div
      class="relative flex items-end gap-1.5 rounded-2xl acrylic-input px-1.5 py-1.5 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900/60"
      :class="isDraggingFiles ? 'ring-2 ring-indigo-500 border-indigo-400' : ''"
    >
      <div
        v-if="mentionOpen"
        class="absolute bottom-full left-10 right-10 z-[110] mb-2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div class="flex items-center justify-between px-2 py-1 text-[10px] text-zinc-400">
          <span>@ 引用 MCP 或文件</span>
          <span class="hidden sm:inline">Tab 选择首项 · ↑↓ 切换</span>
        </div>
        <button
          v-for="(candidate, index) in mentionCandidates"
          :key="candidate.key"
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
          :class="index === activeMentionIndex ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800'"
          @mouseenter="activeMentionIndex = index"
          @mousedown.prevent
          @click.prevent.stop="selectMention(candidate)"
        >
          <span
            class="flex h-5 min-w-9 shrink-0 items-center justify-center rounded-md px-1 text-[9px] font-medium"
            :class="candidate.type === 'tool' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'"
          >{{ candidate.type === 'tool' ? 'MCP' : '文件' }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-mono text-[11px]">{{ candidate.label }}</span>
            <span class="block truncate text-[10px] font-normal text-zinc-400">{{ candidate.detail }}</span>
          </span>
        </button>
      </div>

      <!-- 加号：附加文件 / 动态 MCP 范围 -->
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

      <button
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
        :class="showStop
          ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30 hover:bg-rose-500 active:scale-95'
          : canSend
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 hover:bg-indigo-500 active:scale-95'
            : 'cursor-not-allowed bg-zinc-100/60 text-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-600'"
        @click="handlePrimaryAction"
        :disabled="!showStop && !canSend"
        :title="showStop ? '终止生成' : '发送'"
      >
        <svg v-if="showStop" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 -translate-x-px">
          <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
        </svg>
      </button>
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

.dark .chat-input-textarea :deep(.chat-input-mention-mcp) {
  color: rgb(110 231 183);
}

.dark .chat-input-textarea :deep(.chat-input-mention-file) {
  color: rgb(125 211 252);
}
</style>
