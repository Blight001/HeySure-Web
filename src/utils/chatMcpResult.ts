import type { ActionBlock } from '@/utils/chatParser'

export const safeJson = (value: unknown, maxLen = 8000) => {
  let text = ''
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value ?? '')
  }
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n...<truncated>`
}

export const isMcpCallFailed = (data: any) => {
  return data?.success === false
    || data?.mcp?.success === false
    || data?.result?.success === false
    || data?.mcp?.result?.success === false
}

export const buildMcpDisplayResult = (_block: ActionBlock, data: any) => {
  const result = safeJson(data?.result ?? data?.mcp?.result ?? data, 12000)
  if (!isMcpCallFailed(data)) return result
  const errorMessage = String(
    data?.error
    || data?.mcp?.error
    || data?.result?.error
    || data?.mcp?.result?.error
    || '未知错误',
  ).trim()
  return `错误: ${errorMessage}\n\n${result}`
}
