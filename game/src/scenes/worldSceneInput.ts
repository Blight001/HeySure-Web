import Phaser from 'phaser'
import { MemberActor } from '../actors/MemberActor'
import { applyMemberDropBinding } from '../world/bindings'
import { memberTooltipData } from '../ui/worldText'
import type { TooltipData } from '../ui/overlay'
import { playSfx } from './worldSceneAmbient'
import { focusMemberCard, reconcileMembers } from './worldSceneMembers'
import { positionWorkshopLabel, postToDashboard } from './worldSceneShared'
import {
  clearDragHighlight,
  finishWorkshopDrag,
  resolveDropTarget,
  updateDragHighlight,
  workshopForObject,
} from './worldSceneWorkshops'
import type { WorldSceneHost } from './worldSceneTypes'

export const attachHover = (scene: WorldSceneHost) => {
  scene.input.on(
    'gameobjectover',
    (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      scene.lastTooltipTarget = obj
      scene.lastTooltipData = tooltipFor(obj)
      showTooltipAt(scene, pointer)
    },
  )
  scene.input.on(
    'gameobjectmove',
    (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (obj !== scene.lastTooltipTarget) {
        scene.lastTooltipTarget = obj
        scene.lastTooltipData = tooltipFor(obj)
      }
      showTooltipAt(scene, pointer)
    },
  )
  scene.input.on('gameobjectout', () => {
    scene.lastTooltipTarget = null
    scene.lastTooltipData = null
    scene.overlay.hideTooltip()
  })
}

const showTooltipAt = (scene: WorldSceneHost, pointer: Phaser.Input.Pointer) => {
  if (!scene.lastTooltipData) return
  const ev = pointer.event as MouseEvent
  scene.overlay.showTooltip(scene.lastTooltipData, ev.clientX ?? pointer.x, ev.clientY ?? pointer.y)
}

const tooltipFor = (obj: Phaser.GameObjects.GameObject): TooltipData | null => {
  if (obj instanceof MemberActor) return memberTooltipData(obj.member)
  const fn = obj.getData?.('tooltip') as (() => TooltipData) | undefined
  return fn ? fn() : null
}

export const attachClickAndDrag = (scene: WorldSceneHost) => {
  scene.input.dragDistanceThreshold = 8
  scene.input.on(
    'gameobjectdown',
    (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      scene.pressedObj = obj
      if (obj instanceof MemberActor && !obj.isDying) obj.flashClick()
    },
  )
  scene.input.on(
    'gameobjectup',
    (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      onWorldObjectUp(scene, pointer, obj)
    },
  )
  scene.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
    onWorldDragStart(scene, obj)
  })
  scene.input.on(
    'drag',
    (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      onWorldDrag(scene, obj, dragX, dragY)
    },
  )
  scene.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
    onWorldDragEnd(scene, obj)
  })
}

const onWorldObjectUp = (
  scene: WorldSceneHost,
  pointer: Phaser.Input.Pointer,
  obj: Phaser.GameObjects.GameObject,
) => {
  if (scene.draggingActor || scene.draggingWorkshop) return
  const pressed = scene.pressedObj
  scene.pressedObj = null
  if (pressed !== obj) return
  const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY)
  if (dist >= 8 || !scene.snap) return
  playSfx(scene, 'ui_click', 0.4)
  if (obj instanceof MemberActor) {
    focusMemberCard(scene, obj.memberId)
    return
  }
  handleNonMemberClick(scene, obj)
}

const handleNonMemberClick = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject) => {
  const deviceId = obj.getData?.('deviceId') as string | undefined
  if (deviceId) {
    postToDashboard({ type: 'world:focus-device', deviceId })
    return
  }
  const key = obj.getData?.('buildingKey') as string | undefined
  if (key === 'library') postToDashboard({ type: 'world:open-knowledge' })
  if (key) bounceBuilding(scene, key)
}

const bounceBuilding = (scene: WorldSceneHost, key: string) => {
  const bSprite = scene.buildings.get(key)
  if (!bSprite) return
  const sx = bSprite.scaleX
  const sy = bSprite.scaleY
  scene.tweens.add({
    targets: bSprite,
    scaleX: sx * 0.92,
    scaleY: sy * 0.92,
    duration: 75,
    yoyo: true,
    ease: 'Sine.easeOut',
    onComplete: () => { bSprite.scaleX = sx; bSprite.scaleY = sy },
  })
}

const onWorldDragStart = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject) => {
  if (obj instanceof MemberActor && !obj.isDying) {
    scene.pressedObj = null
    scene.draggingActor = obj
    obj.beginDrag()
    scene.overlay.hideTooltip()
    return
  }
  const workshop = workshopForObject(scene, obj)
  if (workshop && workshop.data.type !== 'workshop') {
    scene.pressedObj = null
    scene.draggingWorkshop = workshop
    workshop.sprite.setDepth(160000)
    workshop.label.setDepth(160012)
    scene.overlay.hideTooltip()
  }
}

const onWorldDrag = (
  scene: WorldSceneHost,
  obj: Phaser.GameObjects.GameObject,
  dragX: number,
  dragY: number,
) => {
  if (obj instanceof MemberActor && obj === scene.draggingActor) {
    obj.x = dragX
    obj.y = dragY
    updateDragHighlight(scene, dragX, dragY)
    return
  }
  const workshop = workshopForObject(scene, obj)
  if (workshop && workshop === scene.draggingWorkshop) {
    workshop.sprite.setPosition(dragX, dragY)
    workshop.taskGlow.setPosition(dragX, dragY - 24)
    positionWorkshopLabel(workshop)
  }
}

const onWorldDragEnd = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject) => {
  if (obj instanceof MemberActor && obj === scene.draggingActor) {
    finishMemberDrag(scene, obj)
    return
  }
  const workshop = workshopForObject(scene, obj)
  if (workshop && workshop === scene.draggingWorkshop) {
    scene.draggingWorkshop = null
    const deviceIds = finishWorkshopDrag(scene, workshop)
    if (scene.snap) reconcileMembers(scene, scene.snap)
    if (deviceIds) void scene.store.saveDeviceOrder(deviceIds).catch(() => undefined)
  }
}

const finishMemberDrag = (scene: WorldSceneHost, obj: MemberActor) => {
  scene.draggingActor = null
  clearDragHighlight(scene)
  const drop = resolveDropTarget(scene, obj.x, obj.y)
  obj.endDrag()
  if (!drop || !scene.snap) return
  const member = scene.snap.members.find(item => item.id === obj.memberId)
  if (member) void applyMemberDropBinding(member, drop, scene.snap, () => scene.store.refreshNow())
}
