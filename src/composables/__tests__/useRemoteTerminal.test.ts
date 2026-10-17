import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptTerminalOpened,
  acceptTerminalReady,
  createRemoteTerminalContext,
  teardownRemoteTerminal,
} from '../useRemoteTerminalHelpers'

afterEach(() => vi.useRealTimers())

describe('remote terminal readiness gate', () => {
  const context = () => createRemoteTerminalContext(ref('connecting'), ref(''))

  it('keeps opened connecting until matching ready arrives', () => {
    vi.useFakeTimers()
    const ctx = context()
    acceptTerminalOpened(ctx, { sessionId: 'rt-a' })
    expect(ctx.status.value).toBe('connecting')
    acceptTerminalReady(ctx, { sessionId: 'rt-a' })
    expect(ctx.status.value).toBe('streaming')
  })

  it('uses a bounded legacy fallback and ignores stale ready', () => {
    vi.useFakeTimers()
    const ctx = context()
    acceptTerminalOpened(ctx, { sessionId: 'rt-a' })
    vi.advanceTimersByTime(499)
    expect(ctx.status.value).toBe('connecting')
    vi.advanceTimersByTime(1)
    expect(ctx.status.value).toBe('streaming')
    acceptTerminalReady(ctx, { sessionId: 'rt-old' })
    expect(ctx.sessionId).toBe('rt-a')
  })

  it('cancels the legacy fallback during teardown', () => {
    vi.useFakeTimers()
    const ctx = context()
    acceptTerminalOpened(ctx, { sessionId: 'rt-a' })
    teardownRemoteTerminal(ctx, false)
    ctx.status.value = 'idle'
    vi.advanceTimersByTime(500)
    expect(ctx.status.value).toBe('idle')
    expect(ctx.sessionId).toBe('')
  })
})
