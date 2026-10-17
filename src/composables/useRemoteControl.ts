import { ref, shallowRef } from 'vue'
import {
  attachSocketHandlers,
  emptyRemoteControlState,
  teardownSession,
  type RemoteControlCtx,
} from './useRemoteControlHelpers'

export type RcStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended'
export type RcMode = 'android' | 'desktop' | 'browser' | 'custom'
export type RcMouseButton = 'left' | 'right' | 'middle'
export type RcQualityPreset = 'smooth' | 'balanced' | 'clear'

export interface RcInput {
  type: 'tap' | 'long_press' | 'swipe' | 'key' | 'text' | 'move' | 'down' | 'up' | 'click' | 'scroll'
  x?: number
  y?: number
  x2?: number
  y2?: number
  durationMs?: number
  key?: string
  text?: string
  button?: RcMouseButton
  double?: boolean
  dx?: number
  dy?: number
  action?: 'down' | 'up' | 'tap'
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export interface RcBrowserTab {
  id: number
  title: string
  url: string
  favIconUrl: string
  active: boolean
}
export interface RcBrowserState {
  activeTabId: number
  tabs: RcBrowserTab[]
  controllable?: boolean
}
export type RcBrowserCommand =
  | { action: 'back' | 'forward' | 'reload' }
  | { action: 'navigate' | 'new-tab'; url?: string }
  | { action: 'switch-tab' | 'close-tab'; tabId: number }

export const sendDataChannelJson = (channel: RTCDataChannel | null, payload: unknown, maxBufferedAmount: number) => {
  if (channel?.readyState !== 'open' || channel.bufferedAmount > maxBufferedAmount) return false
  try { channel.send(JSON.stringify(payload)); return true }
  catch { return false }
}

export const createFastChannelJsonSender = (getChannel: () => RTCDataChannel | null) => {
  let backpressured = false
  return {
    send(payload: unknown) {
      const channel = getChannel()
      if (channel?.readyState !== 'open') {
        backpressured = false
        return false
      }
      if (backpressured && channel.bufferedAmount > 16 * 1024) return false
      if (backpressured) backpressured = false
      if (channel.bufferedAmount > 64 * 1024) {
        backpressured = true
        return false
      }
      return sendDataChannelJson(channel, payload, 64 * 1024)
    },
    reset() { backpressured = false },
  }
}

export const useRemoteControl = () => {
  const status = ref<RcStatus>('idle')
  const errorMessage = ref('')
  const deviceWidth = ref(0)
  const deviceHeight = ref(0)
  const remoteStream = shallowRef<MediaStream | null>(null)
  const controlReady = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const browserState = ref<RcBrowserState | null>(null)
  const webStateReady = ref(false)
  const webResourceReady = ref(false)
  const controllerFastReady = ref(false)
  const session: RemoteControlCtx = {
    status,
    errorMessage,
    deviceWidth,
    deviceHeight,
    remoteStream,
    controlReady,
    connectionState,
    browserState,
    webStateReady,
    webResourceReady,
    controllerFastReady,
    ...emptyRemoteControlState(),
  }
  const fastSender = createFastChannelJsonSender(() => session.controllerFastChannel)

  const start = (deviceId: string, options?: { qualityPreset?: RcQualityPreset; requestWebMirror?: boolean }) => {
    if (status.value === 'connecting' || status.value === 'streaming') return
    session.requestedQualityPreset = options?.qualityPreset || 'balanced'
    session.requestWebMirror = options?.requestWebMirror === true
    status.value = 'connecting'
    errorMessage.value = ''
    attachSocketHandlers(session, deviceId)
  }

  const sendJson = (payload: unknown, maxBufferedAmount = 512 * 1024) => sendDataChannelJson(session.controlChannel, payload, maxBufferedAmount)
  const sendFastJson = (payload: unknown) => fastSender.send(payload)
  const sendWebStateJson = (payload: unknown) => sendDataChannelJson(session.webStateChannel, payload, 256 * 1024)

  const stop = () => {
    teardownSession(session, true)
    fastSender.reset()
    status.value = 'idle'
  }

  return {
    status,
    errorMessage,
    deviceWidth,
    deviceHeight,
    remoteStream,
    controlReady,
    connectionState,
    browserState,
    webStateReady,
    webResourceReady,
    controllerFastReady,
    start,
    stop,
    sendInput: (input: RcInput) => sendJson(input),
    sendBrowserCommand: (cmd: RcBrowserCommand) => sendJson({ kind: 'browser', ...cmd }),
    setQualityPreset: (preset: RcQualityPreset) => {
      session.requestedQualityPreset = preset
      sendJson({ kind: 'quality', preset })
    },
    getSessionId: () => session.sessionId,
    sendControlJson: sendJson,
    sendFastJson,
    sendWebStateJson,
    setRemoteChannelHandlers: (handlers: {
      control?: (data: unknown) => void
      webState?: (data: unknown) => void
      webResource?: (data: unknown) => void
    }) => {
      session.controlMessageHandler = handlers.control || null
      session.webStateHandler = handlers.webState || null
      session.webResourceHandler = handlers.webResource || null
    },
  }
}
