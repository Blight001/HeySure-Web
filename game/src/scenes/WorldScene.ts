/**
 * 世界场景：草原 tilemap + 3 固定建筑 + 作坊街（随 device:list 增减）
 * + 成员按锚区规则站位/游荡 + hover tooltip + 状态气泡。只读。
 */
import Phaser from 'phaser'
import type { MemberActor } from '../actors/MemberActor'
import { MinigameModal } from '../ui/minigames'
import type { Overlay, TooltipData } from '../ui/overlay'
import { WorldStore, type WorldSnapshot } from '../world/store'
import { createWorldAnims, preloadWorldAssets } from './assetSetup'
import {
  createAmbientLife,
  createAudio,
  createCloudCurtain,
  createDayNight,
  createGround,
} from './worldSceneAmbient'
import { attachWorldCamera } from './worldSceneCamera'
import { createBuildings, createDecor, createMinigameBuildings } from './worldSceneDecor'
import { attachGovernorControls, createGovernor } from './worldSceneGovernor'
import { attachClickAndDrag, attachHover } from './worldSceneInput'
import { applySnapshot, handleWorldEvent } from './worldSceneMembers'
import type {
  NightGlowActor,
  PatrolState,
  SakuraSpot,
  SwayTree,
  WaterTile,
  WorkshopPad,
  WorkshopView,
  WorldButterfly,
  FireflyActor,
  WorldSceneFields,
} from './worldSceneTypes'
import { updateWorldScene } from './worldSceneUpdate'

export class WorldScene extends Phaser.Scene implements WorldSceneFields {
  store!: WorldStore
  overlay!: Overlay
  minigameModal = new MinigameModal()
  actors = new Map<number, MemberActor>()
  workshops = new Map<string, WorkshopView>()
  deviceIconLoads = new Set<string>()
  deviceIconFailures = new Set<string>()
  buildings = new Map<string, Phaser.GameObjects.Sprite>()
  snap: WorldSnapshot | null = null
  draggingActor: MemberActor | null = null
  draggingWorkshop: WorkshopView | null = null
  memberPatrol = new Map<number, PatrolState>()
  nextPatrolUpdate = 0
  prevGeneration = new Map<number, number>()
  bgmMuted = false
  sfxMuted = false
  currentBgm: Phaser.Sound.BaseSound | null = null
  currentBgmIndex = -1
  bgmAutoplayArmed = false
  nightOverlay: Phaser.GameObjects.Rectangle | null = null
  clouds: Phaser.GameObjects.Image[] = []
  introDone = false
  sceneReadyAt = 0
  groundLayer: Phaser.Tilemaps.TilemapLayer | null = null
  waterTiles: WaterTile[] = []
  waterFlip = false
  lamps: Phaser.GameObjects.Image[] = []
  butterflies: WorldButterfly[] = []
  nightness = 0
  worldHour = 12
  nightGlows: NightGlowActor[] = []
  fireflies: FireflyActor[] = []
  nightGlowsVisible = false
  butterfliesVisible = true
  firefliesVisible = false
  workshopPads: WorkshopPad[] = []
  smokePool: Phaser.GameObjects.Sprite[] = []
  sparklePool: Phaser.GameObjects.Sprite[] = []
  petalPool: Phaser.GameObjects.Sprite[] = []
  swayTrees: SwayTree[] = []
  sakuraSpots: SakuraSpot[] = []
  lastTooltipTarget: Phaser.GameObjects.GameObject | null = null
  lastTooltipData: TooltipData | null = null
  governorMode = false
  governorId: number | null = null
  camVx = 0
  camVy = 0
  camDragging = false
  pinching = false
  pinchStartDist = 0
  pinchStartZoom = 1
  pressedObj: Phaser.GameObjects.GameObject | null = null
  dragHoveredDeviceId: string | null = null
  dragHoveredSpawn = false
  moveKeys: Record<string, Phaser.Input.Keyboard.Key> | null = null
  interactPrompt!: Phaser.GameObjects.Text
  nearestInteractId: number | null = null
  chatMemberId: number | null = null

  private readonly onParentMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { type?: string; aiConfigId?: number | null } | null
    if (data?.type !== 'world:chat-state') return
    const id = Number(data.aiConfigId)
    this.chatMemberId = Number.isFinite(id) && id > 0 ? id : null
  }

  constructor() {
    super('world')
  }

  init(data: { store: WorldStore; overlay: Overlay }) {
    this.store = data.store
    this.overlay = data.overlay
  }

  preload() {
    preloadWorldAssets(this)
  }

  create() {
    createWorldAnims(this)
    createGround(this)
    createDecor(this)
    createBuildings(this)
    createMinigameBuildings(this)
    attachWorldCamera(this)
    createGovernor(this)
    createDayNight(this)
    createAudio(this)
    createCloudCurtain(this)
    attachHover(this)
    attachClickAndDrag(this)
    attachGovernorControls(this)
    createAmbientLife(this)
    window.addEventListener('message', this.onParentMessage)
    this.store.subscribe(snap => applySnapshot(this, snap))
    this.store.onEvent(ev => handleWorldEvent(this, ev))
    this.store.start()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('message', this.onParentMessage)
      this.store.stop()
    })
  }

  update(time: number, delta: number) {
    updateWorldScene(this, time, delta)
  }
}
