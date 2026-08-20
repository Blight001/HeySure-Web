import { ref, watch } from 'vue'
import { normalizeSystemAutoControl as normalizeTaskSystemAutoControl } from '@/utils/taskSystem'
import { syncUiPreferencesToStorage } from '@/utils/uiPreferences'
import type { ModelPreset, User } from '@/types'
import { updateProfile } from '@/api/auth'
import {
  applyUserSystemSettings,
  clampIdleSeconds,
  clampMcpHistoryResultChars,
  clampMcpMaxSteps,
  clampReminderSeconds,
  DEFAULT_MCP_DYNAMIC_RULE,
  DEFAULT_MCP_NAMESPACE_HINTS,
  normalizeModelPresets,
  stripLegacyOneToolRule,
} from './useDashboardSystemSettingsHelpers'

type ThemeMode = 'light' | 'dark'
type FontSize = 'sm' | 'md' | 'lg'
type BrainViewMode = 'sections' | 'all'
type MessageType = 'info' | 'success' | 'warning' | 'error'
type AlertFn = (options: string | { message: string; type?: MessageType }) => Promise<void>

interface UseDashboardSystemSettingsOptions {
  getCurrentUser: () => User | null | undefined
  alert: AlertFn
  onRefreshUser: (user: User) => void
}

export const useDashboardSystemSettings = (options: UseDashboardSystemSettingsOptions) => {
  const themeMode = ref<ThemeMode>('dark')
  const fontSize = ref<FontSize>('md')
  const brainViewMode = ref<BrainViewMode>('sections')
  const tavilyApiKey = ref('')
  const modelPresets = ref<ModelPreset[]>([])
  const mcpMaxSteps = ref(48)
  const mcpHistoryResultMaxChars = ref(8000)
  const conversationAutoCompressEnabled = ref(true)
  const mcpNamespaceHints = ref(DEFAULT_MCP_NAMESPACE_HINTS)
  const mcpDynamicRule = ref(DEFAULT_MCP_DYNAMIC_RULE)
  const globalMcpCallMethod = ref(`When you want to call a tool, output one or more blocks using EXACTLY this format and do not wrap them in markdown code fences:
<mcp-call>
{"tool":"workspace.run+command","arguments":{"command":"dir"}}
</mcp-call>

可用的 MCP namespace：
{MCP}

Rules:
- Explain your intent in normal text first when helpful, then emit the MCP call block.
- Do not assume tool arguments. Use mcp.describe+tool with a tool, tools, or query request to discover capabilities and load schemas before calling a target tool.
- Use workspace.run+command for workspace inspection, file reads, file writes, edits, deletion, and command execution.
- Use admin.* tools when managing connected agents.
- Only fall back to legacy File/Create File/Delete File/Run Command formats if MCP is unavailable.`)
  const globalMcpFormatErrorHint = ref(`[系统提示] 检测到你正在尝试调用 MCP，但调用格式未通过校验，因此本次没有执行任何工具。

请改用以下标准格式（任选其一）：
1) JSON 方式（推荐）
<mcp-call>
{"tool":"workspace.run+command","arguments":{"command":"dir"}}
</mcp-call>

2) XML-like 方式
<mcp-call>
<tool>workspace.run+command</tool>
<arguments>{"command":"dir"}</arguments>
</mcp-call>

注意：
- <arguments> 标签内必须是 JSON 对象字符串。
- 不要写成 <arguments><paths>...</paths></arguments> 这种嵌套标签格式。
- 一次只调用一个工具，等待 MCP 返回后再继续。
{details}`)
  const defaultStartTaskPrompt = ref('你将收到一个任务，请先理解目标、约束与优先级，然后开始执行。')
  const defaultResumeTaskPrompt = ref('请继续执行刚才被暂停的任务，先简要回顾当前进度，再继续推进直到可交付。')
  const defaultSupervisionPrompt = ref('系统监督提醒：请确认当前任务是否已完成。若已完成可自然结束；若未完成请给出剩余步骤并继续执行。复杂任务请使用 todo.manage(action=create) 拆分阶段，阶段完成后用 action=edit 更新状态。')
  const defaultSupervisionIdleSeconds = ref(25)
  const defaultCompressionPrompt = ref(`你正在把一段较长的对话历史压缩成摘要，以便在不超出上下文上限的情况下继续同一段对话。请阅读下面的对话历史，输出一段简洁但信息完整的中文摘要，必须保留：用户的核心目标与约束、已完成的工作与关键产出、尚未完成的事项与已知风险、重要的事实/数据/结论，以及接下来应继续推进的下一步。请省略寒暄与重复内容，只输出摘要正文，不要添加额外说明或前后缀。

[待压缩的对话历史]
{history}`)
  const promptAiMessageNotify = ref(`[系统通知 · AI 间通信]
你收到一条来自其它 AI 的通知消息。发送方不会在原工具调用中阻塞等待，但你仍然可以主动回复。

- 收件方（你）: {target_ai_name}（ai_config_id={target_ai_config_id}）
- 发送方: {from_ai_name}（ai_config_id={from_ai_config_id}）
- 消息编号: {message_id}
- 消息内容:
{content}

如果消息内容要求你回话、确认或补充状态，请调用 MCP 工具 \`message.send+to\` 回发消息给发送方：
  arguments: {{"to": "{from_ai_config_id}", "content": "<你的回复>", "require_reply": false}}
这样发送方会作为新收件方被系统唤醒处理你的回信。`)
  const promptAiMessageInquiry = ref(`[AI 间通信 · 询问]
{from_ai_name} 向你提出了一个询问，需要你给出明确答复**一次**。

- 收件方（你）: {target_ai_name}（ai_config_id={target_ai_config_id}）
- 发送方: {from_ai_name}（ai_config_id={from_ai_config_id}）
- 消息编号: {message_id}
- 询问内容:
{content}

回复方式：调用 MCP 工具 \`message.send+to\`，参数如下：
  {{"to": "{from_ai_config_id}", "content": "<你的答复>", "message_type": "reply", "require_reply": false, "reply_to_message_id": "{message_id}", "current_session_id": "{current_session_id}"}}

回复后如仍需沟通，可以继续使用 \`message.send+to\`。`)
  const aiMessageInquiryReminderSeconds = ref(3)
  const promptAiMessageInquiryReminder = ref(`[系统提示 · AI 间询问待回复]
你仍有一条来自 {from_ai_name} 的询问尚未回复，系统正在等待这个闭环。

- 原消息编号: {message_id}
- 当前会话: {current_session_id}
- 已等待秒数: {elapsed_seconds}
- 询问内容:
{content}

请立即先答复这条询问。回复方式：调用 MCP 工具 \`message.send+to\`，参数必须包含：
{{"to": "{from_ai_config_id}", "content": "<你的答复>", "message_type": "reply", "require_reply": false, "reply_to_message_id": "{message_id}", "current_session_id": "{current_session_id}"}}`)
  const promptAiMessageReply = ref(`[AI 间通信 · 收到答复]
你之前的询问已收到对方答复。

- 收件方（你）: {target_ai_name}（ai_config_id={target_ai_config_id}）
- 答复方: {from_ai_name}（ai_config_id={from_ai_config_id}）
- 本次答复消息编号: {message_id}
- 答复内容:
{content}`)
  const promptAiMessageReplySuccess = ref('[系统提示] 你对消息 {message_id} 的回复已送达。\n现在请继续你刚才被打断的任务。')
  const promptUserMessageNotice = ref('[系统提示] 你已向用户发出一条消息（{channel}）。\n用户的回复（如有）会通过正常对话渠道返回，请不要重复发送。')

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement
    if (mode === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }

  const applyFontSize = (size: FontSize) => {
    const map: Record<FontSize, string> = { sm: '14px', md: '17px', lg: '20px' }
    document.documentElement.style.setProperty('--app-font-size', map[size])
  }

  const getSystemAutoControlDefaults = () => ({
    start_task_prompt: defaultStartTaskPrompt.value,
    resume_task_prompt: defaultResumeTaskPrompt.value,
    supervision_prompt: defaultSupervisionPrompt.value,
    compression_prompt: defaultCompressionPrompt.value,
  })

  const normalizeSystemAutoControl = (raw: unknown) =>
    normalizeTaskSystemAutoControl(raw, getSystemAutoControlDefaults())

  const saveSystemSettings = async () => {
    const currentUser = options.getCurrentUser()
    if (!currentUser) return

    try {
      const updatedUser = await updateProfile({
        mcp_call_method: stripLegacyOneToolRule(globalMcpCallMethod.value),
        mcp_namespace_hints: mcpNamespaceHints.value,
        mcp_dynamic_rule: mcpDynamicRule.value,
        mcp_format_error_hint: globalMcpFormatErrorHint.value,
        tavily_api_key: tavilyApiKey.value,
        model_presets: JSON.stringify(normalizeModelPresets(modelPresets.value)),
        mcp_max_steps: clampMcpMaxSteps(mcpMaxSteps.value),
        mcp_history_result_max_chars: clampMcpHistoryResultChars(mcpHistoryResultMaxChars.value),
        conversation_auto_compress_enabled: conversationAutoCompressEnabled.value,
        default_start_task_prompt: defaultStartTaskPrompt.value,
        default_resume_task_prompt: defaultResumeTaskPrompt.value,
        default_supervision_prompt: defaultSupervisionPrompt.value,
        default_supervision_idle_seconds: clampIdleSeconds(defaultSupervisionIdleSeconds.value),
        default_compression_prompt: defaultCompressionPrompt.value,
        prompt_ai_message_notify: promptAiMessageNotify.value,
        prompt_ai_message_inquiry: promptAiMessageInquiry.value,
        ai_message_inquiry_reminder_seconds: clampReminderSeconds(aiMessageInquiryReminderSeconds.value),
        prompt_ai_message_inquiry_reminder: promptAiMessageInquiryReminder.value,
        prompt_ai_message_reply: promptAiMessageReply.value,
        prompt_ai_message_reply_success: promptAiMessageReplySuccess.value,
        prompt_user_message_notice: promptUserMessageNotice.value,
        ui_theme_mode: themeMode.value,
        ui_font_size: fontSize.value,
        ui_brain_view_mode: brainViewMode.value,
      })
      void options.alert({ message: '系统设置已保存', type: 'success' })
      options.onRefreshUser(updatedUser)
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      void options.alert({ message: `保存失败: ${err?.message || '未知错误'}`, type: 'error' })
    }
  }

  const saveBrainViewMode = async (mode: BrainViewMode) => {
    const next = mode === 'all' ? 'all' : 'sections'
    brainViewMode.value = next
    const currentUser = options.getCurrentUser()
    if (!currentUser) return
    try {
      const updatedUser = await updateProfile({ ui_brain_view_mode: next })
      options.onRefreshUser(updatedUser)
    } catch (err) {
      console.error('Failed to save brain view mode:', err)
      void options.alert({ message: '数字生命查看方式保存失败', type: 'error' })
    }
  }

  watch(themeMode, value => {
    applyTheme(value)
    syncUiPreferencesToStorage(value, fontSize.value)
  }, { immediate: true })

  watch(fontSize, value => {
    applyFontSize(value)
    syncUiPreferencesToStorage(themeMode.value, value)
  }, { immediate: true })

  watch(
    () => options.getCurrentUser(),
    user => applyUserSystemSettings(user, {
      themeMode, fontSize, brainViewMode, globalMcpCallMethod, mcpNamespaceHints, mcpDynamicRule,
      tavilyApiKey, modelPresets, globalMcpFormatErrorHint, mcpMaxSteps, mcpHistoryResultMaxChars,
      conversationAutoCompressEnabled, defaultStartTaskPrompt, defaultResumeTaskPrompt,
      defaultSupervisionPrompt, defaultSupervisionIdleSeconds, defaultCompressionPrompt,
      promptAiMessageNotify, promptAiMessageInquiry, aiMessageInquiryReminderSeconds,
      promptAiMessageInquiryReminder, promptAiMessageReply,
      promptAiMessageReplySuccess, promptUserMessageNotice,
    }),
    { immediate: true },
  )

  return {
    themeMode,
    fontSize,
    brainViewMode,
    tavilyApiKey,
    modelPresets,
    globalMcpCallMethod,
    mcpNamespaceHints,
    mcpDynamicRule,
    globalMcpFormatErrorHint,
    mcpMaxSteps,
    mcpHistoryResultMaxChars,
    conversationAutoCompressEnabled,
    defaultStartTaskPrompt,
    defaultResumeTaskPrompt,
    defaultSupervisionPrompt,
    defaultSupervisionIdleSeconds,
    defaultCompressionPrompt,
    promptAiMessageNotify,
    promptAiMessageInquiry,
    aiMessageInquiryReminderSeconds,
    promptAiMessageInquiryReminder,
    promptAiMessageReply,
    promptAiMessageReplySuccess,
    promptUserMessageNotice,
    normalizeSystemAutoControl,
    saveSystemSettings,
    saveBrainViewMode,
  }
}
