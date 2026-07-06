import { get, put } from './http'

export interface AgentMode {
  mode_key: string
  name: string
  description: string
  prompt: string
  /** 模式类型：是否允许调用设备端（桌面/浏览器/安卓）MCP */
  allow_device_mcp: boolean
  is_builtin: boolean
  sort_order?: number
  updated_at?: number
}

// 工作模式按 AI 隔离：aiConfigId 指定读取 / 编辑哪个 AI 的模式清单。
export const listAgentModes = (aiConfigId?: number) =>
  get<{ modes: AgentMode[] }>('/api/agent-modes', {
    query: { ai_config_id: aiConfigId },
    fallbackError: '工作模式加载失败',
  })

export const updateAgentMode = (
  modeKey: string,
  patch: Partial<Pick<AgentMode, 'name' | 'description' | 'prompt' | 'allow_device_mcp'>>,
  aiConfigId?: number,
) =>
  put<AgentMode>(`/api/agent-modes/${encodeURIComponent(modeKey)}`, patch, {
    query: { ai_config_id: aiConfigId },
    fallbackError: '工作模式保存失败',
  })
