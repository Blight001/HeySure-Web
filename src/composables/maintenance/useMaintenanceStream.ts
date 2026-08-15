import { onBeforeUnmount, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { getAuthToken } from '@/api/http'
import type { MaintenanceTask } from '@/api/maintenance'

export type MaintenanceUpdatePayload = { task_id?: string; task?: MaintenanceTask; event?: unknown }

export function useMaintenanceStream(onUpdate: (payload: MaintenanceUpdatePayload) => void) {
  const connected = ref(false)
  let socket: Socket | null = null

  const disconnect = () => {
    socket?.off()
    socket?.disconnect()
    socket = null
    connected.value = false
  }

  const connect = (onConnectionChange?: () => void) => {
    if (socket) return
    const token = getAuthToken()
    if (!token) return
    socket = io('/', { transports: ['websocket', 'polling'], auth: { token } })
    socket.on('connect', () => {
      connected.value = true
      socket?.emit('ui:join')
      onConnectionChange?.()
    })
    socket.on('disconnect', () => { connected.value = false; onConnectionChange?.() })
    socket.on('connect_error', () => { connected.value = false; onConnectionChange?.() })
    socket.on('maintenance:update', onUpdate)
  }

  onBeforeUnmount(disconnect)
  return { connected, connect, disconnect }
}
