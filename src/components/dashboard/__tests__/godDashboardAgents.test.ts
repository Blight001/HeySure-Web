import { describe, expect, it } from 'vitest'
import { devicesBoundToAiConfig, type ChatDeviceHint } from '../godDashboardAgents'

const devices: ChatDeviceHint[] = [
  { id: 'legacy', aiConfigId: 7 },
  { id: 'shared', boundAiConfigIds: [7, '9'] },
  { id: 'other', aiConfigId: 12, boundAiConfigIds: [13] },
]

describe('devicesBoundToAiConfig', () => {
  it('returns only devices bound to the active AI member', () => {
    expect(devicesBoundToAiConfig(devices, 7).map(device => device.id)).toEqual(['legacy', 'shared'])
    expect(devicesBoundToAiConfig(devices, 9).map(device => device.id)).toEqual(['shared'])
  })

  it('does not expose devices when the AI member id is missing', () => {
    expect(devicesBoundToAiConfig(devices, undefined)).toEqual([])
  })
})
