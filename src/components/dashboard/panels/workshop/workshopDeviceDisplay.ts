import { nextTick } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { resolveAiAvatarUrl } from '@/utils/aiAvatar'
import { deviceTypeLabel, isOffline, isToolboxDevice } from './workshopDeviceKinds'
import type { WorkshopAgent, WorkshopDisplayState, WorkshopPanelProps } from './workshopTypes'

export const DEVICE_ICON_PRESETS = Array.from({ length: 8 }, (_, index) => `/device_png/${index + 1}.webp`)
export const DEVICE_ICON_CACHE_BUST = Date.now().toString(36)

export function deviceIconUrl(url: string) {
  if (!url.startsWith('/device_png/')) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${DEVICE_ICON_CACHE_BUST}`
}

export function createDisplayState(): WorkshopDisplayState {
  return {
    bindingOverrides: {},
    displayRemarkOverride: {},
    displayIconOverride: {},
    displayIconSettingOverride: {},
    aiDescriptionSettingOverride: {},
    effectiveAiDescriptionOverride: {},
  }
}

export function orderDevices(devices: ConnectedDevice[] | undefined): ConnectedDevice[] {
  return (devices || [])
    .map((device, index) => ({ device, index }))
    .sort((a, b) => Number(a.device.online === false) - Number(b.device.online === false) || a.index - b.index)
    .map(item => item.device)
}

export function memberMapFromAgents(agents: WorkshopAgent[] | undefined): Map<number, WorkshopAgent> {
  const map = new Map<number, WorkshopAgent>()
  for (const agent of agents || []) {
    const id = Number(agent.aiConfigId)
    if (Number.isFinite(id) && id > 0) map.set(id, agent)
  }
  return map
}

export function assignableMembersFromAgents(agents: WorkshopAgent[] | undefined) {
  return (agents || [])
    .filter(a => Number.isFinite(Number(a.aiConfigId)) && Number(a.aiConfigId) > 0)
    .map(a => ({ aiConfigId: Number(a.aiConfigId), name: a.name }))
}

export function linkedConfigIds(device: ConnectedDevice, state: WorkshopDisplayState): number[] {
  if (device.id in state.bindingOverrides) return [...state.bindingOverrides[device.id]]
  const ids = Array.isArray(device.boundAiConfigIds)
    ? device.boundAiConfigIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : []
  const legacyId = Number(device.aiConfigId)
  if (Number.isFinite(legacyId) && legacyId > 0 && !ids.includes(legacyId)) ids.push(legacyId)
  return Array.from(new Set(ids)).sort((a, b) => a - b)
}

export function linkedConfigId(device: ConnectedDevice, state: WorkshopDisplayState): number | null {
  return linkedConfigIds(device, state)[0] || null
}

export function hasAnyLinked(device: ConnectedDevice, state: WorkshopDisplayState) {
  return linkedConfigIds(device, state).length > 0
}

export function linkedMember(
  device: ConnectedDevice,
  state: WorkshopDisplayState,
  members: Map<number, WorkshopAgent>,
) {
  const id = linkedConfigId(device, state)
  if (!id) return undefined
  return members.get(id)
}

export function getBoundMemberNames(
  device: ConnectedDevice,
  state: WorkshopDisplayState,
  members: Map<number, WorkshopAgent>,
): string[] {
  return linkedConfigIds(device, state).map((id) => members.get(id)?.name || `AI-${id}`)
}

export function displayRemark(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (device.id in state.displayRemarkOverride) return state.displayRemarkOverride[device.id]
  return String(device.remark || '').trim()
}

export function effectiveAiDescription(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (device.id in state.effectiveAiDescriptionOverride) return state.effectiveAiDescriptionOverride[device.id]
  return String(device.effectiveAiDescription || device.reportedAiDescription || '').trim()
}

export function deviceDisplayName(device: ConnectedDevice, state: WorkshopDisplayState) {
  const base = device.name || device.id || deviceTypeLabel(device)
  const remark = displayRemark(device, state)
  return remark ? `${base}（${remark}）` : base
}

export function deviceIcon(device: ConnectedDevice, state: WorkshopDisplayState) {
  const icon = device.id in state.displayIconOverride ? state.displayIconOverride[device.id] : device.icon || ''
  return icon ? deviceIconUrl(icon) : ''
}

export function deviceAvatarUrl(
  device: ConnectedDevice,
  state: WorkshopDisplayState,
  members: Map<number, WorkshopAgent>,
) {
  if (linkedConfigIds(device, state).length !== 1) return ''
  return resolveAiAvatarUrl(linkedMember(device, state, members)?.avatar) || ''
}

function offlineOrLinkedBorder(offline: boolean, linked: boolean) {
  if (offline) return 'border-zinc-200 dark:border-zinc-600'
  if (linked) return 'border-emerald-200 dark:border-emerald-500/30'
  return 'border-amber-200 dark:border-amber-500/30'
}

function offlineOrLinkedBg(offline: boolean, linked: boolean) {
  if (offline) return ' bg-zinc-100/60 dark:bg-zinc-800/40'
  if (linked) return ' bg-emerald-50/60 dark:bg-emerald-500/10'
  return ' bg-amber-50/60 dark:bg-amber-500/10'
}

export function deviceCardClass(
  device: ConnectedDevice,
  state: WorkshopDisplayState,
  members: Map<number, WorkshopAgent>,
) {
  const hasAvatar = !!deviceAvatarUrl(device, state, members)
  const linked = hasAnyLinked(device, state)
  const offline = isOffline(device)
  const baseBorder = offlineOrLinkedBorder(offline, linked)
  if (hasAvatar) return `${baseBorder} bg-transparent dark:bg-transparent`
  return baseBorder + offlineOrLinkedBg(offline, linked)
}

export function memberPanelClass(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (hasAnyLinked(device, state)) {
    return 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10'
  }
  return 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10'
}

export function memberStatusBadgeClass(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (hasAnyLinked(device, state)) {
    return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
  }
  return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200'
}

export function memberStatusLabel(
  device: ConnectedDevice,
  state: WorkshopDisplayState,
  members: Map<number, WorkshopAgent>,
) {
  const names = getBoundMemberNames(device, state, members)
  if (names.length === 0) return isToolboxDevice(device) ? '未绑定 AI' : '未链接成员'
  if (names.length === 1) return `${names[0]}已绑定`
  const more = names.length > 2 ? '等' : ''
  return `${names.slice(0, 2).join('、')}${more}已绑定`
}

export function currentIconSetting(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (device.id in state.displayIconSettingOverride) return state.displayIconSettingOverride[device.id]
  return device.iconOverride ?? device.icon ?? ''
}

export function currentAiDescriptionSetting(device: ConnectedDevice, state: WorkshopDisplayState) {
  if (device.id in state.aiDescriptionSettingOverride) return state.aiDescriptionSettingOverride[device.id]
  return device.aiDescriptionOverride ?? ''
}

export async function scrollFocusedDevice(
  props: Pick<WorkshopPanelProps, 'focusedDeviceId'>,
  panelRoot: HTMLElement | null,
) {
  if (!props.focusedDeviceId) return
  await nextTick()
  const card = Array.from(panelRoot?.querySelectorAll<HTMLElement>('[data-device-card]') || [])
    .find(item => item.dataset.deviceId === props.focusedDeviceId)
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
