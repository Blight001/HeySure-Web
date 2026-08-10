import { onScopeDispose, ref } from 'vue'

const cloneSnapshot = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const useSnapshotHistory = <T,>(
  restore: (snapshot: T) => void,
  options: { limit?: number; delay?: number } = {},
) => {
  const limit = Math.max(1, options.limit ?? 100)
  const delay = Math.max(0, options.delay ?? 220)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const past: T[] = []
  const future: T[] = []
  let current: T | null = null
  let pending: T | null = null
  let timer: number | undefined

  const updateAvailability = () => {
    canUndo.value = past.length > 0
    canRedo.value = future.length > 0
  }

  const clearTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }

  const commit = (snapshot: T) => {
    const next = cloneSnapshot(snapshot)
    if (current === null) current = next
    else if (JSON.stringify(current) !== JSON.stringify(next)) {
      past.push(current)
      if (past.length > limit) past.shift()
      current = next
      future.length = 0
    }
    updateAvailability()
  }

  const flush = () => {
    clearTimer()
    if (pending !== null) commit(pending)
    pending = null
  }

  const schedule = (snapshot: T) => {
    pending = cloneSnapshot(snapshot)
    clearTimer()
    timer = window.setTimeout(flush, delay)
  }

  const reset = (snapshot: T) => {
    clearTimer()
    pending = null
    past.length = 0
    future.length = 0
    current = cloneSnapshot(snapshot)
    updateAvailability()
  }

  const undo = () => {
    flush()
    const previous = past.pop()
    if (!previous || current === null) return false
    future.push(current)
    current = cloneSnapshot(previous)
    restore(cloneSnapshot(current))
    updateAvailability()
    return true
  }

  const redo = () => {
    flush()
    const next = future.pop()
    if (!next || current === null) return false
    past.push(current)
    current = cloneSnapshot(next)
    restore(cloneSnapshot(current))
    updateAvailability()
    return true
  }

  onScopeDispose(clearTimer)
  return { canUndo, canRedo, schedule, reset, undo, redo, flush }
}
