import { reactive, ref, type Reactive, type Ref } from 'vue'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import {
  deleteDeviceRecord,
  setBuiltinDeviceBinding,
  setDeviceMemberBinding,
  updateDeviceDisplay,
} from '@/api/devices'
import {
  currentAiDescriptionSetting,
  currentIconSetting,
  deviceDisplayName,
  displayRemark,
  linkedConfigIds,
} from './workshopDeviceDisplay'
import { isLibraryDevice, isToolboxDevice, remoteControlMode } from './workshopDeviceKinds'
import type {
  DeviceSettingsDraft,
  WorkshopDisplayState,
  WorkshopRcTarget,
} from './workshopTypes'

export interface WorkshopRuntime {
  display: WorkshopDisplayState
  busy: Reactive<Record<string, boolean>>
  errors: Reactive<Record<string, string>>
  assignMemberModal: Ref<ConnectedDevice | null>
  assignDraftIds: Ref<number[]>
  deleteConfirmTarget: Ref<ConnectedDevice | null>
  deviceSettingsTarget: Ref<ConnectedDevice | null>
  deviceSettingsDraft: DeviceSettingsDraft
  rcTarget: Ref<WorkshopRcTarget | null>
}

export function createWorkshopRuntime(): WorkshopRuntime {
  return {
    display: {
      bindingOverrides: reactive({}),
      displayRemarkOverride: reactive({}),
      displayIconOverride: reactive({}),
      displayIconSettingOverride: reactive({}),
      aiDescriptionSettingOverride: reactive({}),
      effectiveAiDescriptionOverride: reactive({}),
    },
    busy: reactive({}),
    errors: reactive({}),
    assignMemberModal: ref<ConnectedDevice | null>(null),
    assignDraftIds: ref<number[]>([]),
    deleteConfirmTarget: ref<ConnectedDevice | null>(null),
    deviceSettingsTarget: ref<ConnectedDevice | null>(null),
    deviceSettingsDraft: reactive({ remark: '', icon: '', aiDescriptionOverride: '' }),
    rcTarget: ref<WorkshopRcTarget | null>(null),
  }
}

export async function updateOneBinding(device: ConnectedDevice, cfgId: number, bound: boolean) {
  if (isLibraryDevice(device) || isToolboxDevice(device)) {
    await setBuiltinDeviceBinding(cfgId, device.id, bound)
    return
  }
  await setDeviceMemberBinding(device.id, cfgId, bound)
}

function setBusy(rt: WorkshopRuntime, deviceId: string, value: boolean) {
  rt.busy[deviceId] = value
}

function setError(rt: WorkshopRuntime, deviceId: string, message: string) {
  rt.errors[deviceId] = message
}

async function runDeviceAction(
  rt: WorkshopRuntime,
  device: ConnectedDevice,
  fallback: string,
  action: () => Promise<void>,
) {
  setBusy(rt, device.id, true)
  setError(rt, device.id, '')
  try {
    await action()
  } catch (err: any) {
    setError(rt, device.id, err?.message || fallback)
  } finally {
    setBusy(rt, device.id, false)
  }
}

export async function saveMemberAssignments(rt: WorkshopRuntime) {
  const device = rt.assignMemberModal.value
  if (!device) return
  const current = new Set(linkedConfigIds(device, rt.display))
  const desired = new Set(rt.assignDraftIds.value)
  await runDeviceAction(rt, device, '分配失败', async () => {
    for (const cfgId of current) {
      if (!desired.has(cfgId)) await updateOneBinding(device, cfgId, false)
    }
    for (const cfgId of desired) {
      if (!current.has(cfgId)) await updateOneBinding(device, cfgId, true)
    }
    rt.display.bindingOverrides[device.id] = [...desired].sort((a, b) => a - b)
    closeAssignMember(rt)
  })
}

export function openAssignMember(rt: WorkshopRuntime, device: ConnectedDevice) {
  rt.assignMemberModal.value = device
  rt.assignDraftIds.value = [...linkedConfigIds(device, rt.display)]
}

export function closeAssignMember(rt: WorkshopRuntime) {
  rt.assignMemberModal.value = null
  rt.assignDraftIds.value = []
}

export function toggleAssignDraft(rt: WorkshopRuntime, aiConfigId: number) {
  const ids = rt.assignDraftIds.value ?? []
  rt.assignDraftIds.value = ids.includes(aiConfigId)
    ? ids.filter(id => id !== aiConfigId)
    : [...ids, aiConfigId]
}

export async function unbindSpecific(rt: WorkshopRuntime, device: ConnectedDevice, aiConfigId: number) {
  await runDeviceAction(rt, device, '解除绑定失败', async () => {
    await updateOneBinding(device, aiConfigId, false)
    rt.display.bindingOverrides[device.id] = linkedConfigIds(device, rt.display).filter(id => id !== aiConfigId)
  })
}

export function deleteRecord(rt: WorkshopRuntime, device: ConnectedDevice) {
  rt.deleteConfirmTarget.value = device
}

export function closeDeleteConfirm(rt: WorkshopRuntime) {
  rt.deleteConfirmTarget.value = null
}

export async function confirmDeleteRecord(rt: WorkshopRuntime) {
  const device = rt.deleteConfirmTarget.value
  if (!device) return
  closeDeleteConfirm(rt)
  await runDeviceAction(rt, device, '删除失败', async () => {
    await deleteDeviceRecord(device.id)
  })
}

export function openDeviceSettings(rt: WorkshopRuntime, device: ConnectedDevice) {
  rt.deviceSettingsTarget.value = device
  rt.deviceSettingsDraft.remark = displayRemark(device, rt.display)
  rt.deviceSettingsDraft.icon = currentIconSetting(device, rt.display)
  rt.deviceSettingsDraft.aiDescriptionOverride = currentAiDescriptionSetting(device, rt.display)
}

export function closeDeviceSettings(rt: WorkshopRuntime) {
  rt.deviceSettingsTarget.value = null
}

export function selectDeviceIcon(rt: WorkshopRuntime, icon: string) {
  rt.deviceSettingsDraft.icon = icon
}

export async function saveDeviceSettings(rt: WorkshopRuntime) {
  const device = rt.deviceSettingsTarget.value
  if (!device) return
  await runDeviceAction(rt, device, '显示设置保存失败', async () => {
    const data = await updateDeviceDisplay(device.id, {
      remark: rt.deviceSettingsDraft.remark,
      icon: rt.deviceSettingsDraft.icon,
      aiDescriptionOverride: rt.deviceSettingsDraft.aiDescriptionOverride,
    })
    rt.display.displayRemarkOverride[device.id] = data.remark || ''
    rt.display.displayIconOverride[device.id] = data.icon || ''
    rt.display.displayIconSettingOverride[device.id] = data.iconOverride || ''
    rt.display.aiDescriptionSettingOverride[device.id] = data.aiDescriptionOverride || ''
    rt.display.effectiveAiDescriptionOverride[device.id] = data.effectiveAiDescription || ''
    closeDeviceSettings(rt)
  })
}

export function openRemoteControl(rt: WorkshopRuntime, device: ConnectedDevice) {
  rt.rcTarget.value = {
    deviceId: device.id,
    name: deviceDisplayName(device, rt.display),
    mode: remoteControlMode(device),
  }
}
