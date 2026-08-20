import { WORLD_H, WORLD_W } from '../world/layout'
import { anchorFor } from './worldSceneMembers'
import type { WorldButterfly, WorldSceneHost } from './worldSceneTypes'

export const updateWorldScene = (scene: WorldSceneHost, time: number, delta: number) => {
  updatePatrolAnchors(scene, time)
  updateCameraInertia(scene)
  updateActors(scene, time, delta)
  updateWorkshopTaskGlows(scene, time)
  updateWorkshopPads(scene, time)
  updateSwayTrees(scene, time)
  updateButterflies(scene, time, delta)
  updateNightGlows(scene, time)
  updateFireflies(scene, time, delta)
}

const updatePatrolAnchors = (scene: WorldSceneHost, time: number) => {
  if (time < scene.nextPatrolUpdate) return
  scene.nextPatrolUpdate = time + 500
  for (const member of scene.snap?.members ?? []) {
    const actor = scene.actors.get(member.id)
    if (actor && !actor.isBenchLocked) actor.setAnchor(anchorFor(scene, member, time))
  }
}

const updateCameraInertia = (scene: WorldSceneHost) => {
  if (scene.camDragging) return
  if (Math.abs(scene.camVx) > 0.15 || Math.abs(scene.camVy) > 0.15) {
    scene.cameras.main.scrollX += scene.camVx
    scene.cameras.main.scrollY += scene.camVy
    scene.camVx *= 0.88
    scene.camVy *= 0.88
    return
  }
  scene.camVx = 0
  scene.camVy = 0
}

const updateActors = (scene: WorldSceneHost, time: number, delta: number) => {
  for (const actor of scene.actors.values()) {
    actor.setStationary(scene.chatMemberId === actor.memberId)
    actor.setNightness(scene.nightness)
    actor.tick(time, delta)
  }
}

const updateWorkshopTaskGlows = (scene: WorldSceneHost, time: number) => {
  for (const view of scene.workshops.values()) {
    if (!view.taskActive || view.offlineSince !== null) {
      view.taskGlow.setAlpha(0)
      continue
    }
    const pulse = 0.5 + 0.5 * Math.sin(time / 230 + view.glowPhase)
    const nightBoost = scene.nightness * 0.08
    view.taskGlow.setAlpha(0.18 + pulse * 0.2 + nightBoost)
    view.taskGlow.setScale(6.4 + pulse * 1.2, 4.9 + pulse * 0.9)
  }
}

const updateWorkshopPads = (scene: WorldSceneHost, time: number) => {
  for (const p of scene.workshopPads) {
    const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI / p.halfPeriod + p.phase)
    p.img.setAlpha(0.12 + pulse * 0.10)
    p.img.setScale(3.4 + pulse * 0.5, 1.05)
  }
}

const updateSwayTrees = (scene: WorldSceneHost, time: number) => {
  for (const t of scene.swayTrees) {
    t.img.setAngle(Math.sin(time / 1400 + t.phase) * t.amp)
  }
}

const updateButterflies = (scene: WorldSceneHost, time: number, delta: number) => {
  const day = 1 - scene.nightness
  if (day >= 0.05) {
    scene.butterfliesVisible = true
    moveButterflies(scene, time, delta, day)
    return
  }
  if (scene.butterfliesVisible) {
    scene.butterfliesVisible = false
    for (const b of scene.butterflies) b.sprite.setAlpha(0)
  }
}

const moveButterflies = (scene: WorldSceneHost, time: number, delta: number, day: number) => {
  for (const b of scene.butterflies) {
    b.sprite.setAlpha(day)
    const dx = b.tx - b.sprite.x
    const dy = b.ty - b.sprite.y
    const dist = Math.hypot(dx, dy)
    if (dist < 6) retargetButterfly(b)
    else stepButterfly(b, dx, dy, dist, time, delta)
  }
}

const retargetButterfly = (b: WorldButterfly) => {
  b.tx = Math.min(Math.max(b.home.x + (Math.random() * 2 - 1) * b.home.r, 40), WORLD_W - 40)
  b.ty = Math.min(Math.max(b.home.y + (Math.random() * 2 - 1) * b.home.r, 60), WORLD_H - 40)
}

const stepButterfly = (
  b: WorldButterfly,
  dx: number,
  dy: number,
  dist: number,
  time: number,
  delta: number,
) => {
  const step = (26 * delta) / 1000
  b.sprite.x += (dx / dist) * step
  b.sprite.y += (dy / dist) * step + Math.sin(time / 260 + b.phase) * 0.45
  b.sprite.setFlipX(dx < 0)
}

const updateNightGlows = (scene: WorldSceneHost, time: number) => {
  if (scene.nightness > 0.01) {
    scene.nightGlowsVisible = true
    for (const g of scene.nightGlows) {
      g.img.setAlpha(scene.nightness * (g.base + g.pulse * Math.sin(time / 480 + g.phase)))
    }
    return
  }
  if (scene.nightGlowsVisible) {
    scene.nightGlowsVisible = false
    for (const g of scene.nightGlows) g.img.setAlpha(0)
  }
}

const updateFireflies = (scene: WorldSceneHost, time: number, delta: number) => {
  if (scene.nightness > 0.05) {
    scene.firefliesVisible = true
    moveFireflies(scene, time, delta)
    return
  }
  if (scene.firefliesVisible) {
    scene.firefliesVisible = false
    for (const f of scene.fireflies) f.img.setAlpha(0)
  }
}

const moveFireflies = (scene: WorldSceneHost, time: number, delta: number) => {
  for (const f of scene.fireflies) {
    f.img.x += (f.vx * delta) / 1000
    f.img.y += (f.vy * delta) / 1000 + Math.sin(time / 300 + f.phase) * 0.3
    if (f.img.x < 100 || f.img.x > WORLD_W - 100) f.vx *= -1
    if (f.img.y < 100 || f.img.y > WORLD_H - 100) f.vy *= -1
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(time / 700 + f.phase * 3))
    f.img.setAlpha(scene.nightness * blink * 0.9)
  }
}
