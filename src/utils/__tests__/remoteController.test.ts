import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_REMOTE_CONTROLLER_TEMPLATES } from '@/constants/remoteControllers'
import { sanitizeControllerValue, useRemoteControllerTransport } from '@/composables/useRemoteControllerTransport'
import { parseRemoteControllerTemplate } from '../remoteControllerSchema'
import { applyJoystickDeadZone } from '../remoteControllerValue'

describe('remote controller templates', () => {
  it('accepts canonical builtins and rejects arbitrary actions or missing emit capability', () => {
    for (const template of BUILTIN_REMOTE_CONTROLLER_TEMPLATES) expect(parseRemoteControllerTemplate(template).id).toBe(template.id)
    const unsafe = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0]) as any
    unsafe.controls[0].action = { type: 'emit', event: 'rc.start' }
    expect(() => parseRemoteControllerTemplate(unsafe)).toThrow()
    unsafe.controls[0].action = { type: 'emit', event: 'safe.event' }
    expect(() => parseRemoteControllerTemplate(unsafe)).toThrow('emit 模板缺少设备能力')
  })

  it('keeps legacy keys on control and emits custom actions only through P2P', () => {
    const sendInput = vi.fn()
    const sendControlJson = vi.fn((_payload: unknown, _maxBufferedAmount?: number) => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput, sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(() => false),
      controllerFastReady: false,
    })
    transport.trigger(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0], BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0].controls[0])
    expect(sendInput).toHaveBeenCalledWith(expect.objectContaining({ type: 'key', key: 'ArrowUp' }))
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    template.requiredCapabilities.push('remote_controller_templates')
    template.controls[0].action = { type: 'emit', event: 'safe.event' }
    transport.trigger(template, template.controls[0], 'value')
    expect(sendControlJson).toHaveBeenCalledWith(expect.objectContaining({ kind: 'controller-action', event: 'safe.event', phase: 'trigger' }))
  })

  it('coalesces continuous updates to the latest animation frame value', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const sendFastJson = vi.fn(() => true)
    const sendControlJson = vi.fn((_payload: unknown, _maxBufferedAmount?: number) => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson,
      controllerFastReady: true,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0, y: 0 })
    sendControlJson.mockClear()
    transport.sendContinuous(template, control, 'update', { x: 0.1, y: 0.2 })
    transport.sendContinuous(template, control, 'update', { x: 0.8, y: -0.5 })
    expect(sendFastJson).not.toHaveBeenCalled()
    frame?.(16)
    expect(sendFastJson).toHaveBeenCalledTimes(1)
    expect(sendFastJson).toHaveBeenCalledWith(expect.objectContaining({ event: 'stick.move', value: { x: 0.8, y: -0.5 } }))
  })

  it('keeps backpressured fast updates off reliable control and preserves the latest value', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
    const sendFastJson = vi.fn(() => false)
    const sendControlJson = vi.fn(() => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson, controllerFastReady: true,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0, y: 0 })
    sendControlJson.mockClear()
    transport.sendContinuous(template, control, 'update', { x: 0.1, y: 0.2 })
    frame?.(16)
    expect(sendControlJson).not.toHaveBeenCalled()
    transport.sendContinuous(template, control, 'update', { x: 0.9, y: 0.8 })
    sendFastJson.mockReturnValue(true)
    frame?.(32)
    expect(sendFastJson).toHaveBeenLastCalledWith(expect.objectContaining({ value: { x: 0.9, y: 0.8 } }))
    expect(sendControlJson).not.toHaveBeenCalled()
  })
})

describe('remote controller continuous controls and schema', () => {
  it('heartbeats an unchanged active continuous control within the dead-man window', () => {
    vi.useFakeTimers()
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const sendFastJson = vi.fn(() => true)
    const sendControlJson = vi.fn(() => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson, controllerFastReady: true,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0.4, y: 0.2 })
    vi.advanceTimersByTime(100)
    transport.sendContinuous(template, control, 'start', { x: 0.4, y: 0.2 })
    vi.advanceTimersByTime(100)
    expect(sendFastJson).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    frame?.(300)
    expect(sendFastJson).toHaveBeenCalledWith(expect.objectContaining({ phase: 'update', value: { x: 0.4, y: 0.2 } }))
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    const heartbeatCount = sendFastJson.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(sendFastJson).toHaveBeenCalledTimes(heartbeatCount)
    expect(sendControlJson).toHaveBeenCalledWith(expect.objectContaining({ phase: 'end' }))
    transport.dispose()
    vi.useRealTimers()
  })

  it('restarts a held control once when fast closes, then heartbeats reliably', () => {
    vi.useFakeTimers()
    let frame: FrameRequestCallback | undefined
    let fastReady = true
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const sendControlJson = vi.fn((_payload: unknown, _maxBufferedAmount?: number) => true)
    const channel = {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(() => true),
      get controllerFastReady() { return fastReady },
    }
    const transport = useRemoteControllerTransport('desktop', channel)
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0.3, y: 0.4 })
    fastReady = false
    vi.advanceTimersByTime(200)
    frame?.(200)
    expect(sendControlJson.mock.calls.map(call => (call[0] as any).phase)).toEqual(['start', 'start', 'update'])
    vi.advanceTimersByTime(200)
    frame?.(400)
    expect(sendControlJson.mock.calls.filter(call => (call[0] as any).phase === 'start')).toHaveLength(2)
    expect(sendControlJson).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'update', value: { x: 0.3, y: 0.4 } }), 64 * 1024)
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    expect(sendControlJson).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'end' }))
    transport.dispose()
    vi.useRealTimers()
  })

  it('retries reliable end a bounded number of times and rejects coerced axes', () => {
    vi.useFakeTimers()
    const sendControlJson = vi.fn((_payload: unknown, _maxBufferedAmount?: number) => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(), controllerFastReady: false,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0, y: 0 })
    sendControlJson.mockClear()
    sendControlJson.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true)
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    vi.runAllTimers()
    expect(sendControlJson).toHaveBeenCalledTimes(3)
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    expect(sendControlJson).toHaveBeenCalledTimes(3)
    expect(sanitizeControllerValue({ x: '1', y: false })).toBeNull()
    expect(applyJoystickDeadZone({ x: 0.05, y: 0.05 }, 0.1)).toEqual({ x: 0, y: 0 })
    transport.dispose()
    vi.useRealTimers()
  })

  it('cancels a failed pending start when end arrives without sending a delayed start', () => {
    vi.useFakeTimers()
    const sendControlJson = vi.fn((_payload: unknown) => false)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(), controllerFastReady: false,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0.2, y: 0.2 })
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    vi.runAllTimers()
    expect(sendControlJson).toHaveBeenCalledTimes(1)
    expect(sendControlJson).toHaveBeenCalledWith(expect.objectContaining({ phase: 'start' }))
    transport.dispose()
    vi.useRealTimers()
  })

})

describe('remote controller continuous cleanup', () => {
  it('still sends end when a delivered start is followed by a failed fast-close restart', () => {
    vi.useFakeTimers()
    let fastReady = true
    const sendControlJson = vi.fn((_payload: unknown) => true).mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValue(true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(),
      get controllerFastReady() { return fastReady },
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'joystick'; control.action = { type: 'emit', event: 'stick.move' }
    transport.sendContinuous(template, control, 'start', { x: 0.2, y: 0.2 })
    fastReady = false
    transport.sendContinuous(template, control, 'update', { x: 0.3, y: 0.3 })
    transport.sendContinuous(template, control, 'end', { x: 0, y: 0 })
    vi.runAllTimers()
    expect(sendControlJson.mock.calls.map(call => (call[0] as any).phase)).toEqual(['start', 'start', 'end'])
    transport.dispose()
    vi.useRealTimers()
  })

  it('releases hidden continuous controls once and stops their heartbeat', () => {
    vi.useFakeTimers()
    const sendControlJson = vi.fn((_payload: unknown) => true)
    const transport = useRemoteControllerTransport('desktop', {
      sendInput: vi.fn(), sendBrowserCommand: vi.fn(), sendControlJson, sendFastJson: vi.fn(), controllerFastReady: true,
    })
    const template = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0])
    const control = template.controls[0]
    control.kind = 'slider'; control.action = { type: 'emit', event: 'slider.move' }
    transport.sendContinuous(template, control, 'start', 0.5)
    transport.releaseAllContinuous()
    transport.releaseAllContinuous()
    vi.advanceTimersByTime(1_000)
    expect(sendControlJson.mock.calls.map(call => (call[0] as any).phase)).toEqual(['start', 'end'])
    transport.dispose()
    vi.useRealTimers()
  })
})

describe('remote controller schema parity', () => {
  it('matches the Server builtin documents and rejects loose template fields', () => {
    expect(BUILTIN_REMOTE_CONTROLLER_TEMPLATES.map(item => ({
      id: item.id, name: item.name, deviceTypes: item.deviceTypes, columns: item.layout.columns,
      controls: item.controls.map(control => [control.id, control.label, control.tone]),
    }))).toEqual([
      { id: 'direction', name: '方向遥控器', deviceTypes: ['desktop', 'android', 'browser'], columns: 3, controls: [['up', '上', 'default'], ['left', '左', 'default'], ['ok', '确定', 'default'], ['right', '右', 'default'], ['down', '下', 'default'], ['back', '返回', 'default']] },
      { id: 'media', name: '媒体遥控器', deviceTypes: ['desktop', 'android'], columns: 3, controls: [['previous', '上一首', 'default'], ['play-pause', '播放/暂停', 'default'], ['next', '下一首', 'default'], ['volume-down', '音量-', 'default'], ['mute', '静音', 'default'], ['volume-up', '音量+', 'default']] },
      { id: 'presentation', name: '演示遥控器', deviceTypes: ['desktop'], columns: 3, controls: [['previous', '上一页', 'default'], ['next', '下一页', 'default'], ['start', '开始', 'default'], ['exit', '退出', 'default']] },
      { id: 'browser', name: '浏览器遥控器', deviceTypes: ['browser'], columns: 3, controls: [['back', '后退', 'default'], ['reload', '刷新', 'primary'], ['forward', '前进', 'default']] },
      { id: 'jibotarm', name: 'AI Mechanical Arm', deviceTypes: ['custom'], columns: 2, controls: [['joint1', '关节 1', 'default'], ['joint2', '关节 2', 'default'], ['joint3', '关节 3', 'default'], ['joint4', '关节 4', 'default'], ['joint5', '关节 5', 'default'], ['joint6', '关节 6', 'default']] },
    ])
    const loose = structuredClone(BUILTIN_REMOTE_CONTROLLER_TEMPLATES[0]) as any
    loose.deviceTypes.push('desktop')
    expect(() => parseRemoteControllerTemplate(loose)).toThrow('模板设备类型无效')
    loose.deviceTypes = ['desktop']; loose.controls[0].tone = 1
    expect(() => parseRemoteControllerTemplate(loose)).toThrow('tone')
    loose.controls[0].tone = 'default'; loose.controls[0].min = '0'
    expect(() => parseRemoteControllerTemplate(loose)).toThrow('min')
    loose.controls[0].min = undefined; loose.name = ' '.repeat(81)
    expect(() => parseRemoteControllerTemplate(loose)).toThrow('模板名称无效')
    loose.name = 'x'.repeat(70_000)
    expect(() => parseRemoteControllerTemplate(loose)).toThrow('64 KiB')
  })
})
