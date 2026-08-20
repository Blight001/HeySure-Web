import Phaser from 'phaser'
import { MemberActor } from '../actors/MemberActor'
import { memberTooltipData } from '../ui/worldText'
import { skinFor } from '../world/skins'
import {
  ZONES,
  workshopBenchSeat,
  workshopZone,
  type Point,
  type Rect,
} from '../world/layout'
import type { WorldEvent, WorldMember, WorldSnapshot } from '../world/store'
import { burstSparkle, playSfx, revealWorld } from './worldSceneAmbient'
import { postToDashboard, updateHud } from './worldSceneShared'
import { reconcileWorkshops } from './worldSceneWorkshops'
import type { WorldSceneHost } from './worldSceneTypes'

export const applySnapshot = (scene: WorldSceneHost, snap: WorldSnapshot) => {
  scene.snap = snap
  updateHud(scene, snap)
  if (snap.authOk || snap.lastError) revealWorld(scene)
  if (!snap.authOk) return
  reconcileWorkshops(scene, snap)
  reconcileMembers(scene, snap)
}

export const handleWorldEvent = (scene: WorldSceneHost, ev: WorldEvent) => {
  const id = Number(ev.payload?.ai_config_id)
  const actor = Number.isFinite(id) ? scene.actors.get(id) : undefined
  if (ev.type === 'task_started') {
    playSfx(scene, 'scroll')
    return
  }
  if (ev.type === 'task_finished') {
    if (actor) burstSparkle(scene, actor.x, actor.y - 24)
    playSfx(scene, 'success')
    return
  }
  if (ev.type === 'member_inherited') {
    if (actor && !actor.isDying) actor.die(() => scene.actors.delete(id))
    playSfx(scene, 'bell', 0.45)
    return
  }
  if (ev.type === 'member_completed') {
    if (actor) burstSparkle(scene, actor.x, actor.y - 24)
    playSfx(scene, 'bell', 0.35)
    return
  }
  if (ev.type === 'ai_message') playAiMessage(scene, ev)
}

const playAiMessage = (scene: WorldSceneHost, ev: WorldEvent) => {
  const fromId = Number(ev.payload?.from_ai_config_id)
  const toId = Number(ev.payload?.to_ai_config_id)
  const msgContent = ev.payload?.content ? String(ev.payload.content).slice(0, 120) : undefined
  playMessenger(
    scene,
    Number.isFinite(fromId) ? scene.actors.get(fromId) : undefined,
    Number.isFinite(toId) ? scene.actors.get(toId) : undefined,
    String(ev.payload?.kind || 'message'),
    msgContent,
  )
}

export const playMessenger = (
  scene: WorldSceneHost,
  from: MemberActor | undefined,
  to: MemberActor | undefined,
  kind: string,
  message?: string,
) => {
  if (!from || !to || from === to) return
  from.flashEmote('scroll', 1500)
  const envelope = scene.add.image(from.x, from.y - 36, 'envelope.png', 0)
  envelope.setDepth(99500)
  playSfx(scene, 'ui_click', 0.3)
  const sx = from.x
  const sy = from.y - 36
  const dist = Phaser.Math.Distance.Between(sx, sy, to.x, to.y - 36)
  const duration = Phaser.Math.Clamp(dist * 1.8, 700, 2600)
  const arc = Phaser.Math.Clamp(dist * 0.25, 40, 160)
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration,
    ease: 'Sine.easeInOut',
    onUpdate: tween => flyEnvelope(envelope, to, sx, sy, arc, tween),
    onComplete: () => finishEnvelope(scene, envelope, to, kind, message),
  })
}

const flyEnvelope = (
  envelope: Phaser.GameObjects.Image,
  to: MemberActor,
  sx: number,
  sy: number,
  arc: number,
  tween: Phaser.Tweens.Tween,
) => {
  const t = tween.getValue() ?? 0
  const ex = to.x
  const ey = to.y - 36
  envelope.x = sx + (ex - sx) * t
  envelope.y = sy + (ey - sy) * t - Math.sin(Math.PI * t) * arc
  envelope.setFlipX(ex < sx)
}

const finishEnvelope = (
  scene: WorldSceneHost,
  envelope: Phaser.GameObjects.Image,
  to: MemberActor,
  kind: string,
  message?: string,
) => {
  envelope.destroy()
  if (to.scene) {
    to.flashEmote(kind === 'reply' ? 'check' : 'alert', 2200)
    burstSparkle(scene, to.x, to.y - 40)
    if (message) to.showReceivedMessage(message, 3200)
  }
  playSfx(scene, 'chime', 0.35)
}

export const focusMemberCard = (scene: WorldSceneHost, id: number) => {
  const actor = scene.actors.get(id)
  if (actor) scene.cameras.main.pan(actor.x, actor.y, 400, 'Sine.easeInOut')
  postToDashboard({ type: 'world:focus-agent', aiConfigId: id })
}

export const reconcileMembers = (scene: WorldSceneHost, snap: WorldSnapshot) => {
  const seen = new Set<number>()
  for (const m of snap.members) {
    seen.add(m.id)
    syncOneMember(scene, m)
  }
  for (const [id, actor] of scene.actors) {
    if (!seen.has(id) && !actor.isDying) actor.die(() => scene.actors.delete(id))
  }
}

const syncOneMember = (scene: WorldSceneHost, m: WorldMember) => {
  const existing = scene.actors.get(m.id)
  if (m.lifecycle === 'dead') {
    if (existing && !existing.isDying) existing.die(() => scene.actors.delete(m.id))
    return
  }
  const actor = existing ?? spawnMember(scene, m)
  applyMemberAnchor(scene, actor, m)
  playTransitions(scene, m, actor)
}

const spawnMember = (scene: WorldSceneHost, m: WorldMember): MemberActor => {
  const skin = skinFor(m.role, m.id, m.skin)
  const lockedSeat = getLockedBenchSeat(scene, m)
  const zone = anchorFor(scene, m, scene.time.now)
  const initZone = lockedSeat
    ? { x: lockedSeat.x - 2, y: lockedSeat.y - 2, w: 4, h: 4 }
    : zone
  const actor = new MemberActor(scene, m, skin, initZone)
  scene.input.setDraggable(actor)
  scene.actors.set(m.id, actor)
  return actor
}

const applyMemberAnchor = (scene: WorldSceneHost, actor: MemberActor, m: WorldMember) => {
  const skin = skinFor(m.role, m.id, m.skin)
  const lockedSeat = getLockedBenchSeat(scene, m)
  const zone = anchorFor(scene, m, scene.time.now)
  actor.setMember(m, skin)
  if (lockedSeat) {
    actor.lockSitOnBench(lockedSeat)
    return
  }
  if (actor.isBenchLocked) actor.unlockBench()
  actor.setAnchor(zone)
}

const playTransitions = (scene: WorldSceneHost, m: WorldMember, actor: MemberActor) => {
  const prevGen = scene.prevGeneration.get(m.id)
  if (prevGen !== undefined && m.generation > prevGen) {
    const spawn = scene.buildings.get('spawn')
    if (spawn) burstSparkle(scene, spawn.x, spawn.y - 20)
    burstSparkle(scene, actor.x, actor.y - 24)
  }
  scene.prevGeneration.set(m.id, m.generation)
}

export const anchorFor = (scene: WorldSceneHost, m: WorldMember, time: number): Rect => {
  const boundZone = boundPatrolZone(scene, m, time)
  if (boundZone) return boundZone
  if (m.role === 'core_admin') return ZONES.plaza
  if (m.role === 'librarian') return ZONES.library
  if (!m.projectId || m.lifecycle === 'learning') return ZONES.spawn
  return ZONES.wanderAll
}

export const boundPatrolZone = (scene: WorldSceneHost, m: WorldMember, time: number): Rect | null => {
  const online = m.boundAgentIds
    .map(deviceId => scene.workshops.get(deviceId))
    .filter((view): view is NonNullable<typeof view> => !!view && view.data.online)
  if (!online.length) {
    scene.memberPatrol.delete(m.id)
    return null
  }
  const key = online.map(view => `${view.data.deviceId}:${view.slot}`).join('|')
  let state = scene.memberPatrol.get(m.id)
  if (!state || state.key !== key) {
    state = initialPatrolState(m, online, key, time)
    scene.memberPatrol.set(m.id, state)
  } else if (online.length > 1 && time >= state.nextAt) {
    advancePatrol(state, m, online, time)
  }
  return state.zone
}

const initialPatrolState = (
  m: WorldMember,
  online: { data: { type: string; deviceId: string }; slot: number }[],
  key: string,
  time: number,
) => {
  const index = m.id % online.length
  const view = online[index]
  return {
    key,
    index,
    nextAt: time + 10000 + (m.id % 5) * 1000,
    zone: view.data.type === 'workshop' ? ZONES.library : workshopZone(view.slot),
  }
}

const advancePatrol = (
  state: { index: number; nextAt: number; zone: Rect },
  m: WorldMember,
  online: { data: { type: string }; slot: number }[],
  time: number,
) => {
  state.index = (state.index + 1) % online.length
  state.nextAt = time + 12000 + (m.id % 4) * 1000
  const view = online[state.index]
  state.zone = view.data.type === 'workshop' ? ZONES.library : workshopZone(view.slot)
}

export const getLockedBenchSeat = (scene: WorldSceneHost, m: WorldMember): Point | null => {
  if (!m.boundAgentIds?.length) return null
  const hasOnlineBuilding = m.boundAgentIds.some(id => {
    const view = scene.workshops.get(id)
    return !!view && view.data.online
  })
  if (hasOnlineBuilding) return null
  return firstOfflineBenchSeat(scene, m)
}

const firstOfflineBenchSeat = (scene: WorldSceneHost, m: WorldMember): Point | null => {
  for (const deviceId of m.boundAgentIds) {
    const view = scene.workshops.get(deviceId)
    if (view && view.offlineSince !== null && view.data.boundAiConfigIds.includes(m.id) && view.slot >= 0) {
      const seat = workshopBenchSeat(view.slot)
      return { x: seat.x + ((m.id % 3) - 1) * 14, y: seat.y }
    }
  }
  return null
}

export const memberTooltip = (m: WorldMember) => memberTooltipData(m)
