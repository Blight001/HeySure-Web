import {
  getTaskJobRuntimeState,
  isCompletedTaskJob,
  type AITaskJobItem,
} from '@/utils/taskSystem'

export type JobStateFilter = 'running' | 'next' | 'scheduled' | 'completed'

export function getJobVisualState(job: AITaskJobItem) {
  if (isCompletedTaskJob(job)) return 'completed'
  return getTaskJobRuntimeState(job)
}

export function isJobStateMatched(job: AITaskJobItem, state: JobStateFilter | null) {
  if (!state) return true
  return getJobVisualState(job) === state
}

export function taskStateRank(job: AITaskJobItem) {
  const state = getJobVisualState(job)
  if (state === 'running') return 0
  if (state === 'next') return 1
  if (state === 'scheduled') return 2
  return 3
}

function compareTaskJobs(a: AITaskJobItem, b: AITaskJobItem) {
  const rankDiff = taskStateRank(a) - taskStateRank(b)
  if (rankDiff !== 0) return rankDiff
  const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0)
  if (priorityDiff !== 0) return priorityDiff
  const createdDiff = Number(b.created_at || 0) - Number(a.created_at || 0)
  if (createdDiff !== 0) return createdDiff
  return String(a.job_id || '').localeCompare(String(b.job_id || ''))
}

export function sortTaskJobs(jobs: AITaskJobItem[]): AITaskJobItem[] {
  return [...jobs].sort(compareTaskJobs)
}

export function taskStateFilterButtonClass(state: JobStateFilter, active: boolean) {
  if (state === 'running') {
    return active
      ? 'border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-500/25 dark:text-emerald-200'
      : 'border-emerald-300 text-emerald-700 dark:border-emerald-500/60 dark:text-emerald-300'
  }
  if (state === 'next') {
    return active
      ? 'border-amber-500 bg-amber-100 text-amber-700 dark:border-amber-400 dark:bg-amber-500/25 dark:text-amber-200'
      : 'border-amber-300 text-amber-700 dark:border-amber-500/60 dark:text-amber-300'
  }
  if (state === 'scheduled') {
    return active
      ? 'border-blue-500 bg-blue-100 text-blue-700 dark:border-blue-400 dark:bg-blue-500/25 dark:text-blue-200'
      : 'border-blue-300 text-blue-700 dark:border-blue-500/60 dark:text-blue-300'
  }
  return active
    ? 'border-zinc-500 bg-zinc-200 text-zinc-700 dark:border-zinc-400 dark:bg-zinc-700/70 dark:text-zinc-100'
    : 'border-zinc-300 text-zinc-700 dark:border-zinc-500/70 dark:text-zinc-300'
}

export function applyScheduleEnabled(form: { schedule_enabled: boolean; schedule_loop_enabled: boolean; schedule_run_immediately: boolean }, enabled: boolean) {
  form.schedule_enabled = enabled
  if (!enabled) {
    form.schedule_loop_enabled = false
    form.schedule_run_immediately = false
  }
}

export function applyScheduleLoopEnabled(form: { schedule_loop_enabled: boolean; schedule_time_mode: 'duration' | 'datetime'; schedule_at: string; schedule_run_immediately: boolean }, enabled: boolean) {
  form.schedule_loop_enabled = enabled
  if (enabled) {
    form.schedule_time_mode = 'duration'
    form.schedule_at = ''
    return
  }
  form.schedule_run_immediately = false
}

export function applyScheduleTimeMode(form: { schedule_time_mode: 'duration' | 'datetime'; schedule_at: string }, mode: 'duration' | 'datetime') {
  form.schedule_time_mode = mode
  if (mode === 'duration') form.schedule_at = ''
}

export function applyScheduleLoopMode(form: { schedule_loop_mode: 'interval' | 'daily' | 'weekly' }, raw: string) {
  form.schedule_loop_mode = raw === 'daily' || raw === 'weekly' ? raw : 'interval'
}

export function applyWeeklyDayChange(days: number[], day: number, checked: boolean): number[] {
  const next = new Set(days)
  if (checked) next.add(day)
  else next.delete(day)
  return Array.from(next).sort((a, b) => a - b)
}
