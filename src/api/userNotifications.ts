import { get, getAuthToken, post } from './http'

export interface UserNotificationAttachment {
  file_ref: string
  file_name: string
  mime_type: string
  bytes: number
  available: boolean
}

export interface UserNotification {
  notification_id: string
  kind: string
  title: string
  body: string
  severity: string
  status: 'unread' | 'read'
  action_url: string
  app_push_required: boolean
  external_channel: string
  external_delivered: boolean
  attachment_count: number
  attachments: UserNotificationAttachment[]
  created_at: number
  updated_at: number
  read_at: number | null
}

export const listUserNotifications = (unreadOnly = false, limit = 100) =>
  get<{ items: UserNotification[] }>('/api/user-notifications', {
    query: { unread_only: unreadOnly, limit },
    fallbackError: '通知收件箱加载失败',
  })

export const markUserNotificationRead = (notificationId: string) =>
  post<UserNotification>(`/api/user-notifications/${encodeURIComponent(notificationId)}/read`, undefined, {
    fallbackError: '通知状态更新失败',
  })

export const markAllUserNotificationsRead = () =>
  post<{ updated: number }>('/api/user-notifications/read-all', undefined, {
    fallbackError: '通知状态更新失败',
  })

export const downloadUserNotificationAttachment = async (
  notificationId: string,
  index: number,
  fileName: string,
) => {
  const response = await fetch(
    `/api/user-notifications/${encodeURIComponent(notificationId)}/attachments/${index}`,
    { headers: { Authorization: `Bearer ${getAuthToken()}` } },
  )
  if (!response.ok) throw new Error('文件下载失败')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'file'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
