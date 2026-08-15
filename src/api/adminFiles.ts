/**
 * Admin data-folder file manager.
 */
import { del, get, getAuthToken, post, put } from './http'

export type FileKind = 'dir' | 'image' | 'text' | 'binary'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: number
  kind: FileKind
}

export interface FileContent {
  path: string
  size: number
  binary: boolean
  too_large: boolean
  content: string
  kind?: FileKind
}

export const listFiles = (path = '') =>
  get<{ path: string; entries: FileEntry[] }>('/api/admin/files', {
    query: { path: path || undefined },
    fallbackError: '获取文件列表失败',
  })

export const readFile = (path: string) =>
  get<FileContent>('/api/admin/files/read', {
    query: { path },
    fallbackError: '读取文件失败',
  })

export const writeFile = (path: string, content: string) =>
  put<{ ok: boolean; path: string; created: boolean }>('/api/admin/files', { path, content }, {
    fallbackError: '保存文件失败',
  })

export const makeDir = (path: string) =>
  post<{ ok: boolean; path: string }>('/api/admin/files/mkdir', { path }, {
    fallbackError: '新建文件夹失败',
  })

export const renameFile = (path: string, newPath: string) =>
  post<{ ok: boolean; path: string }>('/api/admin/files/rename', { path, new_path: newPath }, {
    fallbackError: '重命名失败',
  })

export const deleteFile = (path: string) =>
  del<{ ok: boolean; path: string }>('/api/admin/files', {
    query: { path },
    fallbackError: '删除失败',
  })

export const batchDeleteFiles = (paths: string[]) =>
  post<{ ok: boolean; deleted: string[]; errors: { path: string; error: string }[] }>(
    '/api/admin/files/batch-delete',
    { paths },
    { fallbackError: '批量删除失败' },
  )

/** Authenticated blob fetch for previews/downloads (endpoint needs Bearer). */
export const fetchFileBlob = async (path: string): Promise<Blob> => {
  const url = `/api/admin/files/raw?path=${encodeURIComponent(path)}`
  const token = getAuthToken()
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) throw new Error('加载文件失败')
  return res.blob()
}
