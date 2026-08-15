import type { ActionBlock } from '@/utils/chatParser'
import type { PersistedMessageActionState } from '@/types/chat'

export const STATE_PREFIX = '__HS_MCP_STATE__='
export const ATTACHMENTS_PREFIX = '__HS_ATTACHMENTS__='

export const splitTags = (raw?: string) => {
  const text = String(raw || '')
  const idx = text.indexOf(STATE_PREFIX)
  if (idx < 0) return { base: text.trim(), encoded: '' }
  const base = text.slice(0, idx).replace(/\s*\|\s*$/, '').trim()
  const encoded = text.slice(idx + STATE_PREFIX.length).trim()
  return { base, encoded }
}

export const encodeUserAttachmentTags = (files: string[], toPath: (path: string) => string) => {
  const normalized = files.map(file => toPath(file).trim()).filter(Boolean)
  if (normalized.length === 0) return ''
  return `${ATTACHMENTS_PREFIX}${encodeURIComponent(JSON.stringify(normalized))}`
}

export const buildAttachedPathSection = (paths: string[], toPath: (path: string) => string) => {
  const normalized = paths.map(path => toPath(path)).filter(Boolean)
  if (normalized.length === 0) return ''
  const lines = normalized.map(path => `- ${path.endsWith('/') ? '文件夹' : '文件'}: \`${path}\``)
  return [
    '[本轮附加工作区路径]',
    '用户勾选了以下工作区路径。路径均按当前 AI 工作目录视角给出。不要假设内容已被直接提供；如需查看，请使用 workspace.run+command 执行 shell 命令（如 type/cat 读取、dir/ls 列目录）自行读取、列目录或检索。',
    ...lines,
  ].join('\n')
}

export const stableStringify = (value: any): string => {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

export const simpleHash = (input: string) => {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i)
    hash |= 0
  }
  return String(hash >>> 0)
}

export const blockSignature = (block: ActionBlock) => {
  const raw = [
    block.type || '',
    block.tool || '',
    block.filename || '',
    block.command || '',
    block.search || '',
    block.replace || '',
    block.content || '',
    stableStringify(block.arguments || {}),
  ].join('|')
  return `sig_${simpleHash(raw)}`
}

export const decodeStateFromTags = (raw?: string): PersistedMessageActionState | null => {
  const { encoded } = splitTags(raw)
  if (!encoded) return null
  try {
    const decoded = decodeURIComponent(encoded)
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export const encodeTagsWithState = (baseTags: string, state: PersistedMessageActionState | null) => {
  const base = (baseTags || '').trim()
  if (!state?.blocks || Object.keys(state.blocks).length === 0) return base
  const encoded = encodeURIComponent(JSON.stringify(state))
  return base ? `${base} | ${STATE_PREFIX}${encoded}` : `${STATE_PREFIX}${encoded}`
}
