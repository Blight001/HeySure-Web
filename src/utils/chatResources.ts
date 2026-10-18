import type { ChatAttachment } from '@/api/chat'
import { parseMcpToolBubbleDetails } from './mcpFormat'

export type ChatResourceKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'spreadsheet' | 'text' | 'binary'

export interface ChatResourceRef {
  url: string
  kind: ChatResourceKind
  mime?: string
  name?: string
  bytes?: number
}

const RESOURCE_KEY_RE = /(?:file|attachment|resource|upload|media|image|picture|photo|video|audio|document|doc|pdf|spreadsheet|excel|xlsx|csv|text|reference|preview|download)/i
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i
const VIDEO_EXT_RE = /\.(?:mp4|webm|mov|m4v|avi|mkv|ogv)(?:[?#].*)?$/i
const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|oga|m4a|aac|flac)(?:[?#].*)?$/i
const PDF_EXT_RE = /\.pdf(?:[?#].*)?$/i
const SPREADSHEET_EXT_RE = /\.(?:xls|xlsx|ods|csv|tsv)(?:[?#].*)?$/i
const DOCUMENT_EXT_RE = /\.(?:doc|docx|odt|rtf|ppt|pptx|odp)(?:[?#].*)?$/i
const TEXT_EXT_RE = /\.(?:txt|md|json|jsonl|yaml|yml|xml|log|ini|conf|toml|js|ts|tsx|jsx|vue|css|scss|html|py|sh|ps1|bat|sql)(?:[?#].*)?$/i

export const normalizeChatResourceUrl = (value: string) => String(value || '').trim().replace(/[),.;]+$/, '')

const isResourceUrl = (value: string) => {
  const url = normalizeChatResourceUrl(value)
  return url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')
    || /^\/(?:api|tmp-images|media|uploads|files)\//i.test(url)
}

const kindFromMime = (mime: string): ChatResourceKind | null => {
  const type = String(mime || '').toLowerCase()
  if (type.startsWith('image/') || type === 'image') return 'image'
  if (type.startsWith('video/') || type === 'video') return 'video'
  if (type.startsWith('audio/') || type === 'audio') return 'audio'
  if (type === 'application/pdf') return 'pdf'
  if (type.includes('spreadsheet') || type.includes('excel')) return 'spreadsheet'
  if (type.includes('word') || type.includes('document')) return 'document'
  if (type.startsWith('text/')) return 'text'
  return null
}

const kindFromExtension = (url: string): ChatResourceKind | null => {
  if (IMAGE_EXT_RE.test(url)) return 'image'
  if (VIDEO_EXT_RE.test(url)) return 'video'
  if (AUDIO_EXT_RE.test(url)) return 'audio'
  if (PDF_EXT_RE.test(url)) return 'pdf'
  if (SPREADSHEET_EXT_RE.test(url)) return 'spreadsheet'
  if (DOCUMENT_EXT_RE.test(url)) return 'document'
  if (TEXT_EXT_RE.test(url)) return 'text'
  return null
}

const kindFromKey = (key: string): ChatResourceKind | null => {
  const normalizedKey = String(key || '').toLowerCase()
  if (/image|picture|photo|screenshot|截图|图片/.test(normalizedKey)) return 'image'
  if (/video|movie|视频/.test(normalizedKey)) return 'video'
  if (/audio|音频/.test(normalizedKey)) return 'audio'
  if (/pdf/.test(normalizedKey)) return 'pdf'
  if (/spreadsheet|excel|xlsx|csv|表格/.test(normalizedKey)) return 'spreadsheet'
  if (/document|docx?|word|pptx?|演示|文档/.test(normalizedKey)) return 'document'
  if (/text|文本/.test(normalizedKey)) return 'text'
  return RESOURCE_KEY_RE.test(normalizedKey) ? 'binary' : null
}

export const chatResourceKind = (value: string, key = '', mime = ''): ChatResourceKind | null => {
  const url = normalizeChatResourceUrl(value)
  return kindFromMime(mime) || kindFromExtension(url) || kindFromKey(key)
}

const addResource = (refs: ChatResourceRef[], seen: Set<string>, value: string, key = '', mime = '', name = '', bytes?: number) => {
  const url = normalizeChatResourceUrl(value)
  if (!isResourceUrl(url) || seen.has(url)) return
  const kind = chatResourceKind(url, key, mime)
  if (!kind) return
  seen.add(url)
  refs.push({ url, kind, mime: String(mime || '').trim() || undefined, name: String(name || '').trim() || undefined, bytes })
}

const walkObject = (record: Record<string, unknown>, mime: string, name: string, bytes: number | undefined, refs: ChatResourceRef[], seen: Set<string>, depth: number) => {
  const nextMime = String(record.mime_type || record.mimeType || record.content_type || record.media_type || mime)
  const nextName = String(record.file_name || record.filename || record.name || record.title || name)
  const rawBytes = record.bytes ?? record.size
  const nextBytes = Number.isFinite(Number(rawBytes)) ? Number(rawBytes) : bytes
  Object.entries(record).forEach(([childKey, child]) => walkValue(child, childKey, nextMime, nextName, nextBytes, refs, seen, depth + 1))
}

const walkValue = (value: unknown, key: string, mime: string, name: string, bytes: number | undefined, refs: ChatResourceRef[], seen: Set<string>, depth: number) => {
  if (depth > 8 || value === null || value === undefined) return
  if (typeof value === 'string') return addResource(refs, seen, value, key, mime, name, bytes)
  if (Array.isArray(value)) return value.forEach(item => walkValue(item, key, mime, name, bytes, refs, seen, depth + 1))
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  walkObject(record, mime, name, bytes, refs, seen, depth)
}

export const resourceFromChatAttachment = (attachment: ChatAttachment): ChatResourceRef | null => {
  const url = String(attachment.resource_url || attachment.preview_url || attachment.url || '').trim()
  if (!url) return null
  const kind = chatResourceKind(url, attachment.file_name, attachment.mime_type)
    || kindFromMime(String(attachment.kind || attachment.resource_type || ''))
    || (attachment.is_image ? 'image' : attachment.is_video ? 'video' : attachment.is_audio ? 'audio' : null)
  if (!kind) return null
  return { url, kind, mime: attachment.mime_type, name: attachment.file_name, bytes: attachment.bytes }
}

export const chatResourcesFromText = (text: string): ChatResourceRef[] => {
  const refs: ChatResourceRef[] = []
  const seen = new Set<string>()
  const markerRe = /\[(?:截图|图片|视频|媒体|音频|文件|附件)\]\s*(?:\r?\n)+\s*(\S+)/gi
  for (const match of String(text || '').matchAll(markerRe)) addResource(refs, seen, match[1] || '', match[0], '', '')

  const sections = parseMcpToolBubbleDetails(text, 'MCP 工具')
  let parsed: unknown = null
  try { parsed = JSON.parse(String(sections.result || '')) } catch { parsed = null }
  walkValue(parsed, '', '', '', undefined, refs, seen, 0)

  if (!parsed) {
    const urlRe = /(?:https?:\/\/|\/(?:api|tmp-images|media|uploads|files)\/)[^\s"'<>]+/gi
    for (const match of String(sections.result || '').matchAll(urlRe)) addResource(refs, seen, match[0] || '', 'resource')
  }
  return refs.slice(0, 24)
}

export const chatResourceLabel = (resource: ChatResourceRef) => {
  if (resource.name) return resource.name
  const raw = resource.url.split(/[?#]/, 1)[0] || ''
  return raw.split('/').pop() || '资源文件'
}

export const chatResourceIcon = (kind: ChatResourceKind) => ({
  image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', document: '📄', spreadsheet: '📊', text: '📝', binary: '📎',
}[kind])
