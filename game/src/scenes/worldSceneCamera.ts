import Phaser from 'phaser'
import { WORLD_H, WORLD_W } from '../world/layout'
import { worldMinZoom } from './worldSceneShared'
import type { WorldSceneHost } from './worldSceneTypes'

interface CamDragState {
  lastX: number
  lastY: number
}

const twoPointersDown = (scene: WorldSceneHost) => {
  const p1 = scene.input.pointer1
  const p2 = scene.input.pointer2
  return !!(p1?.isDown && p2?.isDown)
}

const pinchDistance = (scene: WorldSceneHost) => {
  const p1 = scene.input.pointer1
  const p2 = scene.input.pointer2
  return Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
}

const beginPinch = (scene: WorldSceneHost, cam: Phaser.Cameras.Scene2D.Camera) => {
  scene.pinching = true
  scene.camDragging = false
  scene.camVx = 0
  scene.camVy = 0
  scene.pinchStartDist = pinchDistance(scene)
  scene.pinchStartZoom = cam.zoom
}

const endPinch = (scene: WorldSceneHost) => {
  scene.pinching = false
  scene.pinchStartDist = 0
}

const onCamPointerDown = (
  scene: WorldSceneHost,
  cam: Phaser.Cameras.Scene2D.Camera,
  drag: CamDragState,
  p: Phaser.Input.Pointer,
) => {
  if (twoPointersDown(scene)) {
    beginPinch(scene, cam)
    return
  }
  scene.camDragging = true
  scene.camVx = 0
  scene.camVy = 0
  drag.lastX = p.x
  drag.lastY = p.y
}

const applyPinchZoom = (scene: WorldSceneHost, cam: Phaser.Cameras.Scene2D.Camera) => {
  if (scene.pinchStartDist <= 8) return
  const scale = pinchDistance(scene) / scene.pinchStartDist
  const next = Phaser.Math.Clamp(scene.pinchStartZoom * scale, worldMinZoom(scene), 2)
  cam.setZoom(next)
}

const dragCamera = (
  scene: WorldSceneHost,
  cam: Phaser.Cameras.Scene2D.Camera,
  drag: CamDragState,
  p: Phaser.Input.Pointer,
) => {
  if (!scene.camDragging || !p.isDown || scene.draggingActor || scene.draggingWorkshop) {
    return
  }
  const dx = (p.x - drag.lastX) / cam.zoom
  const dy = (p.y - drag.lastY) / cam.zoom
  cam.scrollX -= dx
  cam.scrollY -= dy
  scene.camVx = -dx
  scene.camVy = -dy
  drag.lastX = p.x
  drag.lastY = p.y
}

const onCamPointerMove = (
  scene: WorldSceneHost,
  cam: Phaser.Cameras.Scene2D.Camera,
  drag: CamDragState,
  p: Phaser.Input.Pointer,
) => {
  if (twoPointersDown(scene)) {
    if (!scene.pinching) beginPinch(scene, cam)
    applyPinchZoom(scene, cam)
    return
  }
  if (scene.pinching) endPinch(scene)
  dragCamera(scene, cam, drag, p)
}

export const attachWorldCamera = (scene: WorldSceneHost) => {
  const cam = scene.cameras.main
  cam.setBounds(0, 0, WORLD_W, WORLD_H)
  cam.setZoom(worldMinZoom(scene))
  cam.centerOn(WORLD_W / 2, WORLD_H / 2)
  cam.roundPixels = true
  const drag: CamDragState = { lastX: 0, lastY: 0 }

  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => onCamPointerDown(scene, cam, drag, p))
  scene.input.on('pointerup', () => {
    if (scene.pinching && !twoPointersDown(scene)) endPinch(scene)
    scene.camDragging = false
    scene.pressedObj = null
  })
  scene.input.on(Phaser.Input.Events.GAME_OUT, () => {
    scene.camDragging = false
    endPinch(scene)
    scene.pressedObj = null
  })
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => onCamPointerMove(scene, cam, drag, p))
  scene.input.on(
    'wheel',
    (_p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), worldMinZoom(scene), 2)
      cam.setZoom(next)
    },
  )
  scene.scale.on('resize', () => {
    if (cam.zoom < worldMinZoom(scene)) cam.setZoom(worldMinZoom(scene))
  })
}

export { worldMinZoom }
