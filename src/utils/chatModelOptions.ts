import type { ChatModelOption } from '@/types/chat'

export const parseModelOptions = (raw: unknown): ChatModelOption[] => {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '[]') } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item: any) => ({
      id: String(item?.id || item?.model || '').trim(),
      name: String(item?.name || item?.model || '').trim(),
      model: String(item?.model || '').trim(),
    }))
    .filter(item => item.id && item.model)
}
