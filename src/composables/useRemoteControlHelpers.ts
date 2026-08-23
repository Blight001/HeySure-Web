import type { Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'
import { fetchIceServers, DEFAULT_ICE_SERVERS, type IceServer } from '@/api/rtc'
import type { RcBrowserState, RcQualityPreset, RcStatus } from './useRemoteControl'
import { createConnectorSocket } from './connectorSocket'

export type RemoteControlCtx = {
  status: { value: RcStatus }
  errorMessage: { value: string }
  deviceWidth: { value: number }
  deviceHeight: { value: number }
  remoteStream: { value: MediaStream | null }
  controlReady: { value: boolean }
  connectionState: { value: RTCPeerConnectionState }
  browserState: { value: RcBrowserState | null }
  webStateReady: { value: boolean }
  webResourceReady: { value: boolean }
  controllerFastReady: { value: boolean }
  socket: Socket | null
  pc: RTCPeerConnection | null
  iceServers: IceServer[]
  controlChannel: RTCDataChannel | null
  webStateChannel: RTCDataChannel | null
  webResourceChannel: RTCDataChannel | null
  controllerFastChannel: RTCDataChannel | null
  sessionId: string
  requestedQualityPreset: RcQualityPreset
  requestWebMirror: boolean
  pendingIce: RTCIceCandidateInit[]
  controlMessageHandler: ((data: unknown) => void) | null
  webStateHandler: ((data: unknown) => void) | null
  webResourceHandler: ((data: unknown) => void) | null
}

export function failSession(ctx: RemoteControlCtx, message: string) {
  ctx.errorMessage.value = message
  ctx.status.value = 'error'
}

const parseControlMessage = (ctx: RemoteControlCtx, raw: unknown) => {
  if (typeof raw !== 'string' || raw.length > 256 * 1024) return
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'browser-state') ctx.browserState.value = parsed.state
    else ctx.controlMessageHandler?.(parsed)
  } catch { /* ignore malformed control messages */ }
}

const detachRemoteDataChannel = (channel: RTCDataChannel | null) => {
  if (!channel) return
  channel.onopen = null
  channel.onclose = null
  channel.onmessage = null
  channel.onbufferedamountlow = null
}

const attachControlChannel = (ctx: RemoteControlCtx, channel: RTCDataChannel) => {
  detachRemoteDataChannel(ctx.controlChannel)
  ctx.controlChannel = channel
  ctx.controlReady.value = channel.readyState === 'open'
  channel.onopen = () => {
    if (ctx.controlChannel !== channel) return
    ctx.controlReady.value = true
    try { channel.send(JSON.stringify({ kind: 'quality', preset: ctx.requestedQualityPreset })) } catch { /* closed concurrently */ }
  }
  channel.onclose = () => { if (ctx.controlChannel === channel) ctx.controlReady.value = false }
  channel.onmessage = event => { if (ctx.controlChannel === channel) parseControlMessage(ctx, event.data) }
}

const attachWebStateChannel = (ctx: RemoteControlCtx, channel: RTCDataChannel) => {
  detachRemoteDataChannel(ctx.webStateChannel)
  ctx.webStateChannel = channel
  channel.onopen = () => { if (ctx.webStateChannel === channel) ctx.webStateReady.value = true }
  channel.onclose = () => { if (ctx.webStateChannel === channel) ctx.webStateReady.value = false }
  channel.onmessage = event => { if (ctx.webStateChannel === channel) ctx.webStateHandler?.(event.data) }
}

const attachWebResourceChannel = (ctx: RemoteControlCtx, channel: RTCDataChannel) => {
  detachRemoteDataChannel(ctx.webResourceChannel)
  ctx.webResourceChannel = channel
  channel.binaryType = 'arraybuffer'
  channel.onopen = () => { if (ctx.webResourceChannel === channel) ctx.webResourceReady.value = true }
  channel.onclose = () => { if (ctx.webResourceChannel === channel) ctx.webResourceReady.value = false }
  channel.onmessage = event => { if (ctx.webResourceChannel === channel) ctx.webResourceHandler?.(event.data) }
}

const attachControllerFastChannel = (ctx: RemoteControlCtx, channel: RTCDataChannel) => {
  detachRemoteDataChannel(ctx.controllerFastChannel)
  ctx.controllerFastChannel = channel
  channel.bufferedAmountLowThreshold = 16 * 1024
  channel.onopen = () => { if (ctx.controllerFastChannel === channel) ctx.controllerFastReady.value = true }
  channel.onclose = () => { if (ctx.controllerFastChannel === channel) ctx.controllerFastReady.value = false }
}

export const attachRemoteDataChannel = (ctx: RemoteControlCtx, channel: RTCDataChannel) => {
  if (channel.label === 'control') attachControlChannel(ctx, channel)
  else if (channel.label === 'web-state') attachWebStateChannel(ctx, channel)
  else if (channel.label === 'web-resource') attachWebResourceChannel(ctx, channel)
  else if (channel.label === 'controller-fast') attachControllerFastChannel(ctx, channel)
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
    attachRemoteDataChannel(ctx, event.channel)
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
  ctx.socket = createConnectorSocket()
  ctx.socket.on('connect', () => {
    ctx.socket?.emit('rc:start', {
      deviceId,
      token: getAuthToken(),
      qualityPreset: ctx.requestedQualityPreset,
      ...(ctx.requestWebMirror ? { requestedSurfaces: ['dom', 'video'], protocolVersions: [1] } : {}),
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
  detachRemoteDataChannel(ctx.controlChannel)
  detachRemoteDataChannel(ctx.webStateChannel)
  detachRemoteDataChannel(ctx.webResourceChannel)
  detachRemoteDataChannel(ctx.controllerFastChannel)
  ctx.controlChannel = null
  ctx.webStateChannel = null
  ctx.webResourceChannel = null
  ctx.controllerFastChannel = null
  ctx.controlReady.value = false
  ctx.webStateReady.value = false
  ctx.webResourceReady.value = false
  ctx.controllerFastReady.value = false
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
  ctx.controlMessageHandler = null
  ctx.webStateHandler = null
  ctx.webResourceHandler = null
}

export function emptyRemoteControlState() {
  return {
    iceServers: DEFAULT_ICE_SERVERS as IceServer[],
    controlChannel: null as RTCDataChannel | null,
    webStateChannel: null as RTCDataChannel | null,
    webResourceChannel: null as RTCDataChannel | null,
    controllerFastChannel: null as RTCDataChannel | null,
    sessionId: '',
    requestedQualityPreset: 'balanced' as RcQualityPreset,
    requestWebMirror: false,
    controlMessageHandler: null as ((data: unknown) => void) | null,
    webStateHandler: null as ((data: unknown) => void) | null,
    webResourceHandler: null as ((data: unknown) => void) | null,
    pendingIce: [] as RTCIceCandidateInit[],
    socket: null as Socket | null,
    pc: null as RTCPeerConnection | null,
  }
}
