import { del, get, post, put } from './http'

export interface ConnectedDeviceRow {
  id?: string
  socketId?: string
  deviceId?: string
  name?: string
  platform?: string
  aiConfigId?: number
  ai_config_id?: number
  boundAiConfigIds?: number[]
  isWindowsDesktop?: boolean
  isBrowserExtension?: boolean
  isAndroid?: boolean
  deviceType?: string
  /** 设备注册时自选的图标 URL（/device_png/N.webp 或绝对 URL），空 = 网页默认样式 */
  icon?: string
  /** 用户在作坊面板保存的显示备注，展示在设备名后面 */
  remark?: string
  /** 用户覆盖图标；存在时 icon 会优先返回这个值 */
  iconOverride?: string
  capabilities?: any[]
  version?: string
  lifecycle?: string
  group?: string
  workspaceRoot?: string
  lastTaskId?: string | null
  lastTaskStatus?: string | null
  lastTaskAt?: number | null
  lastError?: string | null
  connectedAt?: number
}

export const listConnectedDevices = () =>
  get<{ agents?: ConnectedDeviceRow[] }>('/api/devices/connected', {
    fallbackError: '连接 Agent 列表加载失败',
  })

// Assign (or clear, when aiConfigId is null) the server-side AI for a connected
// device. The server persists the binding and broadcasts an updated device:list.
export const assignDeviceAi = (deviceId: string, aiConfigId: number | null) =>
  post<{ ok: boolean; deviceId: string; aiConfigId: number | null }>(
    '/api/devices/bind',
    { deviceId, aiConfigId },
    { fallbackError: '分配 AI 失败' },
  )

export const updateDeviceDisplay = (deviceId: string, payload: { remark?: string; icon?: string }) =>
  put<{ ok: boolean; deviceId: string; remark: string; icon: string; iconOverride: string }>(
    `/api/devices/${encodeURIComponent(deviceId)}/display`,
    { remark: payload.remark || '', icon: payload.icon || '' },
    { fallbackError: '设备显示设置保存失败' },
  )

// Forget an offline device entirely: drops its saved AI binding, presence
// record, and MCP scope. Refused by the server while the device is connected.
export const deleteDeviceRecord = (deviceId: string) =>
  del<{ ok: boolean; deviceId: string; deleted: boolean }>(
    `/api/devices/${encodeURIComponent(deviceId)}`,
    { fallbackError: '删除设备记录失败' },
  )

export interface DeviceMcpScope {
  deviceId: string
  agentName?: string
  deviceType?: 'desktop' | 'browser' | 'android' | 'workshop' | 'toolbox' | 'custom' | null
  platform?: string
  aiConfigId?: number | null
  capabilities: string[]
  toolDefs?: Record<string, {
    description?: string
    input_schema?: Record<string, any>
    destructive?: boolean
  }>
  allowed: string[]
  hasRecord: boolean
}

// Endpoint (desktop / browser / workshop / toolbox) MCP permission scope for a connected agent.
// Visible only while the device is online; persisted per (AI, agent type) so a
// reconnecting agent of the same type keeps its scope.
export const getDeviceMcpScope = (deviceId: string) =>
  get<DeviceMcpScope>(`/api/devices/${encodeURIComponent(deviceId)}/mcp-scope`, {
    fallbackError: 'Agent MCP 权限加载失败',
  })

export const setDeviceMcpScope = (deviceId: string, tools: string[]) =>
  put<DeviceMcpScope>(
    `/api/devices/${encodeURIComponent(deviceId)}/mcp-scope`,
    { tools },
    { fallbackError: 'Agent MCP 权限保存失败' },
  )

// 设备开发手册（控制台"设备开发文档"弹窗）：默认内容随服务端打包，
// 房主编辑后持久化；保存空内容 = 恢复默认。
export interface DeviceDevManual {
  content: string
  isCustom: boolean
  updatedAt?: number | null
}

export const getDeviceDevManual = () =>
  get<DeviceDevManual>('/api/devices/dev-manual', {
    fallbackError: '设备开发文档加载失败',
  })

export const saveDeviceDevManual = (content: string) =>
  put<DeviceDevManual>('/api/devices/dev-manual', { content }, {
    fallbackError: '设备开发文档保存失败',
  })
