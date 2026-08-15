/**
 * Admin user directory, audit log, and registration/SMTP settings.
 */
import { del, get, patch, post, put } from './http'
import type { UserRole } from '@/types'

export interface AdminUser {
  id: number
  name: string
  account: string
  avatar: string | null
  email: string | null
  role: UserRole
  role_label: string
  created_at: number | null
}

export interface AuditEntry {
  id: number
  created_at: number
  actor_id: number | null
  actor_account: string
  action: string
  target_type: string
  target_id: string
  target_label: string
  detail: string
}

export interface NewUserPayload {
  name: string
  account: string
  password: string
  role: UserRole
  avatar?: string | null
}

export const listUsers = () =>
  get<{ users: AdminUser[] }>('/api/admin/users', { fallbackError: '获取用户列表失败' })

export const createUser = (payload: NewUserPayload) =>
  post<{ ok: boolean; user: AdminUser }>('/api/admin/users', payload, {
    fallbackError: '创建用户失败',
  })

export const listAudit = (limit = 100) =>
  get<{ entries: AuditEntry[] }>('/api/admin/audit', {
    query: { limit },
    fallbackError: '获取审计日志失败',
  })

export const setUserRole = (userId: number, role: UserRole) =>
  patch<{ ok: boolean; user: AdminUser }>(`/api/admin/users/${userId}/role`, { role }, {
    fallbackError: '设置权限失败',
  })

export const resetUserPassword = (userId: number, newPassword: string) =>
  post<{ ok: boolean; user_id: number }>(`/api/admin/users/${userId}/reset-password`, {
    new_password: newPassword,
  }, { fallbackError: '重置密码失败' })

export const deleteUser = (userId: number) =>
  del<{ ok: boolean; user_id: number }>(`/api/admin/users/${userId}`, {
    fallbackError: '删除用户失败',
  })

export type RegistrationMode = 'open' | 'email' | 'closed'
export type SmtpEncryption = 'ssl' | 'starttls' | 'none'

export interface AuthSettings {
  registration_mode: RegistrationMode
  smtp: {
    host: string
    port: number
    username: string
    from_addr: string
    encryption: SmtpEncryption
    /** 密码永不回传，仅指示是否已配置 */
    password_set: boolean
  }
  email_enabled: boolean
  note?: string
}

export interface AuthSettingsPayload {
  registration_mode: RegistrationMode
  smtp_host: string
  smtp_port: number
  smtp_username: string
  /** null = 保留已存密码 */
  smtp_password: string | null
  smtp_from: string
  smtp_encryption: SmtpEncryption
}

export const getAuthSettings = () =>
  get<AuthSettings>('/api/admin/auth-settings', { fallbackError: '获取注册与邮箱设置失败' })

export const updateAuthSettings = (payload: AuthSettingsPayload) =>
  put<AuthSettings>('/api/admin/auth-settings', payload, { fallbackError: '保存设置失败' })

export const sendTestEmail = (to: string) =>
  post<{ ok: boolean }>('/api/admin/auth-settings/test-email', { to }, {
    fallbackError: '发送测试邮件失败',
  })
