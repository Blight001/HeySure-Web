<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl, type RcInput, type RcMode, type RcMouseButton } from '@/composables/useRemoteControl'

const props = withDefaults(defineProps<{
  deviceId: string
  deviceName?: string
  mode?: RcMode
}>(), { mode: 'android' })
const emit = defineEmits<{ (e: 'close'): void }>()

// Desktop and browser share the same mouse+keyboard control surface and render
// a landscape <video>; only the device-side injection differs (robotjs vs CDP).
const isDesktopLike = computed(() => props.mode === 'desktop' || props.mode === 'browser')
const modeLabel = computed(() =>
  props.mode === 'browser' ? '（浏览器）' : props.mode === 'desktop' ? '（桌面）' : '')

// Desktop/browser get a big, freely resizable panel (drag the bottom-right
// corner); phone keeps a compact portrait window.
const panelStyle = computed(() => isDesktopLike.value
  ? { width: '80vw', height: '85vh', minWidth: '480px', minHeight: '360px', maxWidth: '98vw', maxHeight: '95vh' }
  : {})

const {
  status,
  errorMessage,
  deviceWidth,
  deviceHeight,
  remoteStream,
  controlReady,
  connectionState,
  browserState,
  start,
  stop,
  sendInput,
  sendBrowserCommand,
} = useRemoteControl()

// ── Edge-style browser chrome (browser-extension mode only) ──────────────────
const isBrowser = computed(() => props.mode === 'browser')
const addressInput = ref('')
const addressFocused = ref(false)
const activeTab = computed(() => browserState.value?.tabs.find(t => t.active) || null)

// Keep the address bar mirroring the live URL, but never clobber what the
// operator is mid-typing.
watch(activeTab, (tab) => {
  if (!addressFocused.value) addressInput.value = tab?.url || ''
})

const submitAddress = (event: Event) => {
  ;(event.target as HTMLInputElement)?.blur()
  sendBrowserCommand({ action: 'navigate', url: addressInput.value })
}
const navBack = () => sendBrowserCommand({ action: 'back' })
const navForward = () => sendBrowserCommand({ action: 'forward' })
const navReload = () => sendBrowserCommand({ action: 'reload' })
const switchTab = (tabId: number) => sendBrowserCommand({ action: 'switch-tab', tabId })
const closeTab = (tabId: number) => sendBrowserCommand({ action: 'close-tab', tabId })
const newTab = () => sendBrowserCommand({ action: 'new-tab' })
const onFaviconError = (event: Event) => { (event.target as HTMLElement).style.visibility = 'hidden' }

const videoRef = ref<HTMLVideoElement | null>(null)
const surfaceRef = ref<HTMLElement | null>(null)
// Hidden field that owns keyboard focus on desktop: raw keys are forwarded
// natively (down/up), while IME composition is captured invisibly so 中文 still
// types through without a visible input box.
const imeRef = ref<HTMLTextAreaElement | null>(null)
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
  return { aspectRatio: isDesktopLike.value ? '16 / 9' : '9 / 19.5' }
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
  if (isDesktopLike.value) {
    // Grab keyboard focus into the hidden IME field so typing reaches the remote.
    imeRef.value?.focus()
    sendInput({ type: 'down', x: pos.x, y: pos.y, button: mouseButton(event.button) })
  } else {
    down = { ...pos, t: Date.now() }
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (status.value !== 'streaming' || !isDesktopLike.value) return
  const now = Date.now()
  if (now - lastMoveAt < MOVE_INTERVAL_MS) return
  lastMoveAt = now
  const pos = normalized(event)
  if (pos) sendInput({ type: 'move', x: pos.x, y: pos.y })
}

const onPointerUp = (event: PointerEvent) => {
  if (status.value !== 'streaming') return
  const pos = normalized(event) || null
  if (isDesktopLike.value) {
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
  if (status.value !== 'streaming' || !isDesktopLike.value) return
  event.preventDefault()
  sendInput({ type: 'scroll', dx: event.deltaX, dy: event.deltaY })
}

// Native key forwarding: each physical key (modifiers included) is sent as
// down/up, so the remote reproduces holds and combos (Ctrl+C, Shift+arrows…)
// exactly. While an IME is composing we stay out of the way and let
// onCompositionEnd ship the finished text instead.
// Desktop (robotjs) replays modifiers as their own key holds; browser (CDP) wants
// a modifier bitmask per key event and ignores standalone modifier presses. So
// browser mode carries the modifier booleans, desktop mode does not.
const MODIFIER_ONLY = new Set(['Control', 'Alt', 'Shift', 'Meta'])
const keyPayload = (event: KeyboardEvent, action: 'down' | 'up'): RcInput | null => {
  if (props.mode === 'browser') {
    if (MODIFIER_ONLY.has(event.key)) return null
    return { type: 'key', action, key: event.key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }
  }
  return { type: 'key', action, key: event.key }
}

const onKeyDown = (event: KeyboardEvent) => {
  if (status.value !== 'streaming' || !isDesktopLike.value) return
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (event.repeat) return // the remote OS auto-repeats a held key
  const payload = keyPayload(event, 'down')
  if (payload) sendInput(payload)
}

const onKeyUp = (event: KeyboardEvent) => {
  if (status.value !== 'streaming' || !isDesktopLike.value) return
  if (event.isComposing) return
  event.preventDefault()
  const payload = keyPayload(event, 'up')
  if (payload) sendInput(payload)
}

const onCompositionEnd = (event: CompositionEvent) => {
  if (status.value !== 'streaming' || !isDesktopLike.value) return
  const text = event.data
  if (text) sendInput({ type: 'text', text })
  if (imeRef.value) imeRef.value.value = '' // don't let the hidden field accumulate
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
        class="flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        :class="isDesktopLike ? 'resize' : 'w-full max-w-sm max-h-[92vh]'"
        :style="panelStyle"
        @click.stop
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-100 truncate">
              远程控制{{ modeLabel }} · {{ deviceName || deviceId }}
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

        <!-- Edge 风格浏览器外壳（仅浏览器控制） -->
        <div v-if="isBrowser" class="border-b border-zinc-800 bg-zinc-950/60">
          <!-- 标签栏 -->
          <div class="flex items-end gap-1 px-2 pt-2 overflow-x-auto rc-tabstrip">
            <button
              v-for="tab in browserState?.tabs || []"
              :key="tab.id"
              class="group flex items-center gap-1.5 min-w-[120px] max-w-[200px] px-2 py-1.5 rounded-t-lg border border-b-0 text-xs transition-colors"
              :class="tab.active ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-900/60 border-transparent text-zinc-400 hover:bg-zinc-800/60'"
              :title="tab.title"
              @click="switchTab(tab.id)"
            >
              <img v-if="tab.favIconUrl" :src="tab.favIconUrl" class="w-3.5 h-3.5 shrink-0 rounded-sm" alt="" @error="onFaviconError" />
              <span class="flex-1 truncate text-left">{{ tab.title || '新标签页' }}</span>
              <span class="grid h-4 w-4 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-600 hover:text-white" title="关闭标签页" @click.stop="closeTab(tab.id)">✕</span>
            </button>
            <button class="mb-0.5 h-7 w-7 shrink-0 rounded text-base leading-none text-zinc-400 hover:bg-zinc-800 hover:text-white" title="新建标签页" @click="newTab">＋</button>
          </div>
          <!-- 工具栏 + 地址栏 -->
          <div class="flex items-center gap-1.5 px-2 py-1.5">
            <button class="rc-toolbtn" title="后退" :disabled="status !== 'streaming'" @click="navBack">‹</button>
            <button class="rc-toolbtn" title="前进" :disabled="status !== 'streaming'" @click="navForward">›</button>
            <button class="rc-toolbtn" title="刷新" :disabled="status !== 'streaming'" @click="navReload">⟳</button>
            <input
              v-model="addressInput"
              type="text"
              placeholder="搜索或输入网址"
              class="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              :disabled="status !== 'streaming'"
              @focus="addressFocused = true"
              @blur="addressFocused = false"
              @keyup.enter="submitAddress"
              @keydown.stop
            />
          </div>
        </div>

        <!-- 画面 -->
        <div class="relative flex-1 min-h-0 overflow-auto bg-black flex items-center justify-center p-3">
          <div
            ref="surfaceRef"
            class="relative w-full max-h-full outline-none"
            :style="aspectStyle"
          >
            <!-- Invisible keyboard/IME sink (desktop). pointer-events:none so it
                 never blocks the mouse; focused programmatically on click. -->
            <textarea
              v-if="isDesktopLike"
              ref="imeRef"
              class="absolute inset-0 z-10 opacity-0 resize-none pointer-events-none"
              autocomplete="off"
              autocapitalize="off"
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
              :class="isDesktopLike ? 'cursor-crosshair' : ''"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @wheel="onWheel"
              @contextmenu.prevent
            ></video>
            <div v-if="status !== 'streaming'" class="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
              <span v-if="status === 'error'" class="px-3 text-center text-rose-300">{{ errorMessage }}</span>
              <span v-else-if="status === 'ended'">会话已结束</span>
              <span v-else class="flex flex-col items-center gap-2 text-center px-3">
                <span class="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></span>
                正在连接设备…<span class="text-zinc-500">P2P：{{ connectionState }}</span>
              </span>
            </div>
            <!-- 画面已出但控制通道未就绪：明确告诉用户鼠标/键盘暂不可用 -->
            <div
              v-if="status === 'streaming' && !controlReady"
              class="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-1 text-[11px] text-white shadow"
            >
              控制通道未就绪，鼠标/键盘暂不可用…
            </div>
          </div>
        </div>

        <!-- 文本输入（仅安卓：手机无逐键注入，靠整段文本写入聚焦框） -->
        <div v-if="!isDesktopLike" class="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
          <input
            v-model="typing"
            type="text"
            placeholder="向聚焦输入框发送文本…"
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

        <!-- 导航键（安卓）/ 操作提示（桌面、浏览器） -->
        <div v-if="!isDesktopLike" class="grid grid-cols-3 gap-2 px-3 py-3 border-t border-zinc-800">
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('back')">返回</button>
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('home')">主页</button>
          <button class="rc-navbtn" :disabled="status !== 'streaming'" @click="sendKey('recents')">最近</button>
        </div>
        <div v-else class="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
          左键点击/拖拽 · 右键、中键 · 滚轮滚动 · 点击画面后直接用键盘输入（支持 Ctrl/Alt 组合键与中文输入法）
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

.rc-toolbtn {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  border-radius: 9999px;
  color: rgb(212 212 216);
  font-size: 1rem;
  line-height: 1;
  transition: background-color 0.15s, color 0.15s;
}
.rc-toolbtn:hover:not(:disabled) {
  background: rgb(39 39 42);
  color: #fff;
}
.rc-toolbtn:disabled {
  opacity: 0.4;
}

.rc-tabstrip::-webkit-scrollbar {
  height: 4px;
}
.rc-tabstrip::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}
</style>
