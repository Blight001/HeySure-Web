import { ref, shallowRef } from 'vue'
import {
  attachSocketHandlers,
  emptyRemoteControlState,
  teardownSession,
  type RemoteControlCtx,
} from './useRemoteControlHelpers'

export type RcStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended'
export type RcMode = 'android' | 'desktop' | 'browser'
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

export const useRemoteControl = () => {
  const status = ref<RcStatus>('idle')
  const errorMessage = ref('')
  const deviceWidth = ref(0)
  const deviceHeight = ref(0)
  const remoteStream = shallowRef<MediaStream | null>(null)
  const controlReady = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const browserState = ref<RcBrowserState | null>(null)
  const session: RemoteControlCtx = {
    status,
    errorMessage,
    deviceWidth,
    deviceHeight,
    remoteStream,
    controlReady,
    connectionState,
    browserState,
    ...emptyRemoteControlState(),
  }

  const start = (deviceId: string, options?: { qualityPreset?: RcQualityPreset }) => {
    if (status.value === 'connecting' || status.value === 'streaming') return
    session.requestedQualityPreset = options?.qualityPreset || 'balanced'
    status.value = 'connecting'
    errorMessage.value = ''
    attachSocketHandlers(session, deviceId)
  }

  const sendJson = (payload: unknown) => {
    if (session.controlChannel?.readyState === 'open') {
      session.controlChannel.send(JSON.stringify(payload))
    }
  }

  const stop = () => {
    teardownSession(session, true)
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
    start,
    stop,
    sendInput: (input: RcInput) => sendJson(input),
    sendBrowserCommand: (cmd: RcBrowserCommand) => sendJson({ kind: 'browser', ...cmd }),
    setQualityPreset: (preset: RcQualityPreset) => {
      session.requestedQualityPreset = preset
      sendJson({ kind: 'quality', preset })
    },
  }
}
