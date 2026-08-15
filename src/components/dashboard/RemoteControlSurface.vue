<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RcInput, RcMode, RcStatus } from '@/composables/useRemoteControl'
import {
  applyFullscreenTextDelta,
  enterNativeFullscreen as requestNativeFullscreen,
  exitNativeFullscreen,
  isNativeFullscreenActive,
} from './remoteControlFullscreen'
import {
  finishAndroidPointer,
  handleDesktopPointerUp,
  mouseButton,
  MOVE_INTERVAL_MS,
  normalizePointer,
  sendAndroidDragMove,
  startAndroidLongPress,
  SWIPE_THRESHOLD,
  clearAndroidTimers,
  type AndroidDown,
} from './remoteControlPointers'
import { keyPayload, shouldIgnoreRemoteKey } from './remoteControlKeys'
import { applyPinchPoints, beginPinchFromPoints, viewportKeyboardOffset, zoomStyle, type PinchStart } from './remoteControlZoom'

const props = defineProps<{
  isMaximized: boolean
  isDesktopLike: boolean
  mode: RcMode
  status: RcStatus
  errorMessage: string
  controlReady: boolean
  connectionState: string
  pageUncontrollable: boolean
  aspectStyle: { aspectRatio: string }
  deviceWidth: number
  deviceHeight: number
  remoteStream: MediaStream | null
  sendInput: (input: RcInput) => void
}>()

const emit = defineEmits<{
  (e: 'update:isMaximized', value: boolean): void
  (e: 'natural-size', size: { width: number; height: number }): void
  (e: 'close'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const surfaceRef = ref<HTMLElement | null>(null)
const imeRef = ref<HTMLTextAreaElement | null>(null)
const fullscreenInputRef = ref<HTMLInputElement | null>(null)
const fullscreenTyping = ref('')
const fullscreenInputOpen = ref(false)
const fullscreenMenuOpen = ref(false)
const zoomScale = ref(1)
const zoomX = ref(0)
const zoomY = ref(0)
const keyboardOffset = ref(0)
const scrollDragging = ref(false)
const activeTouches = new Map<number, { x: number; y: number }>()
let pinchStart: PinchStart | null = null
let twoFingerTap: { x: number; y: number; moved: boolean } | null = null
let fullscreenSentText = ''
let scrollLastY = 0
let down: AndroidDown | null = null
let lastMoveAt = 0
let lastNaturalW = 0
let lastNaturalH = 0
let dimensionPoll = 0

const zoomLayerStyle = computed(() => zoomStyle(zoomScale.value, zoomX.value, zoomY.value, keyboardOffset.value))

const resetZoom = () => {
  zoomScale.value = 1
  zoomX.value = 0
  zoomY.value = 0
  pinchStart = null
  twoFingerTap = null
  activeTouches.clear()
}

const touchPair = () => Array.from(activeTouches.values()).slice(0, 2)

const beginPinch = () => {
  const [a, b] = touchPair()
  if (!a || !b) return
  pinchStart = beginPinchFromPoints(a, b, zoomScale.value, zoomX.value, zoomY.value)
}

const updatePinch = () => {
  const [a, b] = touchPair()
  if (!a || !b || !pinchStart) return
  const next = applyPinchPoints(a, b, pinchStart, twoFingerTap)
  zoomScale.value = next.scale
  zoomX.value = next.x
  zoomY.value = next.y
}

const emitVideoSize = () => {
  const el = videoRef.value
  if (!el || el.videoWidth <= 0 || el.videoHeight <= 0) return
  if (el.videoWidth === lastNaturalW && el.videoHeight === lastNaturalH) return
  lastNaturalW = el.videoWidth
  lastNaturalH = el.videoHeight
  emit('natural-size', { width: lastNaturalW, height: lastNaturalH })
}

const normalized = (event: PointerEvent | WheelEvent) => (
  normalizePointer(event, videoRef.value, props.deviceWidth, props.deviceHeight)
)

const cancelAndroidPointer = () => {
  if (down) clearAndroidTimers(down)
  if (down?.dragging) props.sendInput({ type: 'up', x: down.lastX, y: down.lastY })
  down = null
}

const onPointerDown = (event: PointerEvent) => {
  if (props.status !== 'streaming') return
  if (event.pointerType === 'touch') {
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activeTouches.size >= 2) {
      event.preventDefault()
      cancelAndroidPointer()
      if (props.isDesktopLike) {
        props.sendInput({ type: 'up', button: 'left' })
        const pos = normalized(event)
        twoFingerTap = pos ? { ...pos, moved: false } : null
      }
      beginPinch()
      return
    }
  }
  const pos = normalized(event)
  if (!pos) return
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  if (props.isDesktopLike) {
    if (event.pointerType !== 'touch') imeRef.value?.focus({ preventScroll: true })
    else imeRef.value?.blur()
    props.sendInput({ type: 'down', x: pos.x, y: pos.y, button: mouseButton(event.button) })
    return
  }
  event.preventDefault()
  const now = Date.now()
  down = {
    ...pos,
    t: now,
    lastX: pos.x,
    lastY: pos.y,
    lastMoveAt: now,
    dragging: false,
    longPressSent: false,
    longPressTimer: null,
    holdInterval: null,
  }
  startAndroidLongPress(down, props.sendInput)
}

const onPointerMove = (event: PointerEvent) => {
  if (props.status !== 'streaming') return
  if (event.pointerType === 'touch' && activeTouches.has(event.pointerId)) {
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activeTouches.size >= 2) {
      event.preventDefault()
      updatePinch()
      return
    }
  }
  const pos = normalized(event)
  if (!pos) return
  if (props.isDesktopLike) {
    const now = Date.now()
    if (now - lastMoveAt < MOVE_INTERVAL_MS) return
    lastMoveAt = now
    props.sendInput({ type: 'move', x: pos.x, y: pos.y })
    return
  }
  if (!down) return
  event.preventDefault()
  const dist = Math.hypot(pos.x - down.x, pos.y - down.y)
  if (!down.dragging && dist >= SWIPE_THRESHOLD) {
    clearAndroidTimers(down)
    down.dragging = true
    down.lastMoveAt = Date.now()
    props.sendInput({ type: 'down', x: down.x, y: down.y })
  }
  sendAndroidDragMove(down, pos, props.sendInput)
}

const onPointerUp = (event: PointerEvent) => {
  if (props.status !== 'streaming') return
  if (event.pointerType === 'touch' && activeTouches.has(event.pointerId)) {
    const wasPinching = activeTouches.size >= 2 || !!pinchStart
    activeTouches.delete(event.pointerId)
    if (activeTouches.size < 2) pinchStart = null
    if (wasPinching) {
      handleDesktopPointerUp(props.isDesktopLike, twoFingerTap, props.sendInput)
      twoFingerTap = null
      event.preventDefault()
      return
    }
  }
  const pos = normalized(event) || null
  if (props.isDesktopLike) {
    props.sendInput({ type: 'up', x: pos?.x, y: pos?.y, button: mouseButton(event.button) })
    return
  }
  if (!down) return
  event.preventDefault()
  finishAndroidPointer(down, pos || { x: down.x, y: down.y }, props.sendInput)
  down = null
}

const onPointerCancel = (event: PointerEvent) => {
  activeTouches.delete(event.pointerId)
  pinchStart = null
  cancelAndroidPointer()
}

const onWheel = (event: WheelEvent) => {
  if (props.status !== 'streaming') return
  event.preventDefault()
  if (props.isDesktopLike) {
    props.sendInput({ type: 'scroll', dx: event.deltaX, dy: event.deltaY })
    return
  }
  const pos = normalized(event) || { x: 0.5, y: 0.5 }
  props.sendInput({ type: 'scroll', x: pos.x, y: pos.y, dx: event.deltaX, dy: event.deltaY })
}

const onKeyDown = (event: KeyboardEvent) => {
  if (props.status !== 'streaming' || !props.isDesktopLike) return
  if (shouldIgnoreRemoteKey(event)) return
  event.preventDefault()
  const payload = keyPayload(props.mode, event, 'down')
  if (payload) props.sendInput(payload)
}

const onKeyUp = (event: KeyboardEvent) => {
  if (props.status !== 'streaming' || !props.isDesktopLike) return
  if (shouldIgnoreRemoteKey(event, true)) return
  event.preventDefault()
  const payload = keyPayload(props.mode, event, 'up')
  if (payload) props.sendInput(payload)
}

const onCompositionEnd = (event: CompositionEvent) => {
  if (props.status !== 'streaming' || !props.isDesktopLike) return
  const text = event.data
  if (text) props.sendInput({ type: 'text', text })
  if (imeRef.value) imeRef.value.value = ''
}

const openFullscreenInput = () => {
  fullscreenMenuOpen.value = false
  fullscreenInputOpen.value = true
  fullscreenTyping.value = ''
  fullscreenSentText = ''
  window.setTimeout(() => fullscreenInputRef.value?.focus({ preventScroll: true }), 0)
}

const onFullscreenTextInput = (event: Event) => {
  if ((event as InputEvent).isComposing) return
  fullscreenSentText = applyFullscreenTextDelta(fullscreenTyping.value, fullscreenSentText, props.sendInput)
}

const onFullscreenCompositionEnd = () => {
  const appended = fullscreenTyping.value.slice(fullscreenSentText.length)
  if (appended) props.sendInput({ type: 'text', text: appended })
  fullscreenSentText = fullscreenTyping.value
}

const closeFullscreenInput = () => {
  fullscreenInputOpen.value = false
  keyboardOffset.value = 0
  fullscreenInputRef.value?.blur()
}

const onScrollStart = (event: PointerEvent) => {
  scrollDragging.value = true
  scrollLastY = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

const onScrollMove = (event: PointerEvent) => {
  if (!scrollDragging.value) return
  const dy = event.clientY - scrollLastY
  if (Math.abs(dy) >= 2) {
    props.sendInput({ type: 'scroll', dx: 0, dy: dy * 3 })
    scrollLastY = event.clientY
  }
  event.preventDefault()
}

const onScrollEnd = () => { scrollDragging.value = false }

const shrinkFromFullscreen = () => {
  fullscreenMenuOpen.value = false
  fullscreenInputOpen.value = false
  resetZoom()
  emit('update:isMaximized', false)
}

const exitRemoteControl = () => {
  fullscreenMenuOpen.value = false
  emit('close')
}

const onViewportResize = () => {
  keyboardOffset.value = viewportKeyboardOffset(fullscreenInputOpen.value)
}

const onFullscreenChange = () => {
  if (!isNativeFullscreenActive() && props.isMaximized && !fullscreenInputOpen.value) {
    emit('update:isMaximized', false)
  }
}

watch(() => props.remoteStream, (stream) => {
  if (videoRef.value) videoRef.value.srcObject = stream
})

watch(() => props.isMaximized, (max) => {
  if (max) requestNativeFullscreen(surfaceRef.value)
  else exitNativeFullscreen()
})

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  window.addEventListener('resize', onViewportResize)
  window.addEventListener('orientationchange', onViewportResize)
  window.visualViewport?.addEventListener('resize', onViewportResize)
  dimensionPoll = window.setInterval(emitVideoSize, 500)
  if (videoRef.value && props.remoteStream) videoRef.value.srcObject = props.remoteStream
})

onBeforeUnmount(() => {
  if (dimensionPoll) window.clearInterval(dimensionPoll)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
  window.removeEventListener('resize', onViewportResize)
  window.removeEventListener('orientationchange', onViewportResize)
  window.visualViewport?.removeEventListener('resize', onViewportResize)
  exitNativeFullscreen()
  cancelAndroidPointer()
})

defineExpose({ resetZoom })
</script>

<template>
  <div class="relative flex-1 min-h-0 overflow-auto bg-black flex items-center justify-center p-3">
    <div
      ref="surfaceRef"
      class="rc-surface relative w-full max-h-full outline-none overflow-hidden"
      :class="{ 'rc-surface-fullscreen': isMaximized }"
      :style="aspectStyle"
    >
      <div v-if="isMaximized" class="rc-fullscreen-actions">
        <div v-if="fullscreenMenuOpen" class="rc-fullscreen-menu">
          <button type="button" @click="openFullscreenInput">输入</button>
          <button type="button" @click="resetZoom">重置画面</button>
          <button type="button" @click="shrinkFromFullscreen">恢复窗口</button>
          <button type="button" class="danger" @click="exitRemoteControl">退出远程控制</button>
        </div>
        <button type="button" class="rc-fullscreen-bubble" :aria-expanded="fullscreenMenuOpen" aria-label="远程控制菜单" @click="fullscreenMenuOpen=!fullscreenMenuOpen">
          <span class="rc-bubble-dot"></span><span class="rc-bubble-dot"></span><span class="rc-bubble-dot"></span>
        </button>
      </div>
      <div
        v-if="isMaximized && isDesktopLike"
        class="rc-scroll-slider"
        aria-label="鼠标滚轮"
        @pointerdown="onScrollStart"
        @pointermove="onScrollMove"
        @pointerup="onScrollEnd"
        @pointercancel="onScrollEnd"
      ><span></span></div>
      <form v-if="isMaximized && fullscreenInputOpen" class="rc-fullscreen-input" :style="{ bottom: `${keyboardOffset + 12}px` }" @submit.prevent>
        <input ref="fullscreenInputRef" v-model="fullscreenTyping" type="text" autocomplete="off" placeholder="输入内容将自动发送" @input="onFullscreenTextInput" @compositionend="onFullscreenCompositionEnd" @keydown.stop />
        <button type="button" @click="closeFullscreenInput">完成</button>
      </form>
      <div class="rc-zoom-layer" :style="zoomLayerStyle">
        <textarea
          v-if="isDesktopLike"
          ref="imeRef"
          class="absolute inset-0 z-10 opacity-0 resize-none pointer-events-none"
          autocomplete="off"
          autocapitalize="off"
          inputmode="none"
          enterkeyhint="done"
          spellcheck="false"
          @keydown="onKeyDown"
          @keyup="onKeyUp"
          @compositionend="onCompositionEnd"
        ></textarea>
        <video
          ref="videoRef"
          autoplay
          playsinline
          muted
          class="w-full h-full object-contain rounded-lg bg-zinc-950 touch-none select-none"
          @loadedmetadata="emitVideoSize"
          @resize="emitVideoSize"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
          @wheel="onWheel"
          @contextmenu.prevent
        ></video>
      </div>
      <div v-if="status !== 'streaming'" class="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
        <span v-if="status === 'error'" class="px-3 text-center text-rose-300">{{ errorMessage }}</span>
        <span v-else-if="status === 'ended'">会话已结束</span>
        <span v-else class="flex flex-col items-center gap-2 text-center px-3">
          <span class="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></span>
          正在连接设备…<span class="text-zinc-500">P2P：{{ connectionState }}</span>
        </span>
      </div>
      <div
        v-if="status === 'streaming' && !controlReady"
        class="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-1 text-[11px] text-white shadow"
      >
        控制通道未就绪，鼠标/键盘暂不可用…
      </div>
      <div
        v-if="pageUncontrollable"
        class="absolute inset-x-2 top-2 rounded bg-zinc-800/90 px-3 py-1.5 text-center text-[11px] text-amber-200 shadow"
      >
        当前页面无法控制（chrome:// 等浏览器内部页）。可在上方地址栏输入网址跳转离开。
      </div>
    </div>
  </div>
</template>

<style scoped src="./remoteControl.css"></style>
