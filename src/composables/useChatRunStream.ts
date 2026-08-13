import { onUnmounted, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'

/**
 * Live streaming socket for chat runs.
 *
 * The backend already pushes every AI run's incremental output to the run
 * owner's `user_{id}` room via two events (see
 * `server/main/api/chat_runtime/chat_prompt_utils.py`):
 *   - `chat:run_live` — throttled token / phase / tool / usage snapshots.
 *   - `chat:run_done` — terminal status (completed / error / stopped).
 *
 * This composable subscribes to both so the chat UI no longer needs to poll
 * `GET /chat/run/status/{run_id}` at 90 ms. HTTP polling stays in the component
 * purely as a fallback for when this socket is disconnected (see `connected`).
 *
 * It owns its own socket (the dashboard's socket only exists while that panel is
 * mounted), but connects to the same gateway server and joins the same
 * `user_{id}` room, so the two never interfere. A single socket receives live
 * events for *all* of the user's runs/AIs/sessions — callers filter by
 * `run_id` against the run they currently track.
 */

export interface RunLivePayload {
  run_id: string
  user_id?: number
  text?: string
  reasoning?: string
  phase?: string
  current_tool?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  updated_at?: number
}

export interface RunDonePayload {
  run_id: string
  user_id?: number
  status?: string
  error_message?: string | null
  session_id?: string
  ai_config_id?: number
  ai_kind?: string
}

export interface DeviceTaskEventPayload {
  taskId?: string
  deviceId?: string
  sessionId?: string
  aiConfigId?: number
  aiKind?: string
  tool?: string
  progress?: number
  message?: string
  success?: boolean
  error?: string
  updatedAt?: number
}

export interface ChatHistoryChangedPayload {
  action?: string
  user_id?: number
  session_id?: string
  ai_config_id?: number | null
  ai_kind?: string
  from_message_id?: number
  message_id?: number
  source?: string
}

export interface ChatRunStreamHandlers {
  onLive?: (payload: RunLivePayload) => void
  onDone?: (payload: RunDonePayload) => void
  onDeviceProgress?: (payload: DeviceTaskEventPayload) => void
  onDeviceResult?: (payload: DeviceTaskEventPayload) => void
  onDeviceError?: (payload: DeviceTaskEventPayload) => void
  onHistoryChanged?: (payload: ChatHistoryChangedPayload) => void
}

export function useChatRunStream(handlers: ChatRunStreamHandlers = {}) {
  const connected = ref(false)
  let socket: Socket | null = null
  let joinedUserId = 0

  const handleLive = (payload: RunLivePayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onLive?.(payload)
  }
  const handleDone = (payload: RunDonePayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onDone?.(payload)
  }
  const handleDeviceProgress = (payload: DeviceTaskEventPayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onDeviceProgress?.(payload)
  }
  const handleDeviceResult = (payload: DeviceTaskEventPayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onDeviceResult?.(payload)
  }
  const handleDeviceError = (payload: DeviceTaskEventPayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onDeviceError?.(payload)
  }
  const handleHistoryChanged = (payload: ChatHistoryChangedPayload) => {
    if (!payload || typeof payload !== 'object') return
    handlers.onHistoryChanged?.(payload)
  }

  const disconnect = () => {
    if (!socket) return
    socket.off('connect')
    socket.off('disconnect')
    socket.off('connect_error')
    socket.off('chat:run_live', handleLive)
    socket.off('chat:run_done', handleDone)
    socket.off('device:task_progress', handleDeviceProgress)
    socket.off('device:task_result', handleDeviceResult)
    socket.off('device:task_error', handleDeviceError)
    socket.off('chat:history_changed', handleHistoryChanged)
    socket.disconnect()
    socket = null
    joinedUserId = 0
    connected.value = false
  }

  const connect = (userId: number) => {
    const uid = Number(userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    if (socket && joinedUserId === uid) return
    disconnect()
    const token = getAuthToken()
    if (!token) return
    joinedUserId = uid
    socket = io('/', {
      transports: ['websocket', 'polling'],
      auth: { token },
    })
    socket.on('connect', () => {
      connected.value = true
      socket?.emit('ui:join')
    })
    socket.on('disconnect', () => {
      connected.value = false
    })
    socket.on('connect_error', () => {
      connected.value = false
    })
    socket.on('chat:run_live', handleLive)
    socket.on('chat:run_done', handleDone)
    socket.on('device:task_progress', handleDeviceProgress)
    socket.on('device:task_result', handleDeviceResult)
    socket.on('device:task_error', handleDeviceError)
    socket.on('chat:history_changed', handleHistoryChanged)
  }

  onUnmounted(disconnect)

  return { connected, connect, disconnect }
}
