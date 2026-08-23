import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'

export interface WorkshopAgent {
  id: string
  name: string
  avatar?: string
  role: 'admin' | 'worker'
  aiRole?: 'digital_member' | 'admin' | 'worker'
  digitalMemberRole?: 'manager' | 'member'
  aiConfigId?: number
  mcpTools?: string
  status: 'learning' | 'working' | 'reproducing' | 'dead'
  platform: string
  currentTask?: string
  currentTaskTitle?: string
  currentTaskStatus?: string
  projectName?: string
  runtimeStatus?: string
  runtimeTool?: string
}

export interface WorkshopPanelProps {
  devices: ConnectedDevice[]
  agents: WorkshopAgent[]
  focusedDeviceId?: string
  focusSignal?: number
}

export interface WorkshopDisplayState {
  bindingOverrides: Record<string, number[]>
  displayRemarkOverride: Record<string, string>
  displayIconOverride: Record<string, string>
  displayIconSettingOverride: Record<string, string>
  aiDescriptionSettingOverride: Record<string, string>
  effectiveAiDescriptionOverride: Record<string, string>
}

export interface DeviceSettingsDraft {
  remark: string
  icon: string
  aiDescriptionOverride: string
}

export type WorkshopRcTarget = {
  deviceId: string
  name: string
  mode: 'android' | 'desktop' | 'browser'
  capabilities?: string[]
}
