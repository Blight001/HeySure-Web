import { get } from './http'

/** Standard WebRTC ICE server entry (STUN or TURN). */
export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

/**
 * Fallback used before the server responds, or when it is unreachable /
 * unconfigured. Matches the historical hardcoded default so remote control
 * still works out of the box (STUN-only — no relay).
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

// The STUN/TURN config is server-scoped and changes rarely, so cache it for the
// session instead of hitting the endpoint on every remote-control start.
let cached: IceServer[] | null = null

/**
 * Resolve the ICE servers the server hands out (STUN + optional TURN with
 * credentials). Configured once in the admin console / env; see server
 * ``api.services.access.ice_settings``. Never throws — falls back to
 * {@link DEFAULT_ICE_SERVERS} so a signaling hiccup can't block a session.
 */
export const fetchIceServers = async (): Promise<IceServer[]> => {
  if (cached) return cached
  try {
    const res = await get<{ ice_servers: IceServer[] }>('/api/rtc/ice-servers', {
      fallbackError: '获取 ICE 服务器配置失败',
    })
    cached = Array.isArray(res?.ice_servers) && res.ice_servers.length
      ? res.ice_servers
      : DEFAULT_ICE_SERVERS
  } catch {
    cached = DEFAULT_ICE_SERVERS
  }
  return cached
}

/** Drop the cache so the next session re-reads config (e.g. after an admin change or logout). */
export const clearIceServersCache = () => {
  cached = null
}
