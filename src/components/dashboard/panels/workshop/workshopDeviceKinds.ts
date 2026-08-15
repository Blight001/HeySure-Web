import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'

export const isToolboxDevice = (device: ConnectedDevice) =>
  String(device.id || '').startsWith('toolbox_builtin_')

export const isCustomDevice = (device: ConnectedDevice) =>
  String(device.deviceType || '').toLowerCase() === 'custom'

export const isLibraryDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return ['workshop', 'library'].includes(device.deviceType)
  if (device.isWorkshop || String(device.id || '').startsWith('workshop_builtin_')) return true
  return String(device.platform || '').toLowerCase().includes('workshop')
}

export const canCustomizeDevice = (device: ConnectedDevice) =>
  !isToolboxDevice(device) && !isLibraryDevice(device)

export const isSoftwareDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'desktop'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isWindowsDesktop || platform.includes('desktop') || platform.includes('windows')
}

export const isAndroidDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'android'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isAndroid || platform.includes('android')
}

export const isBrowserDevice = (device: ConnectedDevice) => {
  if (device.deviceType) return device.deviceType === 'browser'
  const platform = String(device.platform || '').toLowerCase()
  return !!device.isBrowserExtension || platform.includes('browser')
}

export const canRemoteControl = (device: ConnectedDevice) =>
  isSoftwareDevice(device) || isAndroidDevice(device) || isBrowserDevice(device)

export const isEndpointDevice = (device: ConnectedDevice) => {
  const platform = String(device.platform || '').toLowerCase()
  return isSoftwareDevice(device)
    || isAndroidDevice(device)
    || !!device.isBrowserExtension
    || platform.includes('browser')
    || isLibraryDevice(device)
    || isCustomDevice(device)
}

export const isOffline = (device: ConnectedDevice) => device.online === false

export function deviceTypeLabel(device: ConnectedDevice) {
  if (isToolboxDevice(device)) return '工具箱'
  if (isLibraryDevice(device)) return '图书馆'
  if (isCustomDevice(device)) return '自定义设备'
  if (isAndroidDevice(device)) return '安卓端'
  if (isBrowserDevice(device)) return '浏览器插件'
  if (isSoftwareDevice(device)) return '软件端'
  return '设备端'
}

export function lifecycleLabel(lifecycle?: string) {
  if (lifecycle === 'offline') return '离线，等待重连'
  if (lifecycle === 'dispatching') return '执行中'
  if (lifecycle === 'registered' || lifecycle === 'connected') return '已连接'
  if (lifecycle === 'degraded') return '异常'
  return '在线'
}

export function lifecycleClass(lifecycle?: string) {
  if (lifecycle === 'offline') return 'bg-zinc-300 dark:bg-zinc-600'
  if (lifecycle === 'dispatching') return 'bg-indigo-500'
  if (lifecycle === 'registered' || lifecycle === 'connected') return 'bg-emerald-500'
  if (lifecycle === 'degraded') return 'bg-amber-500'
  return 'bg-zinc-400'
}

export function remoteControlMode(device: ConnectedDevice): 'android' | 'desktop' | 'browser' {
  if (isAndroidDevice(device)) return 'android'
  if (isBrowserDevice(device)) return 'browser'
  return 'desktop'
}

export function remoteControlLabel(device: ConnectedDevice) {
  if (isAndroidDevice(device)) return '远程控制'
  if (isBrowserDevice(device)) return '浏览器控制'
  return '桌面控制'
}
