/**
 * 数字成员 Actor：精灵 + 头顶表情气泡 + 行为状态机。
 *
 * 状态机（见设计方案 §4.2）：idle ⇄ wander(walkTo)；目标锚区由场景按 §4.3 规则
 * 计算后通过 setAnchor 下发，Actor 只负责"平滑走过去 + 区内游荡"。
 * 死亡：collapse 姿态 → 渐隐移除（由场景驱动）。
 */
import Phaser from 'phaser'
import { EMOTES } from '../assetManifest'
import { clampToWorld, randomPointIn, type Point, type Rect } from '../world/layout'
import { isWorldBlocked } from '../world/map'
import type { WorldMember } from '../world/store'
import { speechPreview } from '../world/format'

const WALK_SPEED = 34 // px/s（放慢步伐，整体更从容）
const CONTROL_SPEED = 150 // px/s，玩家操控辅助管理员时的移动速度
const ARRIVE_EPS = 4
const STUCK_MS = 1400 // 朝目标方向超过该时长无明显靠近 → 判定被障碍挡死，换新目标
const HITBOX_W = 44
const HITBOX_H = 70
const HITBOX_TOP = -68
const TOKEN_BAR_W = 34
const TOKEN_BAR_H = 5
const SPEECH_W = 260
const SHADOW_RX = 18
const SHADOW_RY = 6
// 挎包腰侧定位（scale=1 基准）：
//   SIDE_X   — 正/背面（down/up）时挂在腰侧的横向偏移
//   PROFILE_X— 侧面（left/right）时身体很窄，挎包与身体重叠，仅做小幅偏移点出近侧胯
//   DROP_Y   — 相对精灵中心的下垂量
const BAG_SIDE_X = 11
const BAG_PROFILE_X = 3
const BAG_DROP_Y = 8

const walkablePointIn = (zone: Rect): Point => {
  for (let i = 0; i < 16; i++) {
    const p = clampToWorld(randomPointIn(zone))
    if (!isWorldBlocked(p)) return p
  }
  return clampToWorld(randomPointIn(zone))
}

const blockedAwareStep = (from: Point, dx: number, dy: number): Point | null => {
  // 已身处障碍内部（被拖拽丢进喷泉/水池，或异常落点）：直接朝目标迈步逃离。
  // 否则每个微小步都仍在障碍内 → 永远 null → 永久卡死。
  if (isWorldBlocked(from)) return clampToWorld({ x: from.x + dx, y: from.y + dy })

  const next = clampToWorld({ x: from.x + dx, y: from.y + dy })
  if (!isWorldBlocked(next)) return next

  const slideX = clampToWorld({ x: from.x + dx, y: from.y })
  if (!isWorldBlocked(slideX)) return slideX

  const slideY = clampToWorld({ x: from.x, y: from.y + dy })
  if (!isWorldBlocked(slideY)) return slideY

  return null
}

export type EmoteKind = keyof typeof EMOTES | null

/** 外观自定义（WorldActorMeta）：调色 / 体型 / 光环 */
export interface ActorAppearance {
  tint: string
  scale: number
  aura: string
}

const hexToColor = (hex: string): number | null => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  return parseInt(hex.slice(1), 16)
}

export class MemberActor extends Phaser.GameObjects.Container {
  readonly memberId: number
  member: WorldMember
  /** 上一次渲染所依据的成员数据：用于 setMember 跳过无变化的 Graphics 重绘 */
  private prevRender: WorldMember | null = null
  private shadow: Phaser.GameObjects.Graphics
  private sprite: Phaser.GameObjects.Sprite
  private bag: Phaser.GameObjects.Image
  /**
   * 工具箱夜间光晕：scene 级对象（非 Container 子节点），depth 高于夜幕遮罩
   * (150000) 才能在夜里照亮四周；每帧跟随角色腰侧，白天隐藏。
   */
  private bagGlow: Phaser.GameObjects.Image
  /** 当前世界夜色程度（0=白天，1=深夜），由场景每帧下发 */
  private nightness = 0
  private tokenBar: Phaser.GameObjects.Graphics
  private nameTag: Phaser.GameObjects.Text
  private emote: Phaser.GameObjects.Image
  private speechBubble: Phaser.GameObjects.Graphics
  private speechText: Phaser.GameObjects.Text
  private aura: Phaser.GameObjects.Image
  private auraOn = false
  private auraPhase = Math.random() * Math.PI * 2
  private skin: string
  private zone: Rect
  private target: Point | null = null
  private via: Point | null = null
  private idleUntil = 0
  // 进展跟踪：检测"朝目标走却被障碍长期挡住"，避免在喷泉/水池边缘原地打转
  private progressTarget: Point | null = null
  private progressBest = Infinity
  private progressSince = 0
  /** 当前待机小动作的结束时间戳（到期后换下一个活动） */
  private idlePhaseUntil = 0
  private dying = false
  private dragging = false
  /** Y 轴弹跳 tween（高兴/活跃待机时播放） */
  private bobTween: Phaser.Tweens.Tween | null = null
  /** 玩家接管辅助管理员：停止自治游荡，改由 WSAD 驱动；不显示血条 */
  private controlled = false
  private stationary = false
  private controlVx = 0
  private controlVy = 0
  private controlFacing: 'down' | 'up' | 'left' | 'right' = 'down'
  /** 角色当前朝向：驱动挎包挂在身体哪一侧（转身时同步切换） */
  private facing: 'down' | 'up' | 'left' | 'right' = 'down'

  constructor(scene: Phaser.Scene, member: WorldMember, skin: string, zone: Rect) {
    const start = walkablePointIn(zone)
    super(scene, start.x, start.y)
    this.memberId = member.id
    this.member = member
    this.skin = skin
    this.zone = zone

    // 脚下椭圆阴影（最底层渲染）
    this.shadow = scene.add.graphics()
    this.shadow.fillStyle(0x000000, 0.2)
    this.shadow.fillEllipse(0, 0, SHADOW_RX * 2, SHADOW_RY * 2)
    this.add(this.shadow)

    // 光环垫在角色脚下（ADD 混合），由外观自定义开关
    this.aura = scene.add.image(0, -6, 'glow.png', 0)
    this.aura.setBlendMode(Phaser.BlendModes.ADD)
    this.aura.setVisible(false)
    this.add(this.aura)

    this.sprite = scene.add.sprite(0, -24, skin, 0)
    this.sprite.setOrigin(0.5, 0.5)
    this.add(this.sprite)

    // 工具箱挎包（挂在角色腰侧，绑定工具箱时显示）。中心 origin 便于随朝向左右镜像。
    this.bag = scene.add.image(BAG_SIDE_X, -24 + BAG_DROP_Y, 'effect_toolbox_bag.png', 0)
    this.bag.setOrigin(0.5, 0.5)
    this.bag.setVisible(false)
    this.add(this.bag)

    // 工具箱暖光：跟随角色的独立 scene 对象，盖在夜幕之上照亮四周
    this.bagGlow = scene.add.image(start.x, start.y, 'glow.png', 0)
    this.bagGlow.setBlendMode(Phaser.BlendModes.ADD)
    this.bagGlow.setTint(0xffcf8a)
    this.bagGlow.setScale(3.0, 2.1)
    this.bagGlow.setDepth(155050)
    this.bagGlow.setAlpha(0)
    this.bagGlow.setVisible(false)

    this.applyAppearance(member)
    this.refreshBag()

    this.tokenBar = scene.add.graphics()
    this.add(this.tokenBar)

    // 头顶名牌（在 emote 下方渲染，emote 会遮盖在上方）
    this.nameTag = scene.add.text(0, -52, member.name || `#${member.id}`, {
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontSize: '10px',
      color: '#eef2ff',
      backgroundColor: '#0f1420cc',
      padding: { x: 4, y: 2 },
    })
    this.nameTag.setOrigin(0.5, 0)
    this.add(this.nameTag)

    this.emote = scene.add.image(0, -84, 'emotes.png', 0)
    this.emote.setVisible(false)
    this.add(this.emote)

    this.speechBubble = scene.add.graphics()
    this.speechBubble.setVisible(false)
    this.add(this.speechBubble)

    this.speechText = scene.add.text(0, 0, '', {
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontSize: '11px',
      color: '#20242c',
      lineSpacing: 2,
      wordWrap: { width: SPEECH_W - 16, useAdvancedWrap: true },
    })
    this.speechText.setVisible(false)
    this.add(this.speechText)

    this.setSize(HITBOX_W, HITBOX_H)
    // Container 命中测试会把本地坐标加 displayOrigin，hitArea 需使用校正后的坐标。
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, HITBOX_TOP + HITBOX_H / 2, HITBOX_W, HITBOX_H),
      Phaser.Geom.Rectangle.Contains,
    )
    scene.add.existing(this)
  }

  get isDying(): boolean {
    return this.dying
  }

  /** 让成员途经某点后回到锚区（世界事件演出用）。 */
  walkVia(p: Point) {
    if (this.dying || this.dragging) return
    this.via = clampToWorld(p)
    this.target = this.via
    this.idleUntil = 0
  }

  beginDrag() {
    if (this.dying) return
    this.dragging = true
    this.target = null
    this.via = null
    this.stopBob()
    this.sprite.stop()
    this.sprite.setFrame(0)
    this.setAlpha(0.85)
  }

  endDrag() {
    this.dragging = false
    this.setAlpha(this.member.enabled ? 1 : 0.75)
    // 回到锚区（从拖放点走回去，调度可见）
    this.target = walkablePointIn(this.zone)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  /** 玩家接管 / 释放。接管时停止游荡并隐藏血条，释放后回锚区。 */
  setControlled(on: boolean) {
    if (this.controlled === on) return
    this.controlled = on
    this.controlVx = 0
    this.controlVy = 0
    if (on) {
      this.target = null
      this.via = null
      this.stopBob()
      this.sprite.stop()
      this.sprite.setFrame(0)
      this.setAlpha(1)
    } else {
      this.target = walkablePointIn(this.zone)
      this.idleUntil = 0
    }
    this.refreshTokenBar()
  }

  get isControlled(): boolean {
    return this.controlled
  }

  /** 交互或对话期间原地驻足，结束后恢复自治游荡。 */
  setStationary(on: boolean) {
    if (this.stationary === on) return
    this.stationary = on
    if (on) {
      this.target = null
      this.via = null
      this.stopBob()
      this.sprite.stop()
      this.sprite.setFrame(0)
    } else if (!this.controlled && this.member.enabled) {
      this.target = walkablePointIn(this.zone)
      this.idleUntil = 0
    }
  }

  /** WSAD 合成的单位方向（0 = 停） */
  setControlVelocity(dx: number, dy: number) {
    this.controlVx = dx
    this.controlVy = dy
  }

  private isOnScreen(): boolean {
    const view = this.scene.cameras.main.worldView
    return (
      this.x > view.x - 64 && this.x < view.right + 64 &&
      this.y > view.y - 64 && this.y < view.bottom + 64
    )
  }

  setMember(member: WorldMember, skin: string) {
    // 轮询频繁（任务中每 1.2s），多数字段不变：逐项脏检查，跳过昂贵的 Graphics 重绘。
    const prev = this.prevRender
    this.prevRender = member
    this.member = member
    if (skin !== this.skin) {
      this.skin = skin
      this.sprite.stop()
      this.sprite.setTexture(skin, 0)
    }
    if (!prev || prev.name !== member.name || prev.enabled !== member.enabled) {
      this.nameTag.setText(member.name || `#${member.id}`)
      this.nameTag.setAlpha(member.enabled ? 1 : 0.55)
    }
    // 外观（调色/体型/光环）变化才重绘阴影/缩放/光环（applyAppearance 含 stopBob，跳过可保留弹跳）
    if (!prev || prev.tint !== member.tint || prev.scale !== member.scale || prev.aura !== member.aura) {
      this.applyAppearance(member)
    }
    this.refreshBag()
    this.refreshEmote()
    // 血条仅在 token 用量/上限变化时重绘
    if (!prev || prev.tokensUsed !== member.tokensUsed || prev.tokenLimit !== member.tokenLimit) {
      this.refreshTokenBar()
    }
    this.refreshSpeechBubble()
    // 停用：原地坐下打瞌睡
    if (!member.enabled && !this.dying) {
      this.target = null
      this.stopBob()
      this.sprite.stop()
      this.sprite.setFrame(17) // sit
      this.sprite.setAlpha(0.75)
    } else {
      this.sprite.setAlpha(1)
    }
  }

  /** 应用外观自定义（调色 / 体型 / 光环）；抽屉调参时也用于实时预览 */
  applyAppearance(a: ActorAppearance) {
    this.stopBob() // 体型/位置变化前先停弹跳，避免 tween 与 y 赋值冲突
    const tint = hexToColor(a.tint)
    if (tint !== null) this.sprite.setTint(tint)
    else this.sprite.clearTint()

    const scale = Phaser.Math.Clamp(Number.isFinite(a.scale) && a.scale > 0 ? a.scale : 1, 0.7, 1.4)
    this.sprite.setScale(scale)
    this.sprite.y = -24 * scale // 体型变化时保持脚底贴地
    this.bag.setScale(scale)
    this.applyBagSide() // 随体型/朝向更新挎包横向偏移与镜像
    // 阴影随体型缩放
    this.shadow.clear()
    this.shadow.fillStyle(0x000000, 0.2)
    this.shadow.fillEllipse(0, 0, SHADOW_RX * 2 * scale, SHADOW_RY * 2 * scale)

    const auraColor = hexToColor(a.aura)
    this.auraOn = auraColor !== null
    if (auraColor !== null) {
      this.aura.setTint(auraColor)
      this.aura.setScale(1.6 * scale, 0.9 * scale)
      this.aura.setVisible(true)
    } else {
      this.aura.setVisible(false)
    }
  }

  /**
   * 抽屉外观预览（未落库）：套用调色/体型/光环并使渲染缓存失效，
   * 确保下次快照即便字段未变也会重绘，恢复已保存外观。
   */
  previewAppearance(a: ActorAppearance) {
    this.applyAppearance(a)
    this.prevRender = null
  }

  /** 预览皮肤贴图（抽屉换肤未保存时的所见即所得） */
  previewSkin(skin: string) {
    if (skin === this.skin || this.dying) return
    this.skin = skin
    this.sprite.stop()
    this.sprite.setTexture(skin, 0)
  }

  setAnchor(zone: Rect) {
    if (zone === this.zone) return
    this.zone = zone
    // 玩家接管时不被锚区拉走
    if (this.controlled || this.stationary) return
    // 锚区变化：走过去（不瞬移，让调度可见）
    this.target = walkablePointIn(zone)
    this.idleUntil = 0
  }

  private refreshBag() {
    this.bag.setVisible(!!this.member.hasToolbox && this.member.enabled && !this.dying)
  }

  /** 转身：更新朝向并把挎包挂到对应身体侧（仅在朝向变化时重排，避免每帧抖动）。 */
  private setFacing(dir: 'down' | 'up' | 'left' | 'right') {
    if (this.facing === dir) return
    this.facing = dir
    this.applyBagSide()
  }

  /**
   * 依据朝向决定挎包挂在身体哪一侧：
   *   down  — 正面：挂右胯，偏到腰侧
   *   up    — 背面：收拢到背后偏左、置于精灵之下
   *   left  — 侧面朝左：与身体重叠，水平镜像，仅小幅偏向近侧胯
   *   right — 侧面朝右：与身体重叠，仅小幅偏向近侧胯
   * 侧面时身体很窄，挎包必须与人物重叠显示在侧边，而不是浮在前/后方。
   */
  private applyBagSide() {
    const scale = this.sprite.scaleX || 1
    switch (this.facing) {
      case 'left':
        this.bag.x = -BAG_PROFILE_X * scale
        this.bag.setFlipX(true)
        this.moveAbove(this.bag, this.sprite)
        break
      case 'right':
        this.bag.x = BAG_PROFILE_X * scale
        this.bag.setFlipX(false)
        this.moveAbove(this.bag, this.sprite)
        break
      case 'up':
        this.bag.x = -BAG_SIDE_X * 0.55 * scale
        this.bag.setFlipX(false)
        this.moveBelow(this.bag, this.sprite) // 背面：挎包藏到精灵身后
        break
      default: // down
        this.bag.x = BAG_SIDE_X * scale
        this.bag.setFlipX(false)
        this.moveAbove(this.bag, this.sprite)
        break
    }
  }

  private refreshEmote() {
    if (Date.now() < this.emoteOverrideUntil) return
    const m = this.member
    let kind: EmoteKind = null
    if (m.taskStatus === 'running') kind = null
    else if (!m.enabled) kind = 'zzz'
    else if (m.tokenLimit > 0 && m.tokensUsed / m.tokenLimit >= 0.9) kind = 'hourglass'
    else if (m.runtimeStatus === 'running') kind = 'scroll'
    else if (m.runtimeStatus === 'error') kind = 'alert'
    if (kind === null) {
      this.emote.setVisible(false)
    } else {
      this.emote.setFrame(EMOTES[kind])
      this.emote.setVisible(true)
    }
  }

  private refreshTokenBar() {
    const g = this.tokenBar
    g.clear()
    const m = this.member
    // 受控角色或无 token 上限的角色：不显示血条
    if (this.controlled || m.tokenLimit <= 0) return
    const x = -TOKEN_BAR_W / 2
    const y = -66
    g.fillStyle(0x1f2933, 0.86)
    g.fillRect(x - 1, y - 1, TOKEN_BAR_W + 2, TOKEN_BAR_H + 2)

    const usedRatio = Phaser.Math.Clamp(m.tokensUsed / m.tokenLimit, 0, 1)
    const remainingRatio = 1 - usedRatio
    const color = remainingRatio > 0.45 ? 0x45c46f : remainingRatio > 0.18 ? 0xf4b942 : 0xef5b5b
    g.fillStyle(0x0f141b, 0.95)
    g.fillRect(x, y, TOKEN_BAR_W, TOKEN_BAR_H)
    g.fillStyle(color, 0.98)
    g.fillRect(x, y, Math.max(1, TOKEN_BAR_W * remainingRatio), TOKEN_BAR_H)
  }

  private refreshSpeechBubble() {
    if (Date.now() < this.speechOverrideUntil) return
    const taskRunning = this.member.taskStatus === 'running'
    const text = speechPreview(this.member.latestSpeech)
    const visible = taskRunning && !!text && this.member.enabled && !this.dying
    this.speechBubble.setVisible(visible)
    this.speechText.setVisible(visible)
    if (!visible) return

    this.speechText.setText(text)
    const h = Math.max(28, this.speechText.height + 14)
    const x = -SPEECH_W / 2
    const y = -94 - h
    this.speechText.setPosition(x + 9, y + 7)

    const g = this.speechBubble
    g.clear()
    g.fillStyle(0xffffff, 0.97)
    g.fillRoundedRect(x, y, SPEECH_W, h, 7)
    g.lineStyle(2, 0x6d5bd0, 0.62)
    g.strokeRoundedRect(x, y, SPEECH_W, h, 7)
    g.fillStyle(0xffffff, 0.97)
    g.fillTriangle(-8, y + h - 1, 0, y + h + 10, 8, y + h - 1)
  }

  private emoteOverrideUntil = 0
  private speechOverrideUntil = 0

  /**
   * 收信时临时显示消息内容气泡（任务进行中不触发，避免覆盖推理输出）。
   * 到期后自动恢复原气泡状态。
   */
  showReceivedMessage(text: string, durationMs = 2800) {
    if (this.dying || !text.trim() || this.member.taskStatus === 'running') return
    this.speechOverrideUntil = Date.now() + durationMs

    this.speechText.setText(text)
    const h = Math.max(28, this.speechText.height + 14)
    const x = -SPEECH_W / 2
    const y = -94 - h
    this.speechText.setPosition(x + 9, y + 7)

    const g = this.speechBubble
    g.clear()
    g.fillStyle(0xffffff, 0.97)
    g.fillRoundedRect(x, y, SPEECH_W, h, 7)
    g.lineStyle(2, 0x6d5bd0, 0.62)
    g.strokeRoundedRect(x, y, SPEECH_W, h, 7)
    g.fillStyle(0xffffff, 0.97)
    g.fillTriangle(-8, y + h - 1, 0, y + h + 10, 8, y + h - 1)

    this.speechBubble.setVisible(true)
    this.speechText.setVisible(true)

    this.scene.time.delayedCall(durationMs, () => {
      if (this.scene) this.refreshSpeechBubble()
    })
  }

  /** 点击即时视觉反馈：精灵快速压缩再弹回，给点击一种手感 */
  flashClick() {
    if (this.dying || !this.scene || !this.active) return
    const baseScaleX = this.sprite.scaleX
    const baseScaleY = this.sprite.scaleY
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: baseScaleX * 0.80,
      scaleY: baseScaleY * 0.80,
      duration: 55,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.active) {
          this.sprite.scaleX = baseScaleX
          this.sprite.scaleY = baseScaleY
        }
      },
    })
  }

  /** 临时盖一个表情（信使送达/收信等演出），到期恢复状态表情 */
  flashEmote(kind: keyof typeof EMOTES, durationMs = 2200) {
    if (this.dying) return
    this.emoteOverrideUntil = Date.now() + durationMs
    this.emote.setFrame(EMOTES[kind])
    this.emote.setVisible(true)
    this.scene.time.delayedCall(durationMs + 30, () => {
      if (this.scene) this.refreshEmote()
    })
  }

  private lastDepthY = -1

  /** y 变化超过 1px 才更新 depth，避免每帧触发显示列表重排序 */
  private syncDepth() {
    if (Math.abs(this.y - this.lastDepthY) > 1) {
      this.lastDepthY = this.y
      this.setDepth(this.y)
    }
  }

  /** 场景每帧下发当前夜色程度（0=白天 → 1=深夜），驱动工具箱夜间发光 */
  setNightness(n: number) {
    this.nightness = n
  }

  /**
   * 由当前显示的精灵帧推断身体朝向（帧布局：4-7 左 / 8-11 右 / 12-15 上 / 其余正面）。
   * 待机动作 look_around、wave 会复用这些方向帧让身体转向，据此同步挎包侧别。
   */
  private facingFromFrame(frame: number): 'down' | 'up' | 'left' | 'right' {
    if (frame >= 4 && frame <= 7) return 'left'
    if (frame >= 8 && frame <= 11) return 'right'
    if (frame >= 12 && frame <= 15) return 'up'
    return 'down'
  }

  /**
   * 挎包每帧跟随精灵：依当前帧同步朝向（含待机 look_around/wave 的转身），
   * 并跟随精灵的 Y（弹跳/坐下等待机动作）做同步，不再僵直悬空。
   */
  private syncBag() {
    if (!this.bag.visible) return
    const frame = Number(this.sprite.frame?.name)
    if (Number.isFinite(frame)) this.setFacing(this.facingFromFrame(frame))
    this.bag.y = this.sprite.y + BAG_DROP_Y * this.sprite.scaleX
  }

  /** 工具箱夜间光晕：跟随挎包当前腰侧位置、随夜色与呼吸脉动；白天/无工具箱时熄灭 */
  private refreshBagGlow(time: number) {
    const lit = this.member.hasToolbox && this.member.enabled && !this.dying && this.nightness > 0.3
    if (!lit) {
      if (this.bagGlow.visible) this.bagGlow.setVisible(false)
      return
    }
    this.bagGlow.setVisible(true)
    this.bagGlow.setPosition(this.x + this.bag.x, this.y + this.bag.y)
    const pulse = 0.5 + 0.5 * Math.sin(time / 460 + this.auraPhase)
    this.bagGlow.setAlpha(this.nightness * (0.55 + 0.25 * pulse))
  }

  /** 每帧推进；返回 false 表示已销毁 */
  tick(time: number, deltaMs: number): boolean {
    this.syncBag()
    this.refreshBagGlow(time)
    // 光环呼吸（独立于行走状态机，停用/拖拽时也生效）
    if (this.auraOn) this.aura.setAlpha(0.42 + 0.16 * Math.sin(time / 420 + this.auraPhase))
    if (this.dying || this.dragging) {
      this.syncDepth()
      return true
    }
    // 玩家接管：用 WSAD 速度移动，跳过自治游荡
    if (this.controlled) {
      if (this.controlVx !== 0 || this.controlVy !== 0) {
        const len = Math.hypot(this.controlVx, this.controlVy) || 1
        const step = (CONTROL_SPEED * deltaMs) / 1000
        const np = blockedAwareStep(
          { x: this.x, y: this.y },
          (this.controlVx / len) * step,
          (this.controlVy / len) * step,
        )
        if (np) {
          this.x = np.x
          this.y = np.y
        }
        this.controlFacing = Math.abs(this.controlVx) > Math.abs(this.controlVy)
          ? (this.controlVx > 0 ? 'right' : 'left')
          : (this.controlVy > 0 ? 'down' : 'up')
        this.setFacing(this.controlFacing)
        const animKey = `${this.skin}:walk_${this.controlFacing}`
        if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
          this.sprite.play(animKey)
        }
      } else if (this.sprite.anims.isPlaying) {
        this.sprite.stop()
        this.sprite.setFrame(0)
      }
      this.syncDepth()
      return true
    }
    if (this.stationary) {
      if (this.sprite.anims.isPlaying) {
        this.sprite.stop()
        this.sprite.setFrame(0)
      }
      this.syncDepth()
      return true
    }
    if (!this.member.enabled) return true

    if (this.target) {
      const dx = this.target.x - this.x
      const dy = this.target.y - this.y
      const dist = Math.hypot(dx, dy)
      if (dist <= ARRIVE_EPS) {
        if (this.via && this.target.x === this.via.x && this.target.y === this.via.y) {
          // 到达途经点：短暂停留后回锚区
          this.via = null
          this.target = null
          this.idleUntil = time + 2500
        } else {
          this.target = null
          this.idleUntil = time + 4000 + Math.random() * 10000 // 4–14 s 的悠闲驻留
        }
        this.idlePhaseUntil = 0 // 到达目的地：立即开始第一个待机活动
        this.sprite.stop()
        this.sprite.setFrame(0)
      } else {
        // 长期无法靠近目标（被喷泉/水池挡住绕不过去）：放弃当前目标，换新点，避免卡死。
        if (this.target !== this.progressTarget) {
          this.progressTarget = this.target
          this.progressBest = dist
          this.progressSince = time
        } else if (dist < this.progressBest - 0.5) {
          this.progressBest = dist
          this.progressSince = time
        } else if (time - this.progressSince > STUCK_MS) {
          this.target = null
          this.progressTarget = null
          this.via = null
          this.idleUntil = time + 600 + Math.random() * 900
          this.sprite.stop()
          this.sprite.setFrame(0)
          this.syncDepth()
          return true
        }
        const step = (WALK_SPEED * deltaMs) / 1000
        const np = blockedAwareStep(
          { x: this.x, y: this.y },
          (dx / dist) * Math.min(step, dist),
          (dy / dist) * Math.min(step, dist),
        )
        let moved = false
        if (np) {
          this.x = np.x
          this.y = np.y
          moved = true
        } else {
          this.target = null
          this.idleUntil = time + 800 + Math.random() * 1200
          this.sprite.stop()
          this.sprite.setFrame(0)
        }
        // 离屏裁剪：视口外只移动坐标不跑动画（100+ 成员时省 CPU）
        if (moved && this.isOnScreen()) {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
          this.setFacing(dir)
          const animKey = `${this.skin}:walk_${dir}`
          if (this.sprite.anims.currentAnim?.key !== animKey || !this.sprite.anims.isPlaying) {
            this.sprite.play(animKey)
          }
        } else if (!moved || this.sprite.anims.isPlaying) {
          this.sprite.stop()
          this.sprite.setFrame(0)
        }
      }
    } else if (time >= this.idleUntil) {
      // 区内游荡：挑下一个点
      this.stopBob()
      this.idlePhaseUntil = 0
      this.target = walkablePointIn(this.zone)
    } else {
      // 待机期：循环播放小动作（仅视口内角色才切换动画）
      if (this.isOnScreen() && time >= this.idlePhaseUntil) {
        this.pickIdleActivity(time)
      }
    }
    this.syncDepth()
    return true
  }

  // ---------------------------------------------------------------- 待机活动系统

  /** 停止 Y 轴弹跳 tween，恢复精灵到基准位置 */
  private stopBob() {
    if (this.bobTween) {
      this.bobTween.stop()
      // tween 的 onStop 回调负责把 sprite.y 归位和清空 bobTween
    }
  }

  /** 开始一段弹跳小动作（sprite 局部 Y 轴弹跳，不影响 Container 位置） */
  private startBob() {
    if (this.bobTween || !this.scene || !this.active) return
    const baseY = this.sprite.y
    const restore = () => {
      if (this.active) this.sprite.y = baseY
      this.bobTween = null
    }
    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: baseY - 4,
      duration: 300,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.easeInOut',
      onComplete: restore,
      onStop: restore,
    })
  }

  /**
   * 根据当前成员状态与角色触发一次语境表情（bulb / magnifier / scroll）。
   * 在坐下、环顾等动作切换时调用，增加角色个性感。
   */
  private triggerRoleEmote() {
    if (this.dying || !this.member.enabled) return
    const m = this.member
    if (m.taskStatus === 'running') return // 任务进行中不抢占气泡
    if (m.role === 'librarian') {
      this.flashEmote('bulb', 1800)
    } else if (m.role === 'assistant_admin') {
      this.flashEmote('magnifier', 1600)
    } else if (m.runtimeStatus === 'running') {
      this.flashEmote('scroll', 1400)
    } else if (m.lifecycle === 'learning' && Math.random() < 0.5) {
      this.flashEmote('scroll', 1400)
    }
  }

  /**
   * 从五种待机活动中随机选一种执行：
   *   idle_blink — 原地站立+眨眼（最常见）
   *   look_around — 转头环顾（7 帧 / 2fps ≈ 3.5 s）
   *   sit — 坐下小憩（2.5–5.5 s）
   *   wave — 挥手（6 帧 / 5fps ≈ 1.2 s）
   *   bob+blink — 原地轻跳+眨眼（快乐/活跃时）
   */
  private pickIdleActivity(time: number) {
    this.stopBob()
    const m = this.member
    const busyWorking = m.taskStatus === 'running' || m.runtimeStatus === 'running'
    const roll = Math.random()

    if (busyWorking) {
      // 正在工作：只用眨眼或轻跳，不坐下、不挥手
      if (roll < 0.55) {
        this.sprite.play(`${this.skin}:idle_blink`, true)
        this.idlePhaseUntil = time + 3500 + Math.random() * 3000
      } else {
        this.sprite.play(`${this.skin}:idle_blink`, true)
        this.startBob()
        this.idlePhaseUntil = time + 3000 + Math.random() * 2500
      }
      return
    }

    // 切换活动时以 35% 概率触发角色专属表情
    if (Math.random() < 0.35) this.triggerRoleEmote()

    if (roll < 0.30) {
      // 原地眨眼（最常见，悠然伫立 4–9 s）
      this.sprite.play(`${this.skin}:idle_blink`, true)
      this.idlePhaseUntil = time + 4000 + Math.random() * 5000
    } else if (roll < 0.50) {
      // 转头环顾四方（动画约 3.5 s，再站立一会儿，共 6–8 s）
      this.sprite.play(`${this.skin}:look_around`, true)
      this.idlePhaseUntil = time + 6000 + Math.random() * 2000
    } else if (roll < 0.65) {
      // 坐下小憩（6–13 s）
      this.sprite.stop()
      this.sprite.setFrame(17)
      this.idlePhaseUntil = time + 6000 + Math.random() * 7000
    } else if (roll < 0.80) {
      // 挥手（动画约 1.5 s，再静立一会儿，共 4–6 s）
      this.sprite.play(`${this.skin}:wave`, true)
      this.idlePhaseUntil = time + 4000 + Math.random() * 2000
    } else {
      // 轻跳+眨眼（4–7 s）
      this.sprite.play(`${this.skin}:idle_blink`, true)
      this.startBob()
      this.idlePhaseUntil = time + 4000 + Math.random() * 3000
    }
  }

  // ---------------------------------------------------------------- 生命结束

  /** 死亡演出：踉跄倒地 → 渐隐移除 */
  die(onDone: () => void) {
    if (this.dying) return
    this.dying = true
    this.stopBob()
    this.target = null
    this.emote.setFrame(EMOTES.skull)
    this.emote.setVisible(true)
    this.sprite.stop()
    this.sprite.setFrame(18) // collapse
    const scene = this.scene
    scene.time.delayedCall(700, () => {
      if (!this.scene) {
        this.destroy()
        onDone()
        return
      }
      this.sprite.setFrame(19) // lying
      scene.tweens.add({
        targets: this,
        alpha: 0,
        delay: 700,
        duration: 900,
        onComplete: () => {
          this.destroy()
          onDone()
        },
      })
    })
  }

  /** 销毁时一并清理跟随的工具箱光晕（scene 级对象，不随 Container 自动回收） */
  destroy(fromScene?: boolean) {
    this.bagGlow?.destroy()
    super.destroy(fromScene)
  }
}
