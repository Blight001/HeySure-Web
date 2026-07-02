import { get, getAuthToken } from './http'

/**
 * `/api/chat/files` returns a flat array of file paths inside the configured
 * workspace. It's named "chat/files" for historical reasons (uploaded chat
 * attachments share the same workspace) but every consumer treats it as a
 * generic workspace listing.
 */
export const listWorkspaceFiles = () =>
  get<string[]>('/api/chat/files', { fallbackError: '工作区文件列表加载失败' })

export type WorkspaceFileKind = 'dir' | 'image' | 'video' | 'text' | 'binary'

export interface WorkspaceFileContent {
  path: string
  size: number
  binary: boolean
  too_large: boolean
  content: string
  kind?: WorkspaceFileKind
}

export const readWorkspaceFile = (path: string) =>
  get<WorkspaceFileContent>('/api/chat/files/read', {
    query: { path },
    fallbackError: '读取文件失败',
  })

export const fetchWorkspaceFileBlob = async (path: string): Promise<Blob> => {
  const url = `/api/chat/files/raw?path=${encodeURIComponent(path)}`
  const token = getAuthToken()
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) throw new Error('加载文件失败')
  return res.blob()
}
