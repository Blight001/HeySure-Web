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
  /** 工作模式列表（用于 + 面板的模式切换栏目） */
  agentModes?: any[]
  currentModeKey?: string
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
  (e: 'switchMode', modeKey: string): void
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const attachCount = computed(() =>
  props.selectedFiles.length + (props.selectedToolGroups?.length || 0))

const hasContent = computed(() => !!inputValue.value.trim())
// 参考 Claude Code：AI 生成中且输入框有内容时，发送按钮保持「发送」——点击会把这条
// 消息排队，等本轮结束后自动接上，不打断当前生成。只有生成中且输入框为空时，按钮
// 才切换成「停止」。空闲无内容时禁用。
const showStop = computed(() => props.isTyping && !hasContent.value)
const canSend = computed(() => hasContent.value)
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

onMounted(() => resizeTextarea())

watch(() => props.modelValue, async () => {
  await nextTick()
  resizeTextarea()
})
</script>

<template>
  <div class="pt-2">
    <div
      class="relative flex items-end gap-1.5 rounded-2xl acrylic-input px-1.5 py-1.5 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900/60"
    >
      <!-- 加号：附加文件 / 工具调用 -->
      <button
        @click="emit('toggleFileSelector')"
        class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
        :class="isFileSelectorOpen
          ? 'rotate-45 bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
          : 'text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-300'"
        :title="isFileSelectorOpen ? '关闭附加面板' : '附加文件、工具调用与模式切换'"
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
        :agentModes="agentModes"
        :currentModeKey="currentModeKey"
        @close="emit('closeFileSelector')"
        @navigate="emit('navigateTo', $event)"
        @navigateBack="emit('navigateBack')"
        @toggle="emit('toggleFile', $event)"
        @clear="emit('clearFiles')"
        @refresh="emit('refreshFiles')"
        @toggleToolGroup="emit('toggleToolGroup', $event)"
        @switchMode="emit('switchMode', $event)"
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
