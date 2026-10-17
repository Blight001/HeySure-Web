import { ref, shallowRef } from 'vue'
import type { RwmAction, RwmActionResult, RwmPhase, RwmSnapshot, RwmSnapshotBegin } from '@/types/rwm'
import { RwmDomRenderer } from '@/utils/rwmDomRenderer'
import { decodeRwmBinaryChunk, decodeRwmEnvelope, decodeRwmSnapshot, decompressRwmPayload } from '@/utils/rwmProtocol'
import { RwmSequenceState, type RwmStateEffect } from '@/utils/rwmState'
import { RwmResourceLru, RwmTransferAssembler } from '@/utils/rwmTransfers'

export interface RwmTransport {
  getSessionId: () => string
  sendControlJson: (payload: unknown, maxBufferedAmount?: number) => boolean
  sendWebStateJson: (payload: unknown) => boolean
  setRemoteChannelHandlers: (handlers: {
    control?: (data: unknown) => void
    webState?: (data: unknown) => void
    webResource?: (data: unknown) => void
  }) => void
}

export class RemoteWebMirrorSession {
  readonly phase = ref<RwmPhase>('idle')
  readonly errorMessage = ref('')
  readonly pageId = ref('')
  readonly actionMessage = ref('')
  private renderer = shallowRef<RwmDomRenderer | null>(null)
  private assembler = new RwmTransferAssembler()
  private resources = new RwmResourceLru()
  private pendingActions = new Map<string, number>()
  private completeTransfers = new Set<string>()
  private endedTransfers = new Set<string>()
  private transferGenerations = new Map<string, number>()
  private sequence: RwmSequenceState | null = null
  private snapshotMetadata: RwmSnapshotBegin | null = null
  private snapshotEnded = false
  private snapshotSequence = -1
  private actionSeq = 0
  private fallbackTimer = 0
  private retryTimer = 0
  private ackTimers = new Set<number>()
  private resyncCount = 0
  private currentSnapshot: RwmSnapshot | null = null
  private pendingSnapshotFinish: { transferId: string; seq: number; metadata: RwmSnapshotBegin } | null = null
  private pendingResourceBindings = new Map<string, Array<{ nodeId: number; slot: 'src' | 'poster' }>>()
  private handlerGeneration = 0
  private contentGeneration = 0
  private active = false

  constructor(private readonly transport: RwmTransport) {}

  start() {
    this.active = true
    this.handlerGeneration += 1
    this.phase.value = 'negotiating'
    this.armWatchdog(5000, '网页镜像 5 秒内未完成协商，已回退视频')
    this.connectHandlers(this.handlerGeneration)
  }

  stop() {
    this.active = false
    this.handlerGeneration += 1
    this.contentGeneration += 1
    window.clearTimeout(this.fallbackTimer)
    window.clearTimeout(this.retryTimer)
    this.clearAckTimers()
    this.transport.sendControlJson({ kind: 'web-stop', reason: 'unmount' })
    this.transport.setRemoteChannelHandlers({})
    this.assembler.clear()
    this.resources.clear()
    this.pendingActions.clear()
    this.renderer.value = null
    this.sequence = null
    this.currentSnapshot = null
    this.pendingSnapshotFinish = null
    this.pendingResourceBindings.clear()
    this.transferGenerations.clear()
    this.phase.value = 'idle'
  }

  attachDocument(document: Document) {
    this.renderer.value = new RwmDomRenderer(document, partial => this.sendAction(partial), hash => this.resources.get(hash))
    if (this.currentSnapshot) {
      this.renderer.value.load(this.currentSnapshot)
      this.flushResourceBindings()
      const pending = this.pendingSnapshotFinish
      if (pending) this.finishSnapshot(pending.transferId, pending.seq, pending.metadata)
    }
  }

  private connectHandlers(generation: number) {
    if (!this.active || this.phase.value !== 'negotiating' || generation !== this.handlerGeneration) return
    const sessionId = this.transport.getSessionId()
    if (!sessionId) return this.retryConnect(generation)
    this.sequence = new RwmSequenceState(sessionId)
    this.transport.setRemoteChannelHandlers({
      control: data => { if (this.active && generation === this.handlerGeneration) this.handleControl(data) },
      webState: data => { if (this.active && generation === this.handlerGeneration) this.handleState(data) },
      webResource: data => { if (this.active && generation === this.handlerGeneration) void this.handleResource(data) },
    })
    if (!this.transport.sendControlJson(this.hello())) return this.retryConnect(generation)
  }

  private retryConnect(generation: number) {
    if (this.phase.value !== 'negotiating') return
    this.retryTimer = window.setTimeout(() => this.connectHandlers(generation), 50)
  }

  private hello() {
    return {
      kind: 'rc-hello', versions: [1], surfaces: ['dom', 'video'], encodings: ['json'],
      compressions: ['gzip', 'none'], maxChunkBytes: 16_384, permissions: ['view', 'interact'],
    }
  }

  private armWatchdog(milliseconds: number, reason: string) {
    window.clearTimeout(this.fallbackTimer)
    this.fallbackTimer = window.setTimeout(() => {
      if (this.phase.value !== 'ready') this.fallback(reason)
    }, milliseconds)
  }

  private fallback(reason: string) {
    window.clearTimeout(this.retryTimer)
    this.errorMessage.value = reason
    this.phase.value = 'fallback'
  }

  private requestResync(reason: string) {
    if (!this.active || this.phase.value === 'resyncing') return
    this.contentGeneration += 1
    this.clearAckTimers()
    this.resyncCount += 1
    this.sequence?.markResync()
    this.assembler.clear()
    this.resources.clear()
    this.currentSnapshot = null
    this.pendingSnapshotFinish = null
    this.snapshotMetadata = null
    this.snapshotEnded = false
    this.completeTransfers.clear()
    this.endedTransfers.clear()
    this.pendingResourceBindings.clear()
    this.transferGenerations.clear()
    if (this.resyncCount >= 3) return this.fallback('网页镜像连续同步失败，已回退视频')
    this.phase.value = 'resyncing'
    this.armWatchdog(10_000, '网页镜像重同步 10 秒无进展，已回退视频')
    if (!this.sendStateControl('resync.request', reason)) this.fallback('网页镜像重同步请求发送失败，已回退视频')
  }

  private sendStateControl(type: 'ack' | 'resync.request', reason?: string) {
    if (!this.sequence) return false
    const seq = type === 'resync.request'
      ? Math.max(0, this.snapshotSequence, this.sequence.lastSeq)
      : this.sequence.lastSeq
    return this.transport.sendWebStateJson({
      v: 1, type, sessionId: this.transport.getSessionId(), pageId: this.sequence.pageId,
      epoch: this.sequence.epoch, seq,
      body: { seq, ...(reason ? { reason } : {}) },
    })
  }

  private handleState(raw: unknown) {
    try {
      if (!this.sequence) return
      const effect = this.sequence.accept(decodeRwmEnvelope(raw))
      this.armWatchdog(10_000, '网页镜像传输 10 秒无进展，已回退视频')
      this.applyStateEffect(effect)
    } catch (error) {
      this.requestResync(this.errorName(error, 'state_decode'))
    }
  }

  private applyStateEffect(effect: RwmStateEffect) {
    if (effect.kind === 'ignore') return
    if (effect.kind === 'resync') return this.requestResync(effect.reason)
    if (effect.kind === 'fallback') return this.fallback(effect.reason)
    if (effect.kind === 'page.reset') return this.resetPage()
    if (effect.kind === 'snapshot.begin') return this.beginSnapshot(effect.metadata, effect.seq)
    if (effect.kind === 'snapshot.end') return this.endSnapshot(effect.snapshotId)
    if (effect.kind === 'resource.begin') return this.beginResource(effect.metadata)
    if (effect.kind === 'resource.end') return this.endResource(effect.transferId)
    this.renderer.value?.apply(effect.body.ops)
    this.sequence?.markPatchApplied(effect.seq)
    this.sendAckExact()
  }

  private endSnapshot(transferId: string) {
    this.snapshotEnded = true
    this.endedTransfers.add(transferId)
    void this.applySnapshot(transferId)
  }

  private resetPage() {
    this.contentGeneration += 1
    this.clearAckTimers()
    this.currentSnapshot = null
    this.pendingSnapshotFinish = null
    this.resources.clear()
    this.assembler.clear()
    this.completeTransfers.clear()
    this.endedTransfers.clear()
    this.pendingResourceBindings.clear()
    this.transferGenerations.clear()
    this.snapshotSequence = -1
    this.phase.value = 'snapshot'
  }

  private beginSnapshot(metadata: RwmSnapshotBegin, seq: number) {
    this.contentGeneration += 1
    this.clearAckTimers()
    this.currentSnapshot = null
    this.pendingSnapshotFinish = null
    this.resources.clear()
    this.pendingResourceBindings.clear()
    this.completeTransfers.clear()
    this.endedTransfers.clear()
    this.snapshotMetadata = metadata
    this.snapshotSequence = seq
    const complete = this.assembler.begin({
      transferId: metadata.transferId, total: metadata.chunks, bytes: metadata.bytes,
      hash: metadata.sha256, kind: 'snapshot',
    })
    this.assembler.retainOnly(new Set([metadata.transferId]))
    this.transferGenerations.clear()
    this.transferGenerations.set(metadata.transferId, this.contentGeneration)
    if (complete) this.completeTransfers.add(metadata.transferId)
    this.snapshotEnded = false
    this.phase.value = 'snapshot'
  }

  private beginResource(metadata: Extract<RwmStateEffect, { kind: 'resource.begin' }>['metadata']) {
    this.transferGenerations.set(metadata.transferId, this.contentGeneration)
    if (this.assembler.begin({
      transferId: metadata.transferId, total: metadata.chunks, bytes: metadata.bytes, hash: metadata.sha256,
      kind: 'resource', mime: metadata.mime, bindings: metadata.bindings,
    })) this.completeTransfers.add(metadata.transferId)
  }

  private endResource(transferId: string) {
    this.endedTransfers.add(transferId)
    void this.applyResource(transferId).catch(error => this.requestResync(this.errorName(error, 'resource_apply')))
  }

  private async handleResource(raw: unknown) {
    try {
      const chunk = decodeRwmBinaryChunk(raw)
      if (chunk.sessionId !== this.transport.getSessionId()) return
      this.armWatchdog(10_000, '网页镜像传输 10 秒无进展，已回退视频')
      if (!this.assembler.add(chunk)) return
      this.completeTransfers.add(chunk.transferId)
      if (chunk.kind === 'snapshot') await this.applySnapshot(chunk.transferId)
      else await this.applyResource(chunk.transferId)
    } catch (error) {
      this.requestResync(this.errorName(error, 'resource_decode'))
    }
  }

  private async applySnapshot(transferId: string) {
    if (!this.snapshotMetadata || this.snapshotMetadata.transferId !== transferId || !this.snapshotEnded
      || !this.completeTransfers.has(transferId) || !this.endedTransfers.has(transferId)) return
    const metadata = this.snapshotMetadata
    const snapshotSequence = this.snapshotSequence
    const context = this.captureContentContext()
    try {
      const transfer = await this.assembler.take(transferId)
      if (!this.isCurrentContent(context) || this.snapshotMetadata !== metadata) return
      if (transfer.bytes.byteLength !== metadata.bytes) throw new Error('snapshot_length')
      const payload = await decompressRwmPayload(transfer.bytes, metadata.compression)
      if (!this.isCurrentContent(context) || this.snapshotMetadata !== metadata) return
      this.currentSnapshot = decodeRwmSnapshot(payload)
      const renderer = this.renderer.value
      if (!renderer) {
        this.pendingSnapshotFinish = { transferId, seq: snapshotSequence, metadata }
        return
      }
      renderer.load(this.currentSnapshot)
      this.flushResourceBindings()
      this.finishSnapshot(transferId, snapshotSequence, metadata)
    } catch (error) {
      if (this.isCurrentContent(context) && this.snapshotMetadata === metadata) {
        this.requestResync(this.errorName(error, 'snapshot_apply'))
      }
    }
  }

  private finishSnapshot(transferId: string, snapshotSequence: number, metadata: RwmSnapshotBegin) {
    if (this.snapshotMetadata !== metadata) return
    this.pendingSnapshotFinish = null
    this.sequence?.commitSnapshot(snapshotSequence)
    this.pageId.value = this.sequence?.pageId || ''
    this.sendAckExact(() => {
      if (this.snapshotMetadata !== metadata) return
      this.phase.value = 'ready'
      this.resyncCount = 0
      window.clearTimeout(this.fallbackTimer)
      this.snapshotMetadata = null
      this.snapshotEnded = false
      this.completeTransfers.delete(transferId)
      this.endedTransfers.delete(transferId)
      this.transferGenerations.delete(transferId)
    })
  }

  private async applyResource(transferId: string) {
    if (!this.completeTransfers.has(transferId) || !this.endedTransfers.has(transferId)) return
    if (this.transferGenerations.get(transferId) !== this.contentGeneration) {
      this.assembler.delete(transferId)
      this.completeTransfers.delete(transferId)
      this.endedTransfers.delete(transferId)
      this.transferGenerations.delete(transferId)
      return
    }
    const context = this.captureContentContext()
    try {
      const transfer = await this.assembler.take(transferId)
      if (!this.isCurrentContent(context)) return
      await this.resources.add(transfer.hash, transfer.bytes, transfer.mime, () => this.isCurrentContent(context))
      if (!this.isCurrentContent(context)) return
      if (transfer.bindings?.length) this.pendingResourceBindings.set(transfer.hash, transfer.bindings)
      if (this.currentSnapshot) this.flushResourceBindings(transfer.hash)
      this.completeTransfers.delete(transferId)
      this.endedTransfers.delete(transferId)
      this.transferGenerations.delete(transferId)
    } catch (error) {
      if (this.isCurrentContent(context)) this.requestResync(this.errorName(error, 'resource_apply'))
    }
  }

  private flushResourceBindings(onlyHash?: string) {
    const renderer = this.renderer.value
    if (!renderer || !this.currentSnapshot) return
    for (const [hash, bindings] of this.pendingResourceBindings) {
      if (onlyHash && hash !== onlyHash) continue
      renderer.registerResourceBindings(hash, bindings)
      renderer.refreshResource(hash)
      this.pendingResourceBindings.delete(hash)
    }
  }

  private captureContentContext() {
    return { generation: this.contentGeneration, pageId: this.sequence?.pageId || '', epoch: this.sequence?.epoch ?? -1 }
  }

  private isCurrentContent(context: { generation: number; pageId: string; epoch: number }) {
    return this.active && context.generation === this.contentGeneration
      && context.pageId === (this.sequence?.pageId || '') && context.epoch === (this.sequence?.epoch ?? -1)
  }

  private sendAckExact(onSuccess?: () => void) {
    if (!this.sequence) return
    const context = this.captureContentContext()
    const payload = {
      v: 1, type: 'ack', sessionId: this.transport.getSessionId(), pageId: context.pageId,
      epoch: context.epoch, seq: this.sequence.lastSeq, body: { seq: this.sequence.lastSeq },
    }
    const attempt = (count: number) => {
      if (!this.isCurrentContent(context)) return
      if (this.transport.sendWebStateJson(payload)) return onSuccess?.()
      if (count >= 2) return this.requestResync('ack_send')
      const timer = window.setTimeout(() => { this.ackTimers.delete(timer); attempt(count + 1) }, 50 * (count + 1))
      this.ackTimers.add(timer)
    }
    attempt(0)
  }

  private clearAckTimers() {
    for (const timer of this.ackTimers) window.clearTimeout(timer)
    this.ackTimers.clear()
  }

  private handleControl(data: unknown) {
    if (!data || typeof data !== 'object') return
    const message = data as Record<string, unknown>
    if (message.kind === 'surface.status' && message.reason === 'operator_stop') return
    if (message.kind === 'surface.status' && message.dom !== 'available') return this.fallback(String(message.reason || 'surface_unavailable'))
    if (message.kind === 'rc-hello-ack') return this.handleHello(message)
    if (message.kind === 'web-action-result') this.handleActionResult(message)
  }

  private handleHello(message: Record<string, unknown>) {
    if (this.phase.value !== 'negotiating') return
    if (message.version !== 1 || message.encoding !== 'json') return this.fallback('设备网页镜像协议不兼容')
    if (!Array.isArray(message.surfaces) || !message.surfaces.includes('dom')) return this.fallback('设备未确认网页原生镜像能力')
    this.phase.value = 'snapshot'
    this.armWatchdog(10_000, '网页镜像首个快照 10 秒未完成，已回退视频')
  }

  private handleActionResult(message: Record<string, unknown>) {
    if (message.pageId !== this.sequence?.pageId || message.epoch !== this.sequence?.epoch) return
    const result = message as unknown as RwmActionResult
    if (typeof result.requestId !== 'string' || !['ok', 'stale', 'denied', 'failed'].includes(String(result.status))) return
    if (!this.pendingActions.delete(result.requestId)) return
    this.actionMessage.value = result.status === 'ok' ? '' : String(result.message || result.errorCode || `操作${result.status}`)
    if (result.status === 'stale') this.requestResync('action_stale')
  }

  private sendAction(partial: Omit<RwmAction, 'kind' | 'requestId' | 'pageId' | 'epoch' | 'clientSeq'>) {
    if (!this.sequence?.ready) return
    const requestId = `act_${Date.now().toString(36)}_${(++this.actionSeq).toString(36)}`
    const action: RwmAction = {
      kind: 'web-action', requestId, pageId: this.sequence.pageId, epoch: this.sequence.epoch,
      clientSeq: this.actionSeq, ...partial,
    }
    if (this.transport.sendControlJson(action)) this.trackAction(requestId)
  }

  private trackAction(requestId: string) {
    if (this.pendingActions.size >= 128) {
      const oldest = this.pendingActions.keys().next().value
      if (oldest) this.pendingActions.delete(oldest)
    }
    this.pendingActions.set(requestId, Date.now())
    window.setTimeout(() => this.pendingActions.delete(requestId), 15_000)
  }

  private errorName(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
  }
}
