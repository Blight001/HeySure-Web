<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import ZoomableImage from '../ZoomableImage.vue'

const props = defineProps<{
  open: boolean
  src: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const imagePreviewDialog = ref<HTMLElement | null>(null)
const imagePreviewZIndex = usePopupZIndex(() => props.open)

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    imagePreviewDialog.value?.focus()
  }
})
</script>

<template>
  <!--
    Chat messages may live below a transformed/contained scrolling pane. A
    `position: fixed` element inside such an ancestor is fixed to that pane,
    not to the viewport, which made the preview appear in a small embedded
    area. Teleport the overlay to body so it always covers the whole window.
  -->
  <Teleport to="body">
    <div
      v-if="src && open"
      :style="{ zIndex: imagePreviewZIndex }"
      class="fixed inset-0 modal-overlay flex items-center justify-center p-0"
      @click.self="emit('close')"
    >
      <div
        ref="imagePreviewDialog"
        class="image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        tabindex="-1"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <ZoomableImage :src="src" alt="截图大图预览" />
        <button
          type="button"
          class="image-preview-close"
          aria-label="关闭图片预览"
          title="关闭"
          @click="emit('close')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-preview-dialog {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  background: rgb(9 9 11 / 0.96);
  outline: none;
  overflow: hidden;
}

.image-preview-close {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  right: calc(10px + env(safe-area-inset-right));
  display: flex;
  /* Keep a comfortable touch target on phones (44px minimum). */
  width: 44px;
  height: 44px;
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
</style>
