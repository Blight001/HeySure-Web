/**
 * Admin service monitoring, tasks, and RTC settings.
 */
import { get, post, put } from './http'

export type ServiceStatus = 'running' | 'completed' | 'degraded' | 'down' | 'disabled' | 'local' | 'unknown'
export type ServiceGroup = 'runtime' | 'infrastructure' | 'channel'

export interface ServiceInfo {
  key: string
  name: string
  group: ServiceGroup
  status: ServiceStatus
  summary: string
  detail: Record<string, unknown>
  url: string
  restartable: boolean
  logs_available: boolean
}

export interface LogLine {
  seq: number
  ts: number
  level: string
  logger: string
  msg: string
}

export interface AdminTask {
  run_id: string
  status: string
  stop_requested: boolean
  user_id: number
  user_name: string | null
  user_account: string | null
  ai_config_id: number | null
  ai_kind: string
  session_id: string
  session_name: string | null
  error_message: string | null
  started_at: number | null
  finished_at: number | null
  heartbeat_at: number | null
  created_at: number
  updated_at: number
}

export const listServices = () =>
  get<{ services: ServiceInfo[]; checked_at: number }>('/api/admin/services', {
    fallbackError: '获取服务状态失败',
  })

export const getServiceLogs = (key: string, limit = 200, level?: string) =>
  get<{ key: string; name: string; lines: LogLine[]; note?: string }>(`/api/admin/services/${key}/logs`, {
    query: { limit, level: level || undefined },
    fallbackError: '获取日志失败',
  })

export const listTasks = (limit = 50, status?: string) =>
  get<{ tasks: AdminTask[] }>('/api/admin/tasks', {
    query: { limit, status: status || undefined },
    fallbackError: '获取子任务失败',
  })

export const stopTask = (runId: string) =>
  post<{ ok: boolean; run_id: string; status: string }>(`/api/admin/tasks/${runId}/stop`, undefined, {
    fallbackError: '停止子任务失败',
  })

export const rebuildAllContainers = () =>
  post<{ ok: boolean; started: boolean }>('/api/admin/services/rebuild-all', undefined, {
    fallbackError: '重构全部容器失败',
  })

export const restartService = (key: string) =>
  post<{ ok: boolean; key: string; name: string; restarting: boolean; command?: string[] }>(
    `/api/admin/services/${key}/restart`,
    undefined,
    { fallbackError: '重启服务失败' },
  )

export interface RestartAllServicesResult {
  ok: boolean
  restarting: string[]
  errors: Record<string, string>
  gateway_scheduled: boolean
}

export const restartAllServices = () =>
  post<RestartAllServicesResult>('/api/admin/services/restart-all', undefined, {
    fallbackError: '全部重启失败',
  })

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface RtcSettings {
  stun_url: string
  turn_url: string
  turn_username: string
  /** 密码永不回传，仅指示是否已配置 */
  turn_password_set: boolean
  turn_enabled: boolean
  /** 客户端实际会收到的 iceServers（不含凭据），用于预览 */
  ice_servers: IceServer[]
}

export interface RtcSettingsPayload {
  stun_url: string
  turn_url: string
  turn_username: string
  /** null = 保留已存密码 */
  turn_password: string | null
}

export const getRtcSettings = () =>
  get<RtcSettings>('/api/admin/rtc-settings', { fallbackError: '获取远程控制设置失败' })

export const updateRtcSettings = (payload: RtcSettingsPayload) =>
  put<RtcSettings>('/api/admin/rtc-settings', payload, { fallbackError: '保存远程控制设置失败' })
