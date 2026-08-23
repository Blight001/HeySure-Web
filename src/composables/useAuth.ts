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
import { createExpiryScheduler } from './useAuthHelpers'
import { clearConnectorSocketUrl, setConnectorSocketUrl } from './connectorSocket'

export const useAuth = () => {
  const user = ref<User | null>(null)
  const scheduler = createExpiryScheduler(() => {
    user.value = null
    clearAuthToken()
  })

  const clearLocalSession = () => scheduler.clearLocalSession(() => {
    user.value = null
    clearConnectorSocketUrl()
  })

  const handleLoginSuccess = (userData: User, token: string, agentSocketUrl?: string) => {
    user.value = userData
    setAuthToken(token)
    clearConnectorSocketUrl()
    setConnectorSocketUrl(agentSocketUrl)
    scheduler.scheduleExpiry(token)
  }

  const updateUser = (userData: User) => { user.value = userData }

  const logout = async () => {
    try {
      if (getAuthToken()) await authApi.logout()
    } catch {
      // Local cleanup is mandatory even if the network is unavailable.
    } finally {
      clearLocalSession()
    }
  }

  const restoreSession = async () => {
    const token = getAuthToken()
    if (!token) return
    try {
      user.value = await authApi.me(token)
      scheduler.scheduleExpiry(token)
    } catch {
      clearLocalSession()
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_STORAGE_KEY && !event.newValue) clearLocalSession()
  }

  onMounted(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, clearLocalSession)
    window.addEventListener('storage', handleStorage)
    void restoreSession()
  })

  onBeforeUnmount(() => {
    scheduler.clearExpiryTimer()
    window.removeEventListener(AUTH_EXPIRED_EVENT, clearLocalSession)
    window.removeEventListener('storage', handleStorage)
  })

  return { user, handleLoginSuccess, updateUser, logout, restoreSession }
}
