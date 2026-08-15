<script setup lang="ts">
import { ref } from 'vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { useCopiedTarget } from '@/utils/chatMessageCopy'

const props = defineProps<{
  detailsText: string
  idx: number
}>()

const frontPromptDetailsOpen = ref(false)
const frontPromptDetailsZIndex = usePopupZIndex(frontPromptDetailsOpen)
const { copiedTarget, copyTarget } = useCopiedTarget()
const copyKey = () => `front-prompt-details-${props.idx}`
</script>

<template>
  <button
    v-if="detailsText"
    class="front-prompt-detail-button"
    @click.stop="frontPromptDetailsOpen = true"
  >
    详情
  </button>

  <div
    v-if="frontPromptDetailsOpen"
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
            :title="copiedTarget === copyKey() ? '已复制' : '复制详情'"
            @click.stop="copyTarget(detailsText, copyKey(), $event)"
          >
            {{ copiedTarget === copyKey() ? '已复制' : '复制' }}
          </button>
          <button class="front-prompt-detail-close" @click="frontPromptDetailsOpen = false">×</button>
        </div>
      </div>
      <pre class="front-prompt-detail-pre">{{ detailsText }}</pre>
    </div>
  </div>
</template>

<style scoped>
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
