import { describe, expect, it } from 'vitest'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { canRemoteControl, remoteControlLabel } from '@/components/dashboard/panels/workshop/workshopDeviceKinds'
import { remoteControlAvailability, shouldStartRemoteScreen } from '../remoteControlCapabilities'

const device = (overrides: Partial<ConnectedDevice>): ConnectedDevice => ({
  id: 'device', name: 'Device', capabilities: [], ...overrides,
})

describe('remote control capability entry', () => {
  it('opens Linux and custom terminal-only devices without enabling a screen session', () => {
    const linux = device({ platform: 'linux', capabilities: ['remote_terminal'] })
    const custom = device({ deviceType: 'custom', capabilities: ['remote.terminal'] })
    expect(canRemoteControl(linux)).toBe(true)
    expect(canRemoteControl(custom)).toBe(true)
    expect(remoteControlLabel(linux)).toBe('远程终端')
    expect(remoteControlAvailability('desktop', linux.capabilities)).toEqual({
      screenAvailable: false, terminalAvailable: true, initialSurface: 'terminal', canOpen: true,
    })
    expect(shouldStartRemoteScreen('desktop', custom.capabilities)).toBe(false)
  })

  it('starts screen P2P only for screen capabilities and preserves empty legacy capabilities', () => {
    expect(shouldStartRemoteScreen('desktop', ['remote_control'])).toBe(true)
    expect(shouldStartRemoteScreen('browser', ['remote_web_mirror'])).toBe(false)
    expect(shouldStartRemoteScreen('desktop', ['remote_controller_templates'])).toBe(false)
    expect(canRemoteControl(device({ platform: 'linux', capabilities: ['remote_web_mirror'] }))).toBe(false)
    expect(remoteControlAvailability('browser', ['remote_web_mirror'])).toMatchObject({
      screenAvailable: false, terminalAvailable: false, canOpen: false,
    })
    expect(remoteControlAvailability('desktop', ['remote_control', 'remote_web_mirror'])).toMatchObject({
      screenAvailable: true, terminalAvailable: false, initialSurface: 'screen', canOpen: true,
    })
    expect(shouldStartRemoteScreen('desktop', ['remote_control', 'remote_controller_templates'])).toBe(true)
    expect(remoteControlAvailability('desktop', [])).toMatchObject({ screenAvailable: true, terminalAvailable: true, initialSurface: 'screen' })
    expect(remoteControlAvailability('android', [])).toMatchObject({ screenAvailable: true, terminalAvailable: false })
    expect(canRemoteControl(device({ platform: 'linux', capabilities: [] }))).toBe(false)
  })
})
