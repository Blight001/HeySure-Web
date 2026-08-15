import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'
import { fetchIceServers, DEFAULT_ICE_SERVERS, type IceServer } from '@/api/rtc'
import type { RcBrowserState, RcQualityPreset, RcStatus } from './useRemoteControl'

export const connectorSocketUrl = () => {
  const url = new URL(window.location.href)
  url.port = '3002'
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.origin
}

export type RemoteControlCtx = {
  status: { value: RcStatus }
  errorMessage: { value: string }
  deviceWidth: { value: number }
  deviceHeight: { value: number }
  remoteStream: { value: MediaStream | null }
  controlReady: { value: boolean }
  connectionState: { value: RTCPeerConnectionState }
  browserState: { value: RcBrowserState | null }
  socket: Socket | null
  pc: RTCPeerConnection | null
  iceServers: IceServer[]
  controlChannel: RTCDataChannel | null
  sessionId: string
  requestedQualityPreset: RcQualityPreset
  pendingIce: RTCIceCandidateInit[]
}

export function failSession(ctx: RemoteControlCtx, message: string) {
  ctx.errorMessage.value = message
  ctx.status.value = 'error'
}

export function attachPeerHandlers(ctx: RemoteControlCtx, connection: RTCPeerConnection) {
  connection.ontrack = (event) => {
    ctx.remoteStream.value = event.streams[0] || null
  }
  connection.onicecandidate = (event) => {
    if (event.candidate && ctx.sessionId) {
      ctx.socket?.emit('rc:ice', { sessionId: ctx.sessionId, candidate: event.candidate.toJSON() })
    }
  }
  connection.ondatachannel = (event) => {
    if (event.channel.label !== 'control') return
    ctx.controlChannel = event.channel
    ctx.controlReady.value = ctx.controlChannel.readyState === 'open'
    ctx.controlChannel.onopen = () => {
      ctx.controlReady.value = true
      ctx.controlChannel?.send(JSON.stringify({ kind: 'quality', preset: ctx.requestedQualityPreset }))
    }
    ctx.controlChannel.onclose = () => { ctx.controlReady.value = false }
    ctx.controlChannel.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(String(msg.data))
        if (parsed?.kind === 'browser-state') ctx.browserState.value = parsed.state
      } catch { /* ignore malformed */ }
    }
  }
  connection.onconnectionstatechange = () => {
    const state = connection.connectionState
    ctx.connectionState.value = state
    if (state === 'connected') ctx.status.value = 'streaming'
    else if (state === 'failed') failSession(ctx, '点对点连接失败（可能需要 TURN 服务器或双方网络受限）')
    else if (state === 'disconnected' || state === 'closed') {
      if (ctx.status.value === 'streaming' || ctx.status.value === 'connecting') ctx.status.value = 'ended'
    }
  }
}

export async function handleRemoteOffer(ctx: RemoteControlCtx, data: { sessionId: string; sdp: string }) {
  ctx.sessionId = data.sessionId
  ctx.iceServers = await fetchIceServers()
  if (!ctx.pc) {
    ctx.pc = new RTCPeerConnection({ iceServers: ctx.iceServers as RTCIceServer[] })
    attachPeerHandlers(ctx, ctx.pc)
  }
  await ctx.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
  for (const candidate of ctx.pendingIce.splice(0)) {
    await ctx.pc.addIceCandidate(candidate).catch(() => {})
  }
  const answer = await ctx.pc.createAnswer()
  await ctx.pc.setLocalDescription(answer)
  ctx.socket?.emit('rc:answer', { sessionId: ctx.sessionId, sdp: answer.sdp })
}

export async function handleRemoteIce(ctx: RemoteControlCtx, data: { candidate: RTCIceCandidateInit }) {
  if (!data?.candidate) return
  if (ctx.pc?.remoteDescription) {
    await ctx.pc.addIceCandidate(data.candidate).catch(() => {})
    return
  }
  ctx.pendingIce.push(data.candidate)
}

export function attachSocketHandlers(ctx: RemoteControlCtx, deviceId: string) {
  ctx.socket = io(connectorSocketUrl(), { transports: ['websocket', 'polling'] })
  ctx.socket.on('connect', () => {
    ctx.socket?.emit('rc:start', {
      deviceId,
      token: getAuthToken(),
      qualityPreset: ctx.requestedQualityPreset,
    })
  })
  ctx.socket.on('connect_error', () => failSession(ctx, '信令通道连接失败'))
  ctx.socket.on('rc:started', (data: { sessionId: string }) => { ctx.sessionId = data.sessionId })
  ctx.socket.on('rc:error', (data: { message?: string }) => failSession(ctx, data?.message || '远程控制启动失败'))
  ctx.socket.on('rc:ready', (data: { width: number; height: number }) => {
    ctx.deviceWidth.value = Number(data?.width) || 0
    ctx.deviceHeight.value = Number(data?.height) || 0
  })
  ctx.socket.on('rc:offer', (data: { sessionId: string; sdp: string }) => { void handleRemoteOffer(ctx, data) })
  ctx.socket.on('rc:ice', (data: { candidate: RTCIceCandidateInit }) => { void handleRemoteIce(ctx, data) })
  ctx.socket.on('rc:stopped', () => {
    ctx.status.value = 'ended'
    teardownSession(ctx, false)
  })
}

export function teardownSession(ctx: RemoteControlCtx, notifyServer: boolean) {
  if (notifyServer && ctx.socket && ctx.sessionId) ctx.socket.emit('rc:stop', { sessionId: ctx.sessionId })
  ctx.controlChannel = null
  ctx.controlReady.value = false
  ctx.connectionState.value = 'closed'
  ctx.browserState.value = null
  ctx.pendingIce.length = 0
  ctx.remoteStream.value = null
  if (ctx.pc) {
    ctx.pc.ontrack = null
    ctx.pc.onicecandidate = null
    ctx.pc.ondatachannel = null
    ctx.pc.onconnectionstatechange = null
    ctx.pc.close()
    ctx.pc = null
  }
  if (ctx.socket) {
    ctx.socket.off()
    ctx.socket.disconnect()
    ctx.socket = null
  }
  ctx.sessionId = ''
}

export function emptyRemoteControlState() {
  return {
    iceServers: DEFAULT_ICE_SERVERS as IceServer[],
    controlChannel: null as RTCDataChannel | null,
    sessionId: '',
    requestedQualityPreset: 'balanced' as RcQualityPreset,
    pendingIce: [] as RTCIceCandidateInit[],
    socket: null as Socket | null,
    pc: null as RTCPeerConnection | null,
  }
}
