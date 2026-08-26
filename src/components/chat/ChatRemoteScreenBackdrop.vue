<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl } from '@/composables/useRemoteControl'
import { supportsRemoteScreen } from '@/utils/chatRemoteScreen'
import type { ChatRemoteScreenDevice } from '@/types/chat'

type Direction = 'nw' | 'ne' | 'sw' | 'se'
type Point = { x: number; y: number }
type WindowRect = { left: number; top: number; width: number; height: number }

const props = defineProps<{
  devices: ChatRemoteScreenDevice[]
  preferredDeviceId?: string
}>()
const videoRef = ref<HTMLVideoElement | null>(null)
const open = ref(false)
const menuOpen = ref(false)
const mounted = ref(false)
const selectedId = ref('')
const rect = ref<WindowRect>({ left: 0, top: 0, width: 420, height: 280 })
const bubblePosition = ref<{ left: number; top: number } | null>(null)
const pointers = new Map<number, Point>()
const dragging = ref(false)
const resizing = ref<Direction | null>(null)
let interaction: { point: Point; rect: WindowRect } | null = null
let pinch: { distance: number; rect: WindowRect } | null = null
let bubblePointer: { id: number; point: Point; left: number; top: number } | null = null
let bubbleMoved = false
const { remoteStream, status, errorMessage, start, stop } = useRemoteControl()

const availableDevices = computed(() => props.devices.filter(device => supportsRemoteScreen(device)))
const selectedDevice = computed(() => availableDevices.value.find(device => device.id === selectedId.value) || null)
const bubbleStyle = computed(() => bubblePosition.value ? ({ left: `${bubblePosition.value.left}px`, top: `${bubblePosition.value.top}px` }) : undefined)
const menuStyle = computed(() => bubblePosition.value
  ? ({ left: `${bubblePosition.value.left}px`, top: `${bubblePosition.value.top}px`, transform: 'translateY(calc(-100% - .5rem))' })
  : undefined)
const viewport = () => ({ width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight })
const clampRect = (value: WindowRect): WindowRect => {
  const view = viewport()
  const width = Math.min(Math.max(value.width, 180), Math.max(180, view.width - 16))
  const height = Math.min(Math.max(value.height, 120), Math.max(120, view.height - 16))
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
const startView = async (deviceId: string) => {
  stop()
  await nextTick()
  if (deviceId) start(deviceId, { qualityPreset: 'smooth' })
}
const beginBubblePointer = (event: PointerEvent) => {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  bubblePosition.value = { left: bounds.left, top: bounds.top }
  bubblePointer = { id: event.pointerId, point: { x: event.clientX, y: event.clientY }, left: bounds.left, top: bounds.top }
  bubbleMoved = false
  event.preventDefault()
}
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
  if (bubblePointer?.id === event.pointerId) {
    const dx = event.clientX - bubblePointer.point.x
    const dy = event.clientY - bubblePointer.point.y
    if (Math.abs(dx) + Math.abs(dy) > 4) bubbleMoved = true
    const view = viewport()
    bubblePosition.value = {
      left: Math.min(Math.max(8, bubblePointer.left + dx), Math.max(8, view.width - 52)),
      top: Math.min(Math.max(8, bubblePointer.top + dy), Math.max(8, view.height - 52)),
    }
    event.preventDefault(); return
  }
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
  if (bubblePointer?.id === event.pointerId) { bubblePointer = null; return }
  pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null
  if (!pointers.size) { interaction = null; dragging.value = false; resizing.value = null }
}
const onViewportResize = () => { if (open.value) rect.value = clampRect(rect.value) }
const selectDevice = async (deviceId: string) => {
  selectedId.value = deviceId
  menuOpen.value = false
  open.value = true
  centerWindow()
  await nextTick()
  await attachStream()
}
const show = async () => {
  if (availableDevices.value.length > 1) { menuOpen.value = !menuOpen.value; return }
  if (!selectedId.value && availableDevices.value[0]) selectedId.value = availableDevices.value[0].id
  open.value = true; menuOpen.value = false; centerWindow(); await nextTick(); await attachStream()
}
const onBubbleClick = () => { if (bubbleMoved) { bubbleMoved = false; return } void show() }
const hide = () => { open.value = false; menuOpen.value = false }

watch([availableDevices, () => props.preferredDeviceId], ([devices, preferred]) => {
  const preferredId = String(preferred || '')
  if (preferredId && devices.some(device => device.id === preferredId)) selectedId.value = preferredId
  else if (!devices.some(device => device.id === selectedId.value)) selectedId.value = devices[0]?.id || ''
  if (!selectedId.value) { open.value = false; stop() }
}, { immediate: true })
watch(selectedId, deviceId => { if (mounted.value) void startView(deviceId) })
// The video is conditionally mounted by the stream ref; wait for that DOM commit
// before assigning srcObject, otherwise the first stream can render as a black box.
watch(remoteStream, () => { void nextTick().then(attachStream) })
onMounted(() => {
  mounted.value = true
  if (selectedId.value) void startView(selectedId.value)
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
  <Teleport to="body">
    <div v-if="availableDevices.length" class="chat-remote-screen-layer">
      <div v-if="menuOpen" class="chat-remote-screen-device-menu" :style="menuStyle" role="menu" aria-label="选择远程设备">
        <button v-for="device in availableDevices" :key="device.id" type="button" class="chat-remote-screen-device-option" :class="{ 'is-selected': device.id === selectedId }" role="menuitem" @click="selectDevice(device.id)">
          <span class="chat-remote-screen-device-status" aria-hidden="true"></span><span class="chat-remote-screen-device-name">{{ device.name || device.id }}</span><span v-if="device.id === selectedId" aria-hidden="true">✓</span>
        </button>
      </div>
      <button type="button" class="chat-remote-screen-bubble" :class="{ 'is-offline': !selectedDevice || status === 'error', 'is-positioned': bubblePosition }" :style="bubbleStyle" :aria-label="selectedDevice ? `打开 ${selectedDevice.name || selectedDevice.id} 远程画面` : '选择远程设备'" title="远程设备" @pointerdown="beginBubblePointer" @click="onBubbleClick">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 8h10v6H7z"/></svg>
      </button>
      <section v-if="open" class="chat-remote-screen-window" :style="windowStyle" role="dialog" aria-label="远程画面">
        <header class="chat-remote-screen-header" @pointerdown="beginPointer($event, 'drag')">
          <span class="chat-remote-screen-title">{{ selectedDevice?.name || selectedDevice?.id || '远程画面' }}</span>
          <select v-if="availableDevices.length > 1" v-model="selectedId" class="chat-remote-screen-device-select" aria-label="选择远程设备" @pointerdown.stop><option v-for="device in availableDevices" :key="device.id" :value="device.id">{{ device.name || device.id }}</option></select>
          <span v-if="status === 'connecting'" class="chat-remote-screen-hint">连接中</span><span v-else-if="errorMessage" class="chat-remote-screen-hint is-error">连接异常</span>
          <button type="button" class="chat-remote-screen-close" aria-label="收起远程画面" @pointerdown.stop @click="hide">−</button>
        </header>
        <div class="chat-remote-screen-stage" @pointerdown="beginPointer($event, 'drag')"><video v-if="remoteStream" ref="videoRef" class="chat-remote-screen-video" autoplay muted playsinline tabindex="-1" aria-label="设备远程画面"></video><span v-else class="chat-remote-screen-placeholder">{{ status === 'connecting' ? '正在连接设备…' : '暂无远程画面' }}</span></div>
        <button v-for="direction in (['nw', 'ne', 'sw', 'se'] as Direction[])" :key="direction" type="button" class="chat-remote-screen-handle" :class="`chat-remote-screen-handle-${direction}`" :aria-label="`调整远程画面大小 ${direction}`" @pointerdown.stop="beginPointer($event, direction)"></button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.chat-remote-screen-layer { position: fixed; inset: 0; z-index: 130; pointer-events: none; }
.chat-remote-screen-bubble { position: fixed; left: max(1rem, env(safe-area-inset-left)); bottom: max(5.5rem, calc(env(safe-area-inset-bottom) + 5rem)); z-index: 2; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; padding: .55rem; border: 1px solid rgb(99 102 241 / .6); border-radius: 999px; color: #e0e7ff; background: rgb(30 27 75 / .96); box-shadow: 0 8px 24px rgb(15 23 42 / .3); touch-action: none; pointer-events: auto; cursor: grab; }
.chat-remote-screen-bubble:active { cursor: grabbing; }
.chat-remote-screen-bubble.is-positioned { bottom: auto; }
.chat-remote-screen-bubble svg { width: 1.35rem; height: 1.35rem; }
.chat-remote-screen-bubble:hover { background: rgb(49 46 129 / .98); }
.chat-remote-screen-bubble.is-offline { opacity: .65; }
.chat-remote-screen-device-menu { position: fixed; z-index: 3; min-width: 12rem; max-width: min(18rem, calc(100vw - 1rem)); padding: .35rem; border: 1px solid rgb(99 102 241 / .5); border-radius: .7rem; background: #18181b; box-shadow: 0 16px 42px rgb(0 0 0 / .4); pointer-events: auto; }
.chat-remote-screen-device-option { display: flex; align-items: center; gap: .45rem; width: 100%; min-height: 2.1rem; padding: .35rem .5rem; border-radius: .45rem; color: #d4d4d8; text-align: left; font-size: .72rem; }
.chat-remote-screen-device-option:hover, .chat-remote-screen-device-option.is-selected { background: rgb(79 70 229 / .28); color: #eef2ff; }
.chat-remote-screen-device-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-remote-screen-device-status { width: .42rem; height: .42rem; flex: none; border-radius: 999px; background: #34d399; }
.chat-remote-screen-window { position: fixed; z-index: 1; min-width: 180px; min-height: 120px; overflow: hidden; border: 1px solid rgb(99 102 241 / .7); border-radius: .85rem; background: #09090b; box-shadow: 0 20px 60px rgb(0 0 0 / .5); touch-action: none; pointer-events: auto; }
.chat-remote-screen-header { display: flex; align-items: center; gap: .5rem; height: 2.3rem; padding: 0 .55rem 0 .8rem; color: #e4e4e7; background: #18181b; cursor: move; user-select: none; touch-action: none; }
.chat-remote-screen-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; font-weight: 600; }
.chat-remote-screen-hint { margin-left: auto; color: #a1a1aa; font-size: .625rem; }
.chat-remote-screen-hint.is-error { color: #fb7185; }
.chat-remote-screen-device-select { min-width: 0; max-width: 8rem; margin-left: auto; border: 1px solid #3f3f46; border-radius: .35rem; color: #d4d4d8; background: #27272a; font-size: .65rem; }
.chat-remote-screen-close { width: 1.6rem; height: 1.6rem; border-radius: .4rem; color: #d4d4d8; font-size: 1rem; line-height: 1; }
.chat-remote-screen-close:hover { background: #3f3f46; }
.chat-remote-screen-stage { display: grid; place-items: center; width: 100%; height: calc(100% - 2.3rem); overflow: hidden; background: #09090b; touch-action: none; }
.chat-remote-screen-video { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.chat-remote-screen-placeholder { color: #a1a1aa; font-size: .75rem; }
.chat-remote-screen-handle { position: absolute; z-index: 2; width: .9rem; height: .9rem; padding: 0; touch-action: none; }
.chat-remote-screen-handle-nw { left: 0; top: 0; cursor: nwse-resize; }.chat-remote-screen-handle-ne { right: 0; top: 0; cursor: nesw-resize; }.chat-remote-screen-handle-sw { left: 0; bottom: 0; cursor: nesw-resize; }.chat-remote-screen-handle-se { right: 0; bottom: 0; cursor: nwse-resize; }
@media (max-width: 640px) { .chat-remote-screen-window { max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); } .chat-remote-screen-device-select { max-width: 6rem; } }
@media (prefers-reduced-motion: reduce) { .chat-remote-screen-bubble { transition: none; } }
</style>
