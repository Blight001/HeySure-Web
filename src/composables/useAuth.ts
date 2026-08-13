import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as authApi from '@/api/auth'
import {
  AUTH_EXPIRED_EVENT,
  TOKEN_STORAGE_KEY,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '@/api/http'
import type { User } from '@/types'

/**
 * Authentication state holder + helpers.
 *
 * Encapsulates the current `user` ref and the persistent token lifecycle so
 * components don't have to talk to localStorage directly. On mount the
 * composable will validate any cached token by calling `/api/auth/me` and
 * silently sign out if the token is no longer accepted.
 */
export const useAuth = () => {
  const user = ref<User | null>(null)
  let expiryTimer: number | undefined

  const clearExpiryTimer = () => {
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }

  const clearLocalSession = () => {
    clearExpiryTimer()
    user.value = null
    clearAuthToken()
  }

  const tokenExpiryMs = (token: string): number => {
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

  const scheduleExpiry = (token: string) => {
    clearExpiryTimer()
    const remaining = tokenExpiryMs(token) - Date.now()
    if (remaining <= 0) {
      clearLocalSession()
      return
    }
    expiryTimer = window.setTimeout(clearLocalSession, Math.min(remaining, 2_147_000_000))
  }

  const handleLoginSuccess = (userData: User, token: string) => {
    user.value = userData
    setAuthToken(token)
    scheduleExpiry(token)
  }

  const updateUser = (userData: User) => {
    user.value = userData
  }

  const logout = async () => {
    const token = getAuthToken()
    try {
      if (token) await authApi.logout()
    } catch {
      // Local cleanup is mandatory even if the network is unavailable.
    } finally {
      clearLocalSession()
    }
  }

  const handleAuthExpired = () => clearLocalSession()

  const handleStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_STORAGE_KEY && !event.newValue) clearLocalSession()
  }

  const restoreSession = async () => {
    const token = getAuthToken()
    if (!token) return
    try {
      user.value = await authApi.me(token)
      scheduleExpiry(token)
    } catch {
      clearLocalSession()
    }
  }

  onMounted(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    window.addEventListener('storage', handleStorage)
    void restoreSession()
  })

  onBeforeUnmount(() => {
    clearExpiryTimer()
    window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    window.removeEventListener('storage', handleStorage)
  })

  return {
    user,
    handleLoginSuccess,
    updateUser,
    logout,
    restoreSession,
  }
}
