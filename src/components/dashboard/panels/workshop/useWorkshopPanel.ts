import { computed, reactive, ref, watch } from 'vue'
import {
  assignableMembersFromAgents,
  memberMapFromAgents,
  orderDevices,
  scrollFocusedDevice,
} from './workshopDeviceDisplay'
import {
  closeAssignMember,
  closeDeleteConfirm,
  closeDeviceSettings,
  confirmDeleteRecord,
  createWorkshopRuntime,
  deleteRecord,
  openAssignMember,
  openDeviceSettings,
  openRemoteControl,
  saveDeviceSettings,
  saveMemberAssignments,
  selectDeviceIcon,
  toggleAssignDraft,
  unbindSpecific,
} from './workshopDeviceActions'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import type { WorkshopPanelProps } from './workshopTypes'

export function useWorkshopPanel(props: WorkshopPanelProps) {
  const rt = createWorkshopRuntime()
  const panelRootRef = ref<HTMLElement | null>(null)
  const orderedDevices = computed(() => orderDevices(props.devices))
  const memberByConfigId = computed(() => memberMapFromAgents(props.agents))
  const assignableMembers = computed(() => assignableMembersFromAgents(props.agents))

  watch(() => props.focusSignal, () => {
    void scrollFocusedDevice(props, panelRootRef.value)
  })

  return reactive({
    panelRootRef,
    orderedDevices,
    memberByConfigId,
    assignableMembers,
    display: rt.display,
    busy: rt.busy,
    errors: rt.errors,
    assignMemberModal: rt.assignMemberModal,
    assignDraftIds: rt.assignDraftIds,
    deleteConfirmTarget: rt.deleteConfirmTarget,
    deviceSettingsTarget: rt.deviceSettingsTarget,
    deviceSettingsDraft: rt.deviceSettingsDraft,
    rcTarget: rt.rcTarget,
    openAssignMember: (device: ConnectedDevice) => openAssignMember(rt, device),
    closeAssignMember: () => closeAssignMember(rt),
    toggleAssignDraft: (id: number) => toggleAssignDraft(rt, id),
    saveMemberAssignments: () => saveMemberAssignments(rt),
    unbindSpecific: (device: ConnectedDevice, id: number) => unbindSpecific(rt, device, id),
    deleteRecord: (device: ConnectedDevice) => deleteRecord(rt, device),
    closeDeleteConfirm: () => closeDeleteConfirm(rt),
    confirmDeleteRecord: () => confirmDeleteRecord(rt),
    openDeviceSettings: (device: ConnectedDevice) => openDeviceSettings(rt, device),
    closeDeviceSettings: () => closeDeviceSettings(rt),
    selectDeviceIcon: (icon: string) => selectDeviceIcon(rt, icon),
    saveDeviceSettings: () => saveDeviceSettings(rt),
    openRemoteControl: (device: ConnectedDevice) => openRemoteControl(rt, device),
  })
}
