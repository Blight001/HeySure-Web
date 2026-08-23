import type { RwmEnvelope, RwmPatchBody, RwmResourceBegin, RwmSnapshotBegin } from '@/types/rwm'
import { RWM_LIMITS } from './rwmProtocol'
import { validateRwmPatchBody } from './rwmValidation'

export type RwmStateEffect =
  | { kind: 'snapshot.begin'; metadata: RwmSnapshotBegin; seq: number }
  | { kind: 'snapshot.end'; snapshotId: string }
  | { kind: 'resource.begin'; metadata: RwmResourceBegin }
  | { kind: 'resource.end'; transferId: string }
  | { kind: 'patch'; body: RwmPatchBody; seq: number }
  | { kind: 'page.reset' }
  | { kind: 'fallback'; reason: string }
  | { kind: 'ignore' }
  | { kind: 'resync'; reason: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const safeId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160
const safeHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const validChunks = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= RWM_LIMITS.chunks
const validBytes = (value: unknown, limit: number) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= limit

const snapshotMetadata = (body: unknown): RwmSnapshotBegin | null => {
  if (!isObject(body) || !safeId(body.transferId) || body.kind !== 'snapshot' || body.encoding !== 'json') return null
  if (body.compression !== 'none' && body.compression !== 'gzip') return null
  if (!Number.isSafeInteger(body.baseSeq) || Number(body.baseSeq) < 0) return null
  if (!validChunks(body.chunks) || !validBytes(body.bytes, RWM_LIMITS.snapshotBytes) || !safeHash(body.sha256)) return null
  return body as unknown as RwmSnapshotBegin
}

const resourceMetadata = (body: unknown): RwmResourceBegin | null => {
  if (!isObject(body) || !safeId(body.transferId) || body.kind !== 'resource') return null
  if (!safeHash(body.sha256) || typeof body.mime !== 'string' || body.mime.length > 120) return null
  if (!validBytes(body.bytes, RWM_LIMITS.resourceBytes) || !validChunks(body.chunks) || !validBindings(body.bindings)) return null
  return body as unknown as RwmResourceBegin
}

const validBindings = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(binding => isObject(binding)
  && Number.isSafeInteger(binding.nodeId) && Number(binding.nodeId) > 0 && (binding.slot === 'src' || binding.slot === 'poster')))

export class RwmSequenceState {
  pageId = ''
  epoch = -1
  lastSeq = -1
  snapshotId = ''
  snapshotHash = ''
  snapshotSeq = -1
  private transferHashes = new Map<string, string>()
  ready = false

  constructor(readonly sessionId: string) {}

  accept(message: RwmEnvelope): RwmStateEffect {
    if (message.sessionId !== this.sessionId) return { kind: 'ignore' }
    if (message.type === 'page.reset') return this.resetPage(message)
    if (this.pageId && (message.pageId !== this.pageId || message.epoch !== this.epoch)) {
      return message.epoch < this.epoch ? { kind: 'ignore' } : { kind: 'resync', reason: 'page_epoch' }
    }
    return this.acceptCurrent(message)
  }

  private acceptCurrent(message: RwmEnvelope): RwmStateEffect {
    if (message.type === 'snapshot.begin') return this.beginSnapshot(message)
    if (message.type === 'snapshot.end') return this.endSnapshot(message)
    if (message.type === 'resource.begin' || message.type === 'resource.end') return this.acceptResource(message)
    if (message.type === 'patch') return this.patch(message)
    if (message.type === 'surface.status') return this.surfaceStatus(message.body)
    return { kind: 'ignore' }
  }

  private acceptResource(message: RwmEnvelope): RwmStateEffect {
    if (message.type === 'resource.begin') {
      const metadata = resourceMetadata(message.body)
      if (metadata) this.transferHashes.set(metadata.transferId, metadata.sha256)
      return metadata ? { kind: 'resource.begin', metadata } : { kind: 'resync', reason: 'resource_metadata' }
    }
    const transferId = isObject(message.body) ? message.body.transferId : ''
    const hash = isObject(message.body) ? message.body.sha256 : ''
    if (!safeId(transferId) || !safeHash(hash) || this.transferHashes.get(String(transferId)) !== String(hash)) return { kind: 'resync', reason: 'resource_end' }
    this.transferHashes.delete(String(transferId))
    return { kind: 'resource.end', transferId: String(transferId) }
  }

  private surfaceStatus(body: unknown): RwmStateEffect {
    if (isObject(body) && body.dom === 'available') return { kind: 'ignore' }
    const reason = isObject(body) ? String(body.reason || 'surface_unavailable') : 'surface_unavailable'
    return { kind: 'fallback', reason: reason.slice(0, 160) }
  }

  commitSnapshot(baseSeq: number) {
    this.lastSeq = baseSeq
    this.ready = true
    this.snapshotId = ''
    this.snapshotHash = ''
    this.snapshotSeq = -1
  }

  markPatchApplied(seq: number) {
    this.lastSeq = seq
  }

  markResync() {
    this.ready = false
    this.snapshotId = ''
    this.snapshotHash = ''
    this.snapshotSeq = -1
    this.transferHashes.clear()
  }

  private resetPage(message: RwmEnvelope): RwmStateEffect {
    if (message.epoch < this.epoch) return { kind: 'ignore' }
    if (message.seq !== 0) return { kind: 'resync', reason: 'page_reset_sequence' }
    if (message.epoch === this.epoch && this.pageId && message.pageId !== this.pageId) return { kind: 'resync', reason: 'page_reset_identity' }
    this.pageId = message.pageId
    this.epoch = message.epoch
    this.lastSeq = -1
    this.snapshotId = ''
    this.snapshotHash = ''
    this.snapshotSeq = -1
    this.transferHashes.clear()
    this.ready = false
    return { kind: 'page.reset' }
  }

  private beginSnapshot(message: RwmEnvelope): RwmStateEffect {
    if (this.pageId && message.epoch < this.epoch) return { kind: 'ignore' }
    const metadata = snapshotMetadata(message.body)
    if (!metadata) return { kind: 'resync', reason: 'snapshot_metadata' }
    if (metadata.baseSeq !== message.seq) return { kind: 'resync', reason: 'snapshot_sequence' }
    if (message.seq <= Math.max(this.lastSeq, this.snapshotSeq)) return { kind: 'resync', reason: 'snapshot_sequence' }
    this.pageId = message.pageId
    this.epoch = message.epoch
    this.snapshotId = metadata.transferId
    this.snapshotHash = metadata.sha256
    this.snapshotSeq = message.seq
    this.ready = false
    return { kind: 'snapshot.begin', metadata, seq: message.seq }
  }

  private endSnapshot(message: RwmEnvelope): RwmStateEffect {
    const id = isObject(message.body) ? message.body.snapshotId || message.body.transferId : ''
    const hash = isObject(message.body) ? message.body.sha256 : ''
    if (!safeId(id) || id !== this.snapshotId || !safeHash(hash) || hash !== this.snapshotHash
      || message.seq !== this.snapshotSeq) return { kind: 'resync', reason: 'snapshot_end' }
    return { kind: 'snapshot.end', snapshotId: id }
  }

  private patch(message: RwmEnvelope): RwmStateEffect {
    const body = message.body
    if (!this.ready || !isObject(body) || !Array.isArray(body.ops)) return { kind: 'resync', reason: 'patch_before_snapshot' }
    if (body.ops.length > RWM_LIMITS.patchOps || body.baseSeq !== this.lastSeq || message.seq !== this.lastSeq + 1
      || (body.seq !== undefined && body.seq !== message.seq)) {
      return { kind: 'resync', reason: 'patch_sequence' }
    }
    try { return { kind: 'patch', body: validateRwmPatchBody(body), seq: message.seq } }
    catch { return { kind: 'resync', reason: 'patch_shape' } }
  }
}
