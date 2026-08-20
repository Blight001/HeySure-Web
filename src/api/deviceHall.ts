import {
  AUTH_EXPIRED_EVENT,
  clearAuthToken,
  del,
  get,
  getAuthToken,
} from './http'

export interface DeviceReleaseTarget {
  id: string
  label: string
  platform: string
  arch: string
  channel: string
  version: string
  available: boolean
  download_url?: string | null
  size_bytes?: number | null
  sha256?: string
  release_notes?: string
  install_steps?: string[]
  mandatory?: boolean
  filename?: string | null
  released_at?: string | null
  published_at?: string | null
}

export interface DeviceHallProduct {
  id: string
  name: string
  summary: string
  device_type: string
  accent?: string
  capabilities?: string[]
  targets: DeviceReleaseTarget[]
}

export interface DeviceHallCatalog {
  schema_version: number
  updated_at?: string | null
  products: DeviceHallProduct[]
}

export const getDeviceHallCatalog = () =>
  get<DeviceHallCatalog>('/api/device-hall/catalog', {
    fallbackError: '设备大厅加载失败',
  })

export interface DeviceReleaseUpload {
  productId: string
  targetId: string
  version: string
  releaseNotes: string
  mandatory: boolean
  file: File
}

export const getAdminDeviceReleaseCatalog = () =>
  get<DeviceHallCatalog>('/api/device-hall/admin/catalog', {
    fallbackError: '设备版本目录加载失败',
  })

const parseUploadError = (xhr: XMLHttpRequest): string => {
  try {
    const payload = JSON.parse(xhr.responseText) as { detail?: unknown }
    if (typeof payload.detail === 'string') return payload.detail
  } catch {
    // The response may be plain text or empty.
  }
  return xhr.responseText || '软件发布失败'
}

export const uploadDeviceRelease = (
  input: DeviceReleaseUpload,
  onProgress?: (percent: number) => void,
): Promise<unknown> => new Promise((resolve, reject) => {
  const body = new FormData()
  body.append('product_id', input.productId)
  body.append('target_id', input.targetId)
  body.append('version', input.version)
  body.append('release_notes', input.releaseNotes)
  body.append('mandatory', String(input.mandatory))
  body.append('file', input.file)

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/device-hall/admin/releases')
  const token = getAuthToken()
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
  }
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : undefined)
      } catch {
        resolve(xhr.responseText)
      }
      return
    }
    if (xhr.status === 401) {
      clearAuthToken()
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    reject(new Error(parseUploadError(xhr)))
  }
  xhr.onerror = () => reject(new Error('网络连接失败，软件未发布'))
  xhr.send(body)
})

export const withdrawDeviceRelease = (productId: string, targetId: string) =>
  del<DeviceHallCatalog>(
    `/api/device-hall/admin/releases/${encodeURIComponent(productId)}/${encodeURIComponent(targetId)}`,
    { fallbackError: '撤回设备版本失败' },
  )
