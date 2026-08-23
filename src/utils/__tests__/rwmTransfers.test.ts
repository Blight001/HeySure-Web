import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../rwmProtocol'
import { RwmTransferAssembler } from '../rwmTransfers'

describe('RWM cross-channel transfer assembly', () => {
  const chunk = (bytes: Uint8Array) => ({
    sessionId: 'rc_test', transferId: 'snap_test', kind: 'snapshot' as const,
    index: 0, total: 1, bytes,
  })

  it('buffers a resource-stream chunk that races ahead of its state begin envelope', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const assembler = new RwmTransferAssembler()
    expect(assembler.add(chunk(bytes))).toBe(false)
    expect(assembler.begin({
      transferId: 'snap_test', total: 1, bytes: bytes.byteLength,
      hash: await sha256Hex(bytes), kind: 'snapshot',
    })).toBe(true)
    expect((await assembler.take('snap_test')).bytes).toEqual(bytes)
  })

  it('rejects binary content that exceeds or does not equal declared bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const tooSmall = new RwmTransferAssembler()
    tooSmall.begin({ transferId: 'snap_test', total: 1, bytes: 2, hash: await sha256Hex(bytes), kind: 'snapshot' })
    expect(() => tooSmall.add(chunk(bytes))).toThrow('transfer_length')

    const tooLarge = new RwmTransferAssembler()
    tooLarge.begin({ transferId: 'snap_test', total: 1, bytes: 4, hash: await sha256Hex(bytes), kind: 'snapshot' })
    expect(tooLarge.add(chunk(bytes))).toBe(true)
    await expect(tooLarge.take('snap_test')).rejects.toThrow('transfer_length')
  })
})
