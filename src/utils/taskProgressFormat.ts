import type { TaskPlanPhase, TaskPlanStage } from '@/api/task'

export const phaseStatusLabel: Record<string, string> = {
  pending: '待执行',
  active: '进行中',
  completed: '已完成',
  failed: '未达成',
}

export const phaseDotClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'bg-emerald-500 border-emerald-500'
    case 'failed':
      return 'bg-rose-500 border-rose-500'
    case 'active':
      return 'bg-sky-500 border-sky-500 animate-pulse'
    default:
      return 'bg-transparent border-zinc-300 dark:border-zinc-600'
  }
}

export const phaseBadgeClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30'
    case 'failed':
      return 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/30'
    case 'active':
      return 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-900/30'
    default:
      return 'text-zinc-500 bg-zinc-100/60 dark:text-zinc-400 dark:bg-zinc-800/60'
  }
}

export const phaseTitleClass = (phase: TaskPlanPhase) => {
  switch (phase.status) {
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'failed':
      return 'text-rose-600 dark:text-rose-400'
    case 'active':
      return 'text-blue-600 dark:text-blue-400'
    default:
      return 'text-zinc-500 dark:text-zinc-400'
  }
}

export const endTitleClass = (finished: boolean, outcome: string, stage: TaskPlanStage | string) => {
  if (finished) {
    return outcome === 'failure'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-600 dark:text-emerald-400'
  }
  if (stage === 'finishing') return 'text-indigo-600 dark:text-indigo-400'
  return 'text-zinc-400 dark:text-zinc-500'
}

export const headerEndDotClass = (finished: boolean, outcome: string) => {
  if (finished) {
    return outcome === 'failure'
      ? 'bg-rose-500 border-rose-500'
      : 'bg-emerald-500 border-emerald-500'
  }
  return 'bg-transparent border-zinc-300 dark:border-zinc-600'
}

export const endDotClass = (finished: boolean, outcome: string, stage: TaskPlanStage | string) => {
  if (finished) return headerEndDotClass(true, outcome)
  if (stage === 'finishing') return 'bg-indigo-500 border-indigo-500 animate-pulse'
  return 'bg-transparent border-zinc-300 dark:border-zinc-600'
}

export const planningDotClass = (planningDone: boolean) =>
  planningDone
    ? 'bg-emerald-500 border-emerald-500'
    : 'bg-amber-500 border-amber-500 animate-pulse'

export const isFlowRunning = (stage: TaskPlanStage | string) =>
  ['planning', 'executing', 'finishing'].includes(String(stage))

export const completedPhaseCount = (phases: TaskPlanPhase[]) =>
  phases.filter(phase => phase.status === 'completed').length

export const computeProgressPercent = (
  finished: boolean,
  stage: TaskPlanStage | string,
  planningDone: boolean,
  phases: TaskPlanPhase[],
) => {
  if (finished) return 100
  const totalSteps = phases.length + 2
  if (totalSteps <= 2) return stage === 'planning' ? 8 : 0
  const completedSteps = (planningDone ? 1 : 0) + completedPhaseCount(phases)
  const activeFraction = phases.some(phase => phase.status === 'active') ? 0.5 : 0
  return Math.min(99, Math.max(0, Math.round(((completedSteps + activeFraction) / totalSteps) * 100)))
}

export const progressRingStyle = (percent: number) => ({
  background: `conic-gradient(rgb(59 130 246) ${percent}%, rgb(228 228 231) 0)`,
})

export const stageBadge = (stage: TaskPlanStage | string, finished: boolean, outcome: string) => {
  if (stage === 'planning') {
    return { label: '安排中', className: 'rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  }
  if (stage === 'executing') {
    return { label: '实施中', className: 'rounded bg-sky-50 px-1.5 py-0.5 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' }
  }
  if (stage === 'finishing') {
    return { label: '收尾中', className: 'rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' }
  }
  if (finished && outcome === 'failure') {
    return { label: '已失败', className: 'rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' }
  }
  if (finished) {
    return { label: '已完成', className: 'rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
  }
  return null
}

export const finishStatusText = (finished: boolean, outcome: string, stage: TaskPlanStage | string) => {
  if (finished) return outcome === 'failure' ? '任务失败，已写入失败日志' : '任务完成，已写入成功日志'
  if (stage === 'finishing') return '所有阶段完成，正在总结收尾…'
  return '待所有阶段完成后总结'
}

export type TaskHoverKind = 'arrange' | 'phase' | 'finish'

export interface TaskHoverState {
  kind: TaskHoverKind
  phase?: TaskPlanPhase
}

export const sameHoverTarget = (
  current: TaskHoverState | null,
  kind: TaskHoverKind,
  phase?: TaskPlanPhase,
) => !!current && current.kind === kind && current.phase?.seq === phase?.seq

export const refreshHoveredPhase = (
  hovered: TaskHoverState | null,
  phases: TaskPlanPhase[],
): TaskHoverState | null => {
  if (hovered?.kind !== 'phase' || !hovered.phase) return hovered
  const fresh = phases.find(phase => phase.seq === hovered.phase?.seq)
  return fresh ? { kind: 'phase', phase: fresh } : hovered
}
