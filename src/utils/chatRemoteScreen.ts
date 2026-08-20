import type { ChatMessage, ChatRemoteScreenDevice } from '@/types/chat'
import { buildMcpToolSummary } from '@/utils/chatMessageView'

export const supportsRemoteScreen = (device: ChatRemoteScreenDevice) => {
  if (device.online === false) return false
  return (device.capabilities || []).some(capability =>
    /^(?:remote[._-]?(?:control|screen)|screen[._-]?(?:stream|view))$/i.test(capability))
}

export const latestMcpDeviceId = (messages: ChatMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const text = String(message?.display_text || message?.content || '')
    if (message?.role !== 'system' || !text.trim().startsWith('[MCP工具]')) continue
    const deviceId = buildMcpToolSummary(text).deviceId
    if (deviceId) return deviceId
  }
  return ''
}

export const resolveRemoteScreenDevice = (
  devices: ChatRemoteScreenDevice[],
  liveDeviceId: string,
  messages: ChatMessage[],
) => {
  const deviceId = String(liveDeviceId || latestMcpDeviceId(messages)).trim()
  if (!deviceId) return null
  const device = devices.find(item => String(item.id || '').trim() === deviceId)
  return device && supportsRemoteScreen(device) ? device : null
}
