import type { ClawHubInstalledSkillDetail, ClawHubSkillDetail } from '@/api/librarian'
import type { ModelPreset, McpToolDefinition } from '@/types'
import { formatDateMinute } from '@/utils/datetime'
import { getMcpToolParamRows } from '@/utils/mcpTools'
import type {
  InheritanceSkillDevice,
  InheritanceSkillTool,
  InstalledEndpointKind,
  ToolParamSource,
} from './types'

const ENDPOINT_LABELS: Record<string, string> = {
  any: '通用',
  desktop: '桌面端',
  browser: '浏览器端',
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  server: '服务端（系统内置）',
  desktop: '桌面设备',
  browser: '浏览器设备',
  linux: 'Linux 设备',
}

export function endpointLabel(kind?: string | null) {
  return ENDPOINT_LABELS[String(kind || 'any')] || '通用'
}

export function deviceTypeLabel(kind?: string | null) {
  const key = String(kind || '').toLowerCase()
  return DEVICE_TYPE_LABELS[key] || String(kind || '端侧设备')
}

export function deviceDisplayLabel(device: InheritanceSkillDevice) {
  const id = String(device?.device_id || '').toLowerCase().trim()
  if (id === 'toolbox') return '工具箱（服务端内置）'
  if (id === 'library') return '图书管理工具（服务端治理）'
  return deviceTypeLabel(device?.device_type)
}

export function formatTime(ts?: number | null) {
  return formatDateMinute(ts, '')
}

export function formatImplementationCode(code: unknown) {
  return JSON.stringify(code, null, 2)
}

export function stripSkillFrontmatter(raw: string) {
  const text = String(raw || '')
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end < 0) return text
  return text.slice(end + 4).replace(/^\s+/, '')
}

export function hasImplementation(tool: InheritanceSkillTool) {
  const impl = tool.implementation
  return Boolean(impl && Object.keys(impl).length)
}

export function isServerInheritanceDevice(device: InheritanceSkillDevice) {
  return String(device.device_type || '').toLowerCase() === 'server'
}

export function inheritanceToolKey(device: InheritanceSkillDevice, tool: InheritanceSkillTool) {
  return `${device.device_type}:${device.device_id}:${tool.name}`
}

export function toolParameters(tool: ToolParamSource) {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {}
  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties as Record<string, any>
    : {}
  const fromApi = Array.isArray(tool.parameters) ? tool.parameters : []
  if (fromApi.length) {
    return fromApi.map(param => ({
      ...param,
      description: String(param.description || '').trim()
        || String(properties[param.name]?.description || '').trim(),
    }))
  }
  return getMcpToolParamRows({
    name: String(tool.name || ''),
    inputSchema: schema,
  } as McpToolDefinition)
}

export function normalizeModelPresets(raw: unknown): ModelPreset[] {
  const parsed = parsePresetList(raw)
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  return parsed
    .map((item: any, index) => toModelPreset(item, index, seen))
    .filter(Boolean) as ModelPreset[]
}

function parsePresetList(raw: unknown) {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw || '[]')
  } catch {
    return []
  }
}

function toModelPreset(item: any, index: number, seen: Set<string>): ModelPreset | null {
  const model = String(item?.model || '').trim()
  const apiKey = String(item?.api_key || '').trim()
  const baseUrl = String(item?.base_url || '').trim()
  if (!model || !apiKey || !baseUrl) return null
  let id = String(item?.id || model || `model_${index + 1}`).trim()
  if (!id || seen.has(id)) id = `${model}_${index + 1}`
  seen.add(id)
  return {
    id,
    name: String(item?.name || model).trim() || model,
    api_key: apiKey,
    base_url: baseUrl,
    model,
  }
}

export function clawhubScanLabel(selected: ClawHubSkillDetail | null) {
  const scan = selected?.scan || {}
  const security = isRecord(scan.security) ? scan.security : {}
  const moderation = isRecord(scan.moderation) ? scan.moderation : {}
  return String(security.status || moderation.verdict || moderation.summary || scan.error || '未知')
}

export function pickInstalledEndpointKind(
  selected: ClawHubInstalledSkillDetail | null,
): InstalledEndpointKind {
  const kind = String(selected?.skill?.endpoint_kind || 'any')
  return kind === 'desktop' || kind === 'browser' ? kind : 'any'
}

export function pickMcpTestInputSchema(target: { tool?: Record<string, any> } | null) {
  const tool = target?.tool
  return tool?.inputSchema || tool?.input_schema || {}
}

export function pickRootAttrs(attrs: Record<string, unknown>) {
  const { class: _class, ...rest } = attrs
  return rest
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object')
}
