<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Direction = 'nw' | 'ne' | 'sw' | 'se'
type Point = { x: number; y: number }
type WindowRect = { left: number; top: number; width: number; height: number }

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  title?: string
}>(), { alt: '远程画面', title: '远程画面' })

const open = ref(false)
const rect = ref<WindowRect>({ left: 0, top: 0, width: 360, height: 240 })
const dragging = ref(false)
const resizing = ref<Direction | null>(null)
const pointers = new Map<number, Point>()
let dragStart: { point: Point; rect: WindowRect } | null = null
let pinchStart: { distance: number; rect: WindowRect } | null = null

const viewport = () => ({
  width: window.visualViewport?.width || window.innerWidth,
  height: window.visualViewport?.height || window.innerHeight,
})

const clampRect = (value: WindowRect): WindowRect => {
  const view = viewport()
  const width = Math.min(Math.max(value.width, 220), Math.max(220, view.width - 16))
  const height = Math.min(Math.max(value.height, 150), Math.max(150, view.height - 16))
  return {
    width,
    height,
    left: Math.min(Math.max(value.left, 8), Math.max(8, view.width - width - 8)),
    top: Math.min(Math.max(value.top, 8), Math.max(8, view.height - height - 8)),
  }
}

const style = computed(() => ({
  left: `${rect.value.left}px`,
  top: `${rect.value.top}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}))

const centerWindow = () => {
  const view = viewport()
  rect.value = clampRect({
    ...rect.value,
    left: (view.width - rect.value.width) / 2,
    top: Math.max(16, (view.height - rect.value.height) / 2),
  })
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const beginPointer = (event: PointerEvent, mode: 'drag' | Direction) => {
  if (!open.value) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (event.pointerType === 'touch' && pointers.size >= 2) {
    const [first, second] = Array.from(pointers.values())
    pinchStart = { distance: Math.max(1, distance(first, second)), rect: { ...rect.value } }
    dragging.value = false
    resizing.value = null
    return
  }
  if (mode === 'drag') {
    dragging.value = true
    dragStart = { point: { x: event.clientX, y: event.clientY }, rect: { ...rect.value } }
  } else {
    resizing.value = mode
    dragStart = { point: { x: event.clientX, y: event.clientY }, rect: { ...rect.value } }
  }
  event.preventDefault()
}

const movePointer = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinchStart && pointers.size >= 2) {
    const [first, second] = Array.from(pointers.values())
    const scale = distance(first, second) / pinchStart.distance
    rect.value = clampRect({ ...pinchStart.rect, width: pinchStart.rect.width * scale, height: pinchStart.rect.height * scale })
    event.preventDefault()
    return
  }
  if (!dragStart) return
  const dx = event.clientX - dragStart.point.x
  const dy = event.clientY - dragStart.point.y
  if (dragging.value) rect.value = clampRect({ ...dragStart.rect, left: dragStart.rect.left + dx, top: dragStart.rect.top + dy })
  if (!resizing.value) return
  const direction = resizing.value
  const next = { ...dragStart.rect }
  if (direction.includes('e')) next.width += dx
  if (direction.includes('s')) next.height += dy
  if (direction.includes('w')) { next.width -= dx; next.left += dx }
  if (direction.includes('n')) { next.height -= dy; next.top += dy }
  rect.value = clampRect(next)
  event.preventDefault()
}

const endPointer = (event: PointerEvent) => {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) {
    dragging.value = false
    resizing.value = null
    dragStart = null
  }
}

const onViewportResize = () => { if (open.value) rect.value = clampRect(rect.value) }
const show = () => { open.value = true; centerWindow() }
const hide = () => { open.value = false }

onMounted(() => {
  window.addEventListener('pointermove', movePointer)
  window.addEventListener('pointerup', endPointer)
  window.addEventListener('pointercancel', endPointer)
  window.addEventListener('resize', onViewportResize)
  window.visualViewport?.addEventListener('resize', onViewportResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', movePointer)
  window.removeEventListener('pointerup', endPointer)
  window.removeEventListener('pointercancel', endPointer)
  window.removeEventListener('resize', onViewportResize)
  window.visualViewport?.removeEventListener('resize', onViewportResize)
})
</script>

<template>
  <button
    v-if="!open"
    type="button"
    class="remote-screen-bubble"
    :aria-label="`打开${props.title}`"
    title="打开远程画面"
    @click="show"
  >
    <span class="remote-screen-bubble-icon" aria-hidden="true">▣</span>
    <span class="remote-screen-bubble-label">远程画面</span>
  </button>

  <Teleport to="body">
    <section v-if="open" class="remote-screen-window" :style="style" role="dialog" :aria-label="props.title">
      <header class="remote-screen-window-header" @pointerdown="beginPointer($event, 'drag')">
        <span class="remote-screen-window-title">{{ props.title }}</span>
        <span class="remote-screen-window-hint">拖动 · 双指缩放</span>
        <button type="button" class="remote-screen-window-button" aria-label="收起远程画面" @pointerdown.stop @click="hide">−</button>
      </header>
      <div class="remote-screen-window-body" @pointerdown="beginPointer($event, 'drag')">
        <img :src="props.src" :alt="props.alt" draggable="false" />
        <span class="remote-screen-touch-hint">双指缩放窗口</span>
      </div>
      <button
        v-for="direction in (['nw', 'ne', 'sw', 'se'] as Direction[])"
        :key="direction"
        type="button"
        class="remote-screen-resize-handle"
        :class="`remote-screen-resize-${direction}`"
        :aria-label="`调整远程画面大小 ${direction}`"
        @pointerdown.stop="beginPointer($event, direction)"
      ></button>
    </section>
  </Teleport>
</template>

<style scoped>
.remote-screen-bubble {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 130;
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  min-height: 2.5rem;
  padding: .55rem .8rem;
  border: 1px solid rgb(99 102 241 / .55);
  border-radius: 999px;
  color: rgb(224 231 255);
  background: rgb(30 27 75 / .94);
  box-shadow: 0 8px 24px rgb(15 23 42 / .28);
  font-size: .75rem;
  touch-action: manipulation;
}
.remote-screen-bubble:hover { background: rgb(49 46 129 / .96); }
.remote-screen-bubble-icon { font-size: 1rem; line-height: 1; }
.remote-screen-window {
  position: fixed;
  z-index: 131;
  min-width: 220px;
  min-height: 150px;
  overflow: hidden;
  border: 1px solid rgb(99 102 241 / .65);
  border-radius: .85rem;
  background: #09090b;
  box-shadow: 0 20px 60px rgb(0 0 0 / .48);
  touch-action: none;
}
.remote-screen-window-header {
  display: flex;
  align-items: center;
  gap: .5rem;
  height: 2.25rem;
  padding: 0 .55rem .0 .8rem;
  color: #e4e4e7;
  background: #18181b;
  cursor: move;
  user-select: none;
  touch-action: none;
}
.remote-screen-window-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; font-weight: 600; }
.remote-screen-window-hint { margin-left: auto; color: #a1a1aa; font-size: .625rem; }
.remote-screen-window-button { width: 1.6rem; height: 1.6rem; border-radius: .4rem; color: #d4d4d8; font-size: 1rem; line-height: 1; }
.remote-screen-window-button:hover { background: #3f3f46; }
.remote-screen-window-body { position: relative; display: grid; place-items: center; width: 100%; height: calc(100% - 2.25rem); overflow: hidden; background: #09090b; touch-action: none; }
.remote-screen-window-body img { display: block; width: 100%; height: 100%; object-fit: contain; user-select: none; pointer-events: none; }
.remote-screen-touch-hint { position: absolute; right: .5rem; bottom: .4rem; padding: .15rem .35rem; border-radius: .35rem; color: rgb(228 228 231 / .8); background: rgb(0 0 0 / .55); font-size: .6rem; pointer-events: none; }
.remote-screen-resize-handle { position: absolute; z-index: 2; width: .9rem; height: .9rem; padding: 0; touch-action: none; }
.remote-screen-resize-nw { left: 0; top: 0; cursor: nwse-resize; }
.remote-screen-resize-ne { right: 0; top: 0; cursor: nesw-resize; }
.remote-screen-resize-sw { left: 0; bottom: 0; cursor: nesw-resize; }
.remote-screen-resize-se { right: 0; bottom: 0; cursor: nwse-resize; }
@media (max-width: 640px) {
  .remote-screen-window-hint { display: none; }
  .remote-screen-window { max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); }
}
@media (prefers-reduced-motion: reduce) {
  .remote-screen-bubble { transition: none; }
}
</style>
