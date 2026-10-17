/** 花园是纯环境布景，不计入成员或设备，不参与绑定与任务调度。 */
import Phaser from 'phaser'
import { VISUAL_SCALE } from '../world/visualScale'
import type { WorldSceneHost } from './worldSceneTypes'

interface GardenState {
  reduced: boolean
  resident: Phaser.GameObjects.Image
  blossoms: Phaser.GameObjects.Image[]
}

const gardens = new WeakMap<WorldSceneHost, GardenState>()
const GARDENER = { x: 748, y: 262 }

export const createGarden = (scene: WorldSceneHost) => {
  const ground = scene.add.graphics().setDepth(1)
  ground.fillStyle(0xc5b899, 0.5)
  for (let i = 0; i < 4; i++) ground.fillEllipse(806 - i * 12, 277 + i * 20, 17, 7)
  const shadow = scene.add.ellipse(GARDENER.x, GARDENER.y - 1, 23, 7, 0x1e3527, 0.2)
  shadow.setDepth(GARDENER.y - 2)
  const resident = scene.add.image(GARDENER.x, GARDENER.y, 'resident_gardener.png', 0)
  resident.setOrigin(0.5, 0.96).setScale(VISUAL_SCALE.character.gardener * VISUAL_SCALE.character.display).setDepth(GARDENER.y)
  const plants = [710, 730, 764].map((x, i) => scene.add.image(x, 272 + (i % 2) * 9, 'decor_planter.png', 0)
    .setOrigin(0.5, 1).setScale(VISUAL_SCALE.prop.planter).setDepth(275))
  const blossoms = [0, 1, 2].map(() => scene.add.image(0, 0, 'effect_petal.png', 0)
    .setScale(VISUAL_SCALE.prop.blossom).setAlpha(0).setDepth(290))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(hover: none) and (pointer: coarse)').matches
  gardens.set(scene, { resident, blossoms, reduced })
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const object of [ground, shadow, resident, ...plants, ...blossoms]) object.destroy()
    gardens.delete(scene)
  })
}

export const updateGarden = (scene: WorldSceneHost, time: number) => {
  const garden = gardens.get(scene)
  if (!garden) return
  if (garden.reduced) return
  const breath = Math.sin(time / 1800)
  garden.resident.setScale(
    VISUAL_SCALE.character.gardener * VISUAL_SCALE.character.display,
    (VISUAL_SCALE.character.gardener + breath * 0.009) * VISUAL_SCALE.character.display,
  )
  garden.resident.setAngle(breath * 0.7)
  for (let i = 0; i < garden.blossoms.length; i++) {
    const phase = ((time + i * 1700) % 5400) / 5400
    const blossom = garden.blossoms[i]
    blossom.setPosition(710 + i * 26 + Math.sin(phase * 5) * 9, 244 + phase * 31)
    blossom.setAngle(phase * 150 + i * 80)
    blossom.setAlpha(scene.introDone ? Math.sin(phase * Math.PI) * (1 - scene.nightness) * 0.65 : 0)
  }
}
