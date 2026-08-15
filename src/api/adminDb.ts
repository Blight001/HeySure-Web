/**
 * Admin database browser, cleanup, and backup/restore.
 */
import { get, getAuthToken, patch, post } from './http'

export interface DbColumn {
  name: string
  type: string
  py_type: string
  nullable: boolean
  primary_key: boolean
}

export interface DbTableMeta {
  name: string
  row_count: number
  columns: DbColumn[]
  primary_key: string[]
}

export type DbValue = string | number | boolean | null

export interface DbRowsResult {
  name: string
  rows: Record<string, DbValue>[]
  total: number
  limit: number
  offset: number
  columns: DbColumn[]
  primary_key: string[]
}

export const listDbTables = () =>
  get<{ tables: DbTableMeta[] }>('/api/admin/db/tables', { fallbackError: '获取数据表失败' })

export const listDbRows = (name: string, limit = 50, offset = 0, search = '') =>
  get<DbRowsResult>(`/api/admin/db/tables/${encodeURIComponent(name)}/rows`, {
    query: { limit, offset, search: search || undefined },
    fallbackError: '获取表数据失败',
  })

export const insertDbRow = (name: string, values: Record<string, DbValue>) =>
  post<{ ok: boolean; primary_key: Record<string, DbValue> }>(
    `/api/admin/db/tables/${encodeURIComponent(name)}/rows`,
    { values },
    { fallbackError: '插入失败' },
  )

export const updateDbRow = (name: string, pk: Record<string, DbValue>, values: Record<string, DbValue>) =>
  patch<{ ok: boolean; updated: number }>(
    `/api/admin/db/tables/${encodeURIComponent(name)}/rows`,
    { pk, values },
    { fallbackError: '更新失败' },
  )

export const deleteDbRow = (name: string, pk: Record<string, DbValue>) =>
  post<{ ok: boolean; deleted: number }>(
    `/api/admin/db/tables/${encodeURIComponent(name)}/rows/delete`,
    { pk },
    { fallbackError: '删除失败' },
  )

export type DbCleanupCategory =
  | 'conversations'
  | 'tasks'
  | 'ai_messages'
  | 'knowledge'
  | 'projects'

export interface DbCleanupPayload {
  account: string
  password: string
  categories: DbCleanupCategory[]
  drop_unused_tables: boolean
}

export interface DbCleanupResult {
  ok: boolean
  cleared: Record<string, number>
  dropped_tables: string[]
  total_deleted: number
}

export const cleanupDatabase = (payload: DbCleanupPayload) =>
  post<DbCleanupResult>('/api/admin/db/cleanup', payload, {
    fallbackError: '清理数据库失败',
  })

export interface DbImportResult {
  ok: boolean
  /** table name → number of rows inserted */
  imported: Record<string, number>
  total: number
  /** tables present in the backup but no longer in the live schema */
  skipped_tables: string[]
}

async function failFromResponse(res: Response, fallback: string): Promise<never> {
  let msg = fallback
  try { msg = (await res.json())?.detail || msg } catch { /* keep default */ }
  throw new Error(msg)
}

/** Owner-only full DB backup download. `includeMedia=false` omits chat media blobs. */
export const exportDatabase = async (includeMedia = true): Promise<void> => {
  const url = `/api/admin/db/export?include_media=${includeMedia ? 'true' : 'false'}`
  const token = getAuthToken()
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) await failFromResponse(res, '导出数据库失败')
  const disposition = res.headers.get('Content-Disposition') || ''
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1]
    || `heysure-backup-${Date.now()}.json`
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

/** Owner-only restore. Multipart upload; account + password are a second factor. */
export const importDatabase = async (
  file: File,
  account: string,
  password: string,
): Promise<DbImportResult> => {
  const form = new FormData()
  form.append('file', file)
  form.append('account', account)
  form.append('password', password)
  const token = getAuthToken()
  const res = await fetch('/api/admin/db/import', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  if (!res.ok) await failFromResponse(res, '导入数据库失败')
  return res.json() as Promise<DbImportResult>
}
