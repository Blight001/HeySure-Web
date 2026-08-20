import type { Agent, McpToolDefinition, ModelPreset } from '@/types'
import { DEFAULT_AI_AVATAR, resolveAiAvatarUrl } from '@/utils/aiAvatar'
import type { AiConfigUpsertPayload } from '@/api/ai'

export const BOT_CONFIG_DEFAULTS: Record<string, Record<string, any>> = {
  feishu: {
    enabled: false, webhook_url: '', app_id: '', app_secret: '', verification_token: '',
    default_receive_id: '', default_receive_id_type: 'chat_id',
  },
  qq: {
    enabled: false, app_id: '', app_secret: '', sandbox: false, default_target_id: '',
    default_target_type: 'c2c', markdown_mode: 'native', markdown_template_id: '', stream_enabled: true,
  },
  wechat: { enabled: false, bot_agent: 'HeySureAI/2.0.0' },
}

export function hydrateBotConfigs(raw: any): Record<string, Record<string, any>> {
  if (typeof raw === 'string') {
    try { raw = raw.trim() ? JSON.parse(raw) : null } catch { raw = null }
  }
  const out: Record<string, Record<string, any>> = {}
  for (const [channel, defaults] of Object.entries(BOT_CONFIG_DEFAULTS)) {
    const incoming = (raw && typeof raw === 'object' ? raw[channel] : null) || {}
    const merged: Record<string, any> = { ...defaults }
    for (const key of Object.keys(defaults)) {
      if (incoming[key] !== undefined && incoming[key] !== null) merged[key] = incoming[key]
    }
    out[channel] = merged
  }
  return out
}

export function buildBotConfigsPayload(formConfigs: Record<string, Record<string, any>>) {
  const out: Record<string, Record<string, any>> = {}
  for (const [channel, defaults] of Object.entries(BOT_CONFIG_DEFAULTS)) {
    out[channel] = { ...defaults, ...(formConfigs?.[channel] || {}) }
  }
  return out
}

export function roleGroupFromRole(_role?: string): 'digital_member' {
  return 'digital_member'
}

export function roleFromGroup(_group?: string): 'digital_member' {
  return 'digital_member'
}

export function normalizeDigitalMemberRole(value?: string): 'manager' | 'member' {
  return value === 'manager' ? 'manager' : 'member'
}

export function botChannelOf(value?: string): 'feishu' | 'qq' | 'wechat' {
  if (value === 'wechat') return 'wechat'
  if (value === 'qq') return 'qq'
  return 'feishu'
}

export function presetIdForModel(presets: ModelPreset[], presetId?: string, model?: string) {
  const id = String(presetId || '').trim()
  if (id && presets.some(item => item.id === id)) return id
  const modelName = String(model || '').trim()
  return presets.find(item => item.model === modelName || item.id === modelName)?.id || id
}

export function buildAiForm(_role: 'worker', presets: ModelPreset[]) {
  return {
    id: undefined as number | undefined,
    name: '新执行AI',
    description: '',
    avatar: DEFAULT_AI_AVATAR,
    ai_role_group: roleGroupFromRole(_role),
    digital_member_role: 'member' as 'manager' | 'member',
    platform: 'Ubuntu-Worker',
    token_limit: 10000,
    model_preset_id: presets[0]?.id || '',
    model: presets[0]?.model || '',
    reasoning_effort: '' as '' | 'low' | 'medium' | 'high',
    execution_mode: 'internal_model' as 'internal_model' | 'external_mcp',
    prompt: '',
    mcp_tools: [] as string[],
    bot_channel: 'feishu' as 'feishu' | 'qq' | 'wechat',
    bot_configs: hydrateBotConfigs(null),
  }
}

export function buildEditForm(agent: Agent, presets: ModelPreset[], normalizeSystemAutoControl: (raw: unknown) => any) {
  return {
    id: agent.aiConfigId,
    name: agent.name,
    description: '',
    avatar: resolveAiAvatarUrl(agent.avatar) || DEFAULT_AI_AVATAR,
    ai_role_group: roleGroupFromRole(agent.aiRole),
    digital_member_role: normalizeDigitalMemberRole(agent.digitalMemberRole || (agent.role === 'admin' ? 'manager' : 'member')),
    platform: agent.platform,
    token_limit: agent.tokenLimit,
    model_preset_id: presetIdForModel(presets, '', agent.model),
    model: agent.model || '',
    reasoning_effort: '' as '' | 'low' | 'medium' | 'high',
    execution_mode: agent.executionMode === 'external_mcp' ? 'external_mcp' : 'internal_model',
    prompt: '',
    mcp_tools: [] as string[],
    bot_channel: botChannelOf(agent.botChannel),
    bot_configs: hydrateBotConfigs(null),
    system_auto_control: normalizeSystemAutoControl({}),
  }
}

export function applyLoadedConfig(
  form: any,
  cfg: any,
  presets: ModelPreset[],
  normalizeSystemAutoControl: (raw: unknown) => any,
) {
  let autoControl = {}
  try { autoControl = JSON.parse(cfg.system_auto_control || '{}') } catch { autoControl = {} }
  return {
    ...form,
    description: cfg.description || '',
    avatar: resolveAiAvatarUrl(cfg.avatar) || DEFAULT_AI_AVATAR,
    ai_role_group: roleGroupFromRole(cfg.ai_role),
    digital_member_role: normalizeDigitalMemberRole(cfg.digital_member_role),
    platform: cfg.platform || form.platform,
    token_limit: cfg.token_limit ?? form.token_limit,
    model_preset_id: presetIdForModel(presets, cfg.model_preset_id, cfg.model),
    model: cfg.model ?? form.model,
    reasoning_effort: ['low', 'medium', 'high'].includes(String(cfg.reasoning_effort || '')) ? cfg.reasoning_effort : '',
    execution_mode: cfg.execution_mode === 'external_mcp' ? 'external_mcp' : 'internal_model',
    prompt: cfg.prompt || '',
    mcp_tools: [],
    bot_channel: botChannelOf(cfg.bot_channel),
    bot_configs: hydrateBotConfigs(cfg.bot_configs),
    system_auto_control: normalizeSystemAutoControl(autoControl),
  }
}

export function mapMcpToolRows(data: any): McpToolDefinition[] {
  if (!Array.isArray(data?.tools)) return []
  return data.tools
    .map((item: any) => ({
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
      inputSchema: item?.inputSchema && typeof item.inputSchema === 'object' ? item.inputSchema : { type: 'object', properties: {} },
      destructive: !!item?.destructive,
      mcpSource: 'server' as const,
    }))
    .filter((item: McpToolDefinition) => !!item.name)
}

export function buildAiConfigPayload(
  form: any,
  mode: 'create' | 'edit',
  presets: ModelPreset[],
  normalizeSystemAutoControl: (raw: unknown) => any,
): { payload: AiConfigUpsertPayload; executionMode: 'internal_model' | 'external_mcp'; selectedPreset?: ModelPreset } {
  const selectedBotChannel = botChannelOf(form.bot_channel)
  const executionMode = form.execution_mode === 'external_mcp' ? 'external_mcp' : 'internal_model'
  const selectedPreset = presets.find(item => item.id === form.model_preset_id)
  const usePreset = executionMode === 'internal_model' || mode === 'create'
  return {
    executionMode,
    selectedPreset,
    payload: {
      name: form.name,
      description: form.description,
      avatar: form.avatar || DEFAULT_AI_AVATAR,
      ai_role: roleFromGroup(form.ai_role_group),
      digital_member_role: form.ai_role_group === 'digital_member' ? normalizeDigitalMemberRole(form.digital_member_role) : 'member',
      platform: form.platform,
      token_limit: Number(form.token_limit) || 10000,
      execution_mode: executionMode,
      model: usePreset ? selectedPreset?.model : '',
      model_preset_id: usePreset ? selectedPreset?.id : '',
      reasoning_effort: executionMode === 'internal_model' ? form.reasoning_effort : '',
      prompt: form.prompt,
      mcp_tools: '[]',
      bot_channel: selectedBotChannel,
      bot_configs: buildBotConfigsPayload(form.bot_configs),
      system_auto_control: JSON.stringify(normalizeSystemAutoControl(form.system_auto_control || {})),
    },
  }
}
