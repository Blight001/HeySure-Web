import { describe, expect, it } from 'vitest'
import type { RwmEnvelope } from '@/types/rwm'
import { RwmSequenceState } from '../rwmState'

const hash = 'a'.repeat(64)
const envelope = (type: RwmEnvelope['type'], seq: number, body: Record<string, unknown>, epoch = 1): RwmEnvelope => ({
  v: 1, type, sessionId: 'session', pageId: 'page', epoch, seq, ts: 1, body,
})

describe('RWM ordered state', () => {
  it('commits a snapshot, accepts one ordered patch and requests a gap resync', () => {
    const state = new RwmSequenceState('session')
    expect(state.accept(envelope('page.reset', 0, {})).kind).toBe('page.reset')
    const begin = state.accept(envelope('snapshot.begin', 1, {
      transferId: 'snap', kind: 'snapshot', mime: 'application/json', sha256: hash,
      bytes: 10, chunks: 1, encoding: 'json', compression: 'none', baseSeq: 1,
    }))
    expect(begin.kind).toBe('snapshot.begin')
    expect(state.accept(envelope('snapshot.end', 1, { transferId: 'snap', sha256: hash })).kind).toBe('snapshot.end')
    expect(state.accept(envelope('resource.begin', 1, {
      transferId: 'resource', kind: 'resource', mime: 'image/png', sha256: hash, bytes: 8, chunks: 1,
    })).kind).toBe('resource.begin')
    state.commitSnapshot(1)
    expect(state.accept(envelope('resource.end', 1, { transferId: 'resource', sha256: hash })).kind).toBe('resource.end')
    expect(state.accept(envelope('surface.status', 1, { dom: 'available' })).kind).toBe('ignore')
    expect(state.accept(envelope('patch', 2, { baseSeq: 1, ops: [{ op: 'text.set', id: 2, text: 'ok' }] })).kind).toBe('patch')
    state.markPatchApplied(2)
    expect(state.accept(envelope('patch', 4, { baseSeq: 2, ops: [] }))).toEqual({ kind: 'resync', reason: 'patch_sequence' })
  })

  it('ignores an old epoch and rejects mismatched end hashes', () => {
    const state = new RwmSequenceState('session')
    state.accept(envelope('page.reset', 0, {}, 2))
    expect(state.accept(envelope('patch', 1, { baseSeq: 0, ops: [] }, 1)).kind).toBe('ignore')
    state.accept(envelope('snapshot.begin', 1, {
      transferId: 'snap', kind: 'snapshot', sha256: hash, bytes: 1, chunks: 1,
      encoding: 'json', compression: 'none', baseSeq: 1,
    }, 2))
    expect(state.accept(envelope('snapshot.end', 1, { transferId: 'snap', sha256: 'b'.repeat(64) }, 2)).kind).toBe('resync')
  })

  it('rejects mismatched snapshot end seq, same-epoch page swaps and backwards snapshots', () => {
    const state = new RwmSequenceState('session')
    state.accept(envelope('page.reset', 0, {}))
    state.accept(envelope('snapshot.begin', 1, {
      transferId: 'snap', kind: 'snapshot', sha256: hash, bytes: 1, chunks: 1,
      encoding: 'json', compression: 'none', baseSeq: 1,
    }))
    expect(state.accept(envelope('snapshot.end', 2, { transferId: 'snap', sha256: hash })).kind).toBe('resync')
    expect(state.accept({ ...envelope('page.reset', 0, {}), pageId: 'other' })).toEqual({ kind: 'resync', reason: 'page_reset_identity' })
    state.commitSnapshot(1)
    expect(state.accept(envelope('snapshot.begin', 1, {
      transferId: 'old', kind: 'snapshot', sha256: hash, bytes: 1, chunks: 1,
      encoding: 'json', compression: 'none', baseSeq: 1,
    }))).toEqual({ kind: 'resync', reason: 'snapshot_sequence' })
  })
})
