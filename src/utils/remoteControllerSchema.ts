import type { RemoteControllerAction, RemoteControllerControl, RemoteControllerTemplate } from '@/types/remoteController'

const KINDS = new Set(['button', 'dpad', 'keypad', 'slider', 'joystick', 'textInput'])
const DEVICE_TYPES = new Set(['android', 'desktop', 'browser', 'custom'])
export const REMOTE_CONTROLLER_KEYS = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown',
  'Tab', 'Space', 'Backspace', 'Delete', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'MediaPlayPause', 'MediaTrackPrevious', 'MediaTrackNext', 'AudioVolumeDown', 'AudioVolumeUp', 'AudioVolumeMute',
] as const
const KEYS = new Set<string>(REMOTE_CONTROLLER_KEYS)
const BROWSER_ACTIONS = new Set(['back', 'forward', 'reload'])
const CAPABILITIES = new Set(['remote_control', 'remote.control', 'remote_controller_templates'])
const ID_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/
const EMIT_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/
const RESERVED = ['rc.', 'rc-', 'rt.', 'rt-', 'web-action', 'controller-action']
const TEMPLATE_KEYS = new Set(['schema', 'id', 'name', 'revision', 'builtin', 'deviceTypes', 'requiredCapabilities', 'layout', 'controls'])
const CONTROL_KEYS = new Set(['id', 'kind', 'label', 'tone', 'action', 'min', 'max', 'step', 'deadZone', 'maxLength'])
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const onlyKeys = (value: Record<string, unknown>, allowed: Set<string>) => Object.keys(value).every(key => allowed.has(key))
const trimmed = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const utf8Size = (value: unknown) => {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength }
  catch { return Number.POSITIVE_INFINITY }
}

const parseAction = (value: unknown): RemoteControllerAction => {
  if (!isObject(value)) throw new Error('模板 action 必须是对象')
  const key = trimmed(value.key)
  const browser = trimmed(value.action)
  if (value.type === 'key' && KEYS.has(key) && onlyKeys(value, new Set(['type', 'key']))) return { type: 'key', key }
  if (value.type === 'browser' && BROWSER_ACTIONS.has(browser)
    && onlyKeys(value, new Set(['type', 'action']))) return { type: 'browser', action: browser as 'back' | 'forward' | 'reload' }
  if (value.type === 'emit' && typeof value.event === 'string' && onlyKeys(value, new Set(['type', 'event']))) {
    const event = value.event.trim()
    if (EMIT_PATTERN.test(event) && !RESERVED.some(prefix => event.startsWith(prefix))) return { type: 'emit', event }
  }
  throw new Error('模板 action 不在允许范围')
}

const controlBase = (value: unknown) => {
  if (!isObject(value) || !onlyKeys(value, CONTROL_KEYS)) throw new Error('模板控件字段无效')
  if (!ID_PATTERN.test(trimmed(value.id))) throw new Error('模板控件 id 无效')
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) throw new Error('模板控件 kind 无效')
  const label = trimmed(value.label)
  if (!label || label.length > 40) throw new Error('模板控件 label 无效')
  if (value.tone !== undefined && (typeof value.tone !== 'string' || !['default', 'primary', 'danger'].includes(value.tone))) throw new Error('模板控件 tone 无效')
  return value
}

const numericOptions = (value: Record<string, unknown>) => {
  const number = (key: string) => {
    if (value[key] === undefined) return undefined
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error(`模板控件 ${key} 无效`)
    return value[key] as number
  }
  if (value.maxLength !== undefined && (!Number.isSafeInteger(value.maxLength) || Number(value.maxLength) < 1)) throw new Error('模板控件 maxLength 无效')
  return { min: number('min'), max: number('max'), step: number('step'), deadZone: number('deadZone') }
}

const validateRange = (control: RemoteControllerControl) => {
  const hasRange = [control.min, control.max, control.step].some(item => item !== undefined)
  if (control.kind !== 'slider' && hasRange) throw new Error('控件范围字段无效')
  if (control.kind !== 'slider') return
  const valid = Number.isFinite(control.min) && Number.isFinite(control.max) && Number.isFinite(control.step)
    && Math.abs(control.min!) <= 1_000_000 && Math.abs(control.max!) <= 1_000_000
    && control.min! < control.max! && control.step! > 0 && control.step! <= control.max! - control.min!
  if (!valid) throw new Error('滑杆范围无效')
}

const validateKindOptions = (control: RemoteControllerControl) => {
  if (control.kind !== 'button' && control.action.type !== 'emit') throw new Error('非按钮控件必须使用 emit')
  validateRange(control)
  if (control.kind === 'joystick' && control.deadZone !== undefined && (control.deadZone < 0 || control.deadZone > 0.95)) throw new Error('摇杆死区无效')
  if (control.kind !== 'joystick' && control.deadZone !== undefined) throw new Error('控件死区字段无效')
  if (control.kind === 'textInput' && (!control.maxLength || control.maxLength > 1024)) throw new Error('文本长度无效')
  if (control.kind !== 'textInput' && control.maxLength !== undefined) throw new Error('控件文本长度字段无效')
}

const parseControl = (input: unknown): RemoteControllerControl => {
  const value = controlBase(input)
  const control: RemoteControllerControl = {
    id: trimmed(value.id), kind: value.kind as RemoteControllerControl['kind'], label: trimmed(value.label),
    tone: (value.tone || 'default') as RemoteControllerControl['tone'],
    action: parseAction(value.action), ...numericOptions(value),
    maxLength: Number.isSafeInteger(value.maxLength) ? Number(value.maxLength) : undefined,
  }
  validateKindOptions(control)
  return control
}

const templateBase = (value: unknown) => {
  if (!isObject(value) || !onlyKeys(value, TEMPLATE_KEYS) || value.schema !== 'remote_controller_template.v1') throw new Error('模板 schema 无效')
  if (!ID_PATTERN.test(trimmed(value.id))) throw new Error('模板 id 无效')
  const name = trimmed(value.name)
  if (!name || name.length > 80) throw new Error('模板名称无效')
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new Error('模板 revision 无效')
  if (typeof value.builtin !== 'boolean') throw new Error('模板 builtin 无效')
  return value
}

const templateCollections = (value: Record<string, unknown>) => {
  const devices = Array.isArray(value.deviceTypes) ? value.deviceTypes.map(trimmed) : []
  const capabilities = Array.isArray(value.requiredCapabilities) ? value.requiredCapabilities.map(trimmed) : []
  if (!validUniqueList(devices, DEVICE_TYPES)) throw new Error('模板设备类型无效')
  if (!validUniqueList(capabilities, CAPABILITIES)) throw new Error('模板能力无效')
  if (!capabilities.some(item => item === 'remote_control' || item === 'remote.control')) throw new Error('模板能力无效')
  if (!Array.isArray(value.controls) || value.controls.length < 1 || value.controls.length > 64) throw new Error('模板控件数量无效')
  return { deviceTypes: devices, capabilities, controls: value.controls.map(parseControl) }
}
const validUniqueList = (items: string[], allowed: Set<string>) => items.length >= 1 && items.length <= 4
  && new Set(items).size === items.length && items.every(item => allowed.has(item))

const templateLayout = (value: unknown): RemoteControllerTemplate['layout'] => {
  if (!isObject(value) || !onlyKeys(value, new Set(['columns', 'gap']))) throw new Error('模板布局无效')
  if (!Number.isSafeInteger(value.columns) || Number(value.columns) < 1 || Number(value.columns) > 12) throw new Error('模板布局无效')
  if (value.gap !== undefined && (typeof value.gap !== 'string' || !['xs', 'sm', 'md', 'lg'].includes(value.gap))) throw new Error('模板布局 gap 无效')
  const gap = value.gap || 'sm'
  return { columns: Number(value.columns), gap: gap as RemoteControllerTemplate['layout']['gap'] }
}

const validateControlSet = (controls: RemoteControllerControl[], capabilities: unknown[]) => {
  if (new Set(controls.map(control => control.id)).size !== controls.length) throw new Error('模板控件 id 重复')
  if (controls.some(control => control.action.type === 'emit') && !capabilities.includes('remote_controller_templates')) throw new Error('emit 模板缺少设备能力')
}

export const parseRemoteControllerTemplate = (input: unknown): RemoteControllerTemplate => {
  if (utf8Size(input) > 64 * 1024) throw new Error('模板大小超过 64 KiB')
  const value = templateBase(input)
  const parsed = templateCollections(value)
  validateControlSet(parsed.controls, parsed.capabilities)
  return {
    schema: 'remote_controller_template.v1', id: trimmed(value.id), name: trimmed(value.name),
    revision: Number(value.revision), builtin: value.builtin as boolean,
    deviceTypes: parsed.deviceTypes as RemoteControllerTemplate['deviceTypes'],
    requiredCapabilities: parsed.capabilities as string[], layout: templateLayout(value.layout), controls: parsed.controls,
  }
}

export const parseRemoteControllerTemplateList = (value: unknown) => {
  const items = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.items) ? value.items : []
  return items.slice(0, 64).map(parseRemoteControllerTemplate)
}
