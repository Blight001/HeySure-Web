<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl } from '@/composables/useRemoteControl'

type Direction = 'nw' | 'ne' | 'sw' | 'se'
type Point = { x: number; y: number }
type WindowRect = { left: number; top: number; width: number; height: number }
const props = defineProps<{ deviceId: string }>()
const videoRef = ref<HTMLVideoElement | null>(null)
const open = ref(false)
const rect = ref<WindowRect>({ left: 0, top: 0, width: 420, height: 280 })
const pointers = new Map<number, Point>()
const dragging = ref(false)
const resizing = ref<Direction | null>(null)
let interaction: { point: Point; rect: WindowRect } | null = null
let pinch: { distance: number; rect: WindowRect } | null = null
const { remoteStream, start, stop } = useRemoteControl()
const viewport = () => ({ width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight })
const clampRect = (value: WindowRect): WindowRect => {
  const view = viewport()
  const width = Math.min(Math.max(value.width, 240), Math.max(240, view.width - 16))
  const height = Math.min(Math.max(value.height, 170), Math.max(170, view.height - 16))
  return { width, height, left: Math.min(Math.max(value.left, 8), Math.max(8, view.width - width - 8)), top: Math.min(Math.max(value.top, 8), Math.max(8, view.height - height - 8)) }
}
const windowStyle = computed(() => ({ left: `${rect.value.left}px`, top: `${rect.value.top}px`, width: `${rect.value.width}px`, height: `${rect.value.height}px` }))
const centerWindow = () => {
  const view = viewport()
  rect.value = clampRect({ ...rect.value, left: (view.width - rect.value.width) / 2, top: Math.max(16, (view.height - rect.value.height) / 2) })
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const attachStream = async () => {
  if (!videoRef.value) return
  videoRef.value.srcObject = remoteStream.value
  if (remoteStream.value) await videoRef.value.play().catch(() => {})
}
const startView = async (deviceId: string) => { stop(); await nextTick(); if (deviceId) start(deviceId, { qualityPreset: 'smooth' }) }
const beginPointer = (event: PointerEvent, mode: 'drag' | Direction) => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (event.pointerType === 'touch' && pointers.size >= 2) {
    const [a, b] = Array.from(pointers.values())
    pinch = { distance: Math.max(1, distance(a, b)), rect: { ...rect.value } }
    dragging.value = false; resizing.value = null; return
  }
  interaction = { point: { x: event.clientX, y: event.clientY }, rect: { ...rect.value } }
  dragging.value = mode === 'drag'; resizing.value = mode === 'drag' ? null : mode
  event.preventDefault()
}
const movePointer = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size >= 2) {
    const [a, b] = Array.from(pointers.values())
    const scale = distance(a, b) / pinch.distance
    rect.value = clampRect({ ...pinch.rect, width: pinch.rect.width * scale, height: pinch.rect.height * scale })
    event.preventDefault(); return
  }
  if (!interaction) return
  const dx = event.clientX - interaction.point.x; const dy = event.clientY - interaction.point.y
  if (dragging.value) rect.value = clampRect({ ...interaction.rect, left: interaction.rect.left + dx, top: interaction.rect.top + dy })
  if (!resizing.value) return
  const next = { ...interaction.rect }
  if (resizing.value.includes('e')) next.width += dx
  if (resizing.value.includes('s')) next.height += dy
  if (resizing.value.includes('w')) { next.width -= dx; next.left += dx }
  if (resizing.value.includes('n')) { next.height -= dy; next.top += dy }
  rect.value = clampRect(next); event.preventDefault()
}
const endPointer = (event: PointerEvent) => {
  pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null
  if (!pointers.size) { interaction = null; dragging.value = false; resizing.value = null }
}
const onViewportResize = () => { if (open.value) rect.value = clampRect(rect.value) }
const show = async () => { open.value = true; centerWindow(); await nextTick(); await attachStream() }
const hide = () => { open.value = false }
watch(remoteStream, () => { void attachStream() })
watch(() => props.deviceId, deviceId => { open.value = false; void startView(deviceId) })
onMounted(() => {
  void startView(props.deviceId)
  window.addEventListener('pointermove', movePointer); window.addEventListener('pointerup', endPointer); window.addEventListener('pointercancel', endPointer)
  window.addEventListener('resize', onViewportResize); window.visualViewport?.addEventListener('resize', onViewportResize)
})
onBeforeUnmount(() => {
  stop()
  window.removeEventListener('pointermove', movePointer); window.removeEventListener('pointerup', endPointer); window.removeEventListener('pointercancel', endPointer)
  window.removeEventListener('resize', onViewportResize); window.visualViewport?.removeEventListener('resize', onViewportResize)
})
</script>

<template>
  <Teleport v-if="remoteStream" to="body">
    <button v-if="!open" type="button" class="chat-remote-screen-bubble" aria-label="打开远程画面" @click="show"><span class="chat-remote-screen-dot" aria-hidden="true"></span><span>远程画面</span><span aria-hidden="true">↗</span></button>
    <section v-if="open" class="chat-remote-screen-window" :style="windowStyle" role="dialog" aria-label="远程画面">
      <header class="chat-remote-screen-header" @pointerdown="beginPointer($event, 'drag')"><span class="chat-remote-screen-title">远程画面</span><span class="chat-remote-screen-hint">拖动 · 双指缩放</span><button type="button" class="chat-remote-screen-close" aria-label="收起远程画面" @pointerdown.stop @click="hide">−</button></header>
      <div class="chat-remote-screen-stage" @pointerdown="beginPointer($event, 'drag')"><video ref="videoRef" class="chat-remote-screen-video" autoplay muted playsinline tabindex="-1" aria-label="设备远程画面"></video></div>
      <button v-for="direction in (['nw', 'ne', 'sw', 'se'] as Direction[])" :key="direction" type="button" class="chat-remote-screen-handle" :class="`chat-remote-screen-handle-${direction}`" :aria-label="`调整远程画面大小 ${direction}`" @pointerdown.stop="beginPointer($event, direction)"></button>
    </section>
  </Teleport>
</template>

<style scoped>
.chat-remote-screen-bubble { position: fixed; right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom)); z-index: 130; display: inline-flex; align-items: center; gap: .4rem; min-height: 2.5rem; padding: .55rem .8rem; border: 1px solid rgb(99 102 241 / .55); border-radius: 999px; color: #e0e7ff; background: rgb(30 27 75 / .96); box-shadow: 0 8px 24px rgb(15 23 42 / .3); font-size: .75rem; touch-action: manipulation; }
.chat-remote-screen-bubble:hover { background: rgb(49 46 129 / .98); }
.chat-remote-screen-dot { width: .45rem; height: .45rem; border-radius: 999px; background: #34d399; box-shadow: 0 0 0 3px rgb(52 211 153 / .18); }
.chat-remote-screen-window { position: fixed; z-index: 131; min-width: 240px; min-height: 170px; overflow: hidden; border: 1px solid rgb(99 102 241 / .7); border-radius: .85rem; background: #09090b; box-shadow: 0 20px 60px rgb(0 0 0 / .5); touch-action: none; }
.chat-remote-screen-header { display: flex; align-items: center; gap: .5rem; height: 2.3rem; padding: 0 .55rem 0 .8rem; color: #e4e4e7; background: #18181b; cursor: move; user-select: none; touch-action: none; }
.chat-remote-screen-title { font-size: .75rem; font-weight: 600; }
.chat-remote-screen-hint { margin-left: auto; color: #a1a1aa; font-size: .625rem; }
.chat-remote-screen-close { width: 1.6rem; height: 1.6rem; border-radius: .4rem; color: #d4d4d8; font-size: 1rem; line-height: 1; }
.chat-remote-screen-close:hover { background: #3f3f46; }
.chat-remote-screen-stage { display: grid; place-items: center; width: 100%; height: calc(100% - 2.3rem); overflow: hidden; background: #09090b; touch-action: none; }
.chat-remote-screen-video { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.chat-remote-screen-handle { position: absolute; z-index: 2; width: .9rem; height: .9rem; padding: 0; touch-action: none; }
.chat-remote-screen-handle-nw { left: 0; top: 0; cursor: nwse-resize; }
.chat-remote-screen-handle-ne { right: 0; top: 0; cursor: nesw-resize; }
.chat-remote-screen-handle-sw { left: 0; bottom: 0; cursor: nesw-resize; }
.chat-remote-screen-handle-se { right: 0; bottom: 0; cursor: nwse-resize; }
@media (max-width: 640px) { .chat-remote-screen-hint { display: none; } .chat-remote-screen-window { max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); } }
@media (prefers-reduced-motion: reduce) { .chat-remote-screen-bubble { transition: none; } }
</style>
