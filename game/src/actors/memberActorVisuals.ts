import Phaser from 'phaser'
import { EMOTES } from '../assetManifest'
import { speechPreview } from '../world/format'
import type { WorldMember } from '../world/store'
import {
  BAG_DROP_Y,
  BAG_PROFILE_X,
  BAG_SIDE_X,
  SHADOW_RX,
  SHADOW_RY,
  SPEECH_W,
  TOKEN_BAR_H,
  TOKEN_BAR_W,
  hexToColor,
  type ActorAppearance,
  type EmoteKind,
  type Facing,
  type MemberActorHost,
} from './memberActorTypes'

export const applyAppearance = (actor: MemberActorHost, a: ActorAppearance) => {
  stopBob(actor)
  const tint = hexToColor(a.tint)
  if (tint !== null) actor.sprite.setTint(tint)
  else actor.sprite.clearTint()
  const scale = Phaser.Math.Clamp(Number.isFinite(a.scale) && a.scale > 0 ? a.scale : 1, 0.7, 1.4)
  actor.sprite.setScale(scale)
  actor.sprite.y = -24 * scale
  actor.bag.setScale(scale)
  applyBagSide(actor)
  actor.shadow.clear()
  actor.shadow.fillStyle(0x000000, 0.2)
  actor.shadow.fillEllipse(0, 0, SHADOW_RX * 2 * scale, SHADOW_RY * 2 * scale)
  applyAura(actor, a, scale)
}

const applyAura = (actor: MemberActorHost, a: ActorAppearance, scale: number) => {
  const auraColor = hexToColor(a.aura)
  actor.auraOn = auraColor !== null
  if (auraColor !== null) {
    actor.aura.setTint(auraColor)
    actor.aura.setScale(1.6 * scale, 0.9 * scale)
    actor.aura.setVisible(true)
    return
  }
  actor.aura.setVisible(false)
}

export const refreshBag = (actor: MemberActorHost) => {
  actor.bag.setVisible(!!actor.member.hasToolbox && actor.member.enabled && !actor.dying)
}

export const setFacing = (actor: MemberActorHost, dir: Facing) => {
  if (actor.facing === dir) return
  actor.facing = dir
  applyBagSide(actor)
}

export const applyBagSide = (actor: MemberActorHost) => {
  const scale = actor.sprite.scaleX || 1
  if (actor.facing === 'left') {
    actor.bag.x = -BAG_PROFILE_X * scale
    actor.bag.setFlipX(true)
    actor.moveAbove(actor.bag, actor.sprite)
    return
  }
  if (actor.facing === 'right') {
    actor.bag.x = BAG_PROFILE_X * scale
    actor.bag.setFlipX(false)
    actor.moveAbove(actor.bag, actor.sprite)
    return
  }
  if (actor.facing === 'up') {
    actor.bag.x = -BAG_SIDE_X * 0.55 * scale
    actor.bag.setFlipX(false)
    actor.moveBelow(actor.bag, actor.sprite)
    return
  }
  actor.bag.x = BAG_SIDE_X * scale
  actor.bag.setFlipX(false)
  actor.moveAbove(actor.bag, actor.sprite)
}

export const refreshEmote = (actor: MemberActorHost) => {
  if (Date.now() < actor.emoteOverrideUntil) return
  const kind = emoteKindFor(actor)
  if (kind === null) {
    actor.emote.setVisible(false)
    return
  }
  actor.emote.setFrame(EMOTES[kind])
  actor.emote.setVisible(true)
}

const emoteKindFor = (actor: MemberActorHost): EmoteKind => {
  const m = actor.member
  if (actor.benchLocked) return 'zzz'
  if (m.taskStatus === 'running') return null
  if (!m.enabled) return 'zzz'
  if (m.tokenLimit > 0 && m.tokensUsed / m.tokenLimit >= 0.9) return 'hourglass'
  if (m.runtimeStatus === 'running') return 'scroll'
  if (m.runtimeStatus === 'error') return 'alert'
  return null
}

export const refreshTokenBar = (actor: MemberActorHost) => {
  const g = actor.tokenBar
  g.clear()
  const m = actor.member
  if (actor.controlled || m.tokenLimit <= 0) return
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

export const refreshSpeechBubble = (actor: MemberActorHost) => {
  if (Date.now() < actor.speechOverrideUntil) return
  const taskRunning = actor.member.taskStatus === 'running'
  const text = speechPreview(actor.member.latestSpeech)
  const visible = taskRunning && !!text && actor.member.enabled && !actor.dying
  actor.speechBubble.setVisible(visible)
  actor.speechText.setVisible(visible)
  if (!visible) return
  paintSpeechBubble(actor, text)
}

export const paintSpeechBubble = (actor: MemberActorHost, text: string) => {
  actor.speechText.setText(text)
  const h = Math.max(28, actor.speechText.height + 14)
  const x = -SPEECH_W / 2
  const y = -94 - h
  actor.speechText.setPosition(x + 9, y + 7)
  const g = actor.speechBubble
  g.clear()
  g.fillStyle(0xffffff, 0.97)
  g.fillRoundedRect(x, y, SPEECH_W, h, 7)
  g.lineStyle(2, 0x6d5bd0, 0.62)
  g.strokeRoundedRect(x, y, SPEECH_W, h, 7)
  g.fillStyle(0xffffff, 0.97)
  g.fillTriangle(-8, y + h - 1, 0, y + h + 10, 8, y + h - 1)
}

export const showReceivedMessage = (actor: MemberActorHost, text: string, durationMs = 2800) => {
  if (actor.dying || !text.trim() || actor.member.taskStatus === 'running') return
  actor.speechOverrideUntil = Date.now() + durationMs
  paintSpeechBubble(actor, text)
  actor.speechBubble.setVisible(true)
  actor.speechText.setVisible(true)
  actor.scene.time.delayedCall(durationMs, () => {
    if (actor.scene) refreshSpeechBubble(actor)
  })
}

export const flashClick = (actor: MemberActorHost) => {
  if (actor.dying || !actor.scene || !actor.active) return
  const baseScaleX = actor.sprite.scaleX
  const baseScaleY = actor.sprite.scaleY
  actor.scene.tweens.add({
    targets: actor.sprite,
    scaleX: baseScaleX * 0.80,
    scaleY: baseScaleY * 0.80,
    duration: 55,
    yoyo: true,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (actor.active) {
        actor.sprite.scaleX = baseScaleX
        actor.sprite.scaleY = baseScaleY
      }
    },
  })
}

export const flashEmote = (actor: MemberActorHost, kind: keyof typeof EMOTES, durationMs = 2200) => {
  if (actor.dying) return
  actor.emoteOverrideUntil = Date.now() + durationMs
  actor.emote.setFrame(EMOTES[kind])
  actor.emote.setVisible(true)
  actor.scene.time.delayedCall(durationMs + 30, () => {
    if (actor.scene) refreshEmote(actor)
  })
}

export const syncDepth = (actor: MemberActorHost) => {
  if (Math.abs(actor.y - actor.lastDepthY) > 1) {
    actor.lastDepthY = actor.y
    actor.setDepth(actor.y)
  }
}

export const facingFromFrame = (frame: number): Facing => {
  if (frame >= 4 && frame <= 7) return 'left'
  if (frame >= 8 && frame <= 11) return 'right'
  if (frame >= 12 && frame <= 15) return 'up'
  return 'down'
}

export const syncBag = (actor: MemberActorHost) => {
  if (!actor.bag.visible) return
  const frame = Number(actor.sprite.frame?.name)
  if (Number.isFinite(frame)) setFacing(actor, facingFromFrame(frame))
  actor.bag.y = actor.sprite.y + BAG_DROP_Y * actor.sprite.scaleX
}

export const refreshBagGlow = (actor: MemberActorHost, time: number) => {
  const lit = actor.member.hasToolbox && actor.member.enabled && !actor.dying && actor.nightness > 0.3
  if (!lit) {
    if (actor.bagGlow.visible) actor.bagGlow.setVisible(false)
    return
  }
  actor.bagGlow.setVisible(true)
  actor.bagGlow.setPosition(actor.x + actor.bag.x, actor.y + actor.bag.y)
  const pulse = 0.5 + 0.5 * Math.sin(time / 460 + actor.auraPhase)
  actor.bagGlow.setAlpha(actor.nightness * (0.55 + 0.25 * pulse))
}

export const stopBob = (actor: MemberActorHost) => {
  if (actor.bobTween) actor.bobTween.stop()
}

export const startBob = (actor: MemberActorHost) => {
  if (actor.bobTween || !actor.scene || !actor.active) return
  const baseY = actor.sprite.y
  const restore = () => {
    if (actor.active) actor.sprite.y = baseY
    actor.bobTween = null
  }
  actor.bobTween = actor.scene.tweens.add({
    targets: actor.sprite,
    y: baseY - 4,
    duration: 300,
    yoyo: true,
    repeat: 4,
    ease: 'Sine.easeInOut',
    onComplete: restore,
    onStop: restore,
  })
}

export const syncMemberFromSnapshot = (actor: MemberActorHost, member: WorldMember, skin: string) => {
  const prev = actor.prevRender
  actor.prevRender = member
  actor.member = member
  applySkinIfChanged(actor, skin)
  applyNameIfChanged(actor, prev, member)
  applyLookIfChanged(actor, prev, member)
  refreshBag(actor)
  refreshEmote(actor)
  applyTokensIfChanged(actor, prev, member)
  refreshSpeechBubble(actor)
  applyEnabledPose(actor, member)
  applyBenchPose(actor)
}

const applySkinIfChanged = (actor: MemberActorHost, skin: string) => {
  if (skin === actor.skin) return
  actor.skin = skin
  actor.sprite.stop()
  actor.sprite.setTexture(skin, 0)
}

const applyNameIfChanged = (actor: MemberActorHost, prev: WorldMember | null, member: WorldMember) => {
  if (prev && prev.name === member.name && prev.enabled === member.enabled) return
  actor.nameTag.setText(member.name || `#${member.id}`)
  actor.nameTag.setAlpha(member.enabled ? 1 : 0.55)
}

const applyLookIfChanged = (actor: MemberActorHost, prev: WorldMember | null, member: WorldMember) => {
  if (prev && prev.tint === member.tint && prev.scale === member.scale && prev.aura === member.aura) return
  applyAppearance(actor, member)
}

const applyTokensIfChanged = (actor: MemberActorHost, prev: WorldMember | null, member: WorldMember) => {
  if (prev && prev.tokensUsed === member.tokensUsed && prev.tokenLimit === member.tokenLimit) return
  refreshTokenBar(actor)
}

const applyEnabledPose = (actor: MemberActorHost, member: WorldMember) => {
  if (!member.enabled && !actor.dying) {
    actor.target = null
    stopBob(actor)
    actor.sprite.stop()
    actor.sprite.setFrame(17)
    actor.sprite.setAlpha(0.75)
    return
  }
  actor.sprite.setAlpha(1)
}

const applyBenchPose = (actor: MemberActorHost) => {
  if (!actor.benchLocked || !actor.benchSeat || actor.dying) return
  actor.setPosition(actor.benchSeat.x, actor.benchSeat.y)
  actor.target = null
  stopBob(actor)
  actor.sprite.stop()
  actor.sprite.setFrame(17)
}
