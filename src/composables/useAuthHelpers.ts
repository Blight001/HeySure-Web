import { clearAuthToken } from '@/api/http'

export function tokenExpiryMs(token: string): number {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return 0
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalized))
    return Number(payload?.exp || 0) * 1000
  } catch {
    return 0
  }
}

export function createExpiryScheduler(onExpire: () => void) {
  let expiryTimer: number | undefined
  const clearExpiryTimer = () => {
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }
  const scheduleExpiry = (token: string) => {
    clearExpiryTimer()
    const remaining = tokenExpiryMs(token) - Date.now()
    if (remaining <= 0) {
      onExpire()
      return
    }
    expiryTimer = window.setTimeout(onExpire, Math.min(remaining, 2_147_000_000))
  }
  const clearLocalSession = (clearUser: () => void) => {
    clearExpiryTimer()
    clearUser()
    clearAuthToken()
  }
  return { clearExpiryTimer, scheduleExpiry, clearLocalSession }
}
