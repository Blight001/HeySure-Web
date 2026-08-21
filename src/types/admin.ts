import type { UserRole } from './user'

export type AdminModalTab =
  | 'services'
  | 'users'
  | 'auth'
  | 'files'
  | 'database'
  | 'audit'
  | 'deviceReleases'
  | 'update'

export interface AdminStatusMeta {
  label: string
  cls: string
}

export interface AdminRoleOption {
  value: UserRole
  label: string
}
