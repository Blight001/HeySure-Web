import type Phaser from 'phaser'
import type { MemberActor } from '../actors/MemberActor'
import type { Overlay, TooltipData } from '../ui/overlay'
import type { MinigameModal } from '../ui/minigames'
import type { WorldSnapshot, WorldStore } from '../world/store'
import type { Rect } from '../world/layout'
import type { ButterflyHome } from '../world/map'
import type { WorkshopView } from './types'

export type { WorkshopView }

export interface NightGlowActor {
  img: Phaser.GameObjects.Image
  base: number
  pulse: number
  phase: number
}

export interface FireflyActor {
  img: Phaser.GameObjects.Image
  vx: number
  vy: number
  phase: number
}

export interface WorldButterfly {
  sprite: Phaser.GameObjects.Sprite
  tx: number
  ty: number
  phase: number
  home: ButterflyHome
}

export interface WorkshopPad {
  img: Phaser.GameObjects.Image
  phase: number
  halfPeriod: number
}

export interface SwayTree {
  img: Phaser.GameObjects.Image
  phase: number
  amp: number
}

export interface SakuraSpot {
  x: number
  y: number
  scale: number
}

export interface WaterTile {
  x: number
  y: number
  startsAsA: boolean
}

export interface PatrolState {
  key: string
  index: number
  nextAt: number
  zone: Rect
}

export interface NightGlowSpec {
  x: number
  y: number
  color: number
  scaleX: number
  base: number
  scaleY?: number
  pulse?: number
}

export type DecoFn = (key: string, x: number, y: number, frame?: number) => Phaser.GameObjects.Image

/** Mutable WorldScene surface used by extracted scene modules. */
export interface WorldSceneFields {
  store: WorldStore
  overlay: Overlay
  minigameModal: MinigameModal
  actors: Map<number, MemberActor>
  workshops: Map<string, WorkshopView>
  deviceIconLoads: Set<string>
  deviceIconFailures: Set<string>
  buildings: Map<string, Phaser.GameObjects.Sprite>
  snap: WorldSnapshot | null
  draggingActor: MemberActor | null
  draggingWorkshop: WorkshopView | null
  memberPatrol: Map<number, PatrolState>
  nextPatrolUpdate: number
  prevGeneration: Map<number, number>
  bgmMuted: boolean
  sfxMuted: boolean
  currentBgm: Phaser.Sound.BaseSound | null
  currentBgmIndex: number
  bgmAutoplayArmed: boolean
  nightOverlay: Phaser.GameObjects.Rectangle | null
  clouds: Phaser.GameObjects.Image[]
  introDone: boolean
  sceneReadyAt: number
  groundLayer: Phaser.Tilemaps.TilemapLayer | null
  waterTiles: WaterTile[]
  waterFlip: boolean
  lamps: Phaser.GameObjects.Image[]
  butterflies: WorldButterfly[]
  nightness: number
  worldHour: number
  nightGlows: NightGlowActor[]
  fireflies: FireflyActor[]
  nightGlowsVisible: boolean
  butterfliesVisible: boolean
  firefliesVisible: boolean
  workshopPads: WorkshopPad[]
  smokePool: Phaser.GameObjects.Sprite[]
  sparklePool: Phaser.GameObjects.Sprite[]
  petalPool: Phaser.GameObjects.Sprite[]
  swayTrees: SwayTree[]
  sakuraSpots: SakuraSpot[]
  lastTooltipTarget: Phaser.GameObjects.GameObject | null
  lastTooltipData: TooltipData | null
  governorMode: boolean
  governorId: number | null
  camVx: number
  camVy: number
  camDragging: boolean
  pinching: boolean
  pinchStartDist: number
  pinchStartZoom: number
  pressedObj: Phaser.GameObjects.GameObject | null
  dragHoveredDeviceId: string | null
  dragHoveredSpawn: boolean
  moveKeys: Record<string, Phaser.Input.Keyboard.Key> | null
  interactPrompt: Phaser.GameObjects.Text
  nearestInteractId: number | null
  chatMemberId: number | null
}

export type WorldSceneHost = Phaser.Scene & WorldSceneFields
