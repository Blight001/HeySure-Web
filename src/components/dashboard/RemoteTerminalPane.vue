<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useRemoteTerminal } from '@/composables/useRemoteTerminal'

const props = defineProps<{ deviceId: string }>()
const { status, errorMessage, start, sendInput, resize, stop } = useRemoteTerminal()
const hostRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let inputDisposable: { dispose: () => void } | null = null

const statusText = computed(() => {
  if (status.value === 'connecting') return '正在连接终端…'
  if (status.value === 'streaming') return '终端已连接'
  if (status.value === 'error') return errorMessage.value || '终端连接失败'
  if (status.value === 'ended') return '终端会话已结束'
  return '终端未连接'
})

const fitTerminal = () => {
  if (!terminal || !fitAddon) return
  try {
    fitAddon.fit()
    resize(terminal.cols, terminal.rows)
  } catch {
    // The pane can briefly have no dimensions while its tab is mounting.
  }
}

onMounted(() => {
  if (!hostRef.value) return
  terminal = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", Menlo, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#e4e4e7' },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(hostRef.value)
  fitTerminal()
  inputDisposable = terminal.onData(sendInput)
  resizeObserver = new ResizeObserver(fitTerminal)
  resizeObserver.observe(hostRef.value)
  start(props.deviceId, {
    cols: terminal.cols,
    rows: terminal.rows,
    onData: bytes => terminal?.write(bytes),
  })
  terminal.focus()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  inputDisposable?.dispose()
  stop()
  terminal?.dispose()
  resizeObserver = null
  inputDisposable = null
  terminal = null
  fitAddon = null
})
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-[#09090b]" aria-label="远程终端">
    <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs" :class="status === 'streaming' ? 'text-emerald-400' : status === 'error' ? 'text-rose-400' : 'text-amber-400'">
      <span class="h-1.5 w-1.5 rounded-full" :class="status === 'streaming' ? 'bg-emerald-400' : status === 'error' ? 'bg-rose-400' : 'bg-amber-400'"></span>
      {{ statusText }}
    </div>
    <div class="relative min-h-0 flex-1 p-2">
      <div ref="hostRef" class="absolute inset-2"></div>
    </div>
  </section>
</template>
