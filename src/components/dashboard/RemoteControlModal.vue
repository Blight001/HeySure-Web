<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl, type RcInput, type RcMode, type RcMouseButton } from '@/composables/useRemoteControl'

const props = withDefaults(defineProps<{
  deviceId: string
  deviceName?: string
  mode?: RcMode
}>(), { mode: 'android' })
const emit = defineEmits<{ (e: 'close'): void }>()

const isDesktop = computed(() => props.mode === 'desktop')

const {
  status,
  errorMessage,
  deviceWidth,
  deviceHeight,
  remoteStream,
  start,
  stop,
  sendInput,
} = useRemoteControl()

const videoRef = ref<HTMLVideoElement | null>(null)
const surfaceRef = ref<HTMLElement | null>(null)
const typing = ref('')

// --- Android gesture classification (resolution-independent thresholds) ---
const SWIPE_THRESHOLD = 0.025
const LONG_PRESS_MS = 500
let down: { x: number; y: number; t: number } | null = null

// --- Desktop pointer throttle (move events fire continuously for hover+drag) ---
let lastMoveAt = 0
const MOVE_INTERVAL_MS = 33

const aspectStyle = computed(() => {
  if (deviceWidth.value > 0 && deviceHeight.value > 0) {
    return { aspectRatio: `${deviceWidth.value} / ${deviceHeight.value}` }
  }
  return { aspectRatio: isDesktop.value ? '16 / 9' : '9 / 19.5' }
})

const statusText = computed(() => {
  switch (status.value) {
    case 'connecting': return '正在建立连接…'
    case 'streaming': return '远程控制中'
    case 'error': return errorMessage.value || '连接失败'
    case 'ended': return '会话已结束'
    default: return '未连接'
  }
})

const normalized = (event: PointerEvent | WheelEvent) => {
  const el = videoRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  return { x, y }
}

const mouseButton = (button: number): RcMouseButton =>
  button === 2 ? 'right' : button === 1 ? 'middle' : 'left'

// ---------------- Pointer ----------------
const onPointerDown = (event: PointerEvent) => {
  if (status.value !== 'streaming') return
  const pos = normalized(event)
  if (!pos) return
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  surfaceRef.value?.focus()
  if (isDesktop.value) {
    sendInput({ type: 'down', x: pos.x, y: pos.y, button: mouseButton(event.button) })
  } else {
    down = { ...pos, t: Date.now() }
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (status.value !== 'streaming' || !isDesktop.value) return
  const now = Date.now()
  if (now - lastMoveAt < MOVE_INTERVAL_MS) return
  lastMoveAt = now
  const pos = normalized(event)
  if (pos) sendInput({ type: 'move', x: pos.x, y: pos.y })
}

const onPointerUp = (event: PointerEvent) => {
  if (status.value !== 'streaming') return
  const pos = normalized(event) || null
  if (isDesktop.value) {
    sendInput({ type: 'up', x: pos?.x, y: pos?.y, button: mouseButton(event.button) })
    return
  }
  if (!down) return
  const end = pos || { x: down.x, y: down.y }
  const dt = Date.now() - down.t
  const dist = Math.hypot(end.x - down.x, end.y - down.y)
  let input: RcInput
  if (dist >= SWIPE_THRESHOLD) {
    input = { type: 'swipe', x: down.x, y: down.y, x2: end.x, y2: end.y, durationMs: Math.min(800, Math.max(120, dt)) }
  } else if (dt >= LONG_PRESS_MS) {
    input = { type: 'long_press', x: down.x, y: down.y, durationMs: dt }
  } else {
    input = { type: 'tap', x: down.x, y: down.y }
  }
  sendInput(input)
  down = null
}

const onWheel = (event: WheelEvent) => {
  if (status.value !== 'streaming' || !isDesktop.value) return
  event.preventDefault()
  sendInput({ type: 'scroll', dx: event.deltaX, dy: event.deltaY })
}

const MODIFIER_ONLY = new Set(['Control', 'Alt', 'Shift', 'Meta'])
const onKeyDown = (event: KeyboardEvent) => {
  if (status.value !== 'streaming' || !isDesktop.value) return
  if (MODIFIER_ONLY.has(event.key)) return
  event.preventDefault()
  sendInput({
    type: 'key',
    action: 'tap',
    key: event.key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  })
}

// ---------------- Android nav + text ----------------
const sendKey = (key: 'back' | 'home' | 'recents') => sendInput({ type: 'key', key })

const sendText = () => {
  const text = typing.value
  if (!text) return
  sendInput({ type: 'text', text })
  typing.value = ''
}

watch(remoteStream, (stream) => {
  if (videoRef.value) videoRef.value.srcObject = stream
})

const close = () => {
  stop()
  emit('close')
}

onMounted(() => {
  if (videoRef.value && remoteStream.value) videoRef.value.srcObject = remoteStream.value
  if (props.deviceId) start(props.deviceId)
})

onBeforeUnmount(() => {
  stop()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" @click.self="close">
      <div
        class="flex flex-col w-full max-h-[92vh] rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        :class="isDesktop ? 'max-w-5xl' : 'max-w-sm'"
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-100 truncate">
              远程控制{{ isDesktop ? '（桌面）' : '' }} · {{ deviceName || deviceId }}
            </div>
            <div class="text-xs mt-0.5 flex items-center gap-1.5"
              :class="status === 'streaming' ? 'text-emerald-400' : status === 'error' ? 'text-rose-400' : 'text-amber-400'">
              <span class="inline-block w-1.5 h-1.5 rounded-full"
                :class="status === 'streaming' ? 'bg-emerald-400 animate-pulse' : status === 'error' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse'"></span>
              {{ statusText }}
            </div>
          </div>
          <button class="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-lg leading-none" title="关闭" @click="close">
            ✕
          </button>
        </div>

        <!-- 画面 -->
        <div class="relative flex-1 min-h-0 overflow-auto bg-black flex items-center justify-center p-3">
          <div
            ref="surfaceRef"
            tabindex="0"
            class="relative w-full max-h-full outline-none"
            :style="aspectStyle"
            @keydown="onKeyDown"
          >
            <video
              ref="videoRef"
              autoplay
              playsinline
              muted
              class="w-full h-full object-contain rounded-lg bg-zinc-950 touch-none select-none"
              :class="isDesktop ? 'cursor-crosshair' : ''"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @wheel="onWheel"
              @contextmenu.prevent
            ></video>
            <div v-if="status !== 'streaming'" class="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
              <span v-if="status === 'error'" class="px-3 text-center text-rose-300">{{ errorMessage }}</span>
              <span v-else-if="status === 'ended'">会话已结束</span>
              <span v-else class="flex items-center gap-2">
                <span class="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></span>
                正在连接设备…
              </span>
            </div>
          </div>
        </div>

        <!-- 文本输入 -->
        <div class="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
          <input
            v-model="typing"
            type="text"
            :placeholder="isDesktop ? '向桌面发送一段文本…' : '向聚焦输入框发送文本…'"
            class="flex-1 min-w-0 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            :disabled="status !== 'streaming'"
            @keyup.enter="sendText"
            @keydown.stop
          />
          <button
            class="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 transition-colors"
            :disabled="status !== 'streaming' || !typing"
            @click="sendText"
          >
            发送
          </button>
        </div>

        <!-- 导航键（安卓）/ 操作提示（桌面） -->
        <div v-if="!isDesktop" class="grid grid-cols-3 gap-2 px-3 py-3 border-t border-zinc-800">
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('back')">返回</button>
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('home')">主页</button>
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('recents')">最近</button>
        </div>
        <div v-else class="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
          左键点击/拖拽 · 右键、中键支持 · 滚轮滚动 · 点击画面后可用键盘输入（含 Ctrl/Alt 组合键）
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rc-navbtn {
  border-radius: 0.5rem;
  border: 1px solid rgb(63 63 70);
  background: rgb(39 39 42);
  color: rgb(228 228 231);
  font-size: 0.8rem;
  padding: 0.5rem 0;
  transition: background-color 0.15s, color 0.15s;
}
.rc-navbtn:hover:not(:disabled) {
  background: rgb(63 63 70);
  color: #fff;
}
.rc-navbtn:disabled {
  opacity: 0.4;
}
</style>
