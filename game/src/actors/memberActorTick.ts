import {
  ARRIVE_EPS,
  CONTROL_SPEED,
  STUCK_MS,
  WALK_SPEED,
  blockedAwareStep,
  walkablePointIn,
  type Facing,
  type MemberActorHost,
} from './memberActorTypes'
import {
  flashEmote,
  refreshBagGlow,
  setFacing,
  startBob,
  stopBob,
  syncBag,
  syncDepth,
} from './memberActorVisuals'

export const isOnScreen = (actor: MemberActorHost): boolean => {
  const view = actor.scene.cameras.main.worldView
  return (
    actor.x > view.x - 64 && actor.x < view.right + 64 &&
    actor.y > view.y - 64 && actor.y < view.bottom + 64
  )
}

export const tickMember = (actor: MemberActorHost, time: number, deltaMs: number): boolean => {
  syncBag(actor)
  refreshBagGlow(actor, time)
  if (actor.auraOn) actor.aura.setAlpha(0.42 + 0.16 * Math.sin(time / 420 + actor.auraPhase))
  if (actor.dying || actor.dragging) {
    syncDepth(actor)
    return true
  }
  if (tickBenchLocked(actor)) return true
  if (tickControlled(actor, deltaMs)) return true
  if (tickStationary(actor)) return true
  if (!actor.member.enabled) return true
  tickAutonomous(actor, time, deltaMs)
  syncDepth(actor)
  return true
}

const tickBenchLocked = (actor: MemberActorHost): boolean => {
  if (!actor.benchLocked) return false
  if (actor.benchSeat) {
    actor.x = actor.benchSeat.x
    actor.y = actor.benchSeat.y
  }
  actor.sprite.stop()
  actor.sprite.setFrame(17)
  syncDepth(actor)
  syncBag(actor)
  return true
}

const tickControlled = (actor: MemberActorHost, deltaMs: number): boolean => {
  if (!actor.controlled) return false
  if (actor.controlVx !== 0 || actor.controlVy !== 0) moveControlled(actor, deltaMs)
  else if (actor.sprite.anims.isPlaying) {
    actor.sprite.stop()
    actor.sprite.setFrame(0)
  }
  syncDepth(actor)
  return true
}

const moveControlled = (actor: MemberActorHost, deltaMs: number) => {
  const len = Math.hypot(actor.controlVx, actor.controlVy) || 1
  const step = (CONTROL_SPEED * deltaMs) / 1000
  const np = blockedAwareStep(
    { x: actor.x, y: actor.y },
    (actor.controlVx / len) * step,
    (actor.controlVy / len) * step,
  )
  if (np) {
    actor.x = np.x
    actor.y = np.y
  }
  actor.controlFacing = facingFromStick(actor.controlVx, actor.controlVy)
  setFacing(actor, actor.controlFacing)
  playWalkKey(actor, `${actor.skin}:walk_${actor.controlFacing}`)
}

const facingFromStick = (vx: number, vy: number): Facing => {
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 'right' : 'left'
  return vy > 0 ? 'down' : 'up'
}

const playWalkKey = (actor: MemberActorHost, animKey: string) => {
  if (actor.sprite.anims.currentAnim?.key !== animKey || !actor.sprite.anims.isPlaying) {
    actor.sprite.play(animKey)
  }
}

const tickStationary = (actor: MemberActorHost): boolean => {
  if (!actor.stationary) return false
  if (actor.sprite.anims.isPlaying) {
    actor.sprite.stop()
    actor.sprite.setFrame(0)
  }
  syncDepth(actor)
  return true
}

const tickAutonomous = (actor: MemberActorHost, time: number, deltaMs: number) => {
  if (actor.target) {
    tickWalk(actor, time, deltaMs)
    return
  }
  if (time >= actor.idleUntil) {
    stopBob(actor)
    actor.idlePhaseUntil = 0
    actor.target = walkablePointIn(actor.zone)
    return
  }
  if (isOnScreen(actor) && time >= actor.idlePhaseUntil) pickIdleActivity(actor, time)
}

const tickWalk = (actor: MemberActorHost, time: number, deltaMs: number) => {
  const target = actor.target
  if (!target) return
  const dx = target.x - actor.x
  const dy = target.y - actor.y
  const dist = Math.hypot(dx, dy)
  if (dist <= ARRIVE_EPS) {
    arriveAtTarget(actor, time)
    return
  }
  if (abandonIfStuck(actor, time, dist)) return
  stepTowardTarget(actor, time, dx, dy, dist, deltaMs)
}

const arriveAtTarget = (actor: MemberActorHost, time: number) => {
  const atVia = !!(actor.via && actor.target && actor.target.x === actor.via.x && actor.target.y === actor.via.y)
  if (atVia) {
    actor.via = null
    actor.target = null
    actor.idleUntil = time + 2500
  } else {
    actor.target = null
    actor.idleUntil = time + 4000 + Math.random() * 10000
  }
  actor.idlePhaseUntil = 0
  actor.sprite.stop()
  actor.sprite.setFrame(0)
}

const abandonIfStuck = (actor: MemberActorHost, time: number, dist: number): boolean => {
  if (actor.target !== actor.progressTarget) {
    actor.progressTarget = actor.target
    actor.progressBest = dist
    actor.progressSince = time
    return false
  }
  if (dist < actor.progressBest - 0.5) {
    actor.progressBest = dist
    actor.progressSince = time
    return false
  }
  if (time - actor.progressSince <= STUCK_MS) return false
  actor.target = null
  actor.progressTarget = null
  actor.via = null
  actor.idleUntil = time + 600 + Math.random() * 900
  actor.sprite.stop()
  actor.sprite.setFrame(0)
  syncDepth(actor)
  return true
}

const stepTowardTarget = (
  actor: MemberActorHost,
  time: number,
  dx: number,
  dy: number,
  dist: number,
  deltaMs: number,
) => {
  const step = (WALK_SPEED * deltaMs) / 1000
  const np = blockedAwareStep(
    { x: actor.x, y: actor.y },
    (dx / dist) * Math.min(step, dist),
    (dy / dist) * Math.min(step, dist),
  )
  const moved = applyWalkStep(actor, time, np)
  playWalkAnim(actor, moved, dx, dy)
}

const applyWalkStep = (
  actor: MemberActorHost,
  time: number,
  np: { x: number; y: number } | null,
): boolean => {
  if (np) {
    actor.x = np.x
    actor.y = np.y
    return true
  }
  actor.target = null
  actor.idleUntil = time + 800 + Math.random() * 1200
  actor.sprite.stop()
  actor.sprite.setFrame(0)
  return false
}

const playWalkAnim = (actor: MemberActorHost, moved: boolean, dx: number, dy: number) => {
  if (moved && isOnScreen(actor)) {
    const dir = facingFromStick(dx, dy)
    setFacing(actor, dir)
    playWalkKey(actor, `${actor.skin}:walk_${dir}`)
    return
  }
  if (!moved || actor.sprite.anims.isPlaying) {
    actor.sprite.stop()
    actor.sprite.setFrame(0)
  }
}

export const triggerRoleEmote = (actor: MemberActorHost) => {
  if (actor.dying || !actor.member.enabled) return
  const m = actor.member
  if (m.taskStatus === 'running') return
  if (m.role === 'librarian') flashEmote(actor, 'bulb', 1800)
  else if (m.role === 'assistant_admin') flashEmote(actor, 'magnifier', 1600)
  else if (m.runtimeStatus === 'running') flashEmote(actor, 'scroll', 1400)
  else if (m.lifecycle === 'learning' && Math.random() < 0.5) flashEmote(actor, 'scroll', 1400)
}

export const pickIdleActivity = (actor: MemberActorHost, time: number) => {
  stopBob(actor)
  const busyWorking = actor.member.taskStatus === 'running' || actor.member.runtimeStatus === 'running'
  const roll = Math.random()
  if (busyWorking) {
    pickBusyIdle(actor, time, roll)
    return
  }
  if (Math.random() < 0.35) triggerRoleEmote(actor)
  pickLeisureIdle(actor, time, roll)
}

const pickBusyIdle = (actor: MemberActorHost, time: number, roll: number) => {
  actor.sprite.play(`${actor.skin}:idle_blink`, true)
  if (roll < 0.55) {
    actor.idlePhaseUntil = time + 3500 + Math.random() * 3000
    return
  }
  startBob(actor)
  actor.idlePhaseUntil = time + 3000 + Math.random() * 2500
}

const pickLeisureIdle = (actor: MemberActorHost, time: number, roll: number) => {
  if (roll < 0.30) {
    actor.sprite.play(`${actor.skin}:idle_blink`, true)
    actor.idlePhaseUntil = time + 4000 + Math.random() * 5000
    return
  }
  if (roll < 0.50) {
    actor.sprite.play(`${actor.skin}:look_around`, true)
    actor.idlePhaseUntil = time + 6000 + Math.random() * 2000
    return
  }
  if (roll < 0.65) {
    actor.sprite.stop()
    actor.sprite.setFrame(17)
    actor.idlePhaseUntil = time + 6000 + Math.random() * 7000
    return
  }
  if (roll < 0.80) {
    actor.sprite.play(`${actor.skin}:wave`, true)
    actor.idlePhaseUntil = time + 4000 + Math.random() * 2000
    return
  }
  actor.sprite.play(`${actor.skin}:idle_blink`, true)
  startBob(actor)
  actor.idlePhaseUntil = time + 4000 + Math.random() * 3000
}
