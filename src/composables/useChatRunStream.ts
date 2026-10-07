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
  session_id?: string
  ai_config_id?: number | null
  ai_kind?: string
  text?: string
  reasoning?: string
  phase?: string
  current_tool?: string
  current_tool_arguments?: string
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

export interface CodexEventPayload {
  sessionId?: string
  sequence?: number
  type?: string
  payload?: unknown
}

export interface CodexModelsPayload {
  deviceId?: string
  models?: unknown[]
}

export interface ChatRunStreamHandlers {
  onLive?: (payload: RunLivePayload) => void
  onDone?: (payload: RunDonePayload) => void
  onDeviceProgress?: (payload: DeviceTaskEventPayload) => void
  onDeviceResult?: (payload: DeviceTaskEventPayload) => void
  onDeviceError?: (payload: DeviceTaskEventPayload) => void
  onHistoryChanged?: (payload: ChatHistoryChangedPayload) => void
  onCodexEvent?: (payload: CodexEventPayload) => void
  onCodexModels?: (payload: CodexModelsPayload) => void
}

const forward = <T>(handler?: (payload: T) => void) => (payload: T) => handler?.(payload)

const streamHandlers = (handlers: ChatRunStreamHandlers) => ({
  live: forward(handlers.onLive), done: forward(handlers.onDone),
  deviceProgress: forward(handlers.onDeviceProgress), deviceResult: forward(handlers.onDeviceResult),
  deviceError: forward(handlers.onDeviceError), history: forward(handlers.onHistoryChanged),
  codexEvent: forward(handlers.onCodexEvent), codexModels: forward(handlers.onCodexModels),
})

const streamEventNames = (h: ReturnType<typeof streamHandlers>) => [
  ['chat:run_live', h.live], ['chat:run_done', h.done],
  ['device:task_progress', h.deviceProgress], ['device:task_result', h.deviceResult],
  ['device:task_error', h.deviceError], ['chat:history_changed', h.history],
  ['codex:event', h.codexEvent], ['codex:models', h.codexModels],
] as const

export function useChatRunStream(handlers: ChatRunStreamHandlers = {}) {
  const connected = ref(false)
  let socket: Socket | null = null
  let joinedUserId = 0
  const bound = streamHandlers(handlers)
  const events = streamEventNames(bound)

  const disconnect = () => {
    if (!socket) return
    socket.off('connect')
    socket.off('disconnect')
    socket.off('connect_error')
    events.forEach(([name, handler]) => socket?.off(name, handler))
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
    events.forEach(([name, handler]) => socket?.on(name, handler))
  }

  onUnmounted(disconnect)

  return { connected, connect, disconnect }
}
