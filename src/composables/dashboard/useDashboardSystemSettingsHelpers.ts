import type { ModelPreset } from '@/types'

export const DEFAULT_MCP_NAMESPACE_HINTS = JSON.stringify({
  mcp: 'MCP 自省入口。使用 mcp.describe+tool 的 tool、tools 或 query 参数发现工具并查询参数。',
  member: 'AI 数字成员管理。member.manage 用于查询、创建和编辑成员及其任务、Token 上限和设备绑定，需要绑定图书馆；成员删除只允许人在控制台确认。',
  todo: '统一计划管理。todo.manage 用 create/get/edit/delete 创建、查看、推进或删除计划；阶段完成用 edit，最后阶段更新后系统自动收尾。',
  workspace: '工作区与命令执行。用于检查文件、运行只读诊断命令或执行用户明确要求的工作区操作。',
  conversation: '会话管理。用于查找、新建、删除会话或按请求清理上下文。',
  ai: 'AI 间通信。用于向其他 AI 发送询问、回复、通知或协作消息。',
  user: '用户通知。用于向用户发送异步消息。',
  web: '联网搜索。用于查询外部或实时信息。',
  memory: '长期记忆。用于写入、检索、更新和归档结构化记忆。',
  librarian: '知识流程库。用于咨询、提交、读取和归档可复用流程。',
  evolution: '系统进化建议。用于提交、列出和评审改进建议。',
  project: '项目管理。用于查看或维护项目记录。',
}, null, 2)

export const DEFAULT_MCP_DYNAMIC_RULE = `系统提示的[动态 MCP 说明]目录会一次性列出全部可调用工具的名称与简介，模型据此直接定位。需要参数时用 mcp.describe+tool（支持 tool 单个、tools 批量或 query 关键词搜索）取 schema；被加载的目标工具会在随后轮次直接可调用。

browser_tab 仅 7 种动作：list 获取全部页面（id/url/title/active）及 activeTab；switch+tab_id 切换到已有页；replace+url 在当前页覆盖跳转；navigate+url 新标签打开；close 关闭；back/forward 历史导航。流程：先 list，已开则 switch，当前页改址用 replace，并行任务用 navigate。`

export function clampIdleSeconds(value: unknown) {
  const parsed = Number(value ?? 25)
  if (!Number.isFinite(parsed)) return 25
  return Math.max(5, Math.min(3600, Math.floor(parsed)))
}

export function clampReminderSeconds(value: unknown) {
  const parsed = Number(value ?? 3)
  if (!Number.isFinite(parsed)) return 3
  return Math.max(0, Math.min(3600, Math.floor(parsed)))
}

export function clampMcpMaxSteps(value: unknown) {
  const parsed = Number(value ?? 48)
  if (!Number.isFinite(parsed)) return 48
  return Math.max(1, Math.min(999, Math.floor(parsed)))
}

export function clampMcpHistoryResultChars(value: unknown) {
  const parsed = Number(value ?? 100)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(20, Math.min(10000, Math.floor(parsed)))
}

export function stripLegacyOneToolRule(raw: unknown) {
  return String(raw ?? '')
    .split(/\r?\n/)
    .filter(line => !line.includes('Call exactly one tool per <mcp-call> block; never join two tool names into one name.'))
    .join('\n')
    .trim()
}

function uniquePresetId(item: any, model: string, index: number, seen: Set<string>) {
  let id = String(item?.id || model || `model_${index + 1}`).trim()
  if (!id || seen.has(id)) id = `${model}_${index + 1}`
  seen.add(id)
  return id
}

function parsePresetItem(item: any, index: number, seen: Set<string>): ModelPreset | null {
  const model = String(item?.model || '').trim()
  const apiKey = String(item?.api_key || '').trim()
  const baseUrl = String(item?.base_url || '').trim()
  if (!model || !apiKey || !baseUrl) return null
  const provider = String(item?.provider || '').trim().toLowerCase()
  const toolProtocol = String(item?.tool_protocol || '').trim().toLowerCase()
  return {
    id: uniquePresetId(item, model, index, seen),
    name: String(item?.name || model).trim() || model,
    api_key: apiKey,
    base_url: baseUrl,
    model,
    provider: (['anthropic', 'openai'].includes(provider) ? provider : 'auto') as ModelPreset['provider'],
    tool_protocol: (['native', 'text'].includes(toolProtocol) ? toolProtocol : 'auto') as ModelPreset['tool_protocol'],
  }
}

export function normalizeModelPresets(raw: unknown): ModelPreset[] {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '[]') } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  return parsed.map((item, index) => parsePresetItem(item, index, seen)).filter(Boolean) as ModelPreset[]
}

function hasOwn(raw: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(raw, key)
}

export type SystemSettingsDraft = {
  themeMode: { value: 'light' | 'dark' }
  fontSize: { value: 'sm' | 'md' | 'lg' }
  brainViewMode: { value: 'sections' | 'all' }
  globalMcpCallMethod: { value: string }
  mcpNamespaceHints: { value: string }
  mcpDynamicRule: { value: string }
  tavilyApiKey: { value: string }
  modelPresets: { value: ModelPreset[] }
  globalMcpFormatErrorHint: { value: string }
  mcpMaxSteps: { value: number }
  mcpHistoryResultMaxChars: { value: number }
  conversationAutoCompressEnabled: { value: boolean }
  defaultStartTaskPrompt: { value: string }
  defaultResumeTaskPrompt: { value: string }
  defaultSupervisionPrompt: { value: string }
  defaultSupervisionIdleSeconds: { value: number }
  defaultCompressionPrompt: { value: string }
  promptAiMessageNotify: { value: string }
  promptAiMessageInquiry: { value: string }
  aiMessageInquiryReminderSeconds: { value: number }
  promptAiMessageInquiryReminder: { value: string }
  promptAiMessageReply: { value: string }
  promptAiMessageChitchat: { value: string }
  promptAiMessageReplySuccess: { value: string }
  promptUserMessageNotice: { value: string }
}

function applyUiPrefs(raw: Record<string, any>, draft: SystemSettingsDraft) {
  if (hasOwn(raw, 'ui_theme_mode')) draft.themeMode.value = String(raw.ui_theme_mode ?? '').toLowerCase() === 'light' ? 'light' : 'dark'
  if (hasOwn(raw, 'ui_font_size')) {
    const rawFont = String(raw.ui_font_size ?? '').toLowerCase()
    draft.fontSize.value = rawFont === 'sm' || rawFont === 'lg' ? rawFont : 'md'
  }
  if (hasOwn(raw, 'ui_brain_view_mode')) {
    draft.brainViewMode.value = String(raw.ui_brain_view_mode ?? '').toLowerCase() === 'all' ? 'all' : 'sections'
  }
}

function applyMcpPrefs(raw: Record<string, any>, draft: SystemSettingsDraft) {
  if (hasOwn(raw, 'mcp_call_method')) draft.globalMcpCallMethod.value = stripLegacyOneToolRule(raw.mcp_call_method)
  if (hasOwn(raw, 'mcp_namespace_hints')) draft.mcpNamespaceHints.value = String(raw.mcp_namespace_hints || DEFAULT_MCP_NAMESPACE_HINTS)
  if (hasOwn(raw, 'mcp_dynamic_rule')) draft.mcpDynamicRule.value = String(raw.mcp_dynamic_rule || DEFAULT_MCP_DYNAMIC_RULE)
  if (hasOwn(raw, 'tavily_api_key')) draft.tavilyApiKey.value = String(raw.tavily_api_key ?? '')
  if (hasOwn(raw, 'model_presets')) draft.modelPresets.value = normalizeModelPresets(raw.model_presets)
  if (hasOwn(raw, 'mcp_format_error_hint')) draft.globalMcpFormatErrorHint.value = String(raw.mcp_format_error_hint ?? '')
  if (hasOwn(raw, 'mcp_max_steps')) draft.mcpMaxSteps.value = clampMcpMaxSteps(raw.mcp_max_steps)
  if (hasOwn(raw, 'mcp_history_result_max_chars')) draft.mcpHistoryResultMaxChars.value = clampMcpHistoryResultChars(raw.mcp_history_result_max_chars)
  if (hasOwn(raw, 'conversation_auto_compress_enabled')) {
    draft.conversationAutoCompressEnabled.value = raw.conversation_auto_compress_enabled !== false
  }
}

function applyStringPref(raw: Record<string, any>, key: string, target: { value: string }) {
  if (hasOwn(raw, key)) target.value = String(raw[key] ?? '')
}

function applyTaskPromptPrefs(raw: Record<string, any>, draft: SystemSettingsDraft) {
  applyStringPref(raw, 'default_start_task_prompt', draft.defaultStartTaskPrompt)
  applyStringPref(raw, 'default_resume_task_prompt', draft.defaultResumeTaskPrompt)
  applyStringPref(raw, 'default_supervision_prompt', draft.defaultSupervisionPrompt)
  applyStringPref(raw, 'default_compression_prompt', draft.defaultCompressionPrompt)
  if (hasOwn(raw, 'default_supervision_idle_seconds')) {
    draft.defaultSupervisionIdleSeconds.value = clampIdleSeconds(raw.default_supervision_idle_seconds)
  }
}

function applyAiMessagePrefs(raw: Record<string, any>, draft: SystemSettingsDraft) {
  applyStringPref(raw, 'prompt_ai_message_notify', draft.promptAiMessageNotify)
  applyStringPref(raw, 'prompt_ai_message_inquiry', draft.promptAiMessageInquiry)
  applyStringPref(raw, 'prompt_ai_message_inquiry_reminder', draft.promptAiMessageInquiryReminder)
  applyStringPref(raw, 'prompt_ai_message_reply', draft.promptAiMessageReply)
  applyStringPref(raw, 'prompt_ai_message_chitchat', draft.promptAiMessageChitchat)
  applyStringPref(raw, 'prompt_ai_message_reply_success', draft.promptAiMessageReplySuccess)
  applyStringPref(raw, 'prompt_user_message_notice', draft.promptUserMessageNotice)
  if (hasOwn(raw, 'ai_message_inquiry_reminder_seconds')) {
    draft.aiMessageInquiryReminderSeconds.value = clampReminderSeconds(raw.ai_message_inquiry_reminder_seconds)
  }
}

function applyPromptPrefs(raw: Record<string, any>, draft: SystemSettingsDraft) {
  applyTaskPromptPrefs(raw, draft)
  applyAiMessagePrefs(raw, draft)
}

export function applyUserSystemSettings(user: unknown, draft: SystemSettingsDraft) {
  if (!user) return
  const raw = user as Record<string, any>
  applyUiPrefs(raw, draft)
  applyMcpPrefs(raw, draft)
  applyPromptPrefs(raw, draft)
}
