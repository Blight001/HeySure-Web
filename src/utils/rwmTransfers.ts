import type { RwmBinaryChunk } from '@/types/rwm'
import { RWM_LIMITS, sha256Hex } from './rwmProtocol'

interface Transfer {
  total: number
  expectedBytes: number
  hash?: string
  kind: 'snapshot' | 'resource'
  mime?: string
  chunks: Map<number, Uint8Array>
  bytes: number
  bindings?: Array<{ nodeId: number; slot: 'src' | 'poster' }>
}

interface PendingTransfer {
  total: number
  kind: 'snapshot' | 'resource'
  chunks: Map<number, Uint8Array>
  bytes: number
}

type TransferMetadata = {
  transferId: string
  total: number
  bytes: number
  hash: string
  kind: 'snapshot' | 'resource'
  mime?: string
  bindings?: Array<{ nodeId: number; slot: 'src' | 'poster' }>
}

export class RwmTransferAssembler {
  private transfers = new Map<string, Transfer>()
  // web-state and web-resource are separate SCTP streams, so a binary chunk
  // may legitimately arrive before its begin envelope. Keep a small, globally
  // byte-bounded orphan buffer until the reliable metadata stream catches up.
  private pending = new Map<string, PendingTransfer>()
  private totalBytes = 0

  begin(metadata: TransferMetadata) {
    if (this.transfers.has(metadata.transferId)) throw new Error('transfer_duplicate_begin')
    const early = this.pending.get(metadata.transferId)
    if (early && (early.total !== metadata.total || early.kind !== metadata.kind)) {
      this.deletePending(metadata.transferId)
      throw new Error('transfer_mismatch')
    }
    if (early && early.bytes > metadata.bytes) {
      this.deletePending(metadata.transferId)
      throw new Error('transfer_length')
    }
    if (early) this.pending.delete(metadata.transferId)
    const transfer: Transfer = {
      total: metadata.total, expectedBytes: metadata.bytes, hash: metadata.hash,
      kind: metadata.kind, mime: metadata.mime,
      chunks: early?.chunks || new Map(), bytes: early?.bytes || 0, bindings: metadata.bindings,
    }
    this.transfers.set(metadata.transferId, transfer)
    return transfer.chunks.size === transfer.total
  }

  add(chunk: RwmBinaryChunk) {
    const transfer = this.transfers.get(chunk.transferId)
    if (!transfer) return this.addPending(chunk)
    if (transfer.total !== chunk.total || transfer.kind !== chunk.kind) throw new Error('transfer_mismatch')
    if (transfer.chunks.has(chunk.index)) return false
    const limit = chunk.kind === 'snapshot' ? RWM_LIMITS.snapshotBytes : RWM_LIMITS.resourceBytes
    if (transfer.bytes + chunk.bytes.byteLength > transfer.expectedBytes) throw new Error('transfer_length')
    if (transfer.bytes + chunk.bytes.byteLength > limit || this.totalBytes + chunk.bytes.byteLength > 72 * 1024 * 1024) throw new Error('transfer_memory')
    transfer.chunks.set(chunk.index, chunk.bytes)
    transfer.bytes += chunk.bytes.byteLength
    this.totalBytes += chunk.bytes.byteLength
    return transfer.chunks.size === transfer.total
  }

  async take(transferId: string) {
    const transfer = this.transfers.get(transferId)
    if (!transfer || transfer.chunks.size !== transfer.total) throw new Error('transfer_incomplete')
    if (transfer.bytes !== transfer.expectedBytes) throw new Error('transfer_length')
    // Detach synchronously before hashing. A reset may reuse the same transfer id
    // while digest() is pending; the old completion must never delete that entry.
    this.totalBytes -= transfer.bytes
    this.transfers.delete(transferId)
    const bytes = new Uint8Array(transfer.bytes)
    let offset = 0
    for (let index = 0; index < transfer.total; index += 1) {
      const chunk = transfer.chunks.get(index)
      if (!chunk) throw new Error('transfer_gap')
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (transfer.hash && await sha256Hex(bytes) !== transfer.hash.toLowerCase()) throw new Error('transfer_hash')
    return { bytes, kind: transfer.kind, mime: transfer.mime, hash: transfer.hash || await sha256Hex(bytes), bindings: transfer.bindings }
  }

  delete(transferId: string) {
    const transfer = this.transfers.get(transferId)
    if (!transfer) return
    this.totalBytes -= transfer.bytes
    this.transfers.delete(transferId)
  }

  retainOnly(transferIds: Set<string>) {
    for (const transferId of [...this.transfers.keys()]) if (!transferIds.has(transferId)) this.delete(transferId)
    for (const transferId of [...this.pending.keys()]) if (!transferIds.has(transferId)) this.deletePending(transferId)
  }

  private addPending(chunk: RwmBinaryChunk) {
    let pending = this.pending.get(chunk.transferId)
    if (!pending) {
      if (this.pending.size >= 64) throw new Error('transfer_pending_limit')
      pending = { total: chunk.total, kind: chunk.kind, chunks: new Map(), bytes: 0 }
      this.pending.set(chunk.transferId, pending)
    }
    if (pending.total !== chunk.total || pending.kind !== chunk.kind) throw new Error('transfer_mismatch')
    if (pending.chunks.has(chunk.index)) return false
    const limit = chunk.kind === 'snapshot' ? RWM_LIMITS.snapshotBytes : RWM_LIMITS.resourceBytes
    if (pending.bytes + chunk.bytes.byteLength > limit || this.totalBytes + chunk.bytes.byteLength > 72 * 1024 * 1024) {
      throw new Error('transfer_memory')
    }
    pending.chunks.set(chunk.index, chunk.bytes)
    pending.bytes += chunk.bytes.byteLength
    this.totalBytes += chunk.bytes.byteLength
    // Completion is only actionable after trusted begin metadata arrives.
    return false
  }

  private deletePending(transferId: string) {
    const pending = this.pending.get(transferId)
    if (!pending) return
    this.totalBytes -= pending.bytes
    this.pending.delete(transferId)
  }

  clear() {
    this.transfers.clear()
    this.pending.clear()
    this.totalBytes = 0
  }
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'font/woff', 'font/woff2'])
const startsWith = (bytes: Uint8Array, expected: number[]) => expected.every((value, index) => bytes[index] === value)
export const hasAllowedResourceSignature = (bytes: Uint8Array, mime: string) => {
  if (mime === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mime === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (mime === 'image/gif') return new TextDecoder().decode(bytes.subarray(0, 6)) === 'GIF87a' || new TextDecoder().decode(bytes.subarray(0, 6)) === 'GIF89a'
  if (mime === 'image/webp') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
  if (mime === 'image/avif') return ['ftypavif', 'ftypavis'].includes(new TextDecoder().decode(bytes.subarray(4, 12)))
  if (mime === 'font/woff') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'wOFF'
  if (mime === 'font/woff2') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'wOF2'
  return false
}

type ImageInspector = (blob: Blob) => Promise<boolean>
const inspectImage: ImageInspector = async (blob) => {
  if (typeof createImageBitmap !== 'function') return false
  const bitmap = await createImageBitmap(blob)
  const safe = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 16_384 && bitmap.height <= 16_384
    && bitmap.width * bitmap.height <= 40_000_000
  bitmap.close()
  return safe
}

export class RwmResourceLru {
  private entries = new Map<string, { url: string; bytes: number; mime: string }>()
  private used = 0

  constructor(private readonly limit = 64 * 1024 * 1024, private readonly imageInspector: ImageInspector = inspectImage) {}

  async add(hash: string, bytes: Uint8Array, mime = '', shouldCommit: () => boolean = () => true) {
    if (!ALLOWED_MIME.has(mime) || bytes.byteLength > RWM_LIMITS.resourceBytes || !hasAllowedResourceSignature(bytes, mime)) throw new Error('resource_type')
    const blob = new Blob([Uint8Array.from(bytes)], { type: mime })
    if (mime.startsWith('image/') && !await this.imageInspector(blob)) throw new Error('resource_dimensions')
    if (!shouldCommit()) return ''
    this.delete(hash)
    while (this.used + bytes.byteLength > this.limit && this.entries.size) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (!oldest) break
      this.delete(oldest)
    }
    const url = URL.createObjectURL(blob)
    this.entries.set(hash, { url, bytes: bytes.byteLength, mime })
    this.used += bytes.byteLength
    return url
  }

  get(hash: string) {
    const entry = this.entries.get(hash)
    if (!entry) return ''
    this.entries.delete(hash)
    this.entries.set(hash, entry)
    return entry.url
  }

  delete(hash: string) {
    const entry = this.entries.get(hash)
    if (!entry) return
    URL.revokeObjectURL(entry.url)
    this.used -= entry.bytes
    this.entries.delete(hash)
  }

  clear() {
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url)
    this.entries.clear()
    this.used = 0
  }
}
