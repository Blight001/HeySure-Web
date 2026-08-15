import type { ServiceInfo } from '@/api/admin'
import { formatOptionalDateTime } from '@/utils/adminFormat'

export const ADMIN_SERVICE_DETAIL_LABELS: Record<string, string> = {
  live: '存活', ready: '就绪', draining: '排空中', accepting_work: '接受任务',
  accepting_runs: '接受推理', readiness_error: '未就绪原因', uptime_seconds: '运行时长',
  latency_ms: '延迟', ok: '正常', connected_agent_count: '在线设备',
  dispatchable_agent_count: '可调度设备', pending_dispatch_count: '等待分发',
  queued_dispatch_count: '排队分发', oldest_pending_age_seconds: '最老等待任务',
  active_run_count: '活动推理', queued_run_count: '排队推理', registered_tool_count: '注册工具',
  registry_version: '工具注册表版本', http_status: 'HTTP 状态', phase: '阶段',
  running: '执行中', token_configured: '令牌已配置', configured: '地址已配置',
  current_revisions: '当前 Revision', expected_revisions: '代码 Revision', at_head: '迁移到 Head',
  enabled: '已启用', heartbeat_age_seconds: '心跳年龄', stale_threshold_seconds: '过期阈值',
  last_tick_duration_ms: '最近 Tick', last_error: '最近错误', configured_count: '已配置',
  healthy_count: '正常连接', reported_count: '已上报', service_role: '进程角色',
}

export const detailValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'number' && key.endsWith('_at')) return formatOptionalDateTime(value)
  if (typeof value === 'number' && key.endsWith('_seconds')) return `${Math.round(value * 10) / 10} 秒`
  if (typeof value === 'number' && key.endsWith('_ms')) return `${value} ms`
  return String(value)
}

export const serviceDetailRows = (service: ServiceInfo) => {
  const rows: Array<{ key: string; label: string; value: string }> = []
  const walk = (value: Record<string, unknown>, prefix = '') => {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        walk(item as Record<string, unknown>, path)
      } else {
        rows.push({
          key: path,
          label: ADMIN_SERVICE_DETAIL_LABELS[key] || path,
          value: detailValue(key, item),
        })
      }
    }
  }
  walk(service.detail || {})
  return rows
}
