/**
 * 数字成员 Actor：精灵 + 头顶表情气泡 + 行为状态机。
 *
 * 状态机（见设计方案 §4.2）：idle ⇄ wander(walkTo)；目标锚区由场景按 §4.3 规则
 * 计算后通过 setAnchor 下发，Actor 只负责"平滑走过去 + 区内游荡"。
 * 死亡：collapse 姿态 → 渐隐移除（由场景驱动）。
 */
import Phaser from 'phaser'
import { EMOTES } from '../assetManifest'
import { clampToWorld, type Point, type Rect } from '../world/layout'
import type { WorldMember } from '../world/store'
import { tickMember } from './memberActorTick'
import {
  HITBOX_H,
  HITBOX_TOP,
  HITBOX_W,
  SHADOW_RX,
  SHADOW_RY,
  SPEECH_W,
  BAG_DROP_Y,
  BAG_SIDE_X,
  walkablePointIn,
  type ActorAppearance,
  type Facing,
  type MemberActorHost,
} from './memberActorTypes'
import {
  applyAppearance,
  flashClick,
  flashEmote,
  refreshBag,
  refreshEmote,
  refreshTokenBar,
  showReceivedMessage,
  stopBob,
  syncMemberFromSnapshot,
} from './memberActorVisuals'

export type { ActorAppearance, EmoteKind } from './memberActorTypes'

export class MemberActor extends Phaser.GameObjects.Container implements MemberActorHost {
  readonly memberId: number
  member: WorldMember
  prevRender: WorldMember | null = null
  shadow!: Phaser.GameObjects.Graphics
  sprite!: Phaser.GameObjects.Sprite
  bag!: Phaser.GameObjects.Image
  bagGlow!: Phaser.GameObjects.Image
  nightness = 0
  tokenBar!: Phaser.GameObjects.Graphics
  nameTag!: Phaser.GameObjects.Text
  emote!: Phaser.GameObjects.Image
  speechBubble!: Phaser.GameObjects.Graphics
  speechText!: Phaser.GameObjects.Text
  aura!: Phaser.GameObjects.Image
  auraOn = false
  auraPhase = Math.random() * Math.PI * 2
  skin: string
  zone: Rect
  target: Point | null = null
  via: Point | null = null
  idleUntil = 0
  progressTarget: Point | null = null
  progressBest = Infinity
  progressSince = 0
  idlePhaseUntil = 0
  dying = false
  dragging = false
  bobTween: Phaser.Tweens.Tween | null = null
  controlled = false
  stationary = false
  controlVx = 0
  controlVy = 0
  controlFacing: Facing = 'down'
  facing: Facing = 'down'
  benchLocked = false
  benchSeat: Point | null = null
  emoteOverrideUntil = 0
  speechOverrideUntil = 0
  lastDepthY = -1

  constructor(scene: Phaser.Scene, member: WorldMember, skin: string, zone: Rect) {
    const start = walkablePointIn(zone)
    super(scene, start.x, start.y)
    this.memberId = member.id
    this.member = member
    this.skin = skin
    this.zone = zone
    this.attachVisuals(scene, member, skin, start)
    this.setSize(HITBOX_W, HITBOX_H)
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, HITBOX_TOP + HITBOX_H / 2, HITBOX_W, HITBOX_H),
      Phaser.Geom.Rectangle.Contains,
    )
    scene.add.existing(this)
  }

  private attachVisuals(scene: Phaser.Scene, member: WorldMember, skin: string, start: Point) {
    this.shadow = scene.add.graphics()
    this.shadow.fillStyle(0x000000, 0.2)
    this.shadow.fillEllipse(0, 0, SHADOW_RX * 2, SHADOW_RY * 2)
    this.add(this.shadow)
    this.aura = scene.add.image(0, -6, 'glow.png', 0)
    this.aura.setBlendMode(Phaser.BlendModes.ADD)
    this.aura.setVisible(false)
    this.add(this.aura)
    this.sprite = scene.add.sprite(0, -24, skin, 0)
    this.sprite.setOrigin(0.5, 0.5)
    this.add(this.sprite)
    this.bag = scene.add.image(BAG_SIDE_X, -24 + BAG_DROP_Y, 'effect_toolbox_bag.png', 0)
    this.bag.setOrigin(0.5, 0.5)
    this.bag.setVisible(false)
    this.add(this.bag)
    this.bagGlow = scene.add.image(start.x, start.y, 'glow.png', 0)
    this.bagGlow.setBlendMode(Phaser.BlendModes.ADD)
    this.bagGlow.setTint(0xffcf8a)
    this.bagGlow.setScale(3.0, 2.1)
    this.bagGlow.setDepth(155050)
    this.bagGlow.setAlpha(0)
    this.bagGlow.setVisible(false)
    applyAppearance(this, member)
    refreshBag(this)
    this.attachHud(scene, member)
  }

  private attachHud(scene: Phaser.Scene, member: WorldMember) {
    this.tokenBar = scene.add.graphics()
    this.add(this.tokenBar)
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
  }

  get isDying(): boolean {
    return this.dying
  }

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
    stopBob(this)
    this.sprite.stop()
    this.sprite.setFrame(0)
    this.setAlpha(0.85)
  }

  endDrag() {
    this.dragging = false
    this.setAlpha(this.member.enabled ? 1 : 0.75)
    if (this.benchLocked && this.benchSeat) {
      this.setPosition(this.benchSeat.x, this.benchSeat.y)
      this.sprite.stop()
      this.sprite.setFrame(17)
      this.target = null
      return
    }
    this.target = walkablePointIn(this.zone)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  setControlled(on: boolean) {
    if (this.controlled === on) return
    this.controlled = on
    this.controlVx = 0
    this.controlVy = 0
    if (this.benchLocked) {
      refreshTokenBar(this)
      return
    }
    if (on) {
      this.target = null
      this.via = null
      stopBob(this)
      this.sprite.stop()
      this.sprite.setFrame(0)
      this.setAlpha(1)
    } else {
      this.target = walkablePointIn(this.zone)
      this.idleUntil = 0
    }
    refreshTokenBar(this)
  }

  get isControlled(): boolean {
    return this.controlled
  }

  setStationary(on: boolean) {
    if (this.stationary === on) return
    this.stationary = on
    if (this.benchLocked) return
    if (on) {
      this.target = null
      this.via = null
      stopBob(this)
      this.sprite.stop()
      this.sprite.setFrame(0)
    } else if (!this.controlled && this.member.enabled) {
      this.target = walkablePointIn(this.zone)
      this.idleUntil = 0
    }
  }

  setControlVelocity(dx: number, dy: number) {
    this.controlVx = dx
    this.controlVy = dy
  }

  setMember(member: WorldMember, skin: string) {
    syncMemberFromSnapshot(this, member, skin)
  }

  applyAppearance(a: ActorAppearance) {
    applyAppearance(this, a)
  }

  previewAppearance(a: ActorAppearance) {
    applyAppearance(this, a)
    this.prevRender = null
  }

  previewSkin(skin: string) {
    if (skin === this.skin || this.dying) return
    this.skin = skin
    this.sprite.stop()
    this.sprite.setTexture(skin, 0)
  }

  setAnchor(zone: Rect) {
    if (this.benchLocked) return
    if (zone === this.zone) return
    this.zone = zone
    if (this.controlled || this.stationary) return
    this.target = walkablePointIn(zone)
    this.idleUntil = 0
  }

  lockSitOnBench(seat: Point) {
    if (this.dying || this.dragging) return
    this.benchLocked = true
    this.benchSeat = { x: seat.x, y: seat.y }
    this.target = null
    this.via = null
    this.idleUntil = Number.MAX_SAFE_INTEGER
    this.idlePhaseUntil = Number.MAX_SAFE_INTEGER
    stopBob(this)
    this.setPosition(seat.x, seat.y)
    this.sprite.stop()
    this.sprite.setFrame(17)
    refreshEmote(this)
  }

  unlockBench() {
    this.benchLocked = false
    this.benchSeat = null
  }

  get isBenchLocked(): boolean {
    return this.benchLocked
  }

  showReceivedMessage(text: string, durationMs = 2800) {
    showReceivedMessage(this, text, durationMs)
  }

  flashClick() {
    flashClick(this)
  }

  flashEmote(kind: keyof typeof EMOTES, durationMs = 2200) {
    flashEmote(this, kind, durationMs)
  }

  setNightness(n: number) {
    this.nightness = n
  }

  tick(time: number, deltaMs: number): boolean {
    return tickMember(this, time, deltaMs)
  }

  die(onDone: () => void) {
    if (this.dying) return
    this.dying = true
    stopBob(this)
    this.target = null
    this.emote.setFrame(EMOTES.skull)
    this.emote.setVisible(true)
    this.sprite.stop()
    this.sprite.setFrame(18)
    const scene = this.scene
    scene.time.delayedCall(700, () => this.finishDie(scene, onDone))
  }

  private finishDie(scene: Phaser.Scene, onDone: () => void) {
    if (!this.scene) {
      this.destroy()
      onDone()
      return
    }
    this.sprite.setFrame(19)
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
  }

  destroy(fromScene?: boolean) {
    this.bagGlow?.destroy()
    super.destroy(fromScene)
  }
}
