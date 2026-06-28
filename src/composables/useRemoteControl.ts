import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'

/**
 * Drives one human-operated remote-control session against an Android device.
 *
 * Transport split (see server ``connector_runtime/dispatch/remote_control.py``):
 *   - Signaling rides a Socket.IO connection to the same gateway the dashboard
 *     uses. The browser is the **answerer**; the device offers.
 *   - Media (the live screen) and input (taps/swipes over a ``control``
 *     DataChannel) ride a peer-to-peer WebRTC link — they never touch the server.
 *
 * Coordinates sent to the device are normalized to [0,1] of the screen so the
 * browser never needs the device's pixel size; the device scales them back.
 */

export type RcStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended'

export type RcMode = 'android' | 'desktop' | 'browser'
export type RcMouseButton = 'left' | 'right' | 'middle'

/**
 * One input event sent over the control DataChannel. Both device families read
 * the same envelope but only act on the types they support: Android uses
 * tap/long_press/swipe + nav keys; desktop uses move/down/up/click/scroll +
 * keyboard. The unused fields are simply ignored by the other side.
 */
export interface RcInput {
  type: 'tap' | 'long_press' | 'swipe' | 'key' | 'text' | 'move' | 'down' | 'up' | 'click' | 'scroll'
  x?: number
  y?: number
  x2?: number
  y2?: number
  durationMs?: number
  // android nav key OR desktop keyboard key
  key?: string
  text?: string
  // desktop mouse
  button?: RcMouseButton
  double?: boolean
  dx?: number
  dy?: number
  // desktop keyboard
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
}
export type RcBrowserCommand =
  | { action: 'back' | 'forward' | 'reload' }
  | { action: 'navigate' | 'new-tab'; url?: string }
  | { action: 'switch-tab' | 'close-tab'; tabId: number }

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export const useRemoteControl = () => {
  const status = ref<RcStatus>('idle')
  const errorMessage = ref('')
  const deviceWidth = ref(0)
  const deviceHeight = ref(0)
  const remoteStream = shallowRef<MediaStream | null>(null)
  // True once the P2P control DataChannel is open; until then input is dropped.
  const controlReady = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  // Edge-style chrome state for browser-extension control (tab strip + address bar).
  const browserState = ref<RcBrowserState | null>(null)

  let socket: Socket | null = null
  let pc: RTCPeerConnection | null = null
  let controlChannel: RTCDataChannel | null = null
  let sessionId = ''
  // ICE that arrives before setRemoteDescription must be buffered.
  const pendingIce: RTCIceCandidateInit[] = []

  const fail = (message: string) => {
    errorMessage.value = message
    status.value = 'error'
  }

  const ensurePeer = () => {
    if (pc) return pc
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    connection.ontrack = (event) => {
      // Fires during negotiation, before ICE connects — only stash the stream;
      // we flip to "streaming" on the real 'connected' state below.
      remoteStream.value = event.streams[0] || null
    }
    connection.onicecandidate = (event) => {
      if (event.candidate && sessionId) {
        socket?.emit('rc:ice', { sessionId, candidate: event.candidate.toJSON() })
      }
    }
    connection.ondatachannel = (event) => {
      if (event.channel.label !== 'control') return
      controlChannel = event.channel
      controlReady.value = controlChannel.readyState === 'open'
      controlChannel.onopen = () => { controlReady.value = true }
      controlChannel.onclose = () => { controlReady.value = false }
      // Device → controller messages (browser-extension tab/address state).
      controlChannel.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(String(msg.data))
          if (parsed?.kind === 'browser-state') browserState.value = parsed.state
        } catch { /* ignore malformed */ }
      }
    }
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState
      connectionState.value = state
      if (state === 'connected') {
        status.value = 'streaming'
      } else if (state === 'failed') {
        fail('点对点连接失败（可能需要 TURN 服务器或双方网络受限）')
      } else if (state === 'disconnected' || state === 'closed') {
        if (status.value === 'streaming' || status.value === 'connecting') status.value = 'ended'
      }
    }
    pc = connection
    return connection
  }

  const handleOffer = async (data: { sessionId: string; sdp: string }) => {
    sessionId = data.sessionId
    const connection = ensurePeer()
    await connection.setRemoteDescription({ type: 'offer', sdp: data.sdp })
    for (const candidate of pendingIce.splice(0)) {
      await connection.addIceCandidate(candidate).catch(() => {})
    }
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)
    socket?.emit('rc:answer', { sessionId, sdp: answer.sdp })
  }

  const handleRemoteIce = async (data: { candidate: RTCIceCandidateInit }) => {
    if (!data?.candidate) return
    if (pc?.remoteDescription) {
      await pc.addIceCandidate(data.candidate).catch(() => {})
    } else {
      pendingIce.push(data.candidate)
    }
  }

  /** Open a control session for ``deviceId``. */
  const start = (deviceId: string) => {
    if (status.value === 'connecting' || status.value === 'streaming') return
    status.value = 'connecting'
    errorMessage.value = ''
    socket = io('/', { transports: ['websocket', 'polling'] })

    socket.on('connect', () => {
      socket?.emit('rc:start', { deviceId, token: getAuthToken() })
    })
    socket.on('connect_error', () => fail('信令通道连接失败'))
    socket.on('rc:started', (data: { sessionId: string }) => {
      sessionId = data.sessionId
    })
    socket.on('rc:error', (data: { message?: string }) => {
      fail(data?.message || '远程控制启动失败')
    })
    socket.on('rc:ready', (data: { width: number; height: number }) => {
      deviceWidth.value = Number(data?.width) || 0
      deviceHeight.value = Number(data?.height) || 0
    })
    socket.on('rc:offer', (data: { sessionId: string; sdp: string }) => {
      void handleOffer(data)
    })
    socket.on('rc:ice', (data: { candidate: RTCIceCandidateInit }) => {
      void handleRemoteIce(data)
    })
    socket.on('rc:stopped', () => {
      status.value = 'ended'
      teardown(false)
    })
  }

  /** Send one normalized input event over the P2P control channel. */
  const sendInput = (input: RcInput) => {
    if (controlChannel?.readyState === 'open') {
      controlChannel.send(JSON.stringify(input))
    }
  }

  /** Send an Edge-style browser command (navigate / tabs) over the same channel. */
  const sendBrowserCommand = (cmd: RcBrowserCommand) => {
    if (controlChannel?.readyState === 'open') {
      controlChannel.send(JSON.stringify({ kind: 'browser', ...cmd }))
    }
  }

  const teardown = (notifyServer: boolean) => {
    if (notifyServer && socket && sessionId) {
      socket.emit('rc:stop', { sessionId })
    }
    controlChannel = null
    controlReady.value = false
    connectionState.value = 'closed'
    browserState.value = null
    pendingIce.length = 0
    remoteStream.value = null
    if (pc) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.ondatachannel = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    if (socket) {
      socket.off()
      socket.disconnect()
      socket = null
    }
    sessionId = ''
  }

  /** Operator closed the panel. */
  const stop = () => {
    teardown(true)
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
    sendInput,
    sendBrowserCommand,
  }
}
