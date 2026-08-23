import type { RwmBinaryChunk, RwmEnvelope, RwmSnapshot } from '@/types/rwm'
import { validateRwmSnapshot } from './rwmValidation'
import { validateRwmEnvelopeBody } from './rwmEnvelopeValidation'
import { sha256Fallback } from './sha256Fallback'

export const RWM_LIMITS = {
  stateBytes: 256 * 1024,
  snapshotBytes: 8 * 1024 * 1024,
  resourceBytes: 4 * 1024 * 1024,
  nodes: 50_000,
  chunks: 1024,
  patchOps: 500,
  string: 16_384,
} as const
const MAX_CHUNK_PACKET_BYTES = 4 + 4096 + 16 * 1024

const ENVELOPE_TYPES = new Set(['snapshot.begin', 'snapshot.end', 'resource.begin', 'resource.end', 'patch', 'page.reset', 'surface.status'])
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const safeInteger = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min
const safeId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160
const CHUNK_KEYS = new Set(['v', 'type', 'sessionId', 'transferId', 'index', 'total'])
const ENVELOPE_KEYS = new Set(['v', 'type', 'sessionId', 'pageId', 'epoch', 'seq', 'ts', 'body'])

const binaryBytes = (raw: unknown) => {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  return null
}

const parseChunkHeader = (bytes: Uint8Array) => {
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0)
  if (headerLength < 2 || headerLength > 4096 || 4 + headerLength >= bytes.byteLength) throw new Error('chunk_header_size')
  let header: unknown
  try { header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength))) }
  catch { throw new Error('chunk_header_json') }
  return { header, headerLength }
}

const validateChunkHeader = (value: unknown) => {
  if (!isObject(value) || !Object.keys(value).every(key => CHUNK_KEYS.has(key))) throw new Error('chunk_identity')
  if (value.v !== 1 || !safeId(value.sessionId) || !safeId(value.transferId)) throw new Error('chunk_identity')
  const kind = value.type === 'snapshot.chunk' ? 'snapshot' : value.type === 'resource.chunk' ? 'resource' : ''
  if (!kind) throw new Error('chunk_kind')
  if (!safeInteger(value.index) || !safeInteger(value.total, 1) || Number(value.total) > RWM_LIMITS.chunks) throw new Error('chunk_index')
  if (Number(value.index) >= Number(value.total)) throw new Error('chunk_range')
  return { header: value, kind: kind as RwmBinaryChunk['kind'] }
}

export const decodeRwmEnvelope = (raw: unknown): RwmEnvelope => {
  if (typeof raw !== 'string' || raw.length > RWM_LIMITS.stateBytes
    || new TextEncoder().encode(raw).byteLength > RWM_LIMITS.stateBytes) throw new Error('state_size')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('state_json') }
  if (!isObject(parsed) || !Object.keys(parsed).every(key => ENVELOPE_KEYS.has(key))
    || parsed.v !== 1 || !ENVELOPE_TYPES.has(String(parsed.type))) throw new Error('state_envelope')
  if (!safeId(parsed.sessionId) || !safeId(parsed.pageId)) throw new Error('state_identity')
  if (!safeInteger(parsed.epoch) || !safeInteger(parsed.seq) || !safeInteger(parsed.ts)) throw new Error('state_sequence')
  if (!validateRwmEnvelopeBody(String(parsed.type), parsed.body)) throw new Error('state_body')
  return parsed as unknown as RwmEnvelope
}

export const decodeRwmBinaryChunk = (raw: unknown): RwmBinaryChunk => {
  const bytes = binaryBytes(raw)
  if (!bytes || bytes.byteLength < 6 || bytes.byteLength > MAX_CHUNK_PACKET_BYTES) throw new Error('chunk_size')
  const parsed = parseChunkHeader(bytes)
  const { header, kind } = validateChunkHeader(parsed.header)
  const payload = bytes.slice(4 + parsed.headerLength)
  if (payload.byteLength > 16 * 1024) throw new Error('chunk_payload_size')
  return {
    sessionId: header.sessionId as string,
    transferId: header.transferId as string,
    kind,
    index: Number(header.index),
    total: Number(header.total),
    bytes: payload,
  }
}

export const decodeRwmSnapshot = (bytes: Uint8Array): RwmSnapshot => {
  if (bytes.byteLength > RWM_LIMITS.snapshotBytes) throw new Error('snapshot_size')
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('snapshot_json') }
  return validateRwmSnapshot(parsed) as RwmSnapshot
}

export const sha256Hex = async (bytes: Uint8Array) => {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const source = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer : bytes.slice().buffer
      const digest = await subtle.digest('SHA-256', source)
      return toHex(new Uint8Array(digest))
    } catch { /* HTTP origins may expose crypto without a usable subtle implementation */ }
  }
  return toHex(sha256Fallback(bytes))
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export const decompressRwmPayload = async (bytes: Uint8Array, compression: 'gzip' | 'none') => {
  if (compression === 'none') return bytes
  if (typeof DecompressionStream === 'undefined') throw new Error('compression_unsupported')
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const item = await reader.read()
    if (item.done) break
    total += item.value.byteLength
    if (total > RWM_LIMITS.snapshotBytes) {
      await reader.cancel()
      throw new Error('decompressed_size')
    }
    chunks.push(item.value)
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}
