import { LIBRARY_DEVICE_POS, type Point } from './layout'
import type { WorldMember, WorldWorkshop } from './store'

export const LIBRARY_DOOR: Point = { x: LIBRARY_DEVICE_POS.x, y: LIBRARY_DEVICE_POS.y + 100 }
export const OFFLINE_KEEP_MS = 60000
export const INTERACT_RANGE = 96

export const workshopSheetForType = (type: WorldWorkshop['type']): string => {
  if (type === 'workshop') return 'building_library.png'
  if (type === 'desktop') return 'building_workshop_desktop.png'
  if (type === 'android') return 'building_workshop_android.png'
  return 'building_workshop_browser.png'
}

export const workshopGlowTintForType = (type: WorldWorkshop['type']): number => {
  if (type === 'browser') return 0x72d8ff
  if (type === 'android') return 0x63f0a8
  if (type === 'workshop') return 0xc99cff
  return 0xffd36b
}

export const workshopIsActive = (workshop: WorldWorkshop, boundMember: WorldMember | undefined): boolean => {
  return workshop.online && (
    workshop.lifecycle === 'dispatching'
    || boundMember?.taskStatus === 'running'
    || !!(boundMember?.hasActiveTask && boundMember.runtimeStatus === 'running')
  )
}
