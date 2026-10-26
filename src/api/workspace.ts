import { get, getAuthToken } from './http'

/**
 * `/api/chat/files` returns a flat array of file paths inside the selected AI
 * member's workspace. It's named "chat/files" for historical reasons
 * (uploaded chat attachments share the same workspace) but every consumer
 * treats it as a generic workspace listing.
 */
export const listWorkspaceFiles = (aiConfigId?: number) =>
  get<string[]>('/api/chat/files', {
    query: {
      ai_config_id: aiConfigId,
      max_depth: 32,
      max_entries: 2000,
    },
    fallbackError: '工作区文件列表加载失败',
  })

export type WorkspaceFileKind = 'dir' | 'image' | 'video' | 'text' | 'binary'

export interface WorkspaceFileContent {
  path: string
  size: number
  binary: boolean
  too_large: boolean
  content: string
  kind?: WorkspaceFileKind
}

export const readWorkspaceFile = (path: string, aiConfigId?: number) =>
  get<WorkspaceFileContent>('/api/chat/files/read', {
    query: { path, ai_config_id: aiConfigId },
    fallbackError: '读取文件失败',
  })

export const fetchWorkspaceFileBlob = async (path: string, aiConfigId?: number): Promise<Blob> => {
  const query = new URLSearchParams({ path })
  if (aiConfigId !== undefined) query.set('ai_config_id', String(aiConfigId))
  const url = `/api/chat/files/raw?${query.toString()}`
  const token = getAuthToken()
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) throw new Error('加载文件失败')
  return res.blob()
}
