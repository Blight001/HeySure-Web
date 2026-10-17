/**
 * 低成本的世界环境层。对象全部在创建时分配，update 只改变现有对象的
 * transform / alpha；触屏与系统“减少动态效果”偏好保留静态光影而停止位移。
 */
import Phaser from 'phaser'
import { WORLD_W } from '../world/layout'
import { VISUAL_SCALE } from '../world/visualScale'
import type { WorldSceneHost } from './worldSceneTypes'

interface CloudShadow {
  img: Phaser.GameObjects.Ellipse
  startX: number
  startY: number
  speed: number
  phase: number
}

interface PondRipple {
  ring: Phaser.GameObjects.Ellipse
  phase: number
}

interface Bird {
  graphic: Phaser.GameObjects.Graphics
  startX: number
  y: number
  speed: number
  phase: number
}

interface AtmosphereState {
  reducedMotion: boolean
  cloudShadows: CloudShadow[]
  pondRipples: PondRipple[]
  lightPools: Phaser.GameObjects.Image[]
  birds: Bird[]
}

const states = new WeakMap<WorldSceneHost, AtmosphereState>()
const DAYLIGHT = 1
const POND_CENTER = { x: 242, y: 237 }

const shouldReduceMotion = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

export const createAtmosphere = (scene: WorldSceneHost) => {
  if (states.has(scene)) return
  const reducedMotion = shouldReduceMotion()
  const state: AtmosphereState = {
    reducedMotion,
    cloudShadows: createCloudShadows(scene, reducedMotion),
    pondRipples: createPondRipples(scene),
    lightPools: createLightPools(scene),
    birds: reducedMotion ? [] : createBirds(scene),
  }
  states.set(scene, state)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => destroyAtmosphere(scene))
}

export const updateAtmosphere = (scene: WorldSceneHost, time: number, _delta: number) => {
  const state = states.get(scene)
  if (!state) return
  const daylight = scene.introDone ? DAYLIGHT - scene.nightness * 0.82 : 0
  const motionTime = state.reducedMotion ? 0 : time
  updateLightPools(state, motionTime, daylight)
  updateRipples(state, motionTime, daylight)
  updateCloudShadows(state, motionTime, daylight)
  if (!state.reducedMotion) updateBirds(state, motionTime, daylight)
}

const createCloudShadows = (scene: WorldSceneHost, reducedMotion: boolean): CloudShadow[] => {
  const definitions = [
    { x: 170, y: 124, ...VISUAL_SCALE.atmosphere.cloudShadows[0], speed: 0.00007, phase: 0.3 },
    { x: 690, y: 188, ...VISUAL_SCALE.atmosphere.cloudShadows[1], speed: 0.00005, phase: 2.2 },
    { x: 1070, y: 710, ...VISUAL_SCALE.atmosphere.cloudShadows[2], speed: 0.00006, phase: 4.4 },
  ]
  return definitions.map(def => {
    const img = scene.add.ellipse(def.x, def.y, def.width, def.height, 0x426579, 1)
    img.setDepth(2).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0)
    return { img, startX: def.x, startY: def.y, speed: reducedMotion ? 0 : def.speed, phase: def.phase }
  })
}

const createPondRipples = (scene: WorldSceneHost): PondRipple[] => {
  const positions = [
    { x: POND_CENTER.x - 42, y: POND_CENTER.y - 20, phase: 0.1 },
    { x: POND_CENTER.x + 34, y: POND_CENTER.y + 28, phase: 2.2 },
    { x: POND_CENTER.x + 66, y: POND_CENTER.y - 34, phase: 4.3 },
  ]
  return positions.map(point => {
    const ring = scene.add.ellipse(
      point.x,
      point.y,
      VISUAL_SCALE.atmosphere.rippleSize.width,
      VISUAL_SCALE.atmosphere.rippleSize.height,
    )
    ring.setStrokeStyle(1.2, 0xe8fbff, 1).setFillStyle(0xffffff, 0).setDepth(4).setAlpha(0)
    return { ring, phase: point.phase }
  })
}

const createLightPools = (scene: WorldSceneHost): Phaser.GameObjects.Image[] => {
  const pools = [
    { x: 438, y: 188, tint: 0xfff5bb, ...VISUAL_SCALE.atmosphere.lightPools[0] },
    { x: 92, y: 584, tint: 0xfbe2ff, ...VISUAL_SCALE.atmosphere.lightPools[1] },
  ]
  return pools.map(pool => scene.add.image(pool.x, pool.y, 'glow.png', 0)
    .setTint(pool.tint)
    .setScale(pool.scaleX, pool.scaleY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(3)
    .setAlpha(0))
}

const createBirds = (scene: WorldSceneHost): Bird[] => {
  const definitions = [
    { x: 520, y: 128, speed: 0.018, phase: 0.5 },
    { x: 930, y: 216, speed: 0.014, phase: 3.6 },
  ]
  return definitions.map(def => {
    const graphic = scene.add.graphics()
    graphic.fillStyle(0x34445a, 0.68)
    graphic.fillTriangle(0, 2, 5, 0, 10, 2)
    graphic.fillTriangle(10, 2, 15, 0, 20, 2)
    graphic.setDepth(93000).setAlpha(0)
    return { graphic, startX: def.x, y: def.y, speed: def.speed, phase: def.phase }
  })
}

const updateLightPools = (state: AtmosphereState, time: number, daylight: number) => {
  for (let i = 0; i < state.lightPools.length; i++) {
    const pool = state.lightPools[i]
    const pulse = 0.78 + Math.sin(time / 2300 + i * 1.7) * 0.22
    pool.setAlpha(daylight * 0.075 * pulse)
  }
}

const updateRipples = (state: AtmosphereState, time: number, daylight: number) => {
  for (const ripple of state.pondRipples) {
    const wave = (Math.sin(time / 740 + ripple.phase) + 1) * 0.5
    const scale = VISUAL_SCALE.atmosphere.ripple.min + wave * VISUAL_SCALE.atmosphere.ripple.range
    ripple.ring.setScale(scale, scale)
    ripple.ring.setAlpha(daylight * (0.06 + wave * 0.16))
  }
}

const updateCloudShadows = (state: AtmosphereState, time: number, daylight: number) => {
  for (const shadow of state.cloudShadows) {
    shadow.img.x = shadow.startX + Math.sin(time * shadow.speed + shadow.phase) * 86
    shadow.img.y = shadow.startY + Math.cos(time * shadow.speed * 0.72 + shadow.phase) * 12
    shadow.img.setAlpha(daylight * (state.reducedMotion ? 0.022 : 0.038))
  }
}

const updateBirds = (state: AtmosphereState, time: number, daylight: number) => {
  for (const bird of state.birds) {
    const distance = (time * bird.speed) % (WORLD_W + 140)
    bird.graphic.x = (bird.startX + distance) % (WORLD_W + 100) - 50
    bird.graphic.y = bird.y + Math.sin(time / 900 + bird.phase) * 18
    bird.graphic.setAlpha(daylight * 0.54)
  }
}

const destroyAtmosphere = (scene: WorldSceneHost) => {
  const state = states.get(scene)
  if (!state) return
  for (const shadow of state.cloudShadows) shadow.img.destroy()
  for (const ripple of state.pondRipples) ripple.ring.destroy()
  for (const pool of state.lightPools) pool.destroy()
  for (const bird of state.birds) bird.graphic.destroy()
  states.delete(scene)
}
