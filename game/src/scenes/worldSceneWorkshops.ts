import Phaser from 'phaser'
import { workshopDisplayName, workshopTooltipData } from '../ui/worldText'
import {
  LIBRARY_DEVICE_POS,
  LIBRARY_DEVICE_SCALE,
  WORKSHOP_SCALE,
  workshopSlotPos,
} from '../world/layout'
import type { WorldMember, WorldSnapshot, WorldWorkshop } from '../world/store'
import {
  OFFLINE_KEEP_MS,
  workshopGlowTintForType,
  workshopIsActive,
  workshopSheetForType,
} from '../world/workshops'
import type { WorkshopView } from './types'
import {
  CUSTOM_LIBRARY_ICON_SIZE,
  CUSTOM_WORKSHOP_ICON_SIZE,
  WORKSHOP_BASE_ORIGIN_Y,
  WORKSHOP_LABEL_WRAP_WIDTH,
  deviceIconLoadUrl,
  positionWorkshopLabel,
  setSpriteMaxDisplaySize,
} from './worldSceneShared'
import type { WorldSceneHost } from './worldSceneTypes'
import type { DropTarget } from '../world/bindings'

export const workshopForObject = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject): WorkshopView | null => {
  const deviceId = obj.getData?.('deviceId') as string | undefined
  return deviceId ? scene.workshops.get(deviceId) ?? null : null
}

export const finishWorkshopDrag = (scene: WorldSceneHost, dragged: WorkshopView): string[] | null => {
  const views = orderedWorkshopViews(scene)
  const from = views.indexOf(dragged)
  if (from < 0) return null
  const target = nearestWorkshopSlot(dragged, views.length, from)
  views.splice(from, 1)
  views.splice(target, 0, dragged)
  const deviceIds = views.map(view => view.data.deviceId)
  applyDeviceOrderToSnap(scene, deviceIds)
  relayoutWorkshopSlots(scene)
  return deviceIds
}

const nearestWorkshopSlot = (dragged: WorkshopView, slotCount: number, fallback: number) => {
  let target = fallback
  let bestDistance = Number.POSITIVE_INFINITY
  for (let slot = 0; slot < slotCount; slot++) {
    const pos = workshopSlotPos(slot)
    const distance = Phaser.Math.Distance.Between(dragged.sprite.x, dragged.sprite.y, pos.x, pos.y)
    if (distance < bestDistance) {
      bestDistance = distance
      target = slot
    }
  }
  return target
}

const applyDeviceOrderToSnap = (scene: WorldSceneHost, deviceIds: string[]) => {
  if (!scene.snap) return
  const rank = new Map(deviceIds.map((deviceId, index) => [deviceId, index]))
  scene.snap.deviceOrder = deviceIds
  scene.snap.workshops.sort((a, b) => {
    const ai = rank.get(a.deviceId) ?? Number.MAX_SAFE_INTEGER
    const bi = rank.get(b.deviceId) ?? Number.MAX_SAFE_INTEGER
    return ai - bi || a.deviceId.localeCompare(b.deviceId)
  })
}

export const resolveDropTarget = (scene: WorldSceneHost, x: number, y: number): DropTarget | null => {
  for (const [deviceId, view] of scene.workshops) {
    if (view.offlineSince !== null) continue
    if (Phaser.Math.Distance.Between(x, y, view.sprite.x, view.sprite.y) < 70) {
      return { kind: 'workshop', deviceId }
    }
  }
  const spawn = scene.buildings.get('spawn')
  if (spawn && Phaser.Math.Distance.Between(x, y, spawn.x, spawn.y) < 90) return { kind: 'spawn' }
  return null
}

export const updateDragHighlight = (scene: WorldSceneHost, x: number, y: number) => {
  const target = resolveDropTarget(scene, x, y)
  const newDeviceId = target?.kind === 'workshop' ? target.deviceId : null
  const newSpawn = target?.kind === 'spawn'
  if (newDeviceId !== scene.dragHoveredDeviceId) {
    if (scene.dragHoveredDeviceId) scene.workshops.get(scene.dragHoveredDeviceId)?.sprite.clearTint()
    scene.dragHoveredDeviceId = newDeviceId
    if (newDeviceId) scene.workshops.get(newDeviceId)?.sprite.setTint(0xffb800)
  }
  if (newSpawn !== scene.dragHoveredSpawn) {
    if (scene.dragHoveredSpawn) scene.buildings.get('spawn')?.clearTint()
    scene.dragHoveredSpawn = newSpawn
    if (newSpawn) scene.buildings.get('spawn')?.setTint(0x40d4ff)
  }
}

export const clearDragHighlight = (scene: WorldSceneHost) => {
  if (scene.dragHoveredDeviceId) {
    scene.workshops.get(scene.dragHoveredDeviceId)?.sprite.clearTint()
    scene.dragHoveredDeviceId = null
  }
  if (scene.dragHoveredSpawn) {
    scene.buildings.get('spawn')?.clearTint()
    scene.dragHoveredSpawn = false
  }
}

const deviceIconTextureKey = (url: string): string => {
  let hash = 2166136261
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `device_icon_${url.length}_${(hash >>> 0).toString(36)}`
}

const ensureDeviceIconTexture = (scene: WorldSceneHost, key: string, url: string) => {
  if (scene.textures.exists(key) || scene.deviceIconLoads.has(key) || scene.deviceIconFailures.has(key)) return
  scene.deviceIconLoads.add(key)
  const img = new Image()
  if (/^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous'
  img.onload = () => {
    scene.deviceIconLoads.delete(key)
    if (!scene.textures.exists(key)) scene.textures.addImage(key, img)
    refreshWorkshopTextures(scene)
  }
  img.onerror = () => {
    scene.deviceIconLoads.delete(key)
    scene.deviceIconFailures.add(key)
    refreshWorkshopTextures(scene)
  }
  img.src = deviceIconLoadUrl(url)
}

const workshopTextureKey = (scene: WorldSceneHost, workshop: WorldWorkshop): string => {
  const url = String(workshop.icon || '').trim()
  if (!url) return workshopSheetForType(workshop.type)
  const key = deviceIconTextureKey(url)
  ensureDeviceIconTexture(scene, key, url)
  return scene.textures.exists(key) ? key : workshopSheetForType(workshop.type)
}

export const applyWorkshopTexture = (scene: WorldSceneHost, view: WorkshopView) => {
  const key = workshopTextureKey(scene, view.data)
  const customIconLoaded = key.startsWith('device_icon_')
  if (view.textureKey !== key) bindWorkshopSprite(scene, view, key, customIconLoaded)
  view.sprite.setOrigin(0.5, WORKSHOP_BASE_ORIGIN_Y)
  if (customIconLoaded) {
    const size = view.data.type === 'workshop' ? CUSTOM_LIBRARY_ICON_SIZE : CUSTOM_WORKSHOP_ICON_SIZE
    setSpriteMaxDisplaySize(view.sprite, size)
  } else {
    view.sprite.setScale(view.data.type === 'workshop' ? LIBRARY_DEVICE_SCALE : WORKSHOP_SCALE)
  }
  view.sprite.setAlpha(view.offlineSince !== null || !view.data.online ? 0.62 : 1)
  syncWorkshopLabel(view)
}

const bindWorkshopSprite = (
  scene: WorldSceneHost,
  view: WorkshopView,
  key: string,
  customIconLoaded: boolean,
) => {
  view.sprite.stop()
  view.sprite.setTexture(key)
  view.sprite.setFrame(0)
  view.textureKey = key
  view.sprite.setInteractive({ pixelPerfect: !customIconLoaded })
  view.sprite.setData('tooltip', () => workshopTooltip(scene, view))
  view.sprite.setData('deviceId', view.data.deviceId)
}

const syncWorkshopLabel = (view: WorkshopView) => {
  view.label.setText(workshopDisplayName(view.data))
  view.label.setAlpha(view.offlineSince !== null || !view.data.online ? 0.72 : 1)
  positionWorkshopLabel(view)
}

export const refreshWorkshopTextures = (scene: WorldSceneHost) => {
  for (const view of scene.workshops.values()) applyWorkshopTexture(scene, view)
}

const workshopAnimKey = (view: WorkshopView): string => {
  const url = String(view.data.icon || '').trim()
  if (url && view.sprite.texture.key === deviceIconTextureKey(url)) return ''
  return `${view.sprite.texture.key}:loop`
}

export const reconcileWorkshops = (scene: WorldSceneHost, snap: WorldSnapshot) => {
  const seen = new Set<string>()
  const memberById = new Map<number, WorldMember>()
  for (const m of snap.members) memberById.set(m.id, m)
  for (const w of snap.workshops) {
    seen.add(w.deviceId)
    const view = ensureWorkshopView(scene, w)
    view.data = w
    syncWorkshopOnline(view, w)
    applyWorkshopTexture(scene, view)
    syncWorkshopActivity(view, w, memberById)
  }
  reapMissingWorkshops(scene, seen)
  relayoutWorkshopSlots(scene)
}

const ensureWorkshopView = (scene: WorldSceneHost, w: WorldWorkshop): WorkshopView => {
  const existing = scene.workshops.get(w.deviceId)
  if (existing) return existing
  const view = createWorkshopView(scene, w)
  scene.workshops.set(w.deviceId, view)
  return view
}

const createWorkshopView = (scene: WorldSceneHost, w: WorldWorkshop): WorkshopView => {
  const slot = w.type === 'workshop' ? -1 : firstFreeSlot(scene)
  const pos = w.type === 'workshop' ? LIBRARY_DEVICE_POS : workshopSlotPos(slot)
  const textureKey = workshopTextureKey(scene, w)
  const customIconLoaded = textureKey.startsWith('device_icon_')
  const taskGlow = createWorkshopGlow(scene, pos, w)
  const sprite = createWorkshopSprite(scene, pos, textureKey, w, customIconLoaded)
  const label = createWorkshopLabel(scene, pos, w)
  const view: WorkshopView = {
    sprite,
    taskGlow,
    label,
    textureKey,
    slot,
    data: w,
    offlineSince: w.online ? null : Date.now(),
    taskActive: false,
    glowPhase: Math.random() * Math.PI * 2,
  }
  sprite.setData('tooltip', () => workshopTooltip(scene, view))
  sprite.setData('deviceId', w.deviceId)
  if (w.type !== 'workshop') scene.input.setDraggable(sprite)
  if (!w.online) sprite.setTint(w.lifecycle === 'waiting' ? 0xb9c4d8 : 0x8a8a8a)
  return view
}

const createWorkshopGlow = (
  scene: WorldSceneHost,
  pos: { x: number; y: number },
  w: WorldWorkshop,
) => {
  const taskGlow = scene.add.image(pos.x, pos.y - 24, 'glow.png', 0)
  taskGlow.setBlendMode(Phaser.BlendModes.ADD)
  taskGlow.setTint(workshopGlowTintForType(w.type))
  taskGlow.setScale(6.8, 5.2)
  taskGlow.setDepth(155100)
  taskGlow.setAlpha(0)
  return taskGlow
}

const createWorkshopSprite = (
  scene: WorldSceneHost,
  pos: { x: number; y: number },
  textureKey: string,
  w: WorldWorkshop,
  customIconLoaded: boolean,
) => {
  const sprite = scene.add.sprite(pos.x, pos.y, textureKey, 0)
  sprite.setOrigin(0.5, WORKSHOP_BASE_ORIGIN_Y)
  if (customIconLoaded) {
    const size = w.type === 'workshop' ? CUSTOM_LIBRARY_ICON_SIZE : CUSTOM_WORKSHOP_ICON_SIZE
    setSpriteMaxDisplaySize(sprite, size)
  } else {
    sprite.setScale(w.type === 'workshop' ? LIBRARY_DEVICE_SCALE : WORKSHOP_SCALE)
  }
  sprite.setDepth(pos.y)
  sprite.setInteractive({ pixelPerfect: !customIconLoaded })
  return sprite
}

const createWorkshopLabel = (
  scene: WorldSceneHost,
  pos: { x: number; y: number },
  w: WorldWorkshop,
) => {
  const label = scene.add.text(pos.x, pos.y, workshopDisplayName(w), {
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    color: '#fff4d2',
    backgroundColor: '#14100dcc',
    padding: { x: 5, y: 2 },
    align: 'center',
    wordWrap: { width: WORKSHOP_LABEL_WRAP_WIDTH, useAdvancedWrap: true },
    lineSpacing: -1,
  })
  label.setOrigin(0.5, 1)
  return label
}

const syncWorkshopOnline = (view: WorkshopView, w: WorldWorkshop) => {
  if (w.online && view.offlineSince !== null) {
    view.offlineSince = null
    view.sprite.clearTint()
    return
  }
  if (!w.online && view.offlineSince === null) {
    view.offlineSince = Date.now()
    view.sprite.stop()
    view.sprite.setFrame(0)
    view.sprite.setTint(w.lifecycle === 'waiting' ? 0xb9c4d8 : 0x8a8a8a)
  }
}

const syncWorkshopActivity = (
  view: WorkshopView,
  w: WorldWorkshop,
  memberById: Map<number, WorldMember>,
) => {
  const boundMembers = w.boundAiConfigIds
    .map(aiConfigId => memberById.get(aiConfigId))
    .filter((member): member is WorldMember => !!member)
  const active = workshopIsActive(w, boundMembers)
  view.taskActive = !!active
  if (!active) view.taskGlow.setAlpha(0)
  const animKey = workshopAnimKey(view)
  if (active) {
    if (animKey && (view.sprite.anims.currentAnim?.key !== animKey || !view.sprite.anims.isPlaying)) {
      view.sprite.play(animKey)
    }
    return
  }
  view.sprite.stop()
  view.sprite.setFrame(0)
}

const reapMissingWorkshops = (scene: WorldSceneHost, seen: Set<string>) => {
  const now = Date.now()
  for (const [deviceId, view] of scene.workshops) {
    if (seen.has(deviceId)) continue
    if (view.offlineSince === null) {
      markWorkshopMissing(view, now)
    } else if (now - view.offlineSince > OFFLINE_KEEP_MS) {
      view.taskGlow.destroy()
      view.sprite.destroy()
      view.label.destroy()
      scene.workshops.delete(deviceId)
    }
  }
}

const markWorkshopMissing = (view: WorkshopView, now: number) => {
  view.offlineSince = now
  view.sprite.stop()
  view.sprite.setFrame(0)
  view.sprite.setTint(0x8a8a8a)
  view.sprite.setAlpha(0.62)
  syncWorkshopLabel(view)
}

const firstFreeSlot = (scene: WorldSceneHost): number => {
  const used = new Set<number>()
  for (const v of scene.workshops.values()) {
    if (v.slot >= 0) used.add(v.slot)
  }
  let i = 0
  while (used.has(i)) i++
  return i
}

export const orderedWorkshopViews = (scene: WorldSceneHost): WorkshopView[] => {
  const rank = new Map(
    (scene.snap?.workshops ?? []).map((workshop, index) => [workshop.deviceId, index]),
  )
  return [...scene.workshops.values()]
    .filter(view => view.data.type !== 'workshop')
    .sort((a, b) => {
      const ai = rank.get(a.data.deviceId) ?? Number.MAX_SAFE_INTEGER
      const bi = rank.get(b.data.deviceId) ?? Number.MAX_SAFE_INTEGER
      return ai - bi || a.data.deviceId.localeCompare(b.data.deviceId)
    })
}

export const relayoutWorkshopSlots = (scene: WorldSceneHost) => {
  const views = orderedWorkshopViews(scene)
  views.forEach((view, slot) => {
    view.slot = slot
    const pos = workshopSlotPos(slot)
    view.sprite.setPosition(pos.x, pos.y)
    view.sprite.setDepth(pos.y)
    view.taskGlow.setPosition(pos.x, pos.y - 24)
    applyWorkshopTexture(scene, view)
  })
}

export const workshopTooltip = (scene: WorldSceneHost, view: WorkshopView) => {
  const w = view.data
  const memberById = new Map((scene.snap?.members ?? []).map(member => [member.id, member]))
  const bound = w.boundAiConfigIds
    .map(aiConfigId => memberById.get(aiConfigId))
    .filter((member): member is WorldMember => !!member)
  return workshopTooltipData(view, bound)
}
