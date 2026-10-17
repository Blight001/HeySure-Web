import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '../rwmProtocol'

const encode = (value: string) => new TextEncoder().encode(value)

afterEach(() => vi.unstubAllGlobals())

describe('SHA-256 HTTP-origin fallback', () => {
  it('matches standard golden vectors when crypto.subtle is unavailable', async () => {
    vi.stubGlobal('crypto', {})
    await expect(sha256Hex(encode(''))).resolves.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    await expect(sha256Hex(encode('abc'))).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const multiBlock = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    await expect(sha256Hex(encode(multiBlock))).resolves.toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  })

  it('falls back when subtle.digest exists but is unusable', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => { throw new Error('insecure_context') }) } })
    await expect(sha256Hex(encode('abc'))).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes a near-8MiB payload without constructing a padded payload copy', async () => {
    vi.stubGlobal('crypto', {})
    const bytes = new Uint8Array(8 * 1024 * 1024 - 17)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index & 0xff
    const buffer = bytes.buffer
    await expect(sha256Hex(bytes)).resolves.toBe('8961f3047073e4829ecbc946a900b23297218dc19214a12f614795baa722535f')
    expect(bytes.buffer).toBe(buffer)
    expect(bytes.byteLength).toBe(8 * 1024 * 1024 - 17)
  }, 15_000)
})
