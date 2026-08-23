import { ref, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createFastChannelJsonSender, sendDataChannelJson } from '../useRemoteControl'
import { attachRemoteDataChannel, emptyRemoteControlState, teardownSession, type RemoteControlCtx } from '../useRemoteControlHelpers'

describe('remote control data channel send', () => {
  it('returns false when RTCDataChannel.send throws', () => {
    const channel = { readyState: 'open', bufferedAmount: 0, send: vi.fn(() => { throw new Error('closed') }) } as unknown as RTCDataChannel
    expect(sendDataChannelJson(channel, { kind: 'test' }, 1024)).toBe(false)
  })

  it('keeps fast-channel backpressure latched until the low watermark', () => {
    const channel = { readyState: 'open', bufferedAmount: 64 * 1024 + 1, send: vi.fn() } as unknown as RTCDataChannel
    const sender = createFastChannelJsonSender(() => channel)
    expect(sender.send({ seq: 1 })).toBe(false)
    ;(channel as any).bufferedAmount = 32 * 1024
    expect(sender.send({ seq: 2 })).toBe(false)
    ;(channel as any).bufferedAmount = 16 * 1024
    expect(sender.send({ seq: 3 })).toBe(true)
    expect(channel.send).toHaveBeenCalledTimes(1)
  })

  it('detaches old data-channel handlers and ignores captured callbacks after teardown', () => {
    const handler = vi.fn()
    const ctx = {
      ...emptyRemoteControlState(), status: ref('streaming'), errorMessage: ref(''), deviceWidth: ref(0), deviceHeight: ref(0),
      remoteStream: shallowRef(null), controlReady: ref(false), connectionState: ref('connected'), browserState: ref(null),
      webStateReady: ref(false), webResourceReady: ref(false), controllerFastReady: ref(false), controlMessageHandler: handler,
    } as unknown as RemoteControlCtx
    const channel = { label: 'control', readyState: 'open', bufferedAmount: 0, send: vi.fn() } as unknown as RTCDataChannel
    attachRemoteDataChannel(ctx, channel)
    const staleCallback = channel.onmessage!
    teardownSession(ctx, false)
    expect(channel.onmessage).toBeNull()
    staleCallback.call(channel, { data: JSON.stringify({ kind: 'late-message' }) } as MessageEvent)
    expect(handler).not.toHaveBeenCalled()
  })
})
