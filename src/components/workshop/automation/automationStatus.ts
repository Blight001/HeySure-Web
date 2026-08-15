import type { WorkflowCard } from '@/api/workflowCards'
import type { WorkflowRun } from '@/api/workflowRuns'

type StatusRun = WorkflowRun

const STATUS_LABELS: Record<string, string> = {
  active: '可执行', deprecated: '旧版本', draft: '历史草稿', validated: '历史已校验', published: '可执行',
  pending: '待领取', running: '推进中', waiting_device: '等待设备',
  waiting_ai: '等待 AI', retry_wait: '等待重试', paused_offline: '设备离线', succeeded: '成功', failed: '失败',
  cancelled: '已取消', timed_out: '超时', dispatch_pending: '待派发', dispatching: '派发中',
}

export const ACTIVE_RUN_STATUSES = new Set([
  'pending', 'running', 'waiting_device', 'waiting_ai', 'retry_wait', 'paused_offline',
])

export function statusLabel(status: string) {
  return STATUS_LABELS[status] || status
}

export function runStatusLabel(run: StatusRun) {
  if (run.status === 'succeeded' && run.output?.status === 'published') return '已发布'
  if (run.status === 'succeeded' && run.output?.status === 'manual_required') return '需要人工接管'
  if (run.status === 'succeeded' && run.output?.status === 'ready_for_review') return '待人工检查'
  return statusLabel(run.status)
}

export function statusClass(status: string) {
  if (status === 'succeeded' || ['active', 'published'].includes(status)) {
    return 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10'
  }
  if (['failed', 'timed_out', 'cancelled'].includes(status)) {
    return 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10'
  }
  if (['waiting_ai', 'paused_offline', 'retry_wait'].includes(status)) {
    return 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10'
  }
  return 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10'
}

export function accessScopeSummary(card: WorkflowCard) {
  if (card.access_scope === 'all') return '全员可调用'
  if (card.access_scope === 'selected') return `${(card.allowed_ai_config_ids || []).length} 位成员可调用`
  return '仅创建者可调用'
}

export function visibleCardTags(card: WorkflowCard) {
  return card.tags.filter(tag => !tag.toLowerCase().startsWith('ai_owner:'))
}

export function cardRunSummary(runs: Array<{ card_id: string; status: string; output?: { status?: string }; created_at?: number }>, cardId: string) {
  const items = runs.filter(run => run.card_id === cardId)
  const terminal = items.filter(run => ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(run.status))
  const succeeded = terminal.filter(run => run.status === 'succeeded' && run.output?.status !== 'manual_required').length
  return {
    rate: terminal.length ? `${Math.round((succeeded / terminal.length) * 100)}%` : '—',
    latest: items[0]?.created_at ? new Date(items[0].created_at * 1000).toLocaleString() : '暂无',
  }
}

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export function comparisonStatuses(
  released: Record<string, unknown>,
  draft: Record<string, unknown>,
) {
  const version: Record<string, DiffStatus> = {}
  const current: Record<string, DiffStatus> = {}
  for (const id of new Set([...Object.keys(released), ...Object.keys(draft)])) {
    if (!(id in draft)) version[id] = 'removed'
    else if (!(id in released)) current[id] = 'added'
    else {
      const status = JSON.stringify(released[id]) === JSON.stringify(draft[id]) ? 'unchanged' : 'changed'
      version[id] = status
      current[id] = status
    }
  }
  return { version, current }
}
