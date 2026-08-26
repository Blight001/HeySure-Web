import type { RcMode } from '@/composables/useRemoteControl'

const TERMINAL_CAPABILITIES = new Set(['remote_terminal'])

export type RemoteControlSurface = 'screen' | 'controller' | 'terminal'

export const normalizeRemoteCapabilities = (capabilities?: string[]) =>
  new Set((capabilities || []).map(item => item.toLowerCase().replace(/\./g, '_')))

export const remoteControlAvailability = (mode: RcMode, capabilities?: string[]) => {
  const normalized = normalizeRemoteCapabilities(capabilities)
  const legacy = normalized.size === 0
  const hasRemoteControl = normalized.has('remote_control')
  const hasControllerTemplates = normalized.has('remote_controller_templates')
  const customControllerAvailable = mode === 'custom' && hasRemoteControl && hasControllerTemplates
  const screenAvailable = mode !== 'custom' && (legacy || hasRemoteControl)
  const terminalAvailable = legacy ? mode === 'desktop' : [...normalized].some(item => TERMINAL_CAPABILITIES.has(item))
  const controllerAvailable = screenAvailable || customControllerAvailable
  const sessionAvailable = screenAvailable || customControllerAvailable
  const initialSurface: RemoteControlSurface = customControllerAvailable
    ? 'controller'
    : !screenAvailable && terminalAvailable ? 'terminal' : 'screen'
  return {
    screenAvailable,
    controllerAvailable,
    customControllerAvailable,
    sessionAvailable,
    terminalAvailable,
    initialSurface,
    canOpen: sessionAvailable || terminalAvailable,
  }
}

export const shouldStartRemoteScreen = (mode: RcMode, capabilities?: string[]) =>
  remoteControlAvailability(mode, capabilities).screenAvailable

export const shouldStartRemoteSession = (mode: RcMode, capabilities?: string[]) =>
  remoteControlAvailability(mode, capabilities).sessionAvailable
