import type { RcMode } from '@/composables/useRemoteControl'

const SCREEN_CAPABILITIES = new Set(['remote_control'])
const TERMINAL_CAPABILITIES = new Set(['remote_terminal'])

export const normalizeRemoteCapabilities = (capabilities?: string[]) =>
  new Set((capabilities || []).map(item => item.toLowerCase().replace(/\./g, '_')))

export const remoteControlAvailability = (mode: RcMode, capabilities?: string[]) => {
  const normalized = normalizeRemoteCapabilities(capabilities)
  const legacy = normalized.size === 0
  const screenAvailable = legacy || [...normalized].some(item => SCREEN_CAPABILITIES.has(item))
  const terminalAvailable = legacy ? mode === 'desktop' : [...normalized].some(item => TERMINAL_CAPABILITIES.has(item))
  return {
    screenAvailable,
    terminalAvailable,
    initialSurface: (!screenAvailable && terminalAvailable ? 'terminal' : 'screen') as 'screen' | 'terminal',
    canOpen: screenAvailable || terminalAvailable,
  }
}

export const shouldStartRemoteScreen = (mode: RcMode, capabilities?: string[]) =>
  remoteControlAvailability(mode, capabilities).screenAvailable
