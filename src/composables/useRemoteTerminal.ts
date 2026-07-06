import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'

/**
 * Drives one human-operated remote *terminal* session (命令行远程) against a
 * desktop device — the command-line sibling of ``useRemoteControl`` (画面远程).
 *
 * Transport (see server ``connector_runtime/dispatch/remote_terminal.py``):
 *   - Unlike screen-remote (P2P WebRTC video + input), the terminal is a plain
 *     low-bandwidth byte stream, so it rides the **Socket.IO relay itself** — the
 *     bytes hop browser ↔ server ↔ device over the same gateway. No WebRTC, no
 *     SDP/ICE, and **no TURN dependency**: this works across NAT/public internet
 *     even where screen-remote can't.
 *
 * Byte framing: ``data`` on the wire is base64 of the raw terminal bytes so ANSI
 * / cursor / control sequences survive intact. Keystrokes (a JS string from
 * xterm's ``onData``) are UTF-8 encoded then base64'd on the way out; PTY output
 * is base64-decoded to a ``Uint8Array`` and handed to the caller to render.
 */

export type RtStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended'

export interface RtStartOptions {
  cols?: number
  rows?: number
  shell?: string
  /** Called with each chunk of decoded PTY output bytes (feed to xterm.write). */
  onData: (bytes: Uint8Array) => void
}

const encoder = new TextEncoder()

/** Raw bytes → base64 (browser-safe, chunked so large frames don't overflow the
 *  call stack in String.fromCharCode). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** base64 → raw bytes. Returns an empty array on malformed input. */
function base64ToBytes(b64: string): Uint8Array {
  try {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return new Uint8Array(0)
  }
}

export const useRemoteTerminal = () => {
  const status = ref<RtStatus>('idle')
  const errorMessage = ref('')

  let socket: Socket | null = null
  let sessionId = ''
  let onData: ((bytes: Uint8Array) => void) | null = null

  const fail = (message: string) => {
    errorMessage.value = message
    status.value = 'error'
  }

  /** Open a terminal session for ``deviceId``. */
  const start = (deviceId: string, options: RtStartOptions) => {
    if (status.value === 'connecting' || status.value === 'streaming') return
    status.value = 'connecting'
    errorMessage.value = ''
    onData = options.onData
    socket = io('/', { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      socket?.emit('rt:open', {
        deviceId,
        token: getAuthToken(),
        shell: options.shell,
        cols: options.cols,
        rows: options.rows,
      })
    })
    socket.on('connect_error', () => fail('信令通道连接失败'))
    socket.on('rt:opened', (data: { sessionId: string }) => {
      sessionId = data?.sessionId || ''
      status.value = 'streaming'
    })
    socket.on('rt:error', (data: { message?: string }) => {
      fail(data?.message || '命令行远程启动失败')
    })
    socket.on('rt:data', (data: { sessionId: string; data: string }) => {
      if (data?.sessionId !== sessionId || !data?.data) return
      onData?.(base64ToBytes(data.data))
    })
    socket.on('rt:exit', (data: { code?: number | null }) => {
      status.value = 'ended'
      const code = data?.code
      onData?.(encoder.encode(`\r\n\x1b[90m[会话结束${code != null ? `，退出码 ${code}` : ''}]\x1b[0m\r\n`))
      teardown(false)
    })
  }

  /** Send one keystroke string (xterm onData) into the remote PTY. */
  const sendInput = (data: string) => {
    if (status.value !== 'streaming' || !socket || !sessionId || !data) return
    socket.emit('rt:input', { sessionId, data: bytesToBase64(encoder.encode(data)) })
  }

  /** Tell the remote PTY the window resized (so TUI apps reflow). */
  const resize = (cols: number, rows: number) => {
    if (status.value !== 'streaming' || !socket || !sessionId) return
    socket.emit('rt:resize', { sessionId, cols, rows })
  }

  const teardown = (notifyServer: boolean) => {
    if (notifyServer && socket && sessionId) socket.emit('rt:close', { sessionId })
    if (socket) {
      socket.off()
      socket.disconnect()
      socket = null
    }
    sessionId = ''
    onData = null
  }

  /** Operator closed the panel. */
  const stop = () => {
    teardown(true)
    status.value = 'idle'
  }

  return { status, errorMessage, start, sendInput, resize, stop }
}
