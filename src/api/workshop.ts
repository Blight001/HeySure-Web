import { get, post, put } from './http'

// 服务端内置图书馆 Agent 的专用绑定管理。
// 当前工具集为空，绑定关系保留给后续 MCP 能力使用。
// 工坊与 AI 为 1:1；已被其它 AI 占用时不可绑定。

export interface WorkshopAgentItem {
  device_id: string
  name: string
  online: boolean
  tools: string[]
  /** 是否绑定到查询的 AI */
  bound: boolean
  /** 当前绑定的成员（1:1，可能是其它 AI），null = 未绑定 */
  bound_ai_config_id: number | null
  bound_ai_name: string
  /** 兼容服务端旧字段；当前所有作坊均按 1:1 绑定。 */
  is_toolbox?: boolean
  multi?: boolean
}

export const fetchWorkshopBindings = (aiConfigId: number) =>
  get<{ ai_config_id: number; agents: WorkshopAgentItem[] }>(
    `/api/workshop/bindings?ai_config_id=${aiConfigId}`,
    { fallbackError: '图书馆列表加载失败' },
  )

export const setWorkshopBinding = (aiConfigId: number, deviceId: string, bound: boolean) =>
  post<{
    ai_config_id: number
    device_id: string
    bound: boolean
    replaced_ai_config_id: number | null
    replaced_ai_name: string
  }>(
    '/api/workshop/bindings',
    { ai_config_id: aiConfigId, device_id: deviceId, bound },
    { fallbackError: '更新图书馆绑定失败' },
  )

export interface LibraryMcpScope {
  aiConfigId: number
  capabilities: string[]
  allowed: string[]
  mcpTools: string[]
}

export const getLibraryMcpScope = (aiConfigId: number) =>
  get<LibraryMcpScope>('/api/workshop/mcp-scope', {
    query: { ai_config_id: aiConfigId },
    fallbackError: '图书馆 MCP 权限加载失败',
  })

export const setLibraryMcpScope = (aiConfigId: number, tools: string[]) =>
  put<LibraryMcpScope>('/api/workshop/mcp-scope', {
    ai_config_id: aiConfigId,
    tools,
  }, { fallbackError: '图书馆 MCP 权限保存失败' })
