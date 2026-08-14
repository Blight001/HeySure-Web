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
  /** 用户在设备面板保存的显示备注，展示在设备名后面 */
  remark?: string
  /** 设备自行上报的用途说明；只作为 AI 能力元数据。 */
  reportedAiDescription?: string
  /** 用户在控制台设置的 AI 用途覆盖说明，与 remark 相互独立。 */
  aiDescriptionOverride?: string
  /** 服务端按“覆盖说明 > 上报说明 > 类型默认值”计算的最终用途。 */
  effectiveAiDescription?: string
  catalogGeneration?: number
  catalogHash?: string
  catalogProtocolVersion?: number
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
  post<{ ok: boolean; deviceId: string; aiConfigId: number | null; boundAiConfigIds: number[] }>(
    '/api/devices/bind',
    { deviceId, aiConfigId },
    { fallbackError: '分配 AI 失败' },
  )

export const updateDeviceDisplay = (
  deviceId: string,
  payload: { remark?: string; icon?: string; aiDescriptionOverride?: string },
) =>
  put<{
    ok: boolean
    deviceId: string
    remark: string
    icon: string
    iconOverride: string
    reportedAiDescription: string
    aiDescriptionOverride: string
    effectiveAiDescription: string
    catalogGeneration: number
    catalogHash: string
    catalogProtocolVersion: number
  }>(
    `/api/devices/${encodeURIComponent(deviceId)}/display`,
    {
      remark: payload.remark || '',
      icon: payload.icon || '',
      aiDescriptionOverride: payload.aiDescriptionOverride || '',
    },
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
export const getDeviceMcpScope = (deviceId: string, aiConfigId?: number) =>
  get<DeviceMcpScope>(`/api/devices/${encodeURIComponent(deviceId)}/mcp-scope`, {
    query: aiConfigId ? { ai_config_id: aiConfigId } : undefined,
    fallbackError: 'Agent MCP 权限加载失败',
  })

export const setDeviceMcpScope = (deviceId: string, aiConfigId: number, tools: string[]) =>
  put<DeviceMcpScope>(
    `/api/devices/${encodeURIComponent(deviceId)}/mcp-scope`,
    { aiConfigId, tools },
    { fallbackError: 'Agent MCP 权限保存失败' },
  )

// 设备开发手册（设备栏目"设备端开发文档"弹窗）：默认内容随服务端打包，
// 房主编辑后持久化；保存空内容 = 恢复默认。
export interface DeviceDevManual {
  content: string
  isCustom: boolean
  updatedAt?: number | null
}

export const getDeviceDevManual = () =>
  get<DeviceDevManual>('/api/devices/dev-manual', {
    fallbackError: '设备端开发文档加载失败',
  })

export const saveDeviceDevManual = (content: string) =>
  put<DeviceDevManual>('/api/devices/dev-manual', { content }, {
    fallbackError: '设备端开发文档保存失败',
  })

export interface BuiltinDeviceItem {
  device_id: string
  name: string
  online: boolean
  tools: string[]
  bound: boolean
  bound_ai_config_id: number | null
  bound_ai_config_ids?: number[]
  bound_ai_name: string
  is_toolbox?: boolean
  multi?: boolean
}

export const fetchBuiltinDeviceBindings = (aiConfigId: number) =>
  get<{ ai_config_id: number; agents: BuiltinDeviceItem[] }>(
    '/api/devices/builtin-bindings',
    {
      query: { ai_config_id: aiConfigId },
      fallbackError: '内置设备列表加载失败',
    },
  )

export const setDeviceMemberBinding = (deviceId: string, aiConfigId: number, bound: boolean) =>
  put<{ ok: boolean; deviceId: string; aiConfigId: number | null; boundAiConfigIds: number[] }>(
    `/api/devices/${encodeURIComponent(deviceId)}/member-bindings/${aiConfigId}`,
    { bound },
    { fallbackError: bound ? '分配 AI 失败' : '解除 AI 绑定失败' },
  )

export const setBuiltinDeviceBinding = (aiConfigId: number, deviceId: string, bound: boolean) =>
  post<{
    ai_config_id: number
    device_id: string
    bound: boolean
    replaced_ai_config_id: number | null
    replaced_ai_name: string
  }>(
    '/api/devices/builtin-bindings',
    { ai_config_id: aiConfigId, device_id: deviceId, bound },
    { fallbackError: '更新内置设备绑定失败' },
  )
