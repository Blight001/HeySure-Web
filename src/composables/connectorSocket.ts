import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client'

const CONNECTOR_URL_STORAGE_KEY = 'heysure.connectorSocketUrl'

const normalizeOrigin = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

const readStoredOrigin = () => {
  try {
    return normalizeOrigin(window.localStorage.getItem(CONNECTOR_URL_STORAGE_KEY))
  } catch {
    return ''
  }
}

export const setConnectorSocketUrl = (value?: string | null) => {
  const origin = normalizeOrigin(value)
  if (!origin) return
  try {
    window.localStorage.setItem(CONNECTOR_URL_STORAGE_KEY, origin)
  } catch {
    // Private browsing can make storage unavailable; same-origin remains usable.
  }
}

export const clearConnectorSocketUrl = () => {
  try {
    window.localStorage.removeItem(CONNECTOR_URL_STORAGE_KEY)
  } catch {
    // Ignore storage failures during logout.
  }
}

export const connectorSocketUrl = () => {
  const stored = readStoredOrigin()
  if (stored) return stored
  const configured = normalizeOrigin(import.meta.env.VITE_CONNECTOR_SOCKET_URL)
  if (configured) return configured
  if (window.location.protocol === 'http:' && window.location.hostname) {
    return `http://${window.location.hostname}:3002`
  }
  if (window.location.origin && window.location.origin !== 'null') return window.location.origin
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//localhost:3002`
}

export const createConnectorSocket = (
  options: Partial<ManagerOptions & SocketOptions> = {},
): Socket => io(connectorSocketUrl(), {
  transports: ['websocket', 'polling'],
  ...options,
})
