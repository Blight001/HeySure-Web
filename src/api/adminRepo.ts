/**
 * Admin git/repo auto-update status and actions.
 */
import { get, post, put } from './http'

export interface RepoUpdateConfig {
  auto_enabled: boolean
  interval_seconds: number
}

export interface RepoCommitInfo {
  sha: string
  short: string
  author: string
  committed_at: number | null
  subject: string
  body?: string
  files?: Array<{ path: string; added: number | null; deleted: number | null }>
}

export type RepoUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'update_available'
  | 'pulling'
  | 'queued_restart'
  | 'rebuilding'
  | 'restarting'
  | 'done'
  | 'error'

export type RepoStepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'

export interface RepoUpdateStep {
  key: 'check' | 'pull' | 'restart'
  label: string
  status: RepoStepStatus
}

export interface RepoUpdateState {
  phase: RepoUpdatePhase
  message: string
  running: boolean
  trigger: string
  steps: RepoUpdateStep[]
  branch: string
  ahead: number
  behind: number
  current: RepoCommitInfo | null
  remote: RepoCommitInfo | null
  last_check_at: number | null
  last_error: string
  logs: string[]
  updated_at: number
}

export interface RepoVersionInfo {
  git_available: boolean
  branch: string
  current: RepoCommitInfo | null
}

export interface RepoLastUpdate {
  at: number | null
  commit: string | null
  from: string | null
}

export interface RepoUpdateStatus {
  config: RepoUpdateConfig
  state: RepoUpdateState
  version: RepoVersionInfo
  last_update: RepoLastUpdate
  git_available: boolean
  updater_available: boolean
  update_mode: 'remote' | 'git' | 'unavailable'
  limits: { min_interval: number; max_interval: number }
}

export const getRepoUpdateStatus = () =>
  get<RepoUpdateStatus>('/api/admin/repo-update/status', { fallbackError: '获取版本更新状态失败' })

export const updateRepoUpdateConfig = (payload: RepoUpdateConfig) =>
  put<RepoUpdateStatus>('/api/admin/repo-update/config', payload, { fallbackError: '保存自动更新设置失败' })

export const checkRepoUpdate = (apply = true) =>
  post<{ ok: boolean; started: boolean; state: RepoUpdateState }>(
    '/api/admin/repo-update/check',
    { apply },
    { fallbackError: '检测更新失败' },
  )
