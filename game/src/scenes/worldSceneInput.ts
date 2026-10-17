import Phaser from 'phaser'
import { MemberActor } from '../actors/MemberActor'
import { setTokenBarVisible } from '../actors/memberActorVisuals'
import { applyMemberDropBinding } from '../world/bindings'
import { VISUAL_SCALE } from '../world/visualScale'
import {
  isVisualPositionEditMode,
  onVisualPositionEditModeChange,
  onVisualPositionChange,
  recordVisualPosition,
  visualPositionTargetFor,
} from '../world/visualPositionRuntime'
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
      if (obj instanceof MemberActor) setTokenBarVisible(obj, true)
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
    if (scene.lastTooltipTarget instanceof MemberActor) {
      setTokenBarVisible(scene.lastTooltipTarget, false)
    }
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
  const unsubscribePositionMode = onVisualPositionEditModeChange(enabled => {
    if (!enabled && scene.visualPositionDragObject) {
      onVisualPositionDragEnd(scene, scene.visualPositionDragObject)
    }
  })
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribePositionMode)
  const unsubscribePosition = onVisualPositionChange(() => {
    for (const view of scene.workshops.values()) {
      view.taskGlow.setPosition(view.sprite.x, view.sprite.y - 24)
      positionWorkshopLabel(view)
      view.sprite.setDepth(view.sprite.y)
    }
  })
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribePosition)
  scene.input.on(
    'gameobjectdown',
    (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      scene.pressedObj = obj
      if (!isVisualPositionEditMode() && obj instanceof MemberActor && !obj.isDying) obj.flashClick()
    },
  )
  scene.input.on(
    'gameobjectup',
    (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (isVisualPositionEditMode()) {
        scene.pressedObj = null
        return
      }
      onWorldObjectUp(scene, pointer, obj)
    },
  )
  scene.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
    if (isVisualPositionEditMode()) onVisualPositionDragStart(scene, obj)
    else onWorldDragStart(scene, obj)
  })
  scene.input.on(
    'drag',
    (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      if (isVisualPositionEditMode()) onVisualPositionDrag(scene, obj, dragX, dragY)
      else onWorldDrag(scene, obj, dragX, dragY)
    },
  )
  scene.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
    if (isVisualPositionEditMode()) onVisualPositionDragEnd(scene, obj)
    else onWorldDragEnd(scene, obj)
  })
  scene.input.on(Phaser.Input.Events.GAME_OUT, () => {
    if (scene.visualPositionDragObject) onVisualPositionDragEnd(scene, scene.visualPositionDragObject)
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
    scaleX: sx * VISUAL_SCALE.interaction.buildingBounce,
    scaleY: sy * VISUAL_SCALE.interaction.buildingBounce,
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

/** 坐标编辑优先于成员绑定/作坊排序拖拽；dragX/dragY 已是世界坐标。 */
const onVisualPositionDragStart = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject) => {
  const target = visualPositionTargetFor(obj)
  if (!target) return
  if (obj instanceof MemberActor && obj.isDying) return
  scene.visualPositionDragObject = obj
  scene.pressedObj = null
  scene.overlay.hideTooltip()
  if (obj instanceof MemberActor) obj.beginDrag()
  const workshop = workshopForObject(scene, obj)
  if (workshop) {
    workshop.sprite.setDepth(160000)
    workshop.label.setDepth(160012)
  } else {
    const positioned = obj as Phaser.GameObjects.GameObject & {
      setDepth?: (value: number) => unknown
    }
    positioned.setDepth?.(160000)
  }
}

const onVisualPositionDrag = (
  scene: WorldSceneHost,
  obj: Phaser.GameObjects.GameObject,
  dragX: number,
  dragY: number,
) => {
  if (scene.visualPositionDragObject !== obj) return
  const positioned = obj as Phaser.GameObjects.GameObject & {
    x: number
    y: number
    setPosition?: (x: number, y: number) => unknown
    setDepth?: (value: number) => unknown
  }
  positioned.setPosition?.(dragX, dragY)
  positioned.x = dragX
  positioned.y = dragY
  const workshop = workshopForObject(scene, obj)
  if (workshop) {
    workshop.taskGlow.setPosition(dragX, dragY - 24)
    positionWorkshopLabel(workshop)
    return
  }
  positioned.setDepth?.(dragY)
}

const onVisualPositionDragEnd = (scene: WorldSceneHost, obj: Phaser.GameObjects.GameObject) => {
  if (scene.visualPositionDragObject !== obj) return
  const positioned = obj as Phaser.GameObjects.GameObject & {
    x: number
    y: number
    setDepth?: (value: number) => unknown
  }
  const x = positioned.x
  const y = positioned.y
  if (obj instanceof MemberActor && obj.isDragging) {
    obj.endDrag()
    obj.setPosition(x, y)
  }
  recordVisualPosition(positioned)
  const workshop = workshopForObject(scene, obj)
  if (workshop) {
    workshop.sprite.setDepth(y)
    workshop.taskGlow.setPosition(x, y - 24)
    positionWorkshopLabel(workshop)
  } else positioned.setDepth?.(obj instanceof MemberActor ? obj.y + 1 : y)
  scene.visualPositionDragObject = null
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
