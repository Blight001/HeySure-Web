import Phaser from 'phaser'
import { TILES, TREE_VARIANTS } from '../assetManifest'
import { bgmTracks, type BgmTrack } from '../assets'
import { TILE, WORLD_H, WORLD_W, mulberry32 } from '../world/layout'
import { generateGroundMap } from '../world/map'
import { nightnessForHour, resolveWorldHour } from '../world/time'
import { updateHud, worldMinZoom } from './worldSceneShared'
import type { WorldSceneHost } from './worldSceneTypes'

export const createGround = (scene: WorldSceneHost) => {
  const ground = generateGroundMap()
  scene.waterTiles = ground.waterTiles.map(p => ({
    x: p.x,
    y: p.y,
    startsAsA: ground.grid[p.y]?.[p.x] === TILES.waterA,
  }))
  const map = scene.make.tilemap({ data: ground.grid, tileWidth: TILE, tileHeight: TILE })
  const tiles = map.addTilesetImage('tileset.png', 'tileset.png', TILE, TILE)
  if (tiles) scene.groundLayer = (map.createLayer(0, tiles, 0, 0) ?? null) as Phaser.Tilemaps.TilemapLayer | null
  placeTrees(scene, ground.trees)
  placeBushes(scene, ground.bushes)
  scene.time.addEvent({
    delay: 750,
    loop: true,
    callback: () => flipWaterTiles(scene),
  })
}

const placeTrees = (
  scene: WorldSceneHost,
  trees: { x: number; y: number; variant: number; scale: number; flip: boolean }[],
) => {
  for (const t of trees) {
    const tree = scene.add.image(t.x, t.y, 'tree.png', t.variant)
    tree.setOrigin(0.5, 0.94)
    tree.setScale(t.scale)
    tree.setFlipX(t.flip)
    tree.setDepth(t.y)
    scene.swayTrees.push({
      img: tree,
      phase: (t.x * 0.037 + t.y * 0.021) % (Math.PI * 2),
      amp: t.variant === TREE_VARIANTS.pine ? 0.55 : 1.1,
    })
    if (t.variant === TREE_VARIANTS.sakura) scene.sakuraSpots.push({ x: t.x, y: t.y, scale: t.scale })
  }
}

const placeBushes = (
  scene: WorldSceneHost,
  bushes: { x: number; y: number; variant: number; scale: number; flip: boolean }[],
) => {
  for (const b of bushes) {
    const bush = scene.add.image(b.x, b.y, 'bush.png', b.variant)
    bush.setOrigin(0.5, 0.9)
    bush.setScale(b.scale)
    bush.setFlipX(b.flip)
    bush.setDepth(b.y)
  }
}

const flipWaterTiles = (scene: WorldSceneHost) => {
  scene.waterFlip = !scene.waterFlip
  for (const tile of scene.waterTiles) {
    scene.groundLayer?.putTileAt(
      tile.startsAsA !== scene.waterFlip ? TILES.waterA : TILES.waterB,
      tile.x, tile.y,
    )
  }
}

export const createAmbientLife = (scene: WorldSceneHost) => {
  scene.time.addEvent({
    delay: 4500,
    loop: true,
    callback: () => pulseTaskSparkles(scene),
  })
  scene.time.addEvent({
    delay: 7000,
    loop: true,
    callback: () => pulseNeighborGreetings(scene),
  })
}

const pulseTaskSparkles = (scene: WorldSceneHost) => {
  if (!scene.introDone) return
  for (const actor of scene.actors.values()) {
    if (!actor.member.enabled || actor.isDying) continue
    if (actor.member.taskStatus === 'running' && Math.random() < 0.3) {
      burstSparkle(
        scene,
        actor.x + (Math.random() - 0.5) * 18,
        actor.y - 28 - Math.random() * 12,
      )
    }
  }
}

const pulseNeighborGreetings = (scene: WorldSceneHost) => {
  if (!scene.introDone) return
  const alive = [...scene.actors.values()].filter(a => a.member.enabled && !a.isDying)
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      greetIfClose(scene, alive[i], alive[j])
    }
  }
}

const greetIfClose = (
  scene: WorldSceneHost,
  a: { x: number; y: number; flashEmote: (k: 'scroll' | 'check', ms: number) => void },
  b: { scene?: unknown; flashEmote: (k: 'check', ms: number) => void; x: number; y: number },
) => {
  const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
  if (dist >= 52 || Math.random() >= 0.20) return
  a.flashEmote('scroll', 1600)
  scene.time.delayedCall(350 + Math.random() * 400, () => {
    if (b.scene) b.flashEmote('check', 1800)
  })
}

export const burstSparkle = (scene: WorldSceneHost, x: number, y: number) => {
  for (let i = 0; i < 5; i++) {
    const s = scene.sparklePool.pop() ?? scene.add.sprite(0, 0, 'effect_sparkle.png', 0)
    s.setPosition(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30)
      .setActive(true).setVisible(true).setDepth(99000)
    s.play('effect_sparkle.png:loop')
    scene.time.delayedCall(600 + i * 150, () => {
      s.setActive(false).setVisible(false)
      scene.sparklePool.push(s)
    })
  }
}

export const createAudio = (scene: WorldSceneHost) => {
  const legacyMuted = localStorage.getItem('gw-muted') === '1'
  scene.bgmMuted = (localStorage.getItem('gw-bgm-muted') ?? (legacyMuted ? '1' : '0')) === '1'
  scene.sfxMuted = (localStorage.getItem('gw-sfx-muted') ?? (legacyMuted ? '1' : '0')) === '1'
  scene.overlay.initSoundButtons(document.body, { bgmMuted: scene.bgmMuted, sfxMuted: scene.sfxMuted }, state => {
    onSoundButtonsChange(scene, state)
  })
  if (!scene.bgmMuted) startBgm(scene)
  scene.input.once('pointerdown', () => startBgm(scene))
  scene.input.keyboard?.once('keydown', () => startBgm(scene))
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopBgm(scene))
}

const onSoundButtonsChange = (scene: WorldSceneHost, state: { bgmMuted: boolean; sfxMuted: boolean }) => {
  const bgmWasMuted = scene.bgmMuted
  scene.bgmMuted = state.bgmMuted
  scene.sfxMuted = state.sfxMuted
  try {
    localStorage.setItem('gw-bgm-muted', scene.bgmMuted ? '1' : '0')
    localStorage.setItem('gw-sfx-muted', scene.sfxMuted ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
  if (scene.bgmMuted) stopBgm(scene)
  else if (bgmWasMuted) startBgm(scene)
}

export const playSfx = (scene: WorldSceneHost, key: string, volume = 0.5) => {
  if (scene.sfxMuted) return
  try {
    scene.sound.play(key, { volume })
  } catch {
    // autoplay policy: first gesture may fail
  }
}

export const startBgm = (scene: WorldSceneHost) => {
  if (scene.bgmMuted || bgmTracks.length === 0) return
  if (scene.currentBgm?.isPlaying || scene.bgmAutoplayArmed) return
  playNextBgm(scene)
}

const playNextBgm = (scene: WorldSceneHost) => {
  if (scene.bgmMuted || bgmTracks.length === 0) {
    scene.bgmAutoplayArmed = false
    return
  }
  const nextIndex = pickNextTrackIndex(scene)
  const track = bgmTracks[nextIndex]
  scene.bgmAutoplayArmed = true
  if (scene.cache.audio.exists(track.key)) {
    startTrack(scene, nextIndex, track)
    return
  }
  loadAndStartTrack(scene, nextIndex, track)
}

const pickNextTrackIndex = (scene: WorldSceneHost): number => {
  let nextIndex = Phaser.Math.Between(0, bgmTracks.length - 1)
  if (bgmTracks.length > 1 && nextIndex === scene.currentBgmIndex) {
    nextIndex = (nextIndex + 1 + Phaser.Math.Between(0, bgmTracks.length - 2)) % bgmTracks.length
  }
  return nextIndex
}

const loadAndStartTrack = (scene: WorldSceneHost, nextIndex: number, track: BgmTrack) => {
  scene.load.once(`filecomplete-audio-${track.key}`, () => {
    if (scene.bgmMuted) {
      scene.bgmAutoplayArmed = false
      return
    }
    startTrack(scene, nextIndex, track)
  })
  scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    if (file.key !== track.key) return
    scene.bgmAutoplayArmed = false
  })
  scene.load.audio(track.key, track.url)
  scene.load.start()
}

const startTrack = (scene: WorldSceneHost, nextIndex: number, track: BgmTrack) => {
  scene.currentBgm?.destroy()
  scene.currentBgm = scene.sound.add(track.key, { volume: 0.22 })
  scene.currentBgmIndex = nextIndex
  scene.currentBgm.once(Phaser.Sound.Events.COMPLETE, () => {
    scene.bgmAutoplayArmed = false
    playNextBgm(scene)
  })
  const started = scene.currentBgm.play()
  if (!started) {
    scene.bgmAutoplayArmed = false
    scene.currentBgm.destroy()
    scene.currentBgm = null
  }
}

const stopBgm = (scene: WorldSceneHost) => {
  scene.bgmAutoplayArmed = false
  scene.currentBgm?.destroy()
  scene.currentBgm = null
}

export const createDayNight = (scene: WorldSceneHost) => {
  scene.nightOverlay = scene.add.rectangle(0, 0, WORLD_W, WORLD_H, 0xffffff, 1)
  scene.nightOverlay.setOrigin(0, 0)
  scene.nightOverlay.setDepth(150000)
  scene.nightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
  const apply = () => applyDayNight(scene)
  apply()
  scene.time.addEvent({ delay: 60000, loop: true, callback: apply })
}

const applyDayNight = (scene: WorldSceneHost) => {
  const WHITE = Phaser.Display.Color.ValueToColor(0xffffff)
  const DUSK = Phaser.Display.Color.ValueToColor(0xf0a860)
  const NIGHT = Phaser.Display.Color.ValueToColor(0x3d4d82)
  scene.worldHour = resolveWorldHour(window.location.search)
  scene.nightness = Phaser.Math.Clamp(nightnessForHour(scene.worldHour), 0, 1)
  const mix = scene.nightness < 0.5
    ? Phaser.Display.Color.Interpolate.ColorWithColor(WHITE, DUSK, 100, scene.nightness * 200)
    : Phaser.Display.Color.Interpolate.ColorWithColor(DUSK, NIGHT, 100, (scene.nightness - 0.5) * 200)
  scene.nightOverlay?.setFillStyle(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b), 1)
  scene.nightOverlay?.setVisible(scene.nightness > 0.01)
  const lit = scene.nightness > 0.3
  for (const lamp of scene.lamps) lamp.setFrame(lit ? 1 : 0)
  scene.overlay.setNightness(scene.nightness)
  if (scene.snap) updateHud(scene, scene.snap)
}

export const createCloudCurtain = (scene: WorldSceneHost) => {
  const w = scene.scale.width
  const h = scene.scale.height
  const fillZoom = Math.max(w / WORLD_W, h / WORLD_H)
  scene.cameras.main.setZoom(fillZoom)
  scene.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2)
  scene.sceneReadyAt = scene.time.now
  scatterClouds(scene, w, h)
  scene.overlay.showLoadingHint()
  scene.time.delayedCall(10000, () => revealWorld(scene))
}

const scatterClouds = (scene: WorldSceneHost, w: number, h: number) => {
  const rnd = mulberry32(42)
  const step = 190
  let i = 0
  for (let gy = -60; gy < h + 120; gy += step) {
    for (let gx = -80; gx < w + 160; gx += step) {
      const cloud = scene.add.image(
        gx + (rnd() - 0.5) * step * 0.8,
        gy + (rnd() - 0.5) * step * 0.8,
        'cloud.png',
        i++ % 2,
      )
      cloud.setScrollFactor(0)
      cloud.setDepth(400000 + i)
      cloud.setScale(3 + rnd() * 2.4)
      cloud.setAlpha(0.94 + rnd() * 0.06)
      if (rnd() > 0.5) cloud.setFlipX(true)
      if (rnd() < 0.5) driftCloud(scene, cloud, rnd)
      scene.clouds.push(cloud)
    }
  }
}

const driftCloud = (scene: WorldSceneHost, cloud: Phaser.GameObjects.Image, rnd: () => number) => {
  scene.tweens.add({
    targets: cloud,
    x: cloud.x + 18 + rnd() * 30,
    duration: 2600 + rnd() * 2400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  })
}

export const revealWorld = (scene: WorldSceneHost) => {
  if (scene.introDone) return
  scene.introDone = true
  scene.overlay.hideLoadingHint()
  const elapsed = scene.time.now - scene.sceneReadyAt
  scene.time.delayedCall(Math.max(0, 900 - elapsed), () => playRevealTweens(scene))
}

const playRevealTweens = (scene: WorldSceneHost) => {
  const cam = scene.cameras.main
  cam.pan(WORLD_W / 2, WORLD_H / 2, 2200, 'Sine.easeInOut')
  cam.zoomTo(worldMinZoom(scene), 2200, 'Sine.easeInOut')
  const cx = scene.scale.width / 2
  const rnd = mulberry32(7)
  for (const cloud of scene.clouds) {
    scene.tweens.killTweensOf(cloud)
    const dir = cloud.x >= cx ? 1 : -1
    scene.tweens.add({
      targets: cloud,
      x: cloud.x + dir * (scene.scale.width * 0.45 + rnd() * 300),
      y: cloud.y - 30 - rnd() * 60,
      alpha: 0,
      scale: cloud.scale * 1.25,
      delay: rnd() * 350,
      duration: 1500 + rnd() * 900,
      ease: 'Sine.easeIn',
      onComplete: () => cloud.destroy(),
    })
  }
  scene.clouds = []
}
