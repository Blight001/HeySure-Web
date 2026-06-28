/**
 * 仅查看（view-only）的设备实时画面客户端：复用远程控制的信令链路
 * （rc:start / rc:offer / rc:answer / rc:ice，见 server
 * connector_runtime/dispatch/remote_control.py），但永不打开输入通道——
 * 只接收设备推来的视频轨道并交给 <video> 显示。
 *
 * 与 web/src/composables/useRemoteControl.ts 的差异：那是带键鼠注入的 Vue
 * 组合式；本文件是框架无关的纯类，供游戏世界（社会显示）抽屉里嵌入画面用。
 */
import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'

export type ScreenStatus = 'connecting' | 'streaming' | 'error' | 'ended'

export interface RemoteScreenHandlers {
  /** 状态变化：connecting → streaming，或 error/ended（error 带原因） */
  onStatus?: (status: ScreenStatus, message?: string) => void
  /** 拿到设备画面流：调用方把它接到 <video>.srcObject */
  onStream?: (stream: MediaStream) => void
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export class RemoteScreenViewer {
  private socket: Socket | null = null
  private pc: RTCPeerConnection | null = null
  private sessionId = ''
  // setRemoteDescription 之前到达的 ICE 必须先缓冲。
  private pendingIce: RTCIceCandidateInit[] = []
  private stopped = false

  constructor(private readonly handlers: RemoteScreenHandlers = {}) {}

  /** 对 deviceId 发起一次只读画面会话；浏览器是 answerer，设备来 offer。 */
  start(deviceId: string) {
    this.handlers.onStatus?.('connecting')
    const socket = io('/', { transports: ['websocket', 'polling'] })
    this.socket = socket
    socket.on('connect', () => socket.emit('rc:start', { deviceId, token: getAuthToken() }))
    socket.on('connect_error', () => this.fail('信令通道连接失败'))
    socket.on('rc:started', (data: { sessionId: string }) => { this.sessionId = data.sessionId })
    socket.on('rc:error', (data: { message?: string }) => this.fail(data?.message || '画面获取失败'))
    socket.on('rc:offer', (data: { sessionId: string; sdp: string }) => void this.handleOffer(data))
    socket.on('rc:ice', (data: { candidate: RTCIceCandidateInit }) => void this.handleIce(data))
    socket.on('rc:stopped', () => {
      this.handlers.onStatus?.('ended')
      this.teardown(false)
    })
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.ontrack = (event) => {
      const stream = event.streams[0] || null
      if (stream) this.handlers.onStream?.(stream)
    }
    pc.onicecandidate = (event) => {
      if (event.candidate && this.sessionId) {
        this.socket?.emit('rc:ice', { sessionId: this.sessionId, candidate: event.candidate.toJSON() })
      }
    }
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') this.handlers.onStatus?.('streaming')
      else if (state === 'failed') this.fail('点对点连接失败（可能需要 TURN 服务器或双方网络受限）')
      else if (state === 'disconnected' || state === 'closed') this.handlers.onStatus?.('ended')
    }
    this.pc = pc
    return pc
  }

  private async handleOffer(data: { sessionId: string; sdp: string }) {
    if (this.stopped) return
    this.sessionId = data.sessionId
    const pc = this.ensurePeer()
    await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
    for (const candidate of this.pendingIce.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => {})
    }
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.socket?.emit('rc:answer', { sessionId: this.sessionId, sdp: answer.sdp })
  }

  private async handleIce(data: { candidate: RTCIceCandidateInit }) {
    if (!data?.candidate) return
    if (this.pc?.remoteDescription) {
      await this.pc.addIceCandidate(data.candidate).catch(() => {})
    } else {
      this.pendingIce.push(data.candidate)
    }
  }

  private fail(message: string) {
    if (this.stopped) return
    this.handlers.onStatus?.('error', message)
  }

  /** 关闭会话：通知服务端结束并释放本地资源。 */
  stop() {
    this.teardown(true)
  }

  private teardown(notifyServer: boolean) {
    if (this.stopped) return
    this.stopped = true
    if (notifyServer && this.socket && this.sessionId) {
      this.socket.emit('rc:stop', { sessionId: this.sessionId })
    }
    if (this.pc) {
      this.pc.ontrack = null
      this.pc.onicecandidate = null
      this.pc.onconnectionstatechange = null
      this.pc.close()
      this.pc = null
    }
    if (this.socket) {
      this.socket.off()
      this.socket.disconnect()
      this.socket = null
    }
    this.pendingIce.length = 0
    this.sessionId = ''
  }
}
