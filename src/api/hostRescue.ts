export interface HostRescueService {
  service: string
  state: string
  health: string
  status: string
}

export interface HostRescueState {
  running: boolean
  action: string
  message: string
  last_error: string
  updated_at: number
  last_auto_recovery_at: number
}

export interface HostRescueStatus {
  ok: boolean
  services: HostRescueService[]
  recovery: HostRescueState
}

export interface HostRescueHealth {
  ok: boolean
  auto_recover: boolean
  all_runtimes_unavailable?: boolean
}

const configuredUrl = String(import.meta.env.VITE_HEYSURE_RESCUE_URL || '').trim().replace(/\/$/, '')

export const hostRescueBaseUrl = (): string => {
  if (configuredUrl) return configuredUrl
  return '/host-rescue'
}

const rescueRequest = async <T>(path: string, token = '', body?: unknown): Promise<T> => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${hostRescueBaseUrl()}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const message = response.status === 401 ? '恢复密钥不正确' : String(payload.error || '宿主恢复服务请求失败')
      throw new Error(message)
    }
    return payload as T
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('宿主恢复服务响应超时')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

export const checkHostRescue = () => rescueRequest<HostRescueHealth>('/health')
export const getHostRescueStatus = (token: string) => rescueRequest<HostRescueStatus>('/api/status', token)
export const recoverHost = (token: string, action: 'restart_gateway' | 'restart_runtimes') => (
  rescueRequest<{ ok: boolean; started: boolean; action: string }>('/api/recover', token, { action })
)
