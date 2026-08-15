import { formatDate, formatDateMinute } from '@/utils/datetime'
import type { Agent } from '@/types'
import type { AITaskJobItem, TaskCreateForm } from '@/utils/taskSystem'

export function parseAgentMcpTools(agent: Agent | null | undefined, fallback: string[]) {
  try {
    const parsed = JSON.parse(agent?.mcpTools || '[]')
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // ignore parse issue and fallback
  }
  return [...fallback]
}

export function buildTaskCreateForm(agent: Agent | null | undefined, fallbackTools: string[]): TaskCreateForm {
  return {
    title: '',
    instruction: '',
    priority: 5,
    schedule_enabled: false,
    schedule_loop_enabled: false,
    schedule_loop_mode: 'interval',
    schedule_run_immediately: false,
    schedule_time_mode: 'duration',
    schedule_duration_minutes: 30,
    schedule_daily_time: '09:00',
    schedule_weekly_days: [],
    schedule_max_runs: 0,
    schedule_end_at: '',
    schedule_at: '',
    override_mcp_tools_enabled: false,
    mcp_tools_override: parseAgentMcpTools(agent, fallbackTools),
  }
}

function parseScheduleAt(raw: unknown) {
  let parsedScheduleAt = Number(raw)
  if (!Number.isFinite(parsedScheduleAt) && typeof raw === 'string') {
    const parsedMs = Date.parse(raw)
    if (Number.isFinite(parsedMs) && parsedMs > 0) parsedScheduleAt = Math.floor(parsedMs / 1000)
  }
  return parsedScheduleAt
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

function loopModeOf(schedule: Record<string, any>): TaskCreateForm['schedule_loop_mode'] {
  const raw = String(schedule.loop_mode || 'interval')
  return raw === 'daily' || raw === 'weekly' ? raw : 'interval'
}

function weeklyDaysOf(schedule: Record<string, any>) {
  if (!Array.isArray(schedule.weekly_days)) return []
  return schedule.weekly_days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
}

function scheduleFieldsFromJob(schedule: Record<string, any>, base: TaskCreateForm) {
  const loopEnabled = !!schedule.loop_enabled
  const parsedScheduleAt = parseScheduleAt(schedule.schedule_at)
  const hasScheduleAt = Number.isFinite(parsedScheduleAt) && parsedScheduleAt > 0
  const scheduleTimeMode: TaskCreateForm['schedule_time_mode'] = (!loopEnabled && hasScheduleAt) ? 'datetime' : 'duration'
  const ts = Number(schedule.end_at || 0)
  return {
    schedule_enabled: !!schedule.enabled,
    schedule_loop_enabled: loopEnabled,
    schedule_loop_mode: loopModeOf(schedule),
    schedule_run_immediately: !!schedule.run_immediately,
    schedule_time_mode: scheduleTimeMode,
    schedule_duration_minutes: Math.max(1, Number(schedule.duration_minutes) || 30),
    schedule_daily_time: String(schedule.daily_time || base.schedule_daily_time),
    schedule_weekly_days: weeklyDaysOf(schedule),
    schedule_max_runs: Math.max(0, Number(schedule.max_runs) || 0),
    schedule_end_at: Number.isFinite(ts) && ts > 0 ? formatDate(ts, '') : '',
    schedule_at: scheduleTimeMode === 'datetime' && parsedScheduleAt > 0
      ? formatDateMinute(parsedScheduleAt, '').replace(' ', 'T')
      : '',
  }
}

export function buildTaskCreateFormFromJob(
  agent: Agent | null | undefined,
  job: AITaskJobItem | null | undefined,
  fallbackTools: string[],
): TaskCreateForm {
  const base = buildTaskCreateForm(agent, fallbackTools)
  if (!job) return base
  const payload = objectOrEmpty(job.task_payload)
  const overrideMcp = objectOrEmpty(payload.override_mcp_tools)
  const overrideMcpTools = Array.isArray(overrideMcp.tools)
    ? overrideMcp.tools.map((item: any) => String(item || '').trim()).filter(Boolean)
    : []
  return {
    ...base,
    title: String(job.title || ''),
    instruction: String(job.instruction || ''),
    priority: Math.max(1, Math.min(10, Number(job.priority) || 5)),
    ...scheduleFieldsFromJob(objectOrEmpty(payload.schedule), base),
    override_mcp_tools_enabled: !!overrideMcp.enabled,
    mcp_tools_override: overrideMcpTools.length > 0 ? overrideMcpTools : base.mcp_tools_override,
  }
}

function validateScheduleForm(form: TaskCreateForm): string | null {
  const useScheduleDatetime = !!form.schedule_enabled && !form.schedule_loop_enabled && form.schedule_time_mode === 'datetime'
  if (useScheduleDatetime && !form.schedule_at) return '请选择定时日期'
  const loopEnabled = !!form.schedule_enabled && !!form.schedule_loop_enabled
  const loopMode = loopEnabled ? form.schedule_loop_mode : 'interval'
  if (!loopEnabled || (loopMode !== 'daily' && loopMode !== 'weekly')) return null
  if (!/^\d{1,2}:\d{2}$/.test(form.schedule_daily_time.trim())) return '请选择循环触发时刻（HH:MM）'
  if (loopMode === 'weekly' && form.schedule_weekly_days.length === 0) return '每周循环请至少选择一个星期'
  return null
}

export function validateTaskCreateForm(form: TaskCreateForm): string | null {
  if (!form.title.trim()) return '请填写任务名称'
  if (!form.instruction.trim()) return '请填写任务具体内容'
  if (form.override_mcp_tools_enabled && form.mcp_tools_override.length === 0) {
    return '已启用 MCP 范围覆盖时，请至少选择一个工具'
  }
  return validateScheduleForm(form)
}

function normalizeScheduleAt(form: TaskCreateForm) {
  const useScheduleDatetime = !!form.schedule_enabled && !form.schedule_loop_enabled && form.schedule_time_mode === 'datetime'
  if (!useScheduleDatetime || !form.schedule_at) return null
  const parsedMs = Date.parse(form.schedule_at)
  return Number.isFinite(parsedMs) && parsedMs > 0 ? Math.floor(parsedMs / 1000) : form.schedule_at
}

function normalizeEndAt(form: TaskCreateForm, loopEnabled: boolean) {
  if (!loopEnabled || !form.schedule_end_at) return null
  const parsedMs = Date.parse(`${form.schedule_end_at}T23:59:59`)
  return Number.isFinite(parsedMs) && parsedMs > 0 ? Math.floor(parsedMs / 1000) : null
}

function scheduleSubmitFields(form: TaskCreateForm) {
  const loopEnabled = !!form.schedule_enabled && !!form.schedule_loop_enabled
  const loopMode = loopEnabled ? form.schedule_loop_mode : 'interval'
  const timedLoop = loopEnabled && (loopMode === 'daily' || loopMode === 'weekly')
  return {
    schedule_enabled: !!form.schedule_enabled,
    schedule_loop_enabled: loopEnabled,
    schedule_loop_mode: loopMode,
    schedule_run_immediately: loopEnabled && !!form.schedule_run_immediately,
    schedule_duration_minutes: Math.max(1, Number(form.schedule_duration_minutes) || 30),
    schedule_daily_time: timedLoop ? form.schedule_daily_time.trim() : '',
    schedule_weekly_days: loopEnabled && loopMode === 'weekly' ? [...form.schedule_weekly_days] : [],
    schedule_max_runs: loopEnabled ? Math.max(0, Number(form.schedule_max_runs) || 0) : 0,
    schedule_end_at: normalizeEndAt(form, loopEnabled),
    schedule_at: normalizeScheduleAt(form),
  }
}

export function buildTaskSubmitPayload(form: TaskCreateForm, selectedTools: string[], autoEnableMcpOverride: boolean) {
  return {
    title: form.title.trim(),
    instruction: form.instruction.trim(),
    priority: Math.max(1, Math.min(10, Number(form.priority) || 5)),
    ...scheduleSubmitFields(form),
    override_mcp_tools_enabled: !!form.override_mcp_tools_enabled || autoEnableMcpOverride,
    mcp_tools_override: selectedTools,
  }
}

export function toolsMatch(selected: string[], defaults: string[]) {
  return selected.length === defaults.length && selected.every(tool => defaults.includes(tool))
}
