import type { MaintenanceArtifact, MaintenanceEvent, MaintenancePhase, MaintenanceStatus } from '@/api/maintenance'

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  queued: '排队中', running: '执行中', waiting_user: '等待确认',
  succeeded: '已完成', failed: '失败', cancelled: '已取消',
}

export const PHASE_LABELS: Record<MaintenancePhase, string> = {
  triage: '分诊', diagnose: '诊断', plan: '规划', implement: '实现', test: '测试',
  review: '审查', commit: '提交', push: '推送', release: '发布', verify: '验收',
}

export const formatElapsed = (start: string, end?: string | null) => {
  const started = new Date(start).getTime()
  const stopped = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.max(0, Math.floor((stopped - started) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`
  const hours = Math.floor(seconds / 3600)
  return `${hours} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
}

export const eventIcon = (kind: string) => {
  const value = kind.toLowerCase()
  if (value.includes('error') || value.includes('fail')) return '×'
  if (value.includes('command')) return '›_'
  if (value.includes('tool') || value.includes('mcp')) return '⌘'
  if (value.includes('file') || value.includes('diff')) return '±'
  if (value.includes('plan')) return '☷'
  if (value.includes('reason')) return '◇'
  if (value.includes('message') || value.includes('steer')) return '…'
  return '•'
}

export const artifactGroups = (items: MaintenanceArtifact[] = []) => {
  const groups: Record<string, MaintenanceArtifact[]> = { diff: [], test: [], commit: [], release: [], audit: [] }
  for (const item of Array.isArray(items) ? items : []) (groups[item.kind] ||= []).push(item)
  return groups
}

export const mergeEvents = (current: MaintenanceEvent[], incoming: MaintenanceEvent[]) => {
  const byId = new Map(current.map(item => [Number(item.id), item]))
  for (const item of incoming) if (Number.isFinite(Number(item.id))) byId.set(Number(item.id), item)
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id))
}
