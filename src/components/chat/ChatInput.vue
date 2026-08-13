<script setup lang="ts">
import FileSelector from './FileSelector.vue'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDismissibleLayer } from '@/composables/useDismissibleLayer'

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
  (e: 'navigateBack'): void
  (e: 'toggleFile', file: string): void
  (e: 'clearFiles'): void
  (e: 'refreshFiles'): void
  (e: 'toggleToolGroup', groupKey: string): void
  (e: 'uploadFiles', files: File[]): void
  (e: 'removeUpload', clientId: string): void
  (e: 'selectModel', modelId: string): void
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
const selectedModel = computed(() =>
  (props.modelOptions || []).find(item => item.id === props.selectedModelId) || null)
const showModelSwitcher = computed(() => (props.modelOptions || []).length > 0)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const modelSwitcherRef = ref<HTMLElement | null>(null)
const modelMenuOpen = ref(false)
const isDraggingFiles = ref(false)
const TEXTAREA_MIN_HEIGHT = 36
const TEXTAREA_MAX_HEIGHT = 256

// 触屏设备（手机/平板）上回车应换行，由发送按钮触发发送，避免软键盘回车误发
const isCoarsePointer = typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches

const resizeTextarea = (target = textareaRef.value) => {
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
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
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
  if (!files.length) return
  event.preventDefault()
  emitFiles(files)
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => resizeTextarea())

useDismissibleLayer({
  open: () => props.isFileSelectorOpen,
  roots: [rootRef],
  onDismiss: () => emit('closeFileSelector'),
})

useDismissibleLayer({
  open: () => modelMenuOpen.value,
  roots: [modelSwitcherRef],
  onDismiss: () => { modelMenuOpen.value = false },
})

const selectModel = (modelId: string) => {
  modelMenuOpen.value = false
  if (modelId && modelId !== props.selectedModelId) emit('selectModel', modelId)
}

watch(() => props.modelValue, async () => {
  await nextTick()
  resizeTextarea()
})
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
        @close="emit('closeFileSelector')"
        @navigate="emit('navigateTo', $event)"
        @navigateBack="emit('navigateBack')"
        @toggle="emit('toggleFile', $event)"
        @clear="emit('clearFiles')"
        @refresh="emit('refreshFiles')"
        @pickLocalFiles="fileInputRef?.click()"
        @toggleToolGroup="emit('toggleToolGroup', $event)"
      />

      <textarea
        ref="textareaRef"
        v-model="inputValue"
        rows="1"
        class="chat-input-textarea box-border h-9 max-h-64 min-h-[36px] flex-1 resize-none overflow-hidden border-0 bg-transparent px-1.5 py-[7px] text-sm leading-[22px] text-zinc-800 placeholder:text-zinc-400 transition-[height] duration-300 ease-linear focus:outline-none focus:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        placeholder="给主脑发送指令..."
        @keydown="handleKeydown"
        @input="handleInput"
        @paste="handlePaste"
      ></textarea>

      <div v-if="showModelSwitcher" ref="modelSwitcherRef" class="relative shrink-0">
        <button
          type="button"
          class="flex h-9 max-w-[7.5rem] items-center gap-1 rounded-full border border-zinc-200 bg-white/70 px-2 text-[11px] text-zinc-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-indigo-600 dark:hover:text-indigo-300"
          :disabled="modelSwitching"
          :title="modelSwitching ? '正在切换模型' : `当前模型：${selectedModel?.name || '请选择'}`"
          :aria-expanded="modelMenuOpen"
          @click="modelMenuOpen = !modelMenuOpen"
        >
          <span class="truncate">{{ modelSwitching ? '切换中…' : (selectedModel?.name || '选择模型') }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0 transition-transform" :class="modelMenuOpen ? '' : 'rotate-180'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 15l-7-7-7 7" />
          </svg>
        </button>
        <div
          v-if="modelMenuOpen"
          class="absolute bottom-full right-0 z-50 mb-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white/95 p-1 shadow-2xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
        >
          <div class="max-h-60 overflow-y-auto">
            <button
              v-for="option in modelOptions"
              :key="option.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              :class="option.id === selectedModelId ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200'"
              @click="selectModel(option.id)"
            >
              <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ option.name }}</span>
              <span v-if="option.id === selectedModelId" class="shrink-0 text-xs">✓</span>
            </button>
          </div>
        </div>
      </div>

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
</style>
