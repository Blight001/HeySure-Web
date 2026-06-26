/**
 * 世界场景：草原 tilemap + 3 固定建筑 + 作坊街（随 device:list 增减）
 * + 成员按锚区规则站位/游荡 + hover tooltip + 状态气泡。只读。
 */
import Phaser from 'phaser'
import { TILES } from '../assetManifest'
import { bgmTracks, urlForAsset } from '../assets'
import { MemberActor } from '../actors/MemberActor'
import { createWorldAnims, preloadWorldAssets } from './assetSetup'
import type { WorkshopView } from './types'
import { portraitSpecFor, type PortraitSpec } from '../ui/portrait'
import {
  FIXED_BUILDINGS,
  LIBRARY_DEVICE_POS,
  LIBRARY_DEVICE_SCALE,
  TILE,
  WORKSHOP_COLS,
  WORKSHOP_SCALE,
  WORKSHOP_SLOTS,
  WORLD_H,
  WORLD_W,
  ZONES,
  mulberry32,
  workshopSlotPos,
  workshopZone,
  type Rect,
} from '../world/layout'
import {
  BENCH_POSITIONS,
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
  generateGroundMap,
} from '../world/map'
import { skinFor } from '../world/skins'
import { WorldStore, type WorldEvent, type WorldMember, type WorldSnapshot } from '../world/store'
import { clockLabel, nightnessForHour, resolveWorldHour } from '../world/time'
import { applyMemberDropBinding, type DropTarget } from '../world/bindings'
import {
  INTERACT_RANGE,
  OFFLINE_KEEP_MS,
  workshopGlowTintForType,
  workshopIsActive,
  workshopSheetForType,
} from '../world/workshops'
import { Drawer } from '../ui/drawer'
import { createDrawerActions } from '../ui/drawer/actions'
import type { Overlay, TooltipData } from '../ui/overlay'
import { buildingTooltipData, hudHtml, memberTooltipData, workshopTooltipData } from '../ui/worldText'

export class WorldScene extends Phaser.Scene {
  private store!: WorldStore
  private overlay!: Overlay
  private drawer!: Drawer
  private actors = new Map<number, MemberActor>()
  private workshops = new Map<string, WorkshopView>()
  private slotOwner: (string | null)[] = new Array(WORKSHOP_SLOTS).fill(null)
  private buildings = new Map<string, Phaser.GameObjects.Sprite>()
  private snap: WorldSnapshot | null = null
  private draggingActor: MemberActor | null = null
  /** 演出触发用：上一轮快照的代数 */
  private prevGeneration = new Map<number, number>()
  private bgmMuted = false
  private sfxMuted = false
  private currentBgm: Phaser.Sound.BaseSound | null = null
  private currentBgmIndex = -1
  private bgmAutoplayArmed = false
  private nightOverlay: Phaser.GameObjects.Rectangle | null = null
  /** 开场云层（数据就绪后镜头拉近 + 云朵飘散） */
  private clouds: Phaser.GameObjects.Image[] = []
  private introDone = false
  private sceneReadyAt = 0
  /** 装饰与氛围动画 */
  private groundLayer: Phaser.Tilemaps.TilemapLayer | null = null
  private waterTiles: { x: number; y: number }[] = []
  private waterFlip = false
  private lamps: Phaser.GameObjects.Image[] = []
  private butterflies: { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; phase: number }[] = []
  /** 夜深度 0..1（昼夜系统每分钟更新，光晕/萤火虫/蝴蝶联动） */
  private nightness = 0
  private worldHour = 12
  private nightGlows: { img: Phaser.GameObjects.Image; base: number; pulse: number; phase: number }[] = []
  private fireflies: { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }[] = []
  /**
   * 辅助管理员操控：把世界里已有的「辅助管理员」当作玩家化身，
   * 用户用 WSAD 操控其移动，按 F 与附近其它 AI 交互。不再额外生成化身，避免重复。
   */
  private governorMode = false
  private governorId: number | null = null
  /** 相机拖拽惯性速度（world px/frame） */
  private camVx = 0
  private camVy = 0
  private camDragging = false
  /** 成员长按计时（长按 500ms 打开聊天） */
  private memberLongPressTimer: Phaser.Time.TimerEvent | null = null
  private memberLongPressId: number | null = null
  /** 拖拽落点高亮 */
  private dragHoveredDeviceId: string | null = null
  private dragHoveredSpawn = false
  private moveKeys!: Record<string, Phaser.Input.Keyboard.Key>
  private interactPrompt!: Phaser.GameObjects.Text
  private nearestInteractId: number | null = null
  private chatMemberId: number | null = null
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
    for (const track of bgmTracks) {
      this.load.audio(track.key, track.url)
    }
  }

  create() {
    createWorldAnims(this)
    this.createGround()
    this.createDecor()
    this.createBuildings()
    this.createCamera()
    this.createGovernor()
    this.createDrawer()
    this.createDayNight()
    this.createAudio()
    this.createCloudCurtain()
    this.wireHover()
    this.wireClickAndDrag()
    this.wireGovernorControls()
    this.createAmbientLife()
    window.addEventListener('message', this.onParentMessage)
    this.store.subscribe(snap => this.applySnapshot(snap))
    this.store.onEvent(ev => this.handleWorldEvent(ev))
    this.store.start()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cancelMemberLongPress()
      window.removeEventListener('message', this.onParentMessage)
      this.store.stop()
    })
  }

  // ---------------------------------------------------------------- 开场云层
  /**
   * 加载等待演出：远景 + 云层覆盖（屏幕空间，缓慢漂浮）；
   * 首个有效快照到达后 revealWorld()——镜头由远拉近，云朵向两侧飘散渐隐。
   */
  private createCloudCurtain() {
    const w = this.scale.width
    const h = this.scale.height
    // 远景起点 = 恰好铺满视口的最小缩放（不露世界外黑边），揭幕时再拉近
    const fillZoom = Math.max(w / WORLD_W, h / WORLD_H)
    this.cameras.main.setZoom(fillZoom)
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2)
    this.sceneReadyAt = this.time.now
    const rnd = mulberry32(42)
    // 网格 + 抖动铺满整个视口（含边缘溢出），保证云层完全遮盖
    const step = 190
    let i = 0
    for (let gy = -60; gy < h + 120; gy += step) {
      for (let gx = -80; gx < w + 160; gx += step) {
        const cloud = this.add.image(
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
        // 等待期：缓慢左右漂浮
        this.tweens.add({
          targets: cloud,
          x: cloud.x + 18 + rnd() * 30,
          duration: 2600 + rnd() * 2400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        this.clouds.push(cloud)
      }
    }
    // 兜底：数据迟迟不来（网络挂起）也要在 10s 后揭幕
    this.time.delayedCall(10000, () => this.revealWorld())
  }

  /** 镜头由远拉近 + 云朵向两侧飘散渐隐 */
  private revealWorld() {
    if (this.introDone) return
    this.introDone = true
    // 保证云层至少展示一小段，避免数据秒回时动画一闪而过
    const elapsed = this.time.now - this.sceneReadyAt
    this.time.delayedCall(Math.max(0, 900 - elapsed), () => {
      const cam = this.cameras.main
      const endZoom = this.minZoom()
      cam.pan(WORLD_W / 2, WORLD_H / 2, 2200, 'Sine.easeInOut')
      cam.zoomTo(endZoom, 2200, 'Sine.easeInOut')
      const cx = this.scale.width / 2
      const rnd = mulberry32(7)
      for (const cloud of this.clouds) {
        this.tweens.killTweensOf(cloud)
        const dir = cloud.x >= cx ? 1 : -1
        this.tweens.add({
          targets: cloud,
          x: cloud.x + dir * (this.scale.width * 0.45 + rnd() * 300),
          y: cloud.y - 30 - rnd() * 60,
          alpha: 0,
          scale: cloud.scale * 1.25,
          delay: rnd() * 350,
          duration: 1500 + rnd() * 900,
          ease: 'Sine.easeIn',
          onComplete: () => cloud.destroy(),
        })
      }
      this.clouds = []
    })
  }

  // ---------------------------------------------------------------- 环境生命力
  /**
   * 两类被动氛围事件：
   * 1. 执行任务的成员偶尔迸出火花（任务努力感）
   * 2. 相邻的空闲成员之间随机触发"打招呼"表情（社交感）
   */
  private createAmbientLife() {
    // 任务火花：每 4.5 s 对正在执行任务的成员以 30% 概率冒出一次火花
    this.time.addEvent({
      delay: 4500,
      loop: true,
      callback: () => {
        if (!this.introDone) return
        for (const actor of this.actors.values()) {
          if (!actor.member.enabled || actor.isDying) continue
          if (actor.member.taskStatus === 'running' && Math.random() < 0.3) {
            this.burstSparkle(
              actor.x + (Math.random() - 0.5) * 18,
              actor.y - 28 - Math.random() * 12,
            )
          }
        }
      },
    })

    // 社交互动：每 7 s 扫描距离小于 52px 的相邻成员对，以 20% 概率触发"打招呼"
    this.time.addEvent({
      delay: 7000,
      loop: true,
      callback: () => {
        if (!this.introDone) return
        const alive = [...this.actors.values()].filter(a => a.member.enabled && !a.isDying)
        for (let i = 0; i < alive.length; i++) {
          for (let j = i + 1; j < alive.length; j++) {
            const a = alive[i]
            const b = alive[j]
            const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
            if (dist < 52 && Math.random() < 0.20) {
              a.flashEmote('scroll', 1600)
              // b 稍微延迟回应，模拟自然对话节奏
              this.time.delayedCall(350 + Math.random() * 400, () => {
                if (b.scene) b.flashEmote('check', 1800)
              })
            }
          }
        }
      },
    })
  }

  // ---------------------------------------------------------------- P2 氛围
  private createAudio() {
    const legacyMuted = localStorage.getItem('gw-muted') === '1'
    this.bgmMuted = (localStorage.getItem('gw-bgm-muted') ?? (legacyMuted ? '1' : '0')) === '1'
    this.sfxMuted = (localStorage.getItem('gw-sfx-muted') ?? (legacyMuted ? '1' : '0')) === '1'
    this.overlay.initSoundButtons(document.body, { bgmMuted: this.bgmMuted, sfxMuted: this.sfxMuted }, state => {
      const bgmWasMuted = this.bgmMuted
      this.bgmMuted = state.bgmMuted
      this.sfxMuted = state.sfxMuted
      try {
        localStorage.setItem('gw-bgm-muted', this.bgmMuted ? '1' : '0')
        localStorage.setItem('gw-sfx-muted', this.sfxMuted ? '1' : '0')
      } catch {
        // ignore
      }
      if (this.bgmMuted) {
        this.stopBgm()
      } else if (bgmWasMuted) {
        this.startBgm()
      }
    })
    if (!this.bgmMuted) this.startBgm()
    this.input.once('pointerdown', () => this.startBgm())
    this.input.keyboard?.once('keydown', () => this.startBgm())
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopBgm()
    })
  }

  private playSfx(key: string, volume = 0.5) {
    if (this.sfxMuted) return
    try {
      this.sound.play(key, { volume })
    } catch {
      // 浏览器自动播放策略：首次手势前播放失败属预期
    }
  }

  private startBgm() {
    if (this.bgmMuted || bgmTracks.length === 0) return
    if (this.currentBgm?.isPlaying || this.bgmAutoplayArmed) return
    this.playNextBgm()
  }

  private playNextBgm() {
    if (this.bgmMuted || bgmTracks.length === 0) {
      this.bgmAutoplayArmed = false
      return
    }
    let nextIndex = Phaser.Math.Between(0, bgmTracks.length - 1)
    if (bgmTracks.length > 1 && nextIndex === this.currentBgmIndex) {
      nextIndex = (nextIndex + 1 + Phaser.Math.Between(0, bgmTracks.length - 2)) % bgmTracks.length
    }
    const track = bgmTracks[nextIndex]
    this.currentBgm?.destroy()
    this.currentBgm = this.sound.add(track.key, { volume: 0.22 })
    this.currentBgmIndex = nextIndex
    this.bgmAutoplayArmed = true
    this.currentBgm.once(Phaser.Sound.Events.COMPLETE, () => {
      this.bgmAutoplayArmed = false
      this.playNextBgm()
    })
    const started = this.currentBgm.play()
    if (!started) {
      this.bgmAutoplayArmed = false
      this.currentBgm.destroy()
      this.currentBgm = null
    }
  }

  private stopBgm() {
    this.bgmAutoplayArmed = false
    this.currentBgm?.destroy()
    this.currentBgm = null
  }

  /**
   * 昼夜系统：乘法混合调色层（白天无色 → 黄昏暖橙 → 深夜蓝黑），
   * 配合夜间光晕（createDecor 注册的灯光点）与萤火虫/蝴蝶昼夜交替。
   * 时间标准为**北京时间（UTC+8）**，不随浏览器时区漂移；`?hour=N` 可调试任意时段。
   */
  private createDayNight() {
    this.nightOverlay = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0xffffff, 1)
    this.nightOverlay.setOrigin(0, 0)
    this.nightOverlay.setDepth(150000)
    this.nightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
    const WHITE = Phaser.Display.Color.ValueToColor(0xffffff)
    const DUSK = Phaser.Display.Color.ValueToColor(0xe09a64) // 黄昏暖橙
    const NIGHT = Phaser.Display.Color.ValueToColor(0x6473a8) // 保留道路与建筑细节的月夜蓝
    const apply = () => {
      this.worldHour = resolveWorldHour(window.location.search)
      this.nightness = Phaser.Math.Clamp(nightnessForHour(this.worldHour), 0, 1)
      // 调色：前半段 白→暖橙（日落），后半段 暖橙→深夜蓝
      const mix = this.nightness < 0.5
        ? Phaser.Display.Color.Interpolate.ColorWithColor(WHITE, DUSK, 100, this.nightness * 200)
        : Phaser.Display.Color.Interpolate.ColorWithColor(DUSK, NIGHT, 100, (this.nightness - 0.5) * 200)
      this.nightOverlay?.setFillStyle(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b), 1)
      this.nightOverlay?.setVisible(this.nightness > 0.01)
      // 天黑点灯
      const lit = this.nightness > 0.3
      for (const lamp of this.lamps) lamp.setFrame(lit ? 1 : 0)
      // HUD 时钟随分钟推进刷新
      if (this.snap) this.updateHud(this.snap)
    }
    apply()
    this.time.addEvent({ delay: 60000, loop: true, callback: apply })
  }

  /** 服务端直推事件 → 即时演出（权威状态随后由去抖 refresh 拉取） */
  private handleWorldEvent(ev: WorldEvent) {
    const id = Number(ev.payload?.ai_config_id)
    const actor = Number.isFinite(id) ? this.actors.get(id) : undefined
    switch (ev.type) {
      case 'task_started':
        this.playSfx('scroll')
        break
      case 'task_finished':
        if (actor) this.burstSparkle(actor.x, actor.y - 24)
        this.playSfx('success')
        break
      case 'member_inherited':
        // 传承入殿：立即走死亡演出，下一代由 refresh 带回
        if (actor && !actor.isDying) actor.die(() => this.actors.delete(id))
        this.playSfx('bell', 0.45)
        break
      case 'member_completed': {
        if (actor) this.burstSparkle(actor.x, actor.y - 24)
        this.playSfx('bell', 0.35)
        break
      }
      case 'ai_message': {
        const fromId = Number(ev.payload?.from_ai_config_id)
        const toId = Number(ev.payload?.to_ai_config_id)
        const msgContent = ev.payload?.content ? String(ev.payload.content).slice(0, 120) : undefined
        this.playMessenger(
          Number.isFinite(fromId) ? this.actors.get(fromId) : undefined,
          Number.isFinite(toId) ? this.actors.get(toId) : undefined,
          String(ev.payload?.kind || 'message'),
          msgContent,
        )
        break
      }
    }
  }

  /** AI 互发消息：信封从发信人飞向收信人（弧线），双方头顶表情 + 音效 */
  private playMessenger(from: MemberActor | undefined, to: MemberActor | undefined, kind: string, message?: string) {
    if (!from || !to || from === to) return
    from.flashEmote('scroll', 1500)
    const envelope = this.add.image(from.x, from.y - 36, 'envelope.png', 0)
    envelope.setDepth(99500)
    this.playSfx('ui_click', 0.3)
    const sx = from.x
    const sy = from.y - 36
    const dist = Phaser.Math.Distance.Between(sx, sy, to.x, to.y - 36)
    const duration = Phaser.Math.Clamp(dist * 1.8, 700, 2600)
    const arc = Phaser.Math.Clamp(dist * 0.25, 40, 160)
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: tween => {
        // 收信人可能在走动：每帧重取终点，信会"追着人飞"
        const t = tween.getValue() ?? 0
        const ex = to.x
        const ey = to.y - 36
        envelope.x = sx + (ex - sx) * t
        envelope.y = sy + (ey - sy) * t - Math.sin(Math.PI * t) * arc
        envelope.setFlipX(ex < sx)
      },
      onComplete: () => {
        envelope.destroy()
        if (to.scene) {
          to.flashEmote(kind === 'reply' ? 'check' : 'alert', 2200)
          this.burstSparkle(to.x, to.y - 40)
          if (message) to.showReceivedMessage(message, 3200)
        }
        this.playSfx('chime', 0.35)
      },
    })
  }

  private createDrawer() {
    this.drawer = new Drawer(document.body, createDrawerActions({
      refresh: () => this.store.refreshNow(),
      reopenMember: id => this.reopenMember(id),
      reopenLibrary: () => {
        if (this.snap) this.drawer.openLibrary(this.snap, this.portraitForBuilding('building_library.png'))
      },
      previewAppearance: (id, meta) => this.previewAppearance(id, meta),
      openChat: id => this.openMemberChat(id),
      focusMember: id => this.focusMember(id),
    }))
  }

  private previewAppearance(id: number, meta: { skin: string; tint: string; scale: number; aura: string }) {
    // 仅本地预览，不落库；下次快照刷新会回到已保存外观
    const actor = this.actors.get(id)
    const member = this.snap?.members.find(item => item.id === id)
    if (!actor || !member) return
    actor.previewSkin(skinFor(member.role, id, meta.skin))
    actor.applyAppearance(meta)
  }

  /** 操作后抽屉数据已过期：用新快照重开成员面板 */
  private reopenMember(id: number) {
    const m = this.snap?.members.find(x => x.id === id)
    if (m && this.drawer.isOpen) this.drawer.openMember(m, this.snap!, this.portraitForMember(m))
  }

  private focusMember(id: number) {
    const actor = this.actors.get(id)
    const m = this.snap?.members.find(x => x.id === id)
    if (actor) this.cameras.main.pan(actor.x, actor.y, 400, 'Sine.easeInOut')
    if (m && this.snap) this.drawer.openMember(m, this.snap, this.portraitForMember(m))
  }

  // ---------------------------------------------------------------- 初始化
  private createGround() {
    const ground = generateGroundMap()
    this.waterTiles = ground.waterTiles
    const map = this.make.tilemap({ data: ground.grid, tileWidth: TILE, tileHeight: TILE })
    const tiles = map.addTilesetImage('tileset.png', 'tileset.png', TILE, TILE)
    // Phaser 4 可能返回 GPU layer；二者 putTileAt/getTileAt 同接口
    if (tiles) this.groundLayer = (map.createLayer(0, tiles, 0, 0) ?? null) as Phaser.Tilemaps.TilemapLayer | null

    // 沿边与空地点树（避开建筑、道路带）
    for (const { x, y } of ground.treePositions) {
      const tree = this.add.image(x, y, 'tree.png', 0)
      tree.setOrigin(0.5, 0.92)
      tree.setDepth(y)
    }
    // 池塘波动：水面格子周期性换帧
    this.time.addEvent({
      delay: 750,
      loop: true,
      callback: () => {
        this.waterFlip = !this.waterFlip
        for (const { x, y } of this.waterTiles) {
          const current = this.groundLayer?.getTileAt(x, y)
          if (!current) continue
          const isA = current.index === TILES.waterA
          this.groundLayer?.putTileAt(this.waterFlip === isA ? TILES.waterB : TILES.waterA, x, y)
        }
      },
    })
  }

  /** 装饰层：灯柱（夜晚点亮）/ 图书馆仪式装饰 / 长椅 / 路牌 / 蝴蝶 / 烟囱炊烟 */
  private createDecor() {
    const deco = (key: string, x: number, y: number, frame = 0) => {
      const img = this.add.image(x, y, key, frame)
      img.setOrigin(0.5, 0.9)
      img.setDepth(y)
      return img
    }
    // 主路灯柱（夜晚自动点亮 + 暖光光晕）
    for (const tx of MAIN_ROAD_LAMP_TILES) {
      const lamp = deco('lamp.png', tx * TILE + 16, 22 * TILE - 2)
      this.lamps.push(lamp)
      this.addStreetLampGlow(lamp)
    }
    // 作坊街区灯柱沿两条 2 格宽道路的同一侧等距排布。
    for (const pos of WORKSHOP_STREET_LAMPS) {
      const lamp = deco('lamp.png', pos.x * TILE + 16, pos.y * TILE - 2)
      this.lamps.push(lamp)
      this.addStreetLampGlow(lamp)
    }
    // 建筑灯火与泉水的夜光
    for (const glow of NIGHT_GLOW_SOURCES) {
      this.addNightGlow(glow.x, glow.y, glow.color, glow.scaleX, glow.base, glow.scaleY, glow.pulse)
    }
    this.createLibraryCoreDecor(deco)
    this.createSpawnDecor(deco)
    this.createWorkshopBayDecor()
    // 萤火虫：夜间出没（白天 alpha=0），缓慢游移 + 呼吸闪烁
    const frnd = mulberry32(123)
    for (let i = 0; i < 14; i++) {
      const img = this.add.image(150 + frnd() * (WORLD_W - 300), 150 + frnd() * (WORLD_H - 300), 'glow.png', 0)
      img.setBlendMode(Phaser.BlendModes.ADD)
      img.setTint(0xc8ff7a)
      img.setScale(0.45)
      img.setDepth(160000) // 在夜色层之上发光
      img.setAlpha(0)
      this.fireflies.push({ img, vx: (frnd() - 0.5) * 18, vy: (frnd() - 0.5) * 14, phase: frnd() * Math.PI * 2 })
    }
    deco('signpost.png', SIGNPOST_POS.x, SIGNPOST_POS.y)
    // 广场长椅：落在图书馆和作坊前方的石板街边。
    for (const pos of BENCH_POSITIONS) deco('bench.png', pos.x, pos.y)
    // 蝴蝶：花丛间飞舞
    const rnd = mulberry32(99)
    for (let i = 0; i < 6; i++) {
      const sprite = this.add.sprite(160 + rnd() * (WORLD_W - 320), 160 + rnd() * (WORLD_H - 320), 'butterfly.png', 0)
      sprite.play('butterfly.png:loop')
      sprite.setTint(BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length])
      sprite.setDepth(95000)
      this.butterflies.push({ sprite, tx: sprite.x, ty: sprite.y, phase: rnd() * Math.PI * 2 })
    }
    for (let i = 0; i < SPAWN_BUTTERFLY_POINTS.length; i++) {
      const pos = SPAWN_BUTTERFLY_POINTS[i]
      const sprite = this.add.sprite(pos.x, pos.y, 'butterfly.png', 0)
      sprite.play('butterfly.png:loop')
      sprite.setTint(BUTTERFLY_TINTS[(i + 1) % BUTTERFLY_TINTS.length])
      sprite.setScale(1.15)
      sprite.setDepth(95000)
      this.butterflies.push({
        sprite,
        tx: pos.x + (rnd() - 0.5) * 44,
        ty: pos.y + (rnd() - 0.5) * 34,
        phase: rnd() * Math.PI * 2,
      })
    }
    // 作坊执行任务时（reconcile 标记 active）烟囱冒烟
    this.time.addEvent({
      delay: 850,
      loop: true,
      callback: () => {
        for (const view of this.workshops.values()) {
          if (view.offlineSince === null && view.sprite.anims.isPlaying && view.data.type === 'desktop') {
            this.spawnSmoke(view.sprite.x - 12, view.sprite.y - 32)
          }
        }
      },
    })
  }

  private createLibraryCoreDecor(deco: (key: string, x: number, y: number, frame?: number) => Phaser.GameObjects.Image) {
    const center = LIBRARY_DEVICE_POS
    const aura = this.add.image(center.x, center.y + 64, 'glow.png', 0)
    aura.setBlendMode(Phaser.BlendModes.ADD)
    aura.setTint(0xffdf86)
    aura.setScale(10.8, 3.1)
    aura.setDepth(center.y - 4)
    aura.setAlpha(0.2)
    this.tweens.add({
      targets: aura,
      alpha: 0.34,
      scaleX: 12.2,
      scaleY: 3.55,
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const crown = this.add.image(center.x, center.y - 72, 'glow.png', 0)
    crown.setBlendMode(Phaser.BlendModes.ADD)
    crown.setTint(0xfff1a6)
    crown.setScale(2.4, 2.9)
    crown.setDepth(center.y + 20)
    crown.setAlpha(0.18)
    this.tweens.add({
      targets: crown,
      angle: 360,
      alpha: 0.3,
      duration: 9000,
      repeat: -1,
      ease: 'Linear',
    })

    for (const pos of LIBRARY_CORE_LAMP_POINTS) {
      const lamp = deco('lamp.png', pos.x, pos.y)
      this.lamps.push(lamp)
      this.addStreetLampGlow(lamp)
    }

    for (const pos of LIBRARY_OBELISK_POINTS) {
      const obelisk = deco('decor_library_obelisk.png', pos.x, pos.y)
      obelisk.setDepth(pos.y + 8)
      this.addNightGlow(pos.x, pos.y - 34, 0xf6d987, 2.4, 0.26, 3.2, 0.1)
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
      this.addNightGlow(pos.x, pos.y - 12, 0xfff1a6, 2.2, 0.2, 1.8, 0.08)
    }

    for (let i = 0; i < LIBRARY_SPARKLE_POINTS.length; i++) {
      const pos = LIBRARY_SPARKLE_POINTS[i]
      const sparkle = this.add.sprite(pos.x, pos.y, 'effect_sparkle.png', 0)
      sparkle.setTint([0xfff09e, 0xffffff, 0xc99cff, 0x9ed2ff][i % 4])
      sparkle.setScale(i === LIBRARY_SPARKLE_POINTS.length - 1 ? 1.15 : 0.9)
      sparkle.setDepth(94000)
      sparkle.setAlpha(0.76)
      sparkle.play('effect_sparkle.png:loop')
    }
  }

  private createSpawnDecor(deco: (key: string, x: number, y: number, frame?: number) => Phaser.GameObjects.Image) {
    const spawn = FIXED_BUILDINGS.find(def => def.key === 'spawn')?.pos
    if (!spawn) return

    const aura = this.add.image(spawn.x, spawn.y + 32, 'glow.png', 0)
    aura.setBlendMode(Phaser.BlendModes.ADD)
    aura.setTint(0x8feeff)
    aura.setScale(8.4, 2.2)
    aura.setDepth(spawn.y - 18)
    aura.setAlpha(0.16)
    this.tweens.add({
      targets: aura,
      alpha: 0.26,
      scaleX: 9.2,
      scaleY: 2.5,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const inner = this.add.image(spawn.x, spawn.y - 8, 'glow.png', 0)
    inner.setBlendMode(Phaser.BlendModes.ADD)
    inner.setTint(0xd8fff4)
    inner.setScale(3.8, 3)
    inner.setDepth(spawn.y - 16)
    inner.setAlpha(0.12)
    this.tweens.add({
      targets: inner,
      angle: 360,
      duration: 12000,
      repeat: -1,
      ease: 'Linear',
    })

    for (const pos of SPAWN_LAMP_TILES) {
      const lamp = deco('lamp.png', pos.x * TILE + 16, pos.y * TILE - 2)
      this.lamps.push(lamp)
      this.addStreetLampGlow(lamp)
    }

    for (const p of [
      { x: spawn.x - 70, y: spawn.y + 26, tint: 0xfff09e },
      { x: spawn.x + 68, y: spawn.y + 24, tint: 0xff9ed2 },
      { x: spawn.x - 34, y: spawn.y + 76, tint: 0x9ed2ff },
      { x: spawn.x + 34, y: spawn.y + 78, tint: 0xffffff },
    ]) {
      const sparkle = this.add.sprite(p.x, p.y, 'effect_sparkle.png', 0)
      sparkle.setTint(p.tint)
      sparkle.setScale(0.85)
      sparkle.setDepth(94000)
      sparkle.setAlpha(0.72)
      sparkle.play('effect_sparkle.png:loop')
    }
  }

  private createWorkshopBayDecor() {
    for (let i = 0; i < WORKSHOP_SLOTS; i++) {
      const pos = workshopSlotPos(i)
      const row = Math.floor(i / WORKSHOP_COLS)
      const tint = row === 0 ? 0xffd36b : 0x72d8ff
      const pad = this.add.image(pos.x, pos.y + 38, 'glow.png', 0)
      pad.setBlendMode(Phaser.BlendModes.ADD)
      pad.setTint(tint)
      pad.setScale(3.4, 1.05)
      pad.setDepth(pos.y - 8)
      pad.setAlpha(0.12)
      this.tweens.add({
        targets: pad,
        alpha: 0.22,
        scaleX: 3.9,
        duration: 1800 + (i % 3) * 240,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      const beacon = this.add.sprite(pos.x + 34, pos.y - 42, 'effect_sparkle.png', 0)
      beacon.setTint(tint)
      beacon.setScale(row === 0 ? 0.72 : 0.82)
      beacon.setDepth(94000)
      beacon.setAlpha(0.58)
      beacon.play('effect_sparkle.png:loop')
    }
  }

  /** 灯泡发光之外，再把暖光投射到灯柱周围的路面。 */
  private addStreetLampGlow(lamp: Phaser.GameObjects.Image) {
    this.addNightGlow(lamp.x, lamp.y - 44, 0xffd477, 4.4, 0.62)
    this.addNightGlow(lamp.x, lamp.y - 2, 0xffbd5b, 12.5, 0.38, 4.5, 0.02)
  }

  /** 注册一个夜间发光点（ADD 混合，盖在夜色层之上，白天不可见）。 */
  private addNightGlow(
    x: number,
    y: number,
    color: number,
    scaleX: number,
    base: number,
    scaleY = scaleX,
    pulse = 0.12,
  ) {
    const img = this.add.image(x, y, 'glow.png', 0)
    img.setBlendMode(Phaser.BlendModes.ADD)
    img.setTint(color)
    img.setScale(scaleX, scaleY)
    img.setDepth(155000)
    img.setAlpha(0)
    this.nightGlows.push({ img, base, pulse, phase: Math.random() * Math.PI * 2 })
  }

  private spawnSmoke(x: number, y: number) {
    if (!this.introDone) return
    const s = this.add.sprite(x, y, 'effect_smoke.png', 0)
    s.setDepth(98000)
    s.play('effect_smoke.png:loop')
    this.tweens.add({ targets: s, y: y - 18, duration: 800, onComplete: () => s.destroy() })
  }

  private createBuildings() {
    for (const def of FIXED_BUILDINGS) {
      const sprite = this.add.sprite(def.pos.x, def.pos.y, def.sheet, 0)
      sprite.setOrigin(0.5, 0.55)
      sprite.setScale(def.scale)
      sprite.setDepth(def.pos.y + sprite.displayHeight * 0.4)
      sprite.setInteractive()
      sprite.setData('tooltip', () => this.buildingTooltip(def.key, def.label))
      sprite.setData('buildingKey', def.key)
      this.buildings.set(def.key, sprite)
    }
    this.buildings.get('spawn')?.play('building_spawn.png:loop')
  }

  private createCamera() {
    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD_W, WORLD_H)
    cam.setZoom(this.minZoom())
    cam.centerOn(WORLD_W / 2, WORLD_H / 2)
    cam.roundPixels = true

    let lastX = 0
    let lastY = 0
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.drawer?.isOpen) return
      this.camDragging = true
      this.camVx = 0
      this.camVy = 0
      lastX = p.x
      lastY = p.y
    })
    this.input.on('pointerup', () => {
      this.camDragging = false
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // 辅助管理员操控模式下相机跟随该角色，拖拽平移让位
      if (!this.camDragging || !p.isDown || this.draggingActor || this.governorMode) return
      if (this.drawer?.isOpen) return
      const dx = (p.x - lastX) / cam.zoom
      const dy = (p.y - lastY) / cam.zoom
      cam.scrollX -= dx
      cam.scrollY -= dy
      this.camVx = -dx
      this.camVy = -dy
      lastX = p.x
      lastY = p.y
    })
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), this.minZoom(), 2)
        cam.setZoom(next)
      },
    )
    // 容器尺寸变化（如侧栏折叠）后，若当前缩放已会露出图外则立即校正
    this.scale.on('resize', () => {
      if (cam.zoom < this.minZoom()) cam.setZoom(this.minZoom())
    })
  }

  /** 缩放下限 = 恰好铺满视口的缩放值，保证视野永远不超出地图 */
  private minZoom(): number {
    return Math.max(this.scale.width / WORLD_W, this.scale.height / WORLD_H)
  }

  // ---------------------------------------------------------------- 辅助管理员操控
  private createGovernor() {
    this.interactPrompt = this.add.text(0, 0, '按 F 交互', {
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontSize: '12px',
      color: '#fff7d6',
      backgroundColor: '#2a2410cc',
      padding: { x: 6, y: 2 },
    })
    this.interactPrompt.setOrigin(0.5, 1)
    this.interactPrompt.setDepth(200000)
    this.interactPrompt.setVisible(false)
  }

  private wireGovernorControls() {
    const kb = this.input.keyboard
    if (!kb) return
    // enableCapture=false：不 preventDefault，避免在底部面板输入框里打 WASD 被吞
    this.moveKeys = kb.addKeys('W,A,S,D', false) as Record<string, Phaser.Input.Keyboard.Key>
    kb.on('keydown-F', () => this.tryInteract())
    kb.on('keydown-G', () => {
      if (!this.isTextInputFocused()) this.setGovernorMode(!this.governorMode)
    })
    this.overlay.initGovernorButton(document.body, this.governorMode, active => this.setGovernorMode(active))
  }

  /** 当前可被操控的辅助管理员对应的 actor */
  private governorActor(): MemberActor | null {
    const m = this.snap?.members.find(x => x.role === 'assistant_admin' && x.lifecycle !== 'dead')
    if (!m) return null
    return this.actors.get(m.id) ?? null
  }

  /** 焦点是否在表单输入上（避免在面板里打字时误触 WSAD/F/G） */
  private isTextInputFocused(): boolean {
    const tag = document.activeElement?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  private setGovernorMode(on: boolean) {
    if (on === this.governorMode) return
    const cam = this.cameras.main
    if (on) {
      const gov = this.governorActor()
      if (!gov) {
        // 世界里没有辅助管理员可操控：提示并保持关闭
        this.overlay.flashGovernorHint('世界里暂无辅助管理员可操控')
        this.overlay.setGovernorActive(false)
        return
      }
      this.governorMode = true
      this.governorId = gov.memberId
      gov.setControlled(true)
      cam.stopFollow()
      cam.startFollow(gov, true, 0.12, 0.12)
      if (cam.zoom < 1) cam.zoomTo(Math.min(1.3, Math.max(1, cam.zoom)), 500, 'Sine.easeInOut')
    } else {
      this.governorMode = false
      const gov = this.governorId !== null ? this.actors.get(this.governorId) : null
      gov?.setControlled(false)
      this.governorId = null
      cam.stopFollow()
      this.interactPrompt.setVisible(false)
      this.nearestInteractId = null
    }
    this.overlay.setGovernorActive(this.governorMode)
  }

  /** 按 F：与最近的其它 AI 成员交互——在底部面板打开其信息 */
  private tryInteract() {
    if (!this.governorMode || this.isTextInputFocused()) return
    if (this.nearestInteractId === null || !this.snap) return
    const m = this.snap.members.find(x => x.id === this.nearestInteractId)
    if (!m) return
    this.cancelMemberLongPress()
    this.drawer.openMember(m, this.snap, this.portraitForMember(m))
    this.playSfx('ui_click', 0.4)
  }

  /** 每帧：把 WSAD 输入喂给辅助管理员 actor，并刷新"按 F 交互"提示 */
  private updateGovernor() {
    const gov = this.governorMode ? this.governorActor() : null
    // 辅助管理员离场（死亡/被删）→ 自动退出操控
    if (this.governorMode && !gov) {
      this.setGovernorMode(false)
      return
    }
    if (!gov) {
      this.interactPrompt.setVisible(false)
      this.nearestInteractId = null
      return
    }
    if (!this.isTextInputFocused() && this.moveKeys) {
      let dx = 0
      let dy = 0
      if (this.moveKeys.A?.isDown) dx -= 1
      if (this.moveKeys.D?.isDown) dx += 1
      if (this.moveKeys.W?.isDown) dy -= 1
      if (this.moveKeys.S?.isDown) dy += 1
      gov.setControlVelocity(dx, dy)
    } else {
      gov.setControlVelocity(0, 0)
    }

    // 交互提示：高亮最近的存活成员（排除受控辅助管理员自己）
    let best: MemberActor | null = null
    let bestDist = INTERACT_RANGE
    for (const actor of this.actors.values()) {
      if (actor === gov || actor.isDying) continue
      const d = Phaser.Math.Distance.Between(gov.x, gov.y, actor.x, actor.y)
      if (d < bestDist) {
        bestDist = d
        best = actor
      }
    }
    if (best) {
      this.nearestInteractId = best.memberId
      this.interactPrompt.setPosition(best.x, best.y - 92)
      this.interactPrompt.setVisible(true)
    } else {
      this.nearestInteractId = null
      this.interactPrompt.setVisible(false)
    }
  }

  /** 角色头像规格（上半身）：从成员皮肤纹理裁取 */
  private portraitForMember(m: WorldMember): PortraitSpec {
    return portraitSpecFor(urlForAsset, skinFor(m.role, m.id, m.skin), 0, 'character')
  }

  /** 建筑头像规格（上半身）：从建筑 sheet 第 0 帧裁取 */
  private portraitForBuilding(sheetFile: string): PortraitSpec {
    return portraitSpecFor(urlForAsset, sheetFile, 0, 'building')
  }

  private wireHover() {
    this.input.on(
      'gameobjectover',
      (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        if (this.drawer?.isOpen) return
        const data = this.tooltipFor(obj)
        if (data) {
          const ev = pointer.event as MouseEvent
          this.overlay.showTooltip(data, ev.clientX ?? pointer.x, ev.clientY ?? pointer.y)
        }
      },
    )
    this.input.on(
      'gameobjectmove',
      (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        if (this.drawer?.isOpen) return
        const data = this.tooltipFor(obj)
        if (data) {
          const ev = pointer.event as MouseEvent
          this.overlay.showTooltip(data, ev.clientX ?? pointer.x, ev.clientY ?? pointer.y)
        }
      },
    )
    this.input.on('gameobjectout', () => this.overlay.hideTooltip())
  }

  private cancelMemberLongPress() {
    this.memberLongPressTimer?.remove(false)
    this.memberLongPressTimer = null
    this.memberLongPressId = null
  }

  private wireClickAndDrag() {
    this.input.dragDistanceThreshold = 8

    // 成员按下：启动 500ms 长按计时，时间到前松手则正常开抽屉，持续按住则打开聊天
    this.input.on(
      'gameobjectdown',
      (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        if (!(obj instanceof MemberActor) || obj.isDying) return
        this.cancelMemberLongPress()
        this.memberLongPressId = obj.memberId
        this.memberLongPressTimer = this.time.delayedCall(500, () => {
          if (this.memberLongPressId !== obj.memberId) return
          this.cancelMemberLongPress()
          this.drawer.close()
          this.openMemberChat(obj.memberId)
          this.playSfx('ui_click', 0.5)
        })
      },
    )

    // 成员/建筑/作坊抬起：单击开抽屉
    this.input.on(
      'gameobjectup',
      (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        // 抽屉已打开时仍允许点击其它成员/建筑切换面板（抽屉只占右侧，不挡左侧地图）
        if (this.draggingActor) return
        const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY)
        if (dist >= 8 || !this.snap) return
        this.playSfx('ui_click', 0.4)
        if (obj instanceof MemberActor) {
          this.cancelMemberLongPress()
          const m = this.snap.members.find(x => x.id === obj.memberId)
          if (m) this.drawer.openMember(m, this.snap, this.portraitForMember(m))
          return
        }
        const deviceId = obj.getData?.('deviceId') as string | undefined
        if (deviceId) {
          const view = this.workshops.get(deviceId)
          const portrait = view ? this.portraitForBuilding(view.sprite.texture.key) : null
          this.drawer.openWorkshop(deviceId, this.snap, portrait)
          return
        }
        const key = obj.getData?.('buildingKey') as string | undefined
        if (key === 'library') this.drawer.openLibrary(this.snap, this.portraitForBuilding('building_library.png'))
        else if (key === 'spawn') this.drawer.openSpawn(this.snap, this.portraitForBuilding('building_spawn.png'))
        if (key) {
          const bSprite = this.buildings.get(key)
          if (bSprite) {
            const sx = bSprite.scaleX
            const sy = bSprite.scaleY
            this.tweens.add({
              targets: bSprite,
              scaleX: sx * 0.92,
              scaleY: sy * 0.92,
              duration: 75,
              yoyo: true,
              ease: 'Sine.easeOut',
              onComplete: () => { bSprite.scaleX = sx; bSprite.scaleY = sy },
            })
          }
        }
      },
    )

    // 拖拽成员 → 放到作坊上绑定 / 放到出生地解绑
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.drawer?.isOpen) return
      if (obj instanceof MemberActor && !obj.isDying) {
        this.cancelMemberLongPress()
        this.draggingActor = obj
        obj.beginDrag()
        this.overlay.hideTooltip()
      }
    })
    this.input.on(
      'drag',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        if (obj instanceof MemberActor && obj === this.draggingActor) {
          obj.x = dragX
          obj.y = dragY
          this.updateDragHighlight(dragX, dragY)
        }
      },
    )
    this.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (!(obj instanceof MemberActor) || obj !== this.draggingActor) return
      this.draggingActor = null
      this.clearDragHighlight()
      const drop = this.resolveDropTarget(obj.x, obj.y)
      obj.endDrag()
      if (!drop || !this.snap) return
      const member = this.snap.members.find(item => item.id === obj.memberId)
      if (member) applyMemberDropBinding(member, drop, this.snap, () => this.store.refreshNow())
    })
  }

  /** 拖放落点 → 作坊 / 出生地 */
  private resolveDropTarget(x: number, y: number): DropTarget | null {
    for (const [deviceId, view] of this.workshops) {
      if (view.offlineSince !== null) continue
      if (Phaser.Math.Distance.Between(x, y, view.sprite.x, view.sprite.y) < 70) {
        return { kind: 'workshop', deviceId }
      }
    }
    const spawn = this.buildings.get('spawn')
    if (spawn && Phaser.Math.Distance.Between(x, y, spawn.x, spawn.y) < 90) return { kind: 'spawn' }
    return null
  }

  /** 拖拽进行中：高亮当前悬停的有效落点 */
  private updateDragHighlight(x: number, y: number) {
    const target = this.resolveDropTarget(x, y)
    const newDeviceId = target?.kind === 'workshop' ? target.deviceId : null
    const newSpawn = target?.kind === 'spawn'

    if (newDeviceId !== this.dragHoveredDeviceId) {
      if (this.dragHoveredDeviceId) this.workshops.get(this.dragHoveredDeviceId)?.sprite.clearTint()
      this.dragHoveredDeviceId = newDeviceId
      if (newDeviceId) this.workshops.get(newDeviceId)?.sprite.setTint(0xffd36b)
    }
    if (newSpawn !== this.dragHoveredSpawn) {
      if (this.dragHoveredSpawn) this.buildings.get('spawn')?.clearTint()
      this.dragHoveredSpawn = newSpawn
      if (newSpawn) this.buildings.get('spawn')?.setTint(0x8feeff)
    }
  }

  /** 拖拽结束：清除所有落点高亮 */
  private clearDragHighlight() {
    if (this.dragHoveredDeviceId) {
      this.workshops.get(this.dragHoveredDeviceId)?.sprite.clearTint()
      this.dragHoveredDeviceId = null
    }
    if (this.dragHoveredSpawn) {
      this.buildings.get('spawn')?.clearTint()
      this.dragHoveredSpawn = false
    }
  }

  private tooltipFor(obj: Phaser.GameObjects.GameObject): TooltipData | null {
    if (obj instanceof MemberActor) return this.memberTooltip(obj.member)
    const fn = obj.getData?.('tooltip') as (() => TooltipData) | undefined
    return fn ? fn() : null
  }

  // ---------------------------------------------------------------- 快照消费
  private applySnapshot(snap: WorldSnapshot) {
    this.snap = snap
    this.updateHud(snap)
    // 首个有效快照（成功或明确失败）→ 揭幕：镜头拉近 + 云层散开
    if (snap.authOk || snap.lastError) this.revealWorld()
    if (!snap.authOk) return
    this.reconcileWorkshops(snap)
    this.reconcileMembers(snap)
    this.updateBuildingStates(snap)
  }

  private reconcileMembers(snap: WorldSnapshot) {
    const seen = new Set<number>()
    for (const m of snap.members) {
      seen.add(m.id)
      const existing = this.actors.get(m.id)
      if (m.lifecycle === 'dead') {
        // 死亡：在场则演出后移除；不在场（进图前已死）不再创建
        if (existing && !existing.isDying) existing.die(() => this.actors.delete(m.id))
        continue
      }
      const skin = skinFor(m.role, m.id, m.skin)
      const zone = this.anchorFor(m)
      let actor = existing
      if (actor) {
        actor.setMember(m, skin)
        actor.setAnchor(zone)
      } else {
        actor = new MemberActor(this, m, skin, zone)
        actor.setMember(m, skin)
        this.input.setDraggable(actor)
        this.actors.set(m.id, actor)
      }
      this.playTransitions(m, actor)
    }
    // 配置被删除的成员：同走移除演出
    for (const [id, actor] of this.actors) {
      if (!seen.has(id) && !actor.isDying) actor.die(() => this.actors.delete(id))
    }
  }

  /** 轮询触发版事件演出：传承重生光效 */
  private playTransitions(m: WorldMember, actor: MemberActor) {
    const prevGen = this.prevGeneration.get(m.id)
    if (prevGen !== undefined && m.generation > prevGen) {
      // 传承重生：出生地与成员脚下各放一圈火花
      const spawn = this.buildings.get('spawn')
      if (spawn) this.burstSparkle(spawn.x, spawn.y - 20)
      this.burstSparkle(actor.x, actor.y - 24)
    }
    this.prevGeneration.set(m.id, m.generation)
  }

  private burstSparkle(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const s = this.add.sprite(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30, 'effect_sparkle.png', 0)
      s.setDepth(99000)
      s.play('effect_sparkle.png:loop')
      this.time.delayedCall(600 + i * 150, () => s.destroy())
    }
  }

  /** §4.3 锚区规则：自上而下取第一条命中 */
  private anchorFor(m: WorldMember): Rect {
    if (m.role === 'core_admin') return ZONES.plaza
    if (m.role === 'librarian') return ZONES.library
    if (m.role === 'assistant_admin') return ZONES.wanderAll
    const boundAgent = m.boundAgentIds.find(id => this.workshops.get(id)?.offlineSince === null)
    if (boundAgent !== undefined) {
      const view = this.workshops.get(boundAgent)
      if (view) return view.data.type === 'workshop' ? ZONES.library : workshopZone(view.slot)
    }
    // 已绑定作坊但全部离线时，成员回到出生地等待重连。
    const hasOfflineBinding = m.boundAgentIds.length > 0
      || [...this.workshops.values()].some(view => view.offlineSince !== null && view.data.aiConfigId === m.id)
    if (hasOfflineBinding) return ZONES.spawn
    if (!m.projectId || m.lifecycle === 'learning') return ZONES.spawn
    return ZONES.wanderAll
  }

  private reconcileWorkshops(snap: WorldSnapshot) {
    const seen = new Set<string>()
    for (const w of snap.workshops) {
      seen.add(w.deviceId)
      let view = this.workshops.get(w.deviceId)
      if (!view) {
        const slot = w.type === 'workshop' ? -1 : this.claimSlot(w.deviceId)
        const pos = w.type === 'workshop' ? LIBRARY_DEVICE_POS : workshopSlotPos(slot)
        const sheet = workshopSheetForType(w.type)
        const taskGlow = this.add.image(pos.x, pos.y - 24, 'glow.png', 0)
        taskGlow.setBlendMode(Phaser.BlendModes.ADD)
        taskGlow.setTint(workshopGlowTintForType(w.type))
        taskGlow.setScale(6.8, 5.2)
        // 夜幕遮罩 depth=150000；任务高光需要位于其上方才不会在夜间消失。
        taskGlow.setDepth(155100)
        taskGlow.setAlpha(0)
        const sprite = this.add.sprite(pos.x, pos.y, sheet, 0)
        sprite.setOrigin(0.5, 0.6)
        sprite.setScale(w.type === 'workshop' ? LIBRARY_DEVICE_SCALE : WORKSHOP_SCALE)
        sprite.setDepth(pos.y)
        sprite.setInteractive()
        view = {
          sprite,
          taskGlow,
          slot,
          data: w,
          offlineSince: w.online ? null : Date.now(),
          taskActive: false,
          glowPhase: Math.random() * Math.PI * 2,
        }
        const captured = view
        sprite.setData('tooltip', () => this.workshopTooltip(captured))
        sprite.setData('deviceId', w.deviceId)
        this.workshops.set(w.deviceId, view)
        if (!w.online) sprite.setTint(w.lifecycle === 'waiting' ? 0xb9c4d8 : 0x8a8a8a)
      }
      view.data = w
      if (w.online && view.offlineSince !== null) {
        view.offlineSince = null
        view.sprite.clearTint()
      } else if (!w.online && view.offlineSince === null) {
        view.offlineSince = Date.now()
        view.sprite.stop()
        view.sprite.setFrame(0)
        view.sprite.setTint(w.lifecycle === 'waiting' ? 0xb9c4d8 : 0x8a8a8a)
      }
      // 动效：绑定成员在干活 or agent 正在执行任务
      const boundMember = snap.members.find(m => m.id === w.aiConfigId)
      const active = workshopIsActive(w, boundMember)
      view.taskActive = !!active
      if (!active) view.taskGlow.setAlpha(0)
      const animKey = `${view.sprite.texture.key}:loop`
      if (active) {
        if (view.sprite.anims.currentAnim?.key !== animKey || !view.sprite.anims.isPlaying) {
          view.sprite.play(animKey)
        }
      } else {
        view.sprite.stop()
        view.sprite.setFrame(0)
      }
    }
    // 掉线：变灰保留 60s 再拆除
    const now = Date.now()
    for (const [deviceId, view] of this.workshops) {
      if (seen.has(deviceId)) continue
      if (view.offlineSince === null) {
        view.offlineSince = now
        view.sprite.stop()
        view.sprite.setFrame(0)
        view.sprite.setTint(0x8a8a8a)
      } else if (now - view.offlineSince > OFFLINE_KEEP_MS) {
        view.taskGlow.destroy()
        view.sprite.destroy()
        this.releaseSlot(deviceId)
        this.workshops.delete(deviceId)
      }
    }
  }

  private claimSlot(deviceId: string): number {
    const free = this.slotOwner.findIndex(o => o === null)
    if (free >= 0) {
      this.slotOwner[free] = deviceId
      return free
    }
    // 插槽用尽：街道向东延伸
    this.slotOwner.push(deviceId)
    return this.slotOwner.length - 1
  }

  private releaseSlot(deviceId: string) {
    const i = this.slotOwner.indexOf(deviceId)
    if (i >= 0) this.slotOwner[i] = null
  }

  private updateBuildingStates(_snap: WorldSnapshot) {}

  private openMemberChat(id: number) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'world:open-chat', aiConfigId: id }, window.location.origin)
    } else {
      window.open('/', '_blank', 'noopener')
    }
  }

  // ---------------------------------------------------------------- tooltip / HUD
  private memberTooltip(m: WorldMember): TooltipData {
    return memberTooltipData(m)
  }

  private workshopTooltip(view: WorkshopView): TooltipData {
    const w = view.data
    const bound = this.snap?.members.find(m => m.id === w.aiConfigId)
    return workshopTooltipData(view, bound)
  }

  private buildingTooltip(key: string, label: string): TooltipData {
    return buildingTooltipData(key, label, this.snap)
  }

  private updateHud(snap: WorldSnapshot) {
    this.overlay.setHud(hudHtml(snap, clockLabel(window.location.search, this.worldHour)))
  }

  // ---------------------------------------------------------------- 主循环
  update(time: number, delta: number) {
    // 相机惯性：松手后以 0.88/frame 指数衰减
    if (!this.camDragging && !this.governorMode && !this.drawer?.isOpen) {
      if (Math.abs(this.camVx) > 0.15 || Math.abs(this.camVy) > 0.15) {
        this.cameras.main.scrollX += this.camVx
        this.cameras.main.scrollY += this.camVy
        this.camVx *= 0.88
        this.camVy *= 0.88
      } else {
        this.camVx = 0
        this.camVy = 0
      }
    }

    for (const actor of this.actors.values()) {
      const stationary = this.drawer.activeMemberId === actor.memberId || this.chatMemberId === actor.memberId
      actor.setStationary(stationary)
      actor.tick(time, delta)
    }
    this.updateGovernor()
    // 执行任务的作坊：在昼夜环境中保持柔和、可辨识的呼吸高光。
    for (const view of this.workshops.values()) {
      if (!view.taskActive || view.offlineSince !== null) {
        view.taskGlow.setAlpha(0)
        continue
      }
      const pulse = 0.5 + 0.5 * Math.sin(time / 230 + view.glowPhase)
      const nightBoost = this.nightness * 0.08
      view.taskGlow.setAlpha(0.18 + pulse * 0.2 + nightBoost)
      view.taskGlow.setScale(6.4 + pulse * 1.2, 4.9 + pulse * 0.9)
    }
    // 蝴蝶：白天飘向目标 + 正弦浮动（夜间隐去休息）
    const day = 1 - this.nightness
    for (const b of this.butterflies) {
      b.sprite.setAlpha(day)
      if (day < 0.05) continue
      const dx = b.tx - b.sprite.x
      const dy = b.ty - b.sprite.y
      const dist = Math.hypot(dx, dy)
      if (dist < 6) {
        b.tx = 120 + Math.random() * (WORLD_W - 240)
        b.ty = 120 + Math.random() * (WORLD_H - 240)
      } else {
        const step = (26 * delta) / 1000
        b.sprite.x += (dx / dist) * step
        b.sprite.y += (dy / dist) * step + Math.sin(time / 260 + b.phase) * 0.45
        b.sprite.setFlipX(dx < 0)
      }
    }
    // 夜间灯光光晕：呼吸式微闪
    for (const g of this.nightGlows) {
      g.img.setAlpha(this.nightness * (g.base + g.pulse * Math.sin(time / 480 + g.phase)))
    }
    // 萤火虫：夜间游移 + 呼吸闪烁，碰到边界反弹
    if (this.nightness > 0.05) {
      for (const f of this.fireflies) {
        f.img.x += (f.vx * delta) / 1000
        f.img.y += (f.vy * delta) / 1000 + Math.sin(time / 300 + f.phase) * 0.3
        if (f.img.x < 100 || f.img.x > WORLD_W - 100) f.vx *= -1
        if (f.img.y < 100 || f.img.y > WORLD_H - 100) f.vy *= -1
        const blink = 0.35 + 0.65 * Math.max(0, Math.sin(time / 700 + f.phase * 3))
        f.img.setAlpha(this.nightness * blink * 0.9)
      }
    } else {
      for (const f of this.fireflies) f.img.setAlpha(0)
    }
  }
}
