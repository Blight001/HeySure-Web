<script setup lang="ts">
import { computed, ref } from 'vue'

defineProps<{ src: string; alt?: string }>()

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const interacting = ref(false)
const pointers = new Map<number, { x: number; y: number }>()
let dragOrigin = { x: 0, y: 0, offsetX: 0, offsetY: 0 }
let pinchOrigin = { distance: 0, scale: 1 }

const imageTransform = computed(() => `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`)
const scaleLabel = computed(() => `${Math.round(scale.value * 100)}%`)

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
const pointerDistance = () => {
  const [first, second] = Array.from(pointers.values())
  return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0
}

const reset = () => {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

const setScale = (next: number) => {
  scale.value = clampScale(next)
  if (scale.value <= 1) {
    offsetX.value = 0
    offsetY.value = 0
  }
}

const zoomBy = (amount: number) => setScale(scale.value + amount)

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  setScale(scale.value * (event.deltaY < 0 ? 1.15 : 0.87))
}

const onPointerDown = (event: PointerEvent) => {
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  interacting.value = true
  if (pointers.size === 1) {
    dragOrigin = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value }
  } else if (pointers.size === 2) {
    pinchOrigin = { distance: pointerDistance(), scale: scale.value }
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size >= 2) {
    const distance = pointerDistance()
    if (pinchOrigin.distance > 0) setScale(pinchOrigin.scale * distance / pinchOrigin.distance)
    return
  }
  if (scale.value > 1) {
    offsetX.value = dragOrigin.offsetX + event.clientX - dragOrigin.x
    offsetY.value = dragOrigin.offsetY + event.clientY - dragOrigin.y
  }
}

const onPointerEnd = (event: PointerEvent) => {
  pointers.delete(event.pointerId)
  interacting.value = pointers.size > 0
  const remaining = Array.from(pointers.values())[0]
  if (remaining) dragOrigin = { x: remaining.x, y: remaining.y, offsetX: offsetX.value, offsetY: offsetY.value }
}

const onDoubleClick = () => setScale(scale.value > 1 ? 1 : 2)
</script>

<template>
  <div
    class="zoomable-image relative h-full w-full overflow-hidden bg-zinc-950"
    :class="scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @dblclick="onDoubleClick"
  >
    <img
      :src="src"
      :alt="alt || '图片预览'"
      class="pointer-events-none h-full w-full select-none object-contain"
      :class="interacting ? '' : 'transition-transform duration-150 ease-out'"
      :style="{ transform: imageTransform }"
      draggable="false"
    />
    <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-black/65 p-1 text-white shadow-lg backdrop-blur">
      <button type="button" class="h-8 w-8 rounded-lg text-lg font-normal hover:bg-white/15 disabled:opacity-40" :disabled="scale <= MIN_SCALE" aria-label="缩小" @pointerdown.stop @click.stop="zoomBy(-0.25)">−</button>
      <button type="button" class="min-w-14 rounded-lg px-2 py-1.5 text-xs font-normal hover:bg-white/15" aria-label="重置缩放" @pointerdown.stop @click.stop="reset">{{ scaleLabel }}</button>
      <button type="button" class="h-8 w-8 rounded-lg text-lg font-normal hover:bg-white/15 disabled:opacity-40" :disabled="scale >= MAX_SCALE" aria-label="放大" @pointerdown.stop @click.stop="zoomBy(0.25)">+</button>
    </div>
  </div>
</template>

<style scoped>
.zoomable-image {
  touch-action: none;
  overscroll-behavior: contain;
}
</style>
