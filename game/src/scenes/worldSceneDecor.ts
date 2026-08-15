import Phaser from 'phaser'
import { MINIGAME_DEFS, minigameBestScore } from '../ui/minigames'
import { buildingTooltipData } from '../ui/worldText'
import {
  FIXED_BUILDINGS,
  LIBRARY_DEVICE_POS,
  MINIGAME_BUILDINGS,
  MINIGAME_SCALE,
  TILE,
  WORKSHOP_COLS,
  WORKSHOP_SLOTS,
  WORLD_H,
  WORLD_W,
  mulberry32,
  workshopSlotPos,
  type MinigameBuildingDef,
} from '../world/layout'
import {
  BENCH_POSITIONS,
  BUTTERFLY_HOMES,
  BUTTERFLY_TINTS,
  LIBRARY_BANNER_POINTS,
  LIBRARY_BOOK_STAND_POINTS,
  LIBRARY_CORE_LAMP_POINTS,
  LIBRARY_OBELISK_POINTS,
  LIBRARY_SPARKLE_POINTS,
  MAIN_ROAD_LAMP_TILES,
  NIGHT_GLOW_SOURCES,
  SIGNPOST_POS,
  SPAWN_BUTTERFLY_POINTS,
  SPAWN_LAMP_TILES,
  WORKSHOP_STREET_LAMPS,
  type ButterflyHome,
} from '../world/map'
import { WORKSHOP_BASE_ORIGIN_Y, WORKSHOP_LABEL_GAP } from './worldSceneShared'
import type { DecoFn, NightGlowSpec, WorldSceneHost } from './worldSceneTypes'

const makeDeco = (scene: WorldSceneHost): DecoFn => {
  return (key, x, y, frame = 0) => {
    const img = scene.add.image(x, y, key, frame)
    img.setOrigin(0.5, 0.9)
    img.setDepth(y)
    return img
  }
}

const placeStreetLamps = (scene: WorldSceneHost, deco: DecoFn) => {
  for (const tx of MAIN_ROAD_LAMP_TILES) {
    const lamp = deco('lamp.png', tx * TILE + 16, 22 * TILE - 2)
    scene.lamps.push(lamp)
    addStreetLampGlow(scene, lamp)
  }
  for (const pos of WORKSHOP_STREET_LAMPS) {
    const lamp = deco('lamp.png', pos.x * TILE + 16, pos.y * TILE - 2)
    scene.lamps.push(lamp)
    addStreetLampGlow(scene, lamp)
  }
}

const createFireflies = (scene: WorldSceneHost) => {
  const tints = [0xc8ff7a, 0xfff080, 0x80ffd4]
  const frnd = mulberry32(123)
  for (let i = 0; i < 14; i++) {
    const img = scene.add.image(150 + frnd() * (WORLD_W - 300), 150 + frnd() * (WORLD_H - 300), 'glow.png', 0)
    img.setBlendMode(Phaser.BlendModes.ADD)
    img.setTint(tints[i % 3])
    img.setScale(0.45)
    img.setDepth(160000)
    img.setAlpha(0)
    scene.fireflies.push({ img, vx: (frnd() - 0.5) * 18, vy: (frnd() - 0.5) * 14, phase: frnd() * Math.PI * 2 })
  }
}

const addButterfly = (
  scene: WorldSceneHost,
  rnd: () => number,
  home: ButterflyHome,
  tint: number,
  scale: number,
) => {
  const sprite = scene.add.sprite(
    home.x + (rnd() - 0.5) * home.r,
    home.y + (rnd() - 0.5) * home.r,
    'butterfly.png', 0,
  )
  sprite.play('butterfly.png:loop')
  sprite.setTint(tint)
  sprite.setScale(scale)
  sprite.setDepth(95000)
  scene.butterflies.push({
    sprite,
    tx: home.x + (rnd() - 0.5) * home.r,
    ty: home.y + (rnd() - 0.5) * home.r,
    phase: rnd() * Math.PI * 2,
    home,
  })
}

const createButterflies = (scene: WorldSceneHost) => {
  const rnd = mulberry32(99)
  BUTTERFLY_HOMES.forEach((home, i) => {
    addButterfly(scene, rnd, home, BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length], 0.95 + rnd() * 0.3)
    if (i % 2 === 0) {
      addButterfly(scene, rnd, home, BUTTERFLY_TINTS[(i + 2) % BUTTERFLY_TINTS.length], 0.9 + rnd() * 0.25)
    }
  })
  SPAWN_BUTTERFLY_POINTS.forEach((pos, i) => {
    addButterfly(scene, rnd, { ...pos, r: 46 }, BUTTERFLY_TINTS[(i + 1) % BUTTERFLY_TINTS.length], 1.15)
  })
}

const startSakuraPetals = (scene: WorldSceneHost) => {
  if (!scene.sakuraSpots.length) return
  scene.time.addEvent({
    delay: 640,
    loop: true,
    callback: () => {
      if (scene.nightness > 0.6) return
      const s = scene.sakuraSpots[Math.floor(Math.random() * scene.sakuraSpots.length)]
      spawnPetal(scene, s)
    },
  })
}

const startWorkshopSmoke = (scene: WorldSceneHost) => {
  scene.time.addEvent({
    delay: 850,
    loop: true,
    callback: () => {
      for (const view of scene.workshops.values()) {
        if (view.offlineSince === null && view.sprite.anims.isPlaying && view.data.type === 'desktop') {
          spawnSmoke(scene, view.sprite.x - 12, view.sprite.y - 32)
        }
      }
    },
  })
}

export const createDecor = (scene: WorldSceneHost) => {
  const deco = makeDeco(scene)
  placeStreetLamps(scene, deco)
  for (const glow of NIGHT_GLOW_SOURCES) addNightGlow(scene, glow)
  createLibraryCoreDecor(scene, deco)
  createSpawnDecor(scene, deco)
  createWorkshopBayDecor(scene)
  createFireflies(scene)
  deco('signpost.png', SIGNPOST_POS.x, SIGNPOST_POS.y)
  for (const pos of BENCH_POSITIONS) deco('bench.png', pos.x, pos.y)
  createButterflies(scene)
  startSakuraPetals(scene)
  startWorkshopSmoke(scene)
}

export const createLibraryCoreDecor = (scene: WorldSceneHost, deco: DecoFn) => {
  const center = LIBRARY_DEVICE_POS
  const aura = scene.add.image(center.x, center.y + 64, 'glow.png', 0)
  aura.setBlendMode(Phaser.BlendModes.ADD)
  aura.setTint(0xffcc66)
  aura.setScale(10.8, 3.1)
  aura.setDepth(center.y - 4)
  aura.setAlpha(0.2)
  scene.tweens.add({
    targets: aura, alpha: 0.34, scaleX: 12.2, scaleY: 3.55,
    duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  })
  const crown = scene.add.image(center.x, center.y - 72, 'glow.png', 0)
  crown.setBlendMode(Phaser.BlendModes.ADD)
  crown.setTint(0xfffbe0)
  crown.setScale(2.4, 2.9)
  crown.setDepth(center.y + 20)
  crown.setAlpha(0.18)
  scene.tweens.add({
    targets: crown, angle: 360, alpha: 0.3,
    duration: 9000, repeat: -1, ease: 'Linear',
  })
  placeLibraryProps(scene, deco)
}

const placeLibraryProps = (scene: WorldSceneHost, deco: DecoFn) => {
  for (const pos of LIBRARY_CORE_LAMP_POINTS) {
    const lamp = deco('lamp.png', pos.x, pos.y)
    scene.lamps.push(lamp)
    addStreetLampGlow(scene, lamp)
  }
  for (const pos of LIBRARY_OBELISK_POINTS) {
    const obelisk = deco('decor_library_obelisk.png', pos.x, pos.y)
    obelisk.setDepth(pos.y + 8)
    addNightGlow(scene, { x: pos.x, y: pos.y - 34, color: 0xf6d987, scaleX: 2.4, base: 0.26, scaleY: 3.2, pulse: 0.1 })
  }
  for (let i = 0; i < LIBRARY_BANNER_POINTS.length; i++) {
    const pos = LIBRARY_BANNER_POINTS[i]
    const banner = deco('decor_library_banner.png', pos.x, pos.y)
    banner.setFlipX(i % 2 === 1)
    banner.setDepth(pos.y + 6)
  }
  for (const pos of LIBRARY_BOOK_STAND_POINTS) {
    const stand = deco('decor_book_stand.png', pos.x, pos.y)
    stand.setDepth(pos.y + 4)
    addNightGlow(scene, { x: pos.x, y: pos.y - 12, color: 0xfff1a6, scaleX: 2.2, base: 0.2, scaleY: 1.8, pulse: 0.08 })
  }
  for (let i = 0; i < LIBRARY_SPARKLE_POINTS.length; i++) {
    const pos = LIBRARY_SPARKLE_POINTS[i]
    const sparkle = scene.add.sprite(pos.x, pos.y, 'effect_sparkle.png', 0)
    sparkle.setTint([0xfff09e, 0xffffff, 0xc99cff, 0x9ed2ff][i % 4])
    sparkle.setScale(i === LIBRARY_SPARKLE_POINTS.length - 1 ? 1.15 : 0.9)
    sparkle.setDepth(94000)
    sparkle.setAlpha(0.76)
    sparkle.play('effect_sparkle.png:loop')
  }
}

export const createSpawnDecor = (scene: WorldSceneHost, deco: DecoFn) => {
  const spawn = FIXED_BUILDINGS.find(def => def.key === 'spawn')?.pos
  if (!spawn) return
  const aura = scene.add.image(spawn.x, spawn.y + 32, 'glow.png', 0)
  aura.setBlendMode(Phaser.BlendModes.ADD)
  aura.setTint(0x60d8ff)
  aura.setScale(8.4, 2.2)
  aura.setDepth(spawn.y - 18)
  aura.setAlpha(0.16)
  scene.tweens.add({
    targets: aura, alpha: 0.26, scaleX: 9.2, scaleY: 2.5,
    duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  })
  const inner = scene.add.image(spawn.x, spawn.y - 8, 'glow.png', 0)
  inner.setBlendMode(Phaser.BlendModes.ADD)
  inner.setTint(0xffffff)
  inner.setScale(3.8, 3)
  inner.setDepth(spawn.y - 16)
  inner.setAlpha(0.12)
  scene.tweens.add({ targets: inner, angle: 360, duration: 12000, repeat: -1, ease: 'Linear' })
  for (const pos of SPAWN_LAMP_TILES) {
    const lamp = deco('lamp.png', pos.x * TILE + 16, pos.y * TILE - 2)
    scene.lamps.push(lamp)
    addStreetLampGlow(scene, lamp)
  }
  addSpawnSparkles(scene, spawn)
}

const addSpawnSparkles = (scene: WorldSceneHost, spawn: { x: number; y: number }) => {
  const points = [
    { x: spawn.x - 70, y: spawn.y + 26, tint: 0xfff09e },
    { x: spawn.x + 68, y: spawn.y + 24, tint: 0xff9ed2 },
    { x: spawn.x - 34, y: spawn.y + 76, tint: 0xa0ffda },
    { x: spawn.x + 34, y: spawn.y + 78, tint: 0xffffff },
  ]
  for (const p of points) {
    const sparkle = scene.add.sprite(p.x, p.y, 'effect_sparkle.png', 0)
    sparkle.setTint(p.tint)
    sparkle.setScale(0.85)
    sparkle.setDepth(94000)
    sparkle.setAlpha(0.72)
    sparkle.play('effect_sparkle.png:loop')
  }
}

export const createWorkshopBayDecor = (scene: WorldSceneHost) => {
  const rnd = mulberry32(77)
  for (let i = 0; i < WORKSHOP_SLOTS; i++) {
    const pos = workshopSlotPos(i)
    const row = Math.floor(i / WORKSHOP_COLS)
    const tint = row === 0 ? 0xffd36b : 0x72d8ff
    const pad = scene.add.image(pos.x, pos.y + 38, 'glow.png', 0)
    pad.setBlendMode(Phaser.BlendModes.ADD)
    pad.setTint(tint)
    pad.setScale(3.4, 1.05)
    pad.setDepth(pos.y - 8)
    pad.setAlpha(0.12)
    scene.workshopPads.push({ img: pad, phase: rnd() * Math.PI * 2, halfPeriod: 1800 + (i % 3) * 240 })
    const beacon = scene.add.sprite(pos.x + 34, pos.y - 42, 'effect_sparkle.png', 0)
    beacon.setTint(tint)
    beacon.setScale(row === 0 ? 0.72 : 0.82)
    beacon.setDepth(94000)
    beacon.setAlpha(0.58)
    beacon.play('effect_sparkle.png:loop')
  }
}

export const addStreetLampGlow = (scene: WorldSceneHost, lamp: Phaser.GameObjects.Image) => {
  addNightGlow(scene, { x: lamp.x, y: lamp.y - 44, color: 0xffd477, scaleX: 4.4, base: 0.62 })
  addNightGlow(scene, { x: lamp.x, y: lamp.y - 2, color: 0xffbd5b, scaleX: 12.5, base: 0.38, scaleY: 4.5, pulse: 0.02 })
}

export const addNightGlow = (scene: WorldSceneHost, spec: NightGlowSpec) => {
  const img = scene.add.image(spec.x, spec.y, 'glow.png', 0)
  img.setBlendMode(Phaser.BlendModes.ADD)
  img.setTint(spec.color)
  img.setScale(spec.scaleX, spec.scaleY ?? spec.scaleX)
  img.setDepth(155000)
  img.setAlpha(0)
  scene.nightGlows.push({ img, base: spec.base, pulse: spec.pulse ?? 0.12, phase: Math.random() * Math.PI * 2 })
}

export const spawnSmoke = (scene: WorldSceneHost, x: number, y: number) => {
  if (!scene.introDone) return
  const s = scene.smokePool.pop() ?? scene.add.sprite(0, 0, 'effect_smoke.png', 0)
  s.setPosition(x, y).setAlpha(1).setActive(true).setVisible(true).setDepth(98000)
  s.play('effect_smoke.png:loop')
  scene.tweens.add({
    targets: s,
    y: y - 18,
    alpha: 0,
    duration: 800,
    onComplete: () => {
      s.setActive(false).setVisible(false)
      scene.smokePool.push(s)
    },
  })
}

export const spawnPetal = (scene: WorldSceneHost, spot: { x: number; y: number; scale: number }) => {
  if (!scene.introDone) return
  const startX = spot.x + (Math.random() - 0.5) * 34 * spot.scale
  const startY = spot.y - (34 + Math.random() * 18) * spot.scale
  const p = scene.petalPool.pop() ?? scene.add.sprite(0, 0, 'effect_petal.png', 0)
  p.setPosition(startX, startY).setAlpha(0.95).setActive(true).setVisible(true).setDepth(spot.y + 1)
  p.play('effect_petal.png:loop')
  const drift = (Math.random() - 0.5) * 30
  scene.tweens.add({
    targets: p,
    y: startY + 40 + Math.random() * 22,
    x: startX + drift,
    alpha: 0,
    duration: 2200 + Math.random() * 900,
    ease: 'Sine.easeIn',
    onComplete: () => {
      p.setActive(false).setVisible(false)
      scene.petalPool.push(p)
    },
  })
}

export const createBuildings = (scene: WorldSceneHost) => {
  for (const def of FIXED_BUILDINGS) {
    const sprite = scene.add.sprite(def.pos.x, def.pos.y, def.sheet, 0)
    sprite.setOrigin(0.5, 0.55)
    sprite.setScale(def.scale)
    sprite.setDepth(def.pos.y + sprite.displayHeight * 0.4)
    sprite.setInteractive({ pixelPerfect: true })
    sprite.setData('tooltip', () => buildingTooltipData(def.key, def.label, scene.snap))
    sprite.setData('buildingKey', def.key)
    scene.buildings.set(def.key, sprite)
  }
  scene.buildings.get('spawn')?.play('building_spawn.png:loop')
}

export const createMinigameBuildings = (scene: WorldSceneHost) => {
  for (const def of MINIGAME_BUILDINGS) {
    const sprite = scene.add.sprite(def.pos.x, def.pos.y, def.sheet, 0)
    sprite.setOrigin(0.5, WORKSHOP_BASE_ORIGIN_Y)
    sprite.setScale(MINIGAME_SCALE)
    sprite.setDepth(def.pos.y)
    sprite.setInteractive({ pixelPerfect: true })
    sprite.setData('tooltip', () => minigameTooltip(def))
    sprite.setData('buildingKey', def.key)
    sprite.setData('minigameId', def.game)
    sprite.play(`${def.sheet}:loop`)
    scene.buildings.set(def.key, sprite)
    const label = scene.add.text(def.pos.x, def.pos.y - sprite.displayHeight - WORKSHOP_LABEL_GAP, `🕹 ${def.label}`, {
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontSize: '12px',
      color: '#fff4d2',
      backgroundColor: '#14100dcc',
      padding: { x: 5, y: 2 },
      align: 'center',
    })
    label.setOrigin(0.5, 1)
    label.setDepth(def.pos.y + 12)
  }
}

const minigameTooltip = (def: MinigameBuildingDef) => {
  const game = MINIGAME_DEFS[def.game]
  return {
    title: def.label,
    badge: '小游戏',
    rows: [
      { label: '玩法', value: game.hint },
      { label: '最高分', value: String(minigameBestScore(def.game)) },
      { label: '入口', value: '点击建筑开始游戏' },
    ],
  }
}
