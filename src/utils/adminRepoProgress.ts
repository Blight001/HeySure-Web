import type { RepoUpdateState, RepoUpdateStatus } from '@/api/admin'

export type RepoProgressTone = 'muted' | 'info' | 'warn' | 'error' | 'ok'

export interface RepoProgressLine {
  key: string
  text: string
  tone?: RepoProgressTone
}

const RESTART_STEP_LABELS: Record<string, string> = {
  queued_restart: '等待宿主开始重建',
  rebuilding: '构建 Docker 镜像',
  restarting: '重建并启动容器',
  done: '重启服务完成',
}

export const REPO_ACTIVE_PHASES = new Set([
  'checking',
  'pulling',
  'queued_rollback',
  'backing_up',
  'rolling_back',
  'queued_restart',
  'rebuilding',
  'restarting',
])

export const repoStepLabel = (step: { key: string; label: string }, phase: string) => {
  if (step.key !== 'restart') return step.label
  return RESTART_STEP_LABELS[phase] || step.label
}

export const repoProgressLineClass = (tone?: string) => {
  switch (tone) {
    case 'info':
      return 'text-purple-600 dark:text-purple-300'
    case 'warn':
      return 'text-amber-600 dark:text-amber-400'
    case 'error':
      return 'text-red-600 dark:text-red-400 break-all'
    case 'ok':
      return 'text-emerald-600 dark:text-emerald-400'
    default:
      return 'text-zinc-500 dark:text-zinc-400'
  }
}

const pushLine = (
  lines: RepoProgressLine[],
  key: string,
  text: string,
  tone?: RepoProgressTone,
) => {
  lines.push({ key, text, tone })
}

const pushStatusMessage = (
  lines: RepoProgressLine[],
  state: RepoUpdateState,
  unreachable: boolean,
) => {
  if (unreachable) {
    pushLine(lines, 'unreachable', '服务正在重建或重启，控制台暂时不可用，请稍候…恢复后将显示最新版本。', 'info')
    return
  }
  if (!state.message) return
  pushLine(lines, 'message', state.message, state.phase === 'error' ? 'error' : 'info')
}

const pushMetaLines = (
  lines: RepoProgressLine[],
  state: RepoUpdateState,
  formatTime: (ts: number | null | undefined) => string,
) => {
  if (state.last_check_at) {
    pushLine(lines, 'last-check', `上次检测：${formatTime(state.last_check_at)}`, 'muted')
  }
  if (state.branch) {
    pushLine(lines, 'branch', `当前分支：${state.branch}`, 'muted')
  }
  if (state.current?.short) {
    pushLine(lines, 'current', `当前版本：${state.current.short} ${state.current.subject || ''}`.trim(), 'muted')
  }
  if (state.remote?.short && state.behind > 0) {
    pushLine(lines, 'remote', `远端版本：${state.remote.short} ${state.remote.subject || ''}`.trim(), 'warn')
  }
  if (state.rollback_target?.short) {
    pushLine(
      lines,
      'rollback-target',
      `回退目标：${state.rollback_target.short} ${state.rollback_target.subject || ''}`.trim(),
      'warn',
    )
  }
}

const pushAheadBehind = (lines: RepoProgressLine[], state: RepoUpdateState) => {
  if (state.phase === 'update_available' && state.behind > 0) {
    pushLine(lines, 'behind', `发现 ${state.behind} 个新提交待应用。`, 'warn')
    return
  }
  if (state.ahead <= 0 && state.behind <= 0) return
  pushLine(
    lines,
    'ahead-behind',
    `本地领先 ${state.ahead} 个提交，落后 ${state.behind} 个提交。`,
    state.behind > 0 ? 'warn' : 'muted',
  )
}

const pushDoneOrError = (lines: RepoProgressLine[], state: RepoUpdateState) => {
  if (state.phase === 'done') {
    const text = state.trigger === 'rollback'
      ? '版本回退已完成，服务已启动，自动更新保持关闭。'
      : '更新流程已完成，服务已启动。'
    pushLine(lines, 'done', text, 'ok')
  }
  if (state.phase === 'error' && state.last_error) {
    pushLine(lines, 'error', state.last_error, 'error')
  }
}

const pushRecentLogs = (lines: RepoProgressLine[], state: RepoUpdateState) => {
  const recentLogs = (state.logs || []).filter(Boolean).slice(-10)
  for (const [idx, log] of recentLogs.entries()) {
    const tone = state.phase === 'error' && idx === recentLogs.length - 1 ? 'error' : 'muted'
    pushLine(lines, `log-${idx}`, log, tone)
  }
}

export const buildRepoProgressLines = (
  status: RepoUpdateStatus | null,
  unreachable: boolean,
  formatTime: (ts: number | null | undefined) => string,
): RepoProgressLine[] => {
  if (!status) return []
  const lines: RepoProgressLine[] = []
  pushStatusMessage(lines, status.state, unreachable)
  pushMetaLines(lines, status.state, formatTime)
  pushAheadBehind(lines, status.state)
  pushDoneOrError(lines, status.state)
  pushRecentLogs(lines, status.state)
  return lines
}
