import { describe, expect, it } from 'vitest'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { canRemoteControl, remoteControlLabel, remoteControlMode } from '@/components/dashboard/panels/workshop/workshopDeviceKinds'
import { remoteControlAvailability, shouldStartRemoteScreen, shouldStartRemoteSession } from '../remoteControlCapabilities'

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
    expect(remoteControlAvailability('desktop', linux.capabilities)).toMatchObject({
      screenAvailable: false, sessionAvailable: false, terminalAvailable: true, initialSurface: 'terminal', canOpen: true,
    })
    expect(shouldStartRemoteScreen('desktop', custom.capabilities)).toBe(false)
  })

  it('opens a custom DataChannel controller without advertising a video surface', () => {
    const arm = device({
      deviceType: 'custom',
      capabilities: ['remote_control', 'remote_controller_templates'],
    })
    expect(remoteControlMode(arm)).toBe('custom')
    expect(canRemoteControl(arm)).toBe(true)
    expect(remoteControlLabel(arm)).toBe('远程控制')
    expect(remoteControlAvailability('custom', arm.capabilities)).toMatchObject({
      screenAvailable: false,
      controllerAvailable: true,
      customControllerAvailable: true,
      sessionAvailable: true,
      terminalAvailable: false,
      initialSurface: 'controller',
      canOpen: true,
    })
    expect(shouldStartRemoteScreen('custom', arm.capabilities)).toBe(false)
    expect(shouldStartRemoteSession('custom', arm.capabilities)).toBe(true)
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
