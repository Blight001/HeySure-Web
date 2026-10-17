import { ref } from 'vue'
import {
  attachRemoteTerminalSocket,
  createRemoteTerminalContext,
  encodeTerminalInput,
  teardownRemoteTerminal,
  type RtStartOptions,
} from './useRemoteTerminalHelpers'

export type RtStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended'
export type { RtStartOptions } from './useRemoteTerminalHelpers'

export const useRemoteTerminal = () => {
  const status = ref<RtStatus>('idle')
  const errorMessage = ref('')
  const session = createRemoteTerminalContext(status, errorMessage)

  const start = (deviceId: string, options: RtStartOptions) => {
    if (status.value === 'connecting' || status.value === 'streaming') return
    teardownRemoteTerminal(session, false)
    status.value = 'connecting'
    errorMessage.value = ''
    session.output = options.onData
    attachRemoteTerminalSocket(session, deviceId, options)
  }

  const sendInput = (data: string) => {
    if (status.value !== 'streaming' || !session.socket || !session.sessionId || !data) return
    session.socket.emit('rt:input', {
      sessionId: session.sessionId,
      data: encodeTerminalInput(data),
    })
  }

  const resize = (cols: number, rows: number) => {
    if (status.value !== 'streaming' || !session.socket || !session.sessionId) return
    session.socket.emit('rt:resize', { sessionId: session.sessionId, cols, rows })
  }

  const stop = () => {
    teardownRemoteTerminal(session, true)
    status.value = 'idle'
  }

  return { status, errorMessage, start, sendInput, resize, stop }
}
