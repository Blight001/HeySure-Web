import type { Ref } from 'vue'
import type { Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'
import { createConnectorSocket } from './connectorSocket'
import type { RtStatus } from './useRemoteTerminal'

export interface RtStartOptions {
  cols?: number
  rows?: number
  shell?: string
  cwd?: string
  onData: (bytes: Uint8Array) => void
}

export interface RemoteTerminalContext {
  status: Ref<RtStatus>
  errorMessage: Ref<string>
  socket: Socket | null
  sessionId: string
  output: ((bytes: Uint8Array) => void) | null
}

const encoder = new TextEncoder()

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return new Uint8Array(0)
  }
}

export const encodeTerminalInput = (value: string) => bytesToBase64(encoder.encode(value))

export const createRemoteTerminalContext = (
  status: Ref<RtStatus>,
  errorMessage: Ref<string>,
): RemoteTerminalContext => ({ status, errorMessage, socket: null, sessionId: '', output: null })

const matchesSession = (ctx: RemoteTerminalContext, data?: { sessionId?: string }) =>
  !!ctx.sessionId && data?.sessionId === ctx.sessionId

export const teardownRemoteTerminal = (ctx: RemoteTerminalContext, notifyServer: boolean) => {
  if (notifyServer && ctx.socket && ctx.sessionId) ctx.socket.emit('rt:close', { sessionId: ctx.sessionId })
  ctx.socket?.off()
  ctx.socket?.disconnect()
  ctx.socket = null
  ctx.sessionId = ''
  ctx.output = null
}

const failTerminal = (ctx: RemoteTerminalContext, message: string) => {
  ctx.errorMessage.value = message
  ctx.status.value = 'error'
  teardownRemoteTerminal(ctx, false)
}

const attachTerminalDataHandlers = (ctx: RemoteTerminalContext) => {
  ctx.socket?.on('rt:data', (data: { sessionId?: string; data?: string }) => {
    if (!matchesSession(ctx, data) || !data.data) return
    const bytes = base64ToBytes(data.data)
    if (bytes.length) ctx.output?.(bytes)
  })
  ctx.socket?.on('rt:exit', (data: { sessionId?: string; code?: number | null }) => {
    if (!matchesSession(ctx, data)) return
    const suffix = data.code == null ? '' : `，退出码 ${data.code}`
    ctx.output?.(encoder.encode(`\r\n\x1b[90m[会话结束${suffix}]\x1b[0m\r\n`))
    ctx.status.value = 'ended'
    teardownRemoteTerminal(ctx, false)
  })
  ctx.socket?.on('rt:close', (data: { sessionId?: string }) => {
    if (!matchesSession(ctx, data)) return
    ctx.status.value = 'ended'
    teardownRemoteTerminal(ctx, false)
  })
}

export const attachRemoteTerminalSocket = (
  ctx: RemoteTerminalContext,
  deviceId: string,
  options: RtStartOptions,
) => {
  ctx.socket = createConnectorSocket()
  ctx.socket.on('connect', () => ctx.socket?.emit('rt:open', {
    deviceId,
    token: getAuthToken(),
    shell: options.shell,
    cwd: options.cwd,
    cols: options.cols,
    rows: options.rows,
  }))
  ctx.socket.on('connect_error', () => failTerminal(ctx, '终端通道连接失败'))
  ctx.socket.on('rt:opened', (data: { sessionId?: string }) => {
    if (!data?.sessionId || ctx.sessionId) return
    ctx.sessionId = data.sessionId
    ctx.status.value = 'streaming'
  })
  ctx.socket.on('rt:error', (data: { sessionId?: string; message?: string }) => {
    if (ctx.sessionId && !matchesSession(ctx, data)) return
    failTerminal(ctx, data?.message || '命令行远程启动失败')
  })
  attachTerminalDataHandlers(ctx)
}
