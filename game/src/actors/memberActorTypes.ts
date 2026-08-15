import type Phaser from 'phaser'
import { EMOTES } from '../assetManifest'
import { clampToWorld, randomPointIn, type Point, type Rect } from '../world/layout'
import { isWorldBlocked } from '../world/map'
import type { WorldMember } from '../world/store'

export const WALK_SPEED = 34
export const CONTROL_SPEED = 150
export const ARRIVE_EPS = 4
export const STUCK_MS = 1400
export const HITBOX_W = 44
export const HITBOX_H = 70
export const HITBOX_TOP = -68
export const TOKEN_BAR_W = 34
export const TOKEN_BAR_H = 5
export const SPEECH_W = 260
export const SHADOW_RX = 18
export const SHADOW_RY = 6
export const BAG_SIDE_X = 11
export const BAG_PROFILE_X = 3
export const BAG_DROP_Y = 8

export type Facing = 'down' | 'up' | 'left' | 'right'
export type EmoteKind = keyof typeof EMOTES | null

export interface ActorAppearance {
  tint: string
  scale: number
  aura: string
}

export const walkablePointIn = (zone: Rect): Point => {
  for (let i = 0; i < 16; i++) {
    const p = clampToWorld(randomPointIn(zone))
    if (!isWorldBlocked(p)) return p
  }
  return clampToWorld(randomPointIn(zone))
}

export const blockedAwareStep = (from: Point, dx: number, dy: number): Point | null => {
  if (isWorldBlocked(from)) return clampToWorld({ x: from.x + dx, y: from.y + dy })
  const next = clampToWorld({ x: from.x + dx, y: from.y + dy })
  if (!isWorldBlocked(next)) return next
  const slideX = clampToWorld({ x: from.x + dx, y: from.y })
  if (!isWorldBlocked(slideX)) return slideX
  const slideY = clampToWorld({ x: from.x, y: from.y + dy })
  if (!isWorldBlocked(slideY)) return slideY
  return null
}

export const hexToColor = (hex: string): number | null => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  return parseInt(hex.slice(1), 16)
}

/** Mutable MemberActor surface used by extracted actor modules. */
export interface MemberActorHost extends Phaser.GameObjects.Container {
  memberId: number
  member: WorldMember
  prevRender: WorldMember | null
  shadow: Phaser.GameObjects.Graphics
  sprite: Phaser.GameObjects.Sprite
  bag: Phaser.GameObjects.Image
  bagGlow: Phaser.GameObjects.Image
  nightness: number
  tokenBar: Phaser.GameObjects.Graphics
  nameTag: Phaser.GameObjects.Text
  emote: Phaser.GameObjects.Image
  speechBubble: Phaser.GameObjects.Graphics
  speechText: Phaser.GameObjects.Text
  aura: Phaser.GameObjects.Image
  auraOn: boolean
  auraPhase: number
  skin: string
  zone: Rect
  target: Point | null
  via: Point | null
  idleUntil: number
  progressTarget: Point | null
  progressBest: number
  progressSince: number
  idlePhaseUntil: number
  dying: boolean
  dragging: boolean
  bobTween: Phaser.Tweens.Tween | null
  controlled: boolean
  stationary: boolean
  controlVx: number
  controlVy: number
  controlFacing: Facing
  facing: Facing
  benchLocked: boolean
  benchSeat: Point | null
  emoteOverrideUntil: number
  speechOverrideUntil: number
  lastDepthY: number
}
