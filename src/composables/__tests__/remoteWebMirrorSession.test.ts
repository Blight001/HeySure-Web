// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteWebMirrorSession, type RwmTransport } from '../remoteWebMirrorSession'

const createHarness = () => {
  let handlers: Parameters<RwmTransport['setRemoteChannelHandlers']>[0] = {}
  const transport: RwmTransport = {
    getSessionId: vi.fn(() => 'rc_test'),
    sendControlJson: vi.fn(() => true),
    sendWebStateJson: vi.fn(() => true),
    setRemoteChannelHandlers: vi.fn(value => { handlers = value }),
  }
  const session = new RemoteWebMirrorSession(transport)
  return { session, transport, handlers: () => handlers }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('remote web mirror session lifecycle', () => {
  it('allows a three-second channel negotiation but falls back after five seconds', () => {
    vi.useFakeTimers()
    const { session } = createHarness()
    session.start()
    vi.advanceTimersByTime(3_000)
    expect(session.phase.value).toBe('negotiating')
    vi.advanceTimersByTime(2_000)
    expect(session.phase.value).toBe('fallback')
    session.stop()
  })

  it('rejects hello acknowledgements without dom and ignores callbacks after stop', () => {
    const { session, handlers } = createHarness()
    session.start()
    handlers().control?.({ kind: 'rc-hello-ack', version: 1, encoding: 'json', surfaces: ['video'] })
    expect(session.phase.value).toBe('fallback')
    const stale = handlers().control!
    session.stop()
    stale({ kind: 'rc-hello-ack', version: 1, encoding: 'json', surfaces: ['dom'] })
    expect(session.phase.value).toBe('idle')
  })

  it('ignores a hello acknowledgement that arrives after the mirror is ready', () => {
    vi.useFakeTimers()
    const { session, handlers } = createHarness()
    session.start()
    session.phase.value = 'ready'
    handlers().control?.({ kind: 'rc-hello-ack', version: 1, encoding: 'json', surfaces: ['dom'] })
    expect(session.phase.value).toBe('ready')
    vi.advanceTimersByTime(12_000)
    expect(session.phase.value).toBe('ready')
    session.stop()
  })

  it('caches out-of-order resource bindings until a snapshot is ready', async () => {
    const { session } = createHarness()
    session.start()
    const internal = session as any
    internal.resources = { add: vi.fn(async () => 'blob:test'), get: vi.fn(() => 'blob:test'), clear: vi.fn() }
    internal.assembler = {
      take: vi.fn(async (id: string) => ({
        bytes: new Uint8Array([1]), kind: 'resource', mime: 'image/png', hash: id,
        bindings: [{ nodeId: id === 'hash-a' ? 3 : 4, slot: 'src' }],
      })),
      clear: vi.fn(),
    }
    internal.completeTransfers = new Set(['hash-a', 'hash-b'])
    internal.endedTransfers = new Set(['hash-a', 'hash-b'])
    internal.transferGenerations = new Map([['hash-a', internal.contentGeneration], ['hash-b', internal.contentGeneration]])
    internal.transferGenerations = new Map([
      ['hash-a', internal.contentGeneration],
      ['hash-b', internal.contentGeneration],
    ])
    await internal.applyResource('hash-b')
    await internal.applyResource('hash-a')
    expect(internal.pendingResourceBindings.size).toBe(2)
    const renderer = { registerResourceBindings: vi.fn(), refreshResource: vi.fn() }
    internal.currentSnapshot = {}
    internal.renderer.value = renderer
    internal.flushResourceBindings()
    expect(renderer.registerResourceBindings).toHaveBeenCalledTimes(2)
    expect(internal.pendingResourceBindings.size).toBe(0)
    session.stop()
  })

  it('drops a deferred resource completion after page reset', async () => {
    const { session } = createHarness()
    session.start()
    const internal = session as any
    let resolveTake!: (value: unknown) => void
    const take = new Promise(resolve => { resolveTake = resolve })
    internal.resources = { add: vi.fn(async () => 'blob:test'), get: vi.fn(), clear: vi.fn() }
    internal.assembler = { take: vi.fn(() => take), clear: vi.fn() }
    internal.completeTransfers = new Set(['old'])
    internal.endedTransfers = new Set(['old'])
    internal.transferGenerations = new Map([['old', internal.contentGeneration]])
    const applying = internal.applyResource('old')
    internal.resetPage()
    resolveTake({ bytes: new Uint8Array([1]), kind: 'resource', mime: 'image/png', hash: 'old', bindings: [] })
    await applying
    expect(internal.resources.add).not.toHaveBeenCalled()
    session.stop()
  })

  it('does not commit a deferred snapshot with metadata from before reset', async () => {
    const { session } = createHarness()
    session.start()
    const internal = session as any
    let resolveTake!: (value: unknown) => void
    const take = new Promise(resolve => { resolveTake = resolve })
    const renderer = { load: vi.fn(), registerResourceBindings: vi.fn(), refreshResource: vi.fn() }
    internal.renderer.value = renderer
    internal.assembler = { take: vi.fn(() => take), clear: vi.fn() }
    internal.snapshotMetadata = { transferId: 'old', bytes: 1, compression: 'none' }
    internal.snapshotSequence = 7
    internal.snapshotEnded = true
    internal.completeTransfers = new Set(['old'])
    internal.endedTransfers = new Set(['old'])
    const applying = internal.applySnapshot('old')
    internal.resetPage()
    resolveTake({ bytes: new Uint8Array([123]), kind: 'snapshot', hash: 'old' })
    await applying
    expect(renderer.load).not.toHaveBeenCalled()
    expect(session.phase.value).toBe('snapshot')
    session.stop()
  })
})

describe('remote web mirror negotiation deadline', () => {
  it('falls back when a session id never becomes available', () => {
    vi.useFakeTimers()
    const { session, transport } = createHarness()
    vi.mocked(transport.getSessionId).mockReturnValue('')
    session.start()
    vi.advanceTimersByTime(5_000)
    expect(session.phase.value).toBe('fallback')
    session.stop()
  })

  it('falls back when the control channel never accepts hello', () => {
    vi.useFakeTimers()
    const { session, transport } = createHarness()
    vi.mocked(transport.sendControlJson).mockReturnValue(false)
    session.start()
    vi.advanceTimersByTime(5_000)
    expect(session.phase.value).toBe('fallback')
    session.stop()
  })
})

describe('remote web mirror protocol recovery', () => {
  it('does not ACK a snapshot before the renderer is attached', async () => {
    const { session, transport } = createHarness()
    session.start()
    const internal = session as any
    const snapshot = {
      rootId: 1, styles: [], nodes: [
        { id: 1, parent: null, index: 0, kind: 'element', tag: 'html' },
        { id: 2, parent: 1, index: 0, kind: 'element', tag: 'body' },
        { id: 3, parent: 2, index: 0, kind: 'text', text: 'before' },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
    const metadata = { transferId: 'snap', bytes: bytes.byteLength, compression: 'none' }
    internal.sequence = {
      pageId: 'page', epoch: 1, lastSeq: -1,
      commitSnapshot(seq: number) { this.lastSeq = seq },
      markPatchApplied(seq: number) { this.lastSeq = seq },
    }
    internal.assembler = { take: vi.fn(async () => ({ bytes, kind: 'snapshot', hash: 'snap' })), clear: vi.fn() }
    internal.snapshotMetadata = metadata
    internal.snapshotSequence = 1
    internal.snapshotEnded = true
    internal.completeTransfers = new Set(['snap'])
    internal.endedTransfers = new Set(['snap'])
    session.phase.value = 'snapshot'
    await internal.applySnapshot('snap')
    expect(transport.sendWebStateJson).not.toHaveBeenCalled()
    expect(session.phase.value).toBe('snapshot')
    const doc = document.implementation.createHTMLDocument('mirror')
    session.attachDocument(doc)
    expect(session.phase.value).toBe('ready')
    expect(transport.sendWebStateJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'ack', seq: 1 }))
    internal.applyStateEffect({ kind: 'patch', seq: 2, body: { ops: [{ op: 'text.set', id: 3, text: 'after' }] } })
    expect(doc.body.textContent).toBe('after')
    session.stop()
  })

  it('coalesces repeated tail errors while one resync is pending', () => {
    vi.useFakeTimers()
    const { session, transport } = createHarness()
    session.start()
    const internal = session as any
    internal.requestResync('first')
    internal.requestResync('tail-1')
    internal.requestResync('tail-2')
    expect(internal.resyncCount).toBe(1)
    expect(transport.sendWebStateJson).toHaveBeenCalledTimes(1)
    expect(transport.sendWebStateJson).toHaveBeenCalledWith(expect.objectContaining({
      type: 'resync.request', seq: 0, body: expect.objectContaining({ seq: 0 }),
    }))
    expect(session.phase.value).toBe('resyncing')
    session.stop()
  })

  it('retries an ack with the exact captured sequence', () => {
    vi.useFakeTimers()
    const { session, transport } = createHarness()
    session.start()
    const internal = session as any
    internal.sequence = { pageId: 'page-a', epoch: 2, lastSeq: 7 }
    vi.mocked(transport.sendWebStateJson).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true)
    const success = vi.fn()
    internal.sendAckExact(success)
    internal.sequence.lastSeq = 99
    vi.runAllTimers()
    expect(transport.sendWebStateJson).toHaveBeenCalledTimes(3)
    expect(vi.mocked(transport.sendWebStateJson).mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({ pageId: 'page-a', epoch: 2, seq: 7, body: { seq: 7 } }),
      expect.objectContaining({ pageId: 'page-a', epoch: 2, seq: 7, body: { seq: 7 } }),
      expect.objectContaining({ pageId: 'page-a', epoch: 2, seq: 7, body: { seq: 7 } }),
    ])
    expect(success).toHaveBeenCalledOnce()
    session.stop()
  })

  it('ignores a valid binary chunk belonging to another session', async () => {
    const { session } = createHarness()
    session.start()
    const header = new TextEncoder().encode(JSON.stringify({
      v: 1, type: 'resource.chunk', sessionId: 'foreign', transferId: 'res', index: 0, total: 1,
    }))
    const packet = new Uint8Array(4 + header.byteLength + 1)
    new DataView(packet.buffer).setUint32(0, header.byteLength)
    packet.set(header, 4)
    packet[packet.length - 1] = 1
    await (session as any).handleResource(packet.buffer)
    expect((session as any).resyncCount).toBe(0)
    expect(session.phase.value).toBe('negotiating')
    session.stop()
  })

  it('invalidates an old resource inspector when a same-page resnapshot begins', async () => {
    const { session } = createHarness()
    session.start()
    const internal = session as any
    let finishAdd!: () => void
    internal.resources = {
      add: vi.fn((_hash: string, _bytes: Uint8Array, _mime: string, commit: () => boolean) => new Promise(resolve => {
        finishAdd = () => resolve(commit() ? 'blob:test' : '')
      })),
      get: vi.fn(), clear: vi.fn(),
    }
    internal.assembler = {
      take: vi.fn(async () => ({ bytes: new Uint8Array([1]), kind: 'resource', mime: 'image/png', hash: 'old', bindings: [{ nodeId: 3, slot: 'src' }] })),
      begin: vi.fn(() => false), retainOnly: vi.fn(), clear: vi.fn(),
    }
    internal.completeTransfers = new Set(['old'])
    internal.endedTransfers = new Set(['old'])
    internal.transferGenerations = new Map([['old', internal.contentGeneration]])
    const applying = internal.applyResource('old')
    await Promise.resolve()
    internal.beginSnapshot({ transferId: 'new', chunks: 1, bytes: 1, sha256: 'a'.repeat(64), compression: 'none' }, 8)
    finishAdd()
    await applying
    expect(internal.pendingResourceBindings.size).toBe(0)
    expect(internal.resources.add).toHaveBeenCalledOnce()
    session.stop()
  })
})
