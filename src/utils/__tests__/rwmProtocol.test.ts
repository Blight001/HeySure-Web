import { describe, expect, it } from 'vitest'
import { decodeRwmBinaryChunk, decodeRwmEnvelope } from '../rwmProtocol'

describe('RWM wire decoder', () => {
  const packet = (header: string, payload: Uint8Array) => {
    const encoded = new TextEncoder().encode(header)
    const value = new Uint8Array(4 + encoded.byteLength + payload.byteLength)
    new DataView(value.buffer).setUint32(0, encoded.byteLength)
    value.set(encoded, 4); value.set(payload, 4 + encoded.byteLength)
    return value
  }
  it('decodes the deterministic Device network-byte-order vector', () => {
    const header = '{"v":1,"type":"resource.chunk","sessionId":"rc_test","transferId":"res_test","index":0,"total":1}'
    const encoded = new TextEncoder().encode(header)
    expect(encoded.byteLength).toBe(97)
    const packet = new Uint8Array(4 + encoded.byteLength + 4)
    new DataView(packet.buffer).setUint32(0, encoded.byteLength)
    packet.set(encoded, 4)
    packet.set([0xde, 0xad, 0xbe, 0xef], 4 + encoded.byteLength)
    expect([...packet.subarray(0, 4)]).toEqual([0, 0, 0, 0x61])
    expect(decodeRwmBinaryChunk(packet)).toMatchObject({
      sessionId: 'rc_test', transferId: 'res_test', kind: 'resource', index: 0, total: 1,
      bytes: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    })
  })

  it('rejects little endian, malformed and oversized state input', () => {
    const packet = new Uint8Array([0x61, 0, 0, 0, 0x7b, 0x7d, 1])
    expect(() => decodeRwmBinaryChunk(packet)).toThrow('chunk_header_size')
    expect(() => decodeRwmEnvelope('{')).toThrow('state_json')
    expect(() => decodeRwmEnvelope('x'.repeat(256 * 1024 + 1))).toThrow('state_size')
    const unicode = JSON.stringify({
      v: 1, type: 'page.reset', sessionId: 's', pageId: 'p', epoch: 1, seq: 0, ts: 1,
      body: { reason: '中'.repeat(100_000), urlOrigin: 'https://test', viewport: { width: 1, height: 1, dpr: 1 } },
    })
    expect(unicode.length).toBeLessThan(256 * 1024)
    expect(() => decodeRwmEnvelope(unicode)).toThrow('state_size')
  })

  it('rejects unknown envelope/body fields and binary payloads above 16 KiB', () => {
    const valid = {
      v: 1, type: 'page.reset', sessionId: 's', pageId: 'p', epoch: 1, seq: 0, ts: 1,
      body: { reason: 'navigation', urlOrigin: 'https://test', viewport: { width: 800, height: 600, dpr: 1 } },
    }
    expect(decodeRwmEnvelope(JSON.stringify(valid)).type).toBe('page.reset')
    expect(() => decodeRwmEnvelope(JSON.stringify({ ...valid, html: '<b>' }))).toThrow('state_envelope')
    expect(() => decodeRwmEnvelope(JSON.stringify({ ...valid, body: { ...valid.body, html: '<b>' } }))).toThrow('state_body')
    const header = '{"v":1,"type":"resource.chunk","sessionId":"rc_test","transferId":"res_test","index":0,"total":1}'
    expect(() => decodeRwmBinaryChunk(packet(header, new Uint8Array(16 * 1024 + 1)))).toThrow('chunk_payload_size')
  })
})
