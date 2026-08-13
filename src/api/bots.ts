import { del, get, patch, post } from './http'

export interface BotConnectionItem {
  connection_ref: string
  channel: 'feishu' | 'qq' | 'wechat'
  name: string
  enabled: boolean
  is_default: boolean
  state: string
  config: Record<string, any>
  credentials_configured?: boolean
  runtime_status?: Record<string, any>
}

export const listBotConnections = (configId: number) =>
  get<{ connections: BotConnectionItem[] }>(`/api/bots/connections/${configId}`)

export const createBotConnection = (configId: number, payload: { channel: string; name?: string; config?: Record<string, any> }) =>
  post<BotConnectionItem>(`/api/bots/connections/${configId}`, payload)

export const updateBotConnection = (configId: number, connectionRef: string, payload: Record<string, any>) =>
  patch<BotConnectionItem>(`/api/bots/connections/${configId}/${connectionRef}`, payload)

export const deleteBotConnection = (configId: number, connectionRef: string) =>
  del<{ success: boolean }>(`/api/bots/connections/${configId}/${connectionRef}`)

export interface BotLoginStatus {
  state: string
  message: string
  connected: boolean
  qrcode_url?: string
  expires_at?: number
  needs_verify_code?: boolean
  account_id?: string
  last_seen_at?: number
}

export const startBotLogin = (channel: string, configId: number, connectionRef = '') =>
  post<BotLoginStatus>(`/api/bots/${channel}/login/${configId}?connection_ref=${encodeURIComponent(connectionRef)}`, {}, { fallbackError: '生成登录二维码失败' })

export const getBotLoginStatus = (channel: string, configId: number, connectionRef = '') =>
  get<BotLoginStatus>(`/api/bots/${channel}/login/${configId}?connection_ref=${encodeURIComponent(connectionRef)}`, { fallbackError: '读取机器人连接状态失败' })

export const submitBotVerifyCode = (channel: string, configId: number, value: string, connectionRef = '') =>
  post<BotLoginStatus>(`/api/bots/${channel}/login/${configId}/verify-code?connection_ref=${encodeURIComponent(connectionRef)}`, { value }, { fallbackError: '提交验证码失败' })

export const disconnectBotLogin = (channel: string, configId: number, connectionRef = '') =>
  del<BotLoginStatus>(`/api/bots/${channel}/login/${configId}?connection_ref=${encodeURIComponent(connectionRef)}`, { fallbackError: '断开机器人失败' })
