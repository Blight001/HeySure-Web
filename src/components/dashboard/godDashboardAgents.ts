import type { Agent } from '@/types'

export type ChatDeviceHint = {
  id: string
  aiConfigId?: number | null
  boundAiConfigIds?: Array<number | string>
  online?: boolean
  capabilities?: string[]
}

export function findFreshAgent(agents: Agent[], agent: Agent | null) {
  if (!agent) return null
  const configId = Number(agent.aiConfigId)
  if (Number.isFinite(configId)) {
    const byConfig = agents.find(item => Number(item.aiConfigId) === configId)
    if (byConfig) return byConfig
  }
  return agents.find(item => item.id === agent.id) || agent
}

export function resolveActiveRunSessionId(agent: Agent) {
  const sid = String(agent.activeRunSessionId || '').trim()
  if (!sid) return ''
  const runStatus = String(agent.activeRunStatus || '').toLowerCase()
  if (runStatus === 'running' || runStatus === 'queued') return sid
  if (String(agent.runtimeStatus || '').toLowerCase() === 'running') return sid
  return ''
}

export function aiWorkspaceDirname(agent: Agent | null) {
  if (!agent?.aiConfigId) return ''
  if (agent.aiRole === 'digital_member' && agent.digitalMemberRole === 'manager') return ''
  const raw = String(agent.name || '').trim().toLowerCase()
  const slug = raw
    .replace(/[^0-9a-z\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'ai'
  return `${agent.aiConfigId}-${slug}`
}

export function chatMcpCatalogKey(devices: ChatDeviceHint[]) {
  return devices
    .map(device => [
      device.id,
      device.aiConfigId ?? '',
      ...(device.boundAiConfigIds || []),
      device.online === false ? 'offline' : 'online',
      ...(device.capabilities || []),
    ].join(':'))
    .sort()
    .join('|')
}

export function applyConversationModel(
  agents: Agent[],
  extras: Array<Agent | null | undefined>,
  payload: { aiConfigId: number; model: string },
) {
  const updateAgent = (agent: Agent | null | undefined) => {
    if (agent && Number(agent.aiConfigId) === Number(payload.aiConfigId)) agent.model = payload.model
  }
  agents.forEach(updateAgent)
  extras.forEach(updateAgent)
}
