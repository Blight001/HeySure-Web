/**
 * 世界场景：草原 tilemap + 3 固定建筑 + 作坊街（随 device:list 增减）
 * + 成员按锚区规则站位/游荡 + hover tooltip + 状态气泡。只读。
 */
import Phaser from 'phaser'
import type { MemberActor } from '../actors/MemberActor'
import type { Overlay, TooltipData } from '../ui/overlay'
import { WorldStore, type WorldSnapshot } from '../world/store'
import {
  applyVisualPositionEditMode,
  clearVisualPositionRegistry,
  isVisualPositionEditMode,
  onVisualPositionEditModeChange,
} from '../world/visualPositionRuntime'
import { createWorldAnims, preloadWorldAssets } from './assetSetup'
import { createAtmosphere } from './worldSceneAtmosphere'
import {
  createAmbientLife,
  createAudio,
  createCloudCurtain,
  createDayNight,
  createGround,
} from './worldSceneAmbient'
import { attachWorldCamera } from './worldSceneCamera'
import { createBuildings, createDecor } from './worldSceneDecor'
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
  camVx = 0
  camVy = 0
  camDragging = false
  pinching = false
  pinchStartDist = 0
  pinchStartZoom = 1
  pressedObj: Phaser.GameObjects.GameObject | null = null
  visualPositionDragObject: Phaser.GameObjects.GameObject | null = null
  dragHoveredDeviceId: string | null = null
  dragHoveredSpawn = false
  chatMemberId: number | null = null
  private unsubscribeStore: (() => void) | null = null
  private unsubscribeWorldEvents: (() => void) | null = null
  private unsubscribeVisualPositionMode: (() => boolean) | null = null

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

  /** Phaser restart 复用同一个 Scene 实例，必须清掉上一次运行的可变状态。 */
  private resetForRestart() {
    clearVisualPositionRegistry()
    this.actors.clear()
    this.workshops.clear()
    this.deviceIconLoads.clear()
    this.deviceIconFailures.clear()
    this.buildings.clear()
    this.memberPatrol.clear()
    this.prevGeneration.clear()
    this.clouds = []
    this.waterTiles = []
    this.waterFlip = false
    this.lamps = []
    this.butterflies = []
    this.nightGlows = []
    this.fireflies = []
    this.nightGlowsVisible = false
    this.butterfliesVisible = true
    this.firefliesVisible = false
    this.workshopPads = []
    this.smokePool = []
    this.sparklePool = []
    this.petalPool = []
    this.swayTrees = []
    this.sakuraSpots = []
    this.snap = null
    this.groundLayer = null
    this.nightOverlay = null
    this.currentBgm = null
    this.currentBgmIndex = -1
    this.bgmAutoplayArmed = false
    this.introDone = false
    this.sceneReadyAt = 0
    this.nightness = 0
    this.worldHour = 12
    this.nextPatrolUpdate = 0
    this.lastTooltipTarget = null
    this.lastTooltipData = null
    this.camVx = 0
    this.camVy = 0
    this.camDragging = false
    this.pinching = false
    this.pinchStartDist = 0
    this.pinchStartZoom = 1
    this.pressedObj = null
    this.visualPositionDragObject = null
    this.dragHoveredDeviceId = null
    this.dragHoveredSpawn = false
  }

  preload() {
    preloadWorldAssets(this)
  }

  create() {
    // Phaser reuses the Scene instance on `scene.restart()`. Reset the
    // one-shot intro guard so a preview reload can hide its loading curtain
    // again instead of leaving the stale "正在连接世界..." hint visible.
    this.resetForRestart()
    createWorldAnims(this)
    createGround(this)
    createDecor(this)
    createAtmosphere(this)
    createBuildings(this)
    attachWorldCamera(this)
    createDayNight(this)
    createAudio(this)
    createCloudCurtain(this)
    attachHover(this)
    attachClickAndDrag(this)
    applyVisualPositionEditMode(this, isVisualPositionEditMode())
    this.unsubscribeVisualPositionMode = onVisualPositionEditModeChange(enabled => {
      applyVisualPositionEditMode(this, enabled)
    })
    createAmbientLife(this)
    window.addEventListener('message', this.onParentMessage)
    this.unsubscribeStore = this.store.subscribe(snap => applySnapshot(this, snap))
    this.unsubscribeWorldEvents = this.store.onEvent(ev => handleWorldEvent(this, ev))
    this.store.start()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('message', this.onParentMessage)
      this.unsubscribeStore?.()
      this.unsubscribeStore = null
      this.unsubscribeWorldEvents?.()
      this.unsubscribeWorldEvents = null
      this.unsubscribeVisualPositionMode?.()
      this.unsubscribeVisualPositionMode = null
      this.store.stop()
    })
  }

  update(time: number, delta: number) {
    updateWorldScene(this, time, delta)
  }
}
