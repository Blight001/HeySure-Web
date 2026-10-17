import type { RcBrowserCommand, RcInput, RcMode } from './useRemoteControl'
import type {
  RemoteControllerActionEnvelope,
  RemoteControllerControl,
  RemoteControllerPhase,
  RemoteControllerTemplate,
} from '@/types/remoteController'

interface ControllerTransport {
  sendInput: (input: RcInput) => void
  sendBrowserCommand: (command: RcBrowserCommand) => void
  sendControlJson: (payload: unknown, maxBufferedAmount?: number) => boolean
  sendFastJson: (payload: unknown) => boolean
  controllerFastReady: boolean
}
type ReliableTimer = ReturnType<typeof setTimeout>
type ContinuousState = {
  template: RemoteControllerTemplate
  control: RemoteControllerControl
  value: unknown
  timer: ReliableTimer | null
}
const CONTINUOUS_HEARTBEAT_MS = 200

const sendReliable = (
  transport: ControllerTransport,
  timers: Set<ReliableTimer>,
  message: RemoteControllerActionEnvelope,
  attempt = 0,
) => {
  if (transport.sendControlJson(message) || attempt >= 2) return
  const timer = setTimeout(() => {
    timers.delete(timer)
    sendReliable(transport, timers, message, attempt + 1)
  }, 50 * (attempt + 1))
  timers.add(timer)
}

const controllerEnvelope = (
  template: RemoteControllerTemplate,
  control: RemoteControllerControl,
  phase: RemoteControllerPhase,
  value: unknown,
  sequence: number,
): RemoteControllerActionEnvelope => {
  if (control.action.type !== 'emit') throw new Error('controller_emit_required')
  return {
    kind: 'controller-action', v: 1, templateId: template.id, controlId: control.id,
    seq: sequence, phase, value: sanitizeControllerValue(value), event: control.action.event, ts: Date.now(),
  }
}

const createUpdateQueue = (transport: ControllerTransport, beforeFlush: () => void, canSend: (key: string) => boolean) => {
  let animationFrame = 0
  let lastReliableUpdate = 0
  const pending = new Map<string, RemoteControllerActionEnvelope>()
  const flush = () => {
    animationFrame = 0
    beforeFlush()
    const now = performance.now()
    for (const [key, message] of pending) {
      if (!canSend(key)) continue
      if (transport.controllerFastReady) {
        if (transport.sendFastJson(message)) pending.delete(key)
      } else if (now - lastReliableUpdate >= 50 && transport.sendControlJson(message, 64 * 1024)) {
        pending.delete(key)
        lastReliableUpdate = now
      }
    }
    if (pending.size) animationFrame = requestAnimationFrame(flush)
  }
  return {
    enqueue(key: string, message: RemoteControllerActionEnvelope) {
      pending.set(key, message)
      if (!animationFrame) animationFrame = requestAnimationFrame(flush)
    },
    remove: (key: string) => pending.delete(key),
    dispose() { if (animationFrame) cancelAnimationFrame(animationFrame); pending.clear() },
  }
}

const createHeartbeatManager = (heartbeat: (state: ContinuousState) => void) => {
  const active = new Map<string, ContinuousState>()
  const schedule = (key: string) => {
    const state = active.get(key)
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      const current = active.get(key)
      if (!current) return
      heartbeat(current)
      schedule(key)
    }, CONTINUOUS_HEARTBEAT_MS)
  }
  return {
    start(key: string, state: Omit<ContinuousState, 'timer'>) {
      const previous = active.get(key)
      if (previous?.timer) clearTimeout(previous.timer)
      active.set(key, { ...state, timer: null })
      schedule(key)
    },
    has: (key: string) => active.has(key),
    values: () => [...active.values()],
    update(key: string, value: unknown) { const state = active.get(key); if (state) { state.value = value; schedule(key) } },
    end(key: string) { const state = active.get(key); if (state?.timer) clearTimeout(state.timer); active.delete(key) },
    dispose() { for (const state of active.values()) if (state.timer) clearTimeout(state.timer); active.clear() },
  }
}

const createReliableLifecycle = (transport: ControllerTransport, timers: Set<ReliableTimer>) => {
  const pending = new Map<string, ReliableTimer>()
  const started = new Set<string>()
  const cancel = (key: string) => {
    const timer = pending.get(key)
    if (timer) { clearTimeout(timer); timers.delete(timer) }
    pending.delete(key)
  }
  const start = (key: string, message: RemoteControllerActionEnvelope, attempt = 0) => {
    if (transport.sendControlJson(message)) { pending.delete(key); started.add(key); return }
    if (attempt >= 2) { pending.delete(key); return }
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (pending.get(key) === timer) start(key, message, attempt + 1)
    }, 50 * (attempt + 1))
    pending.set(key, timer)
    timers.add(timer)
  }
  return {
    start(key: string, message: RemoteControllerActionEnvelope) { cancel(key); start(key, message) },
    end(key: string, message: RemoteControllerActionEnvelope) {
      const wasDelivered = started.delete(key)
      cancel(key)
      if (!wasDelivered) return
      sendReliable(transport, timers, message)
    },
    canUpdate: (key: string) => started.has(key) && !pending.has(key),
    dispose() { for (const key of pending.keys()) cancel(key); started.clear() },
  }
}

const ANDROID_KEYS: Record<string, string> = {
  ArrowUp: 'dpad_up', ArrowDown: 'dpad_down', ArrowLeft: 'dpad_left', ArrowRight: 'dpad_right',
  Enter: 'dpad_center', Escape: 'back', Home: 'home', MediaPlayPause: 'media_play_pause',
  MediaTrackPrevious: 'media_previous', MediaTrackNext: 'media_next', AudioVolumeDown: 'volume_down',
  AudioVolumeUp: 'volume_up', AudioVolumeMute: 'volume_mute',
}

const dispatchTrigger = (
  mode: RcMode,
  transport: ControllerTransport,
  template: RemoteControllerTemplate,
  control: RemoteControllerControl,
  value: unknown,
  emit: (template: RemoteControllerTemplate, control: RemoteControllerControl, phase: RemoteControllerPhase, value?: unknown) => void,
) => {
  const action = control.action
  if (action.type === 'browser') return transport.sendBrowserCommand({ action: action.action })
  if (action.type === 'key') {
    const key = mode === 'android' ? ANDROID_KEYS[action.key] || action.key : action.key
    return transport.sendInput({ type: 'key', key, action: mode === 'android' ? undefined : 'tap' })
  }
  emit(template, control, 'trigger', value)
}

export const sanitizeControllerValue = (value: unknown) => {
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 1024)
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(-1_000_000, Math.min(1_000_000, value)) : null
  if (typeof value === 'object') {
    const point = value as { x?: unknown; y?: unknown }
    if (Object.keys(value).some(key => key !== 'x' && key !== 'y')) return null
    if (typeof point.x !== 'number' || typeof point.y !== 'number') return null
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) return { x: Math.max(-1, Math.min(1, point.x)), y: Math.max(-1, Math.min(1, point.y)) }
  }
  return null
}

export const useRemoteControllerTransport = (mode: RcMode, transport: ControllerTransport) => {
  let sequence = 0
  let lastFastReady = transport.controllerFastReady
  const reliableTimers = new Set<ReliableTimer>()
  const reliable = createReliableLifecycle(transport, reliableTimers)
  let reconcileFastState = () => {}
  const updates = createUpdateQueue(transport, () => reconcileFastState(), reliable.canUpdate)

  const sendEmit = (template: RemoteControllerTemplate, control: RemoteControllerControl, phase: RemoteControllerPhase, value?: unknown) => {
    const message = controllerEnvelope(template, control, phase, value, ++sequence)
    if (phase === 'update') {
      updates.enqueue(`${template.id}:${control.id}`, message)
      return
    }
    const key = `${template.id}:${control.id}`
    if (phase === 'start') {
      reliable.start(key, message)
      return
    }
    if (phase === 'end') {
      reliable.end(key, message)
      return
    }
    sendReliable(transport, reliableTimers, message)
  }

  const continuousKey = (template: RemoteControllerTemplate, control: RemoteControllerControl) => `${template.id}:${control.id}`
  const heartbeats = createHeartbeatManager(state => {
    reconcileFastState()
    sendEmit(state.template, state.control, 'update', state.value)
  })
  reconcileFastState = () => {
    const current = transport.controllerFastReady
    if (lastFastReady && !current) {
      for (const state of heartbeats.values()) sendEmit(state.template, state.control, 'start', state.value)
    }
    lastFastReady = current
  }

  const trigger = (template: RemoteControllerTemplate, control: RemoteControllerControl, value?: unknown) =>
    dispatchTrigger(mode, transport, template, control, value, sendEmit)

  const sendContinuous = (template: RemoteControllerTemplate, control: RemoteControllerControl, phase: 'start' | 'update' | 'end', value: unknown) => {
    reconcileFastState()
    const key = continuousKey(template, control)
    if (phase === 'end') {
      if (!heartbeats.has(key)) return
      heartbeats.end(key)
      updates.remove(key)
    } else if (phase === 'start') {
      heartbeats.start(key, { template, control, value: sanitizeControllerValue(value) })
    } else {
      heartbeats.update(key, sanitizeControllerValue(value))
    }
    sendEmit(template, control, phase, value)
  }

  const releaseAllContinuous = () => {
    for (const state of heartbeats.values()) sendContinuous(state.template, state.control, 'end', state.value)
  }

  const dispose = () => {
    updates.dispose()
    heartbeats.dispose()
    reliable.dispose()
    for (const timer of reliableTimers) clearTimeout(timer)
    reliableTimers.clear()
  }

  return { trigger, sendContinuous, releaseAllContinuous, dispose }
}
