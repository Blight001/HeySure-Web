<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useRemoteTerminal } from '@/composables/useRemoteTerminal'

// 命令行远程（PTY）面板：画面远程（RemoteControlModal）的命令行姊妹。走服务器
// rt:* Socket.IO relay，无 WebRTC / 无 TURN 依赖。xterm.js 负责渲染真实终端
// （ANSI 颜色、光标、TUI 程序），键入回传给远端 PTY。
const props = defineProps<{ deviceId: string; deviceName?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { status, errorMessage, start, sendInput, resize, stop } = useRemoteTerminal()

const panelRef = ref<HTMLElement | null>(null)
const termHost = ref<HTMLElement | null>(null)
const isMaximized = ref(false)

let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

const statusText = computed(() => {
  switch (status.value) {
    case 'connecting': return '正在连接终端…'
    case 'streaming': return '命令行远程中'
    case 'error': return errorMessage.value || '连接失败'
    case 'ended': return '会话已结束'
    default: return '未连接'
  }
})

const doFit = () => {
  if (!fit || !term) return
  try {
    fit.fit()
    if (status.value === 'streaming') resize(term.cols, term.rows)
  } catch { /* host not laid out yet */ }
}

const toggleMaximize = () => {
  isMaximized.value = !isMaximized.value
  // Let the layout settle before refitting the terminal to the new size.
  requestAnimationFrame(() => requestAnimationFrame(doFit))
}

const close = () => {
  stop()
  emit('close')
}

onMounted(() => {
  if (!termHost.value) return
  term = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", Menlo, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#e4e4e7' },
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(termHost.value)
  doFit()

  // Keystrokes → remote PTY; local resize → tell the remote PTY to reflow.
  term.onData((data) => sendInput(data))

  // Refit (and re-report size) whenever the panel is resized/maximized.
  resizeObserver = new ResizeObserver(() => doFit())
  resizeObserver.observe(termHost.value)

  start(props.deviceId, {
    cols: term.cols,
    rows: term.rows,
    onData: (bytes) => term?.write(bytes),
  })
  term.focus()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  stop()
  term?.dispose()
  term = null
  fit = null
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[120] flex items-center justify-center modal-overlay p-4" @click.self="close">
      <div
        ref="panelRef"
        class="flex flex-col rounded-2xl border border-zinc-700/70 bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden resize"
        :class="{ 'rt-panel-maximized': isMaximized }"
        style="min-width: 520px; min-height: 340px; max-width: 98vw; max-height: 95vh; width: 76vw; height: 68vh;"
        @click.stop
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-zinc-100 truncate">
              命令行远程 · {{ deviceName || deviceId }}
            </div>
            <div
              class="text-xs mt-0.5 flex items-center gap-1.5"
              :class="status === 'streaming' ? 'text-emerald-400' : status === 'error' ? 'text-rose-400' : 'text-amber-400'"
            >
              <span
                class="inline-block w-1.5 h-1.5 rounded-full"
                :class="status === 'streaming' ? 'bg-emerald-400 animate-pulse' : status === 'error' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse'"
              ></span>
              {{ statusText }}
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              :title="isMaximized ? '退出全屏' : '全屏'"
              @click="toggleMaximize"
            >
              <svg v-if="!isMaximized" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
                <path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
              <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M16 3v3a2 2 0 0 0 2 2h3" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            </button>
            <button class="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-lg leading-none" title="关闭" @click="close">
              ✕
            </button>
          </div>
        </div>

        <!-- 终端画面 -->
        <div class="relative flex-1 min-h-0 bg-[#09090b] p-2">
          <div ref="termHost" class="absolute inset-2"></div>
          <div
            v-if="status === 'error'"
            class="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded bg-rose-500/90 px-3 py-1 text-[11px] text-white shadow"
          >
            {{ errorMessage }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rt-panel-maximized {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  /* 移动端地址栏伸缩时 100vh 超出可视高度，dvh 跟随动态视口（旧浏览器回退上一行） */
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  border-radius: 0 !important;
  resize: none !important;
}
</style>
