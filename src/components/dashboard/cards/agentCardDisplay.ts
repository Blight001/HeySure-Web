import type { AppIconName } from '@/assets/icons'
import type { Agent, AgentTaskSnapshot } from '@/types'

export type BotChannel = 'feishu' | 'qq' | 'wechat'

export interface BotConnectionBadge {
  text: string
  class: string
  title: string
}

export interface RoleBadge {
  text: string
  icon: AppIconName
  class: string
}

export const IDLE_THINKING_TEXT = '空闲中'

const CHANNEL_NAME: Record<BotChannel, string> = {
  feishu: '飞书',
  qq: 'QQ',
  wechat: '微信',
}

const QQ_MODE_TEXT: Record<string, string> = {
  long_connection: '长连接',
  sandbox_webhook: '沙箱仅通知',
  webhook: '仅通知',
}

const FEISHU_MODE_TEXT: Record<string, string> = {
  long_connection: '长连接',
  webhook: '仅通知',
}

const BOT_TONE = {
  success: {
    class: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  pending: {
    class: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
  },
  fail: {
    class: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300',
  },
} as const

function channelEnabled(agent: Agent, channel: BotChannel): boolean {
  if (channel === 'wechat') return !!agent.wechatEnabled
  if (channel === 'qq') return !!agent.qqEnabled
  return !!agent.feishuEnabled
}

function channelStatus(agent: Agent, channel: BotChannel) {
  if (channel === 'wechat') return agent.wechatStatus
  if (channel === 'qq') return agent.qqStatus
  return agent.feishuStatus
}

function channelReceiveId(agent: Agent, channel: BotChannel): string {
  if (channel === 'qq') return String(agent.qqDefaultTargetId || '').trim()
  return String(agent.feishuDefaultReceiveId || '').trim()
}

function channelModeText(channel: BotChannel, mode: string): string {
  if (channel === 'wechat') return 'iLink'
  if (channel === 'qq') return QQ_MODE_TEXT[mode] || '未配置'
  return FEISHU_MODE_TEXT[mode] || '未配置'
}

function botConnectionText(status: string, botName: string, modeText: string): string {
  if (status === 'success') return `${botName} · ${modeText}`
  if (status === 'pending') return `${botName}待回调 · ${modeText}`
  return `${botName}失败 · ${modeText}`
}

function botConnectionClass(status: string): string {
  if (status === 'success') return BOT_TONE.success.class
  if (status === 'pending') return BOT_TONE.pending.class
  return BOT_TONE.fail.class
}

function botConnectionTitle(status: string, name: string, message: string, receiveId: string): string {
  if (status === 'success') {
    return [message || `${name}机器人状态成功`, receiveId ? `默认接收：${receiveId}` : ''].filter(Boolean).join('；')
  }
  if (status === 'pending') {
    return [message || `${name}机器人等待回调`, receiveId ? `默认接收：${receiveId}` : ''].filter(Boolean).join('；')
  }
  return message || `${name}机器人状态失败`
}

export function buildBotConnection(agent: Agent, channel: BotChannel): BotConnectionBadge | null {
  if (!channelEnabled(agent, channel)) return null
  const botStatus = channelStatus(agent, channel)
  const status = String(botStatus?.status || '').trim()
  const mode = String(botStatus?.mode || '').trim()
  const message = String(botStatus?.message || '').trim()
  const name = CHANNEL_NAME[channel]
  return {
    text: botConnectionText(status, `${name}机器人`, channelModeText(channel, mode)),
    class: botConnectionClass(status),
    title: botConnectionTitle(status, name, message, channelReceiveId(agent, channel)),
  }
}

export function listBotConnections(agent: Agent): BotConnectionBadge[] {
  return (['feishu', 'qq', 'wechat'] as const).flatMap((channel) => {
    const item = buildBotConnection(agent, channel)
    return item ? [item] : []
  })
}

const LEARNING_CLASS = 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/30'
const CHAT_CLASS = 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/30'
const WORKING_CLASS = 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30'
const WAITING_CLASS = 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30'
const IDLE_CLASS = 'text-zinc-600 bg-zinc-100/60 border-zinc-200 dark:text-zinc-300 dark:bg-zinc-800/80 dark:border-zinc-700'
const REPRO_CLASS = 'text-purple-600 bg-purple-50 border-purple-200 animate-pulse dark:text-purple-300 dark:bg-purple-500/10 dark:border-purple-500/30'
const DEAD_CLASS = 'text-zinc-500 bg-zinc-100/60 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800/60 dark:border-zinc-700'

function workingStatusDisplay(agent: Agent, suffix: string): { text: string; class: string } {
  const taskStatus = String(agent.currentTaskStatus || '').toLowerCase()
  const isTaskRunning = taskStatus === 'running' || agent.runtimeStatus === 'running'
  const isTaskWaiting = ['queued', 'paused', 'scheduled', 'next'].includes(taskStatus)
  if (agent.userChatActive) return { text: `与用户沟通中${suffix}`, class: CHAT_CLASS }
  if (isTaskRunning) return { text: `工作中${suffix}`, class: WORKING_CLASS }
  if (isTaskWaiting) return { text: `等待中${suffix}`, class: WAITING_CLASS }
  return { text: `空闲中${suffix}`, class: IDLE_CLASS }
}

export function agentStatusDisplay(agent: Agent): { text: string; class: string } {
  const suffix = agent.enabled ? '' : ' · 已停止'
  if (agent.status === 'learning') return { text: `学习中 (下载记忆)${suffix}`, class: LEARNING_CLASS }
  if (agent.status === 'working') return workingStatusDisplay(agent, suffix)
  if (agent.status === 'reproducing') return { text: '传宗接代 (总结任务)', class: REPRO_CLASS }
  if (agent.status === 'dead') return { text: '已枯竭', class: DEAD_CLASS }
  return { text: '未知', class: 'text-gray-500' }
}

export function agentCardBorderClass(agent: Agent): string {
  if (agent.aiRole === 'assistant_admin') {
    return 'border-2 border-violet-300 ring-1 ring-inset ring-violet-200/80 shadow-[0_0_14px_rgba(196,181,253,0.5)] dark:border-violet-400/70 dark:ring-violet-500/35 dark:shadow-[0_0_16px_rgba(139,92,246,0.22)]'
  }
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') {
    return 'border-2 border-amber-300 ring-1 ring-inset ring-amber-200/80 shadow-[0_0_14px_rgba(252,211,77,0.5)] dark:border-amber-400/70 dark:ring-amber-500/35 dark:shadow-[0_0_16px_rgba(245,158,11,0.22)]'
  }
  if (agent.aiRole === 'digital_member') {
    return 'border-2 border-sky-300 ring-1 ring-inset ring-sky-200/80 shadow-[0_0_14px_rgba(125,211,252,0.5)] hover:border-sky-400 dark:border-sky-400/70 dark:ring-sky-500/35 dark:shadow-[0_0_16px_rgba(14,165,233,0.22)]'
  }
  if (agent.status === 'dead') return 'border-zinc-200 opacity-75 grayscale'
  return 'border-zinc-200 hover:border-indigo-300'
}

export function agentCardGlowClass(agent: Agent): string {
  if (agent.status === 'dead') return 'agent-card-glow-dead'
  if (agent.aiRole === 'assistant_admin') return 'agent-card-glow-assistant'
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') return 'agent-card-glow-manager'
  if (agent.aiRole === 'digital_member') return 'agent-card-glow-member'
  return 'agent-card-glow-default'
}

export function agentTitleHoverClass(agent: Agent): string {
  if (agent.status === 'dead') return 'group-hover:text-zinc-500'
  if (agent.aiRole === 'assistant_admin') return 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') return 'group-hover:text-amber-600 dark:group-hover:text-amber-400'
  if (agent.aiRole === 'digital_member') return 'group-hover:text-sky-600 dark:group-hover:text-sky-400'
  return 'group-hover:text-indigo-600'
}

export function agentRoleBadge(agent: Agent): RoleBadge | null {
  if (agent.aiRole === 'assistant_admin') {
    return {
      text: '辅助管理员',
      icon: 'sparkles',
      class: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40',
    }
  }
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') {
    return {
      text: '数字社会管理员',
      icon: 'crown',
      class: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
    }
  }
  if (agent.aiRole === 'digital_member') {
    return {
      text: '数字成员',
      icon: 'robot',
      class: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/40',
    }
  }
  return null
}

export function agentSyncedMcpText(agent: Agent): string {
  if (!agent.enabled) return 'AI 已停止'
  const activeCalling = agent.runtimeStatus === 'running'
    || (agent.currentTaskStatus === 'running' && !!agent.runtimeTool)
  if (activeCalling) {
    return agent.runtimeTool ? `MCP 调用中: ${agent.runtimeTool}` : 'MCP 调用中: 等待返回'
  }
  if (agent.runtimeStatus === 'error') return 'MCP 调用失败'
  return agent.runtimeTool ? `最近 MCP: ${agent.runtimeTool}` : '最近 MCP: 暂无调用'
}

export function conversationRunActive(agent: Agent): boolean {
  const runStatus = String(agent.activeRunStatus || '').toLowerCase()
  const runPhase = String(agent.activeRunPhase || '').toLowerCase()
  return !!agent.userChatActive
    || agent.runtimeStatus === 'running'
    || ['running', 'queued'].includes(runStatus)
    || (!!runStatus && !['completed', 'failed', 'cancelled', 'canceled'].includes(runStatus)
      && !['', 'idle', 'completed', 'failed', 'cancelled', 'canceled'].includes(runPhase))
}

export function thinkingFallbackText(agent: Agent, conversationActive: boolean): string {
  if (agent.runtimeStatus === 'running') {
    return agent.runtimeTool ? `正在调用 ${agent.runtimeTool}…` : '正在调用 MCP…'
  }
  return conversationActive ? '等待 AI 回复…' : IDLE_THINKING_TEXT
}

export function formatTaskSchedule(task?: AgentTaskSnapshot | null): string {
  if (!task) return ''
  if (!task.scheduleAt) return ''
  const date = new Date(task.scheduleAt * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return `下次执行：${date.toLocaleDateString()}`
}

export function scheduledTaskSnapshots(agent: Agent): AgentTaskSnapshot[] {
  const currentJobId = agent.taskCurrent?.jobId || ''
  const scheduled = Array.isArray(agent.taskScheduledTasks) ? agent.taskScheduledTasks : []
  return scheduled.filter(task => task && task.jobId !== currentJobId)
}
