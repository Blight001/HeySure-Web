<script setup lang="ts">
import FileSelector from './FileSelector.vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { McpCatalogToolGroup } from '@/utils/mcpToolCatalog'

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
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'toggleFileSelector'): void
  (e: 'closeFileSelector'): void
  (e: 'navigateTo', path: string): void
  (e: 'navigateBack'): void
  (e: 'toggleFile', file: string): void
  (e: 'clearFiles'): void
  (e: 'refreshFiles'): void
  (e: 'toggleToolGroup', groupKey: string): void
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const attachCount = computed(() =>
  props.selectedFiles.length + (props.selectedToolGroups?.length || 0))

const canSend = computed(() => !!inputValue.value.trim() && !props.isTyping)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const TEXTAREA_MIN_HEIGHT = 36
const TEXTAREA_MAX_HEIGHT = 146

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
    emit('send')
  }
}

const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  resizeTextarea(target)
}

onMounted(() => resizeTextarea())

watch(() => props.modelValue, async () => {
  await nextTick()
  resizeTextarea()
})
</script>

<template>
  <div class="pt-2">
    <div
      class="relative flex items-end gap-1.5 rounded-2xl border border-zinc-200/90 bg-white px-1.5 py-1.5 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <!-- 加号：附加文件 / 工具调用 -->
      <button
        @click="emit('toggleFileSelector')"
        class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
        :class="isFileSelectorOpen
          ? 'rotate-45 bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
          : 'text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-300'"
        :title="isFileSelectorOpen ? '关闭附加面板' : '附加文件与工具调用'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span
          v-if="attachCount > 0 && !isFileSelectorOpen"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm"
        >{{ attachCount }}</span>
      </button>

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
        @toggleToolGroup="emit('toggleToolGroup', $event)"
      />

      <textarea
        ref="textareaRef"
        v-model="inputValue"
        rows="1"
        class="chat-input-textarea box-border h-9 max-h-[146px] min-h-[36px] flex-1 resize-none overflow-hidden border-0 bg-transparent px-1.5 py-[7px] text-sm leading-[22px] text-zinc-800 placeholder:text-zinc-400 transition-[height] duration-300 ease-linear focus:outline-none focus:ring-0 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        placeholder="给主脑发送指令..."
        @keydown="handleKeydown"
        @input="handleInput"
      ></textarea>

      <button
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
        :class="canSend
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 hover:bg-indigo-500 active:scale-95'
          : 'cursor-not-allowed bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600'"
        @click="emit('send')"
        :disabled="!canSend"
        title="发送"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 -translate-x-px">
          <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
        </svg>
      </button>
    </div>
  </div>
</template>
