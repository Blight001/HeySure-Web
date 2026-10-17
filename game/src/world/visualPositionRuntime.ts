/**
 * 世界素材坐标的临时调试层。
 *
 * `layout.ts` 与 `map.ts` 继续保存提交到源码的默认坐标；本模块只记录
 * 浏览器端拖拽产生的覆盖值。编辑完成后可从调试面板复制代码，再由开发者
 * 把需要保留的坐标写回地图配置。
 */

export const VISUAL_POSITION_GROUPS = [
  'tree',
  'bush',
  'character',
  'building',
  'prop',
  'effect',
  'atmosphere',
] as const

export type VisualPositionGroup = (typeof VISUAL_POSITION_GROUPS)[number]

export interface VisualPosition {
  x: number
  y: number
}

export interface VisualPositionRegistration extends VisualPosition {
  key: string
  group: VisualPositionGroup
  label?: string
}

export interface VisualPositionEntry extends VisualPositionRegistration {
  /** 注册时的源码坐标，用来避免复制未移动的对象。 */
  baseX: number
  baseY: number
}

/** Phaser 对象的最小结构，避免坐标调试层依赖 Phaser 类型。 */
export interface VisualPositionObject {
  x: number
  y: number
  setPosition?: (x: number, y: number) => unknown
  setData?: (key: string, value: unknown) => unknown
  getData?: (key: string) => unknown
}

export interface VisualPositionTarget {
  key: string
  group: VisualPositionGroup
  label?: string
  source?: string
  object: VisualPositionObject
}

export interface VisualPositionObjectOptions {
  key: string
  group?: VisualPositionGroup
  label?: string
  source?: string
  /** 编辑模式关闭后仍保留应用自身的拖拽行为（角色/作坊）。 */
  preserveDraggable?: boolean
}

// v2 以本次写入的坐标覆盖值为新基线，避免旧浏览器临时值覆盖已确认坐标。
const STORAGE_KEY = 'heysure.world.visual-position-overrides.v2'
/** 提交到源码的坐标覆盖；网页调试值会在其上叠加。 */
export const VISUAL_POSITION_OVERRIDES: Record<string, VisualPosition> = {
  "building:library": { x: 285.6, y: 456.8 },
  "building:spawn": { x: 218.8, y: 730.9 },
  "bush:0": { x: 21.2, y: 145.5 },
  "bush:1": { x: 116.9, y: 419.5 },
  "bush:13": { x: 655.8, y: 143.7 },
  "bush:18": { x: 988.0, y: 861.4 },
  "bush:2": { x: 516.6, y: 129.4 },
  "bush:23": { x: 386.5, y: 330.0 },
  "bush:25": { x: 84.7, y: 284.2 },
  "bush:26": { x: 1366.2, y: 304.9 },
  "bush:27": { x: 1373.7, y: 339.0 },
  "bush:28": { x: 564.3, y: 293.9 },
  "bush:3": { x: 105.3, y: 613.5 },
  "bush:30": { x: 415.3, y: 591.6 },
  "bush:31": { x: 920.8, y: 310.5 },
  "bush:33": { x: 1375.6, y: 594.3 },
  "bush:34": { x: 1367.2, y: 484.3 },
  "bush:35": { x: 207.5, y: 618.2 },
  "bush:36": { x: 33.5, y: 876.9 },
  "bush:37": { x: 152.3, y: 114.5 },
  "bush:4": { x: 391.8, y: 99.6 },
  "bush:41": { x: 1248.8, y: 291.0 },
  "bush:43": { x: 1339.0, y: 104.0 },
  "bush:44": { x: 1182.7, y: 89.5 },
  "bush:45": { x: 717.2, y: 272.9 },
  "bush:46": { x: 1203.6, y: 823.9 },
  "bush:48": { x: 1325.5, y: 841.9 },
  "bush:49": { x: 1101.6, y: 278.0 },
  "bush:5": { x: 1164.8, y: 836.4 },
  "bush:51": { x: 1137.7, y: 307.7 },
  "bush:52": { x: 903.6, y: 272.7 },
  "bush:53": { x: 766.0, y: 211.4 },
  "bush:54": { x: 138.6, y: 921.9 },
  "bush:55": { x: 782.9, y: 902.8 },
  "bush:56": { x: 220.7, y: 929.9 },
  "bush:6": { x: 655.5, y: 808.4 },
  "bush:7": { x: 807.4, y: 144.0 },
  "character:1": { x: 401.5, y: 539.0 },
  "character:4": { x: 188.3, y: 837.5 },
  "character:6": { x: 135.2, y: 762.8 },
  "character:7": { x: 318.5, y: 861.8 },
  "tree:1": { x: 448.4, y: 1048.2 },
  "tree:11": { x: 586.6, y: 1000.7 },
  "tree:12": { x: 536.4, y: 1060.3 },
  "tree:14": { x: 696.5, y: 1023.8 },
  "tree:15": { x: 843.5, y: 1004.0 },
  "tree:16": { x: 912.0, y: 341.1 },
  "tree:18": { x: 844.2, y: 279.2 },
  "tree:2": { x: 49.5, y: 974.2 },
  "tree:20": { x: 956.4, y: 955.8 },
  "tree:22": { x: 1030.2, y: 1049.0 },
  "tree:24": { x: 1100.1, y: 950.4 },
  "tree:27": { x: 1146.1, y: 1045.1 },
  "tree:29": { x: 1317.4, y: 931.5 },
  "tree:3": { x: 144.6, y: 712.1 },
  "tree:31": { x: 1246.0, y: 1069.8 },
  "tree:35": { x: 1317.6, y: 398.6 },
  "tree:37": { x: 1026.9, y: 411.0 },
  "tree:38": { x: 1282.5, y: 251.7 },
  "tree:39": { x: 48.0, y: 370.2 },
  "tree:4": { x: 302.7, y: 1056.3 },
  "tree:40": { x: 1100.5, y: 319.6 },
  "tree:41": { x: 41.5, y: 479.7 },
  "tree:42": { x: 318.7, y: 235.0 },
  "tree:43": { x: 814.0, y: 435.8 },
  "tree:44": { x: 989.3, y: 252.3 },
  "tree:45": { x: 161.5, y: 828.6 },
  "tree:46": { x: 448.8, y: 263.9 },
  "tree:47": { x: 404.4, y: 386.1 },
  "tree:48": { x: 1168.2, y: 391.1 },
  "tree:49": { x: 74.8, y: 620.4 },
  "tree:5": { x: 385.3, y: 819.5 },
  "tree:50": { x: 1374.0, y: 674.9 },
  "tree:51": { x: 51.1, y: 741.2 },
  "tree:52": { x: 121.4, y: 501.3 },
  "tree:53": { x: 58.7, y: 843.3 },
  "tree:54": { x: 706.1, y: 343.4 },
  "tree:55": { x: 585.8, y: 271.4 },
  "tree:56": { x: 639.6, y: 431.1 },
  "tree:57": { x: 494.7, y: 584.5 },
  "tree:58": { x: 1381.0, y: 561.3 },
  "tree:59": { x: 1371.4, y: 332.0 },
  "tree:60": { x: 1193.0, y: 972.6 },
  "tree:61": { x: 877.9, y: 1059.0 },
  "tree:62": { x: 1387.8, y: 783.8 },
  "tree:63": { x: 1097.3, y: 229.4 },
  "tree:64": { x: 21.6, y: 511.3 },
  "tree:65": { x: 220.5, y: 280.7 },
  "tree:7": { x: 424.0, y: 982.7 },
  "tree:8": { x: 532.7, y: 363.1 },
  "tree:9": { x: 475.8, y: 470.7 },
} as const
const entries = new Map<string, VisualPositionEntry>()
const overrides = new Map<string, VisualPosition>()
const objectTargets = new WeakMap<object, VisualPositionTarget>()
const keyObjects = new Map<string, VisualPositionObject>()
const listeners = new Set<(value: Record<string, VisualPosition>) => void>()
const editorListeners = new Set<(enabled: boolean) => void>()

let editorEnabled = false

const finite = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(-100000, Math.min(100000, value))
}

const normalize = (point: VisualPosition): VisualPosition => ({
  x: finite(Number(point.x)),
  y: finite(Number(point.y)),
})

const groupForKey = (key: string, source?: string): VisualPositionGroup => {
  const prefix = (source === 'workshop' ? 'building' : source ?? key.split(':', 1)[0]) as VisualPositionGroup
  return VISUAL_POSITION_GROUPS.includes(prefix) ? prefix : 'prop'
}

const samePoint = (a: VisualPosition, b: VisualPosition): boolean => (
  Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001
)

const snapshot = (): Record<string, VisualPosition> => {
  const result: Record<string, VisualPosition> = {}
  for (const [key, point] of overrides) result[key] = { ...point }
  return result
}

const emit = () => {
  const value = snapshot()
  for (const listener of listeners) listener(value)
}

const persist = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()))
  } catch {
    // 隐私模式或存储额度不足时，当前页面仍可继续编辑。
  }
}

const readRecord = (parsed: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object') continue
    const point = value as Partial<VisualPosition>
    if (Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
      overrides.set(key, normalize({ x: Number(point.x), y: Number(point.y) }))
    }
  }
}

const readStored = () => {
  readRecord(VISUAL_POSITION_OVERRIDES)
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    readRecord(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    // 损坏的调试缓存不应阻断世界场景启动。
  }
}

readStored()

/** 注册一个世界对象，并返回应用临时覆盖后的坐标。 */
export const registerVisualPosition = (registration: VisualPositionRegistration): VisualPosition => {
  const committed = VISUAL_POSITION_OVERRIDES[registration.key]
  const base = normalize(committed ?? registration)
  const override = overrides.get(registration.key)
  const current = override ? { ...override } : base
  entries.set(registration.key, {
    key: registration.key,
    group: registration.group,
    label: registration.label,
    x: current.x,
    y: current.y,
    baseX: base.x,
    baseY: base.y,
  })
  return current
}

/**
 * 标记可编辑对象并立即应用 localStorage 中的坐标覆盖。
 * 场景模块只需在创建对象后调用一次，输入模块可通过
 * `visualPositionTargetFor` 找回稳定 key。
 */
export const markVisualPositionObject = (
  object: VisualPositionObject,
  options: VisualPositionObjectOptions,
): VisualPositionTarget => {
  const target: VisualPositionTarget = {
    key: options.key,
    group: options.group ?? groupForKey(options.key, options.source),
    label: options.label,
    source: options.source,
    object,
  }
  const current = registerVisualPosition({
    key: target.key,
    group: target.group,
    label: target.label,
    x: object.x,
    y: object.y,
  })
  objectTargets.set(object as object, target)
  keyObjects.set(target.key, object)
  object.setData?.('visualPositionWasInteractive', Boolean((object as { input?: unknown }).input))
  object.setData?.('visualPositionPreserveDraggable', options.preserveDraggable === true)
  object.setData?.('visualPositionTarget', target)
  object.setData?.('visualPositionKey', target.key)
  object.setPosition?.(current.x, current.y)
  return target
}

export const visualPositionTargetFor = (object: unknown): VisualPositionTarget | null => {
  if (!object || typeof object !== 'object') return null
  const direct = objectTargets.get(object)
  if (direct) return direct
  const candidate = (object as VisualPositionObject).getData?.('visualPositionTarget')
  if (!candidate || typeof candidate !== 'object') return null
  return candidate as VisualPositionTarget
}

/** 记录拖拽结束时对象的当前世界坐标。 */
export const recordVisualPosition = (object: VisualPositionObject): VisualPosition | null => {
  const target = visualPositionTargetFor(object)
  if (!target) return null
  const point = updateVisualPosition(target.key, object.x, object.y)
  const entry = entries.get(target.key)
  if (entry) {
    entry.x = point.x
    entry.y = point.y
  }
  return point
}

/** 移除一个场景对象的注册，不会删除已保存的覆盖值。 */
export const unregisterVisualPosition = (key: string) => {
  entries.delete(key)
  keyObjects.delete(key)
}

/** Phaser 场景重启时清理旧对象索引，localStorage 覆盖值会保留。 */
export const clearVisualPositionRegistry = () => {
  entries.clear()
  keyObjects.clear()
}

/** 返回配置覆盖后的坐标，适合在创建 Phaser 对象前调用。 */
export const positionBy = (key: string, base: VisualPosition): VisualPosition => {
  const override = overrides.get(key)
  if (override) return { ...override }
  const committed = VISUAL_POSITION_OVERRIDES[key]
  return committed ? normalize(committed) : normalize(base)
}

export const getVisualPosition = (key: string): VisualPosition | null => {
  const entry = entries.get(key)
  if (entry) return { x: entry.x, y: entry.y }
  const override = overrides.get(key)
  if (override) return { ...override }
  const committed = VISUAL_POSITION_OVERRIDES[key]
  return committed ? normalize(committed) : null
}

export const getVisualPositionEntries = (): VisualPositionEntry[] => (
  [...entries.values()].map(entry => ({ ...entry }))
)

/** 更新拖拽对象坐标；回到源码坐标时自动移除该对象的覆盖值。 */
export const updateVisualPosition = (key: string, x: number, y: number): VisualPosition => {
  const point = normalize({ x, y })
  const entry = entries.get(key)
  if (entry) {
    entry.x = point.x
    entry.y = point.y
    const base = { x: entry.baseX, y: entry.baseY }
    if (samePoint(point, base)) overrides.delete(key)
    else overrides.set(key, point)
  } else {
    overrides.set(key, point)
  }
  persist()
  emit()
  return point
}

export const getVisualPositionOverrides = (): Record<string, VisualPosition> => snapshot()

export const resetVisualPositionOverrides = () => {
  overrides.clear()
  readRecord(VISUAL_POSITION_OVERRIDES)
  for (const entry of entries.values()) {
    entry.x = entry.baseX
    entry.y = entry.baseY
    keyObjects.get(entry.key)?.setPosition?.(entry.baseX, entry.baseY)
  }
  persist()
  emit()
}

export const onVisualPositionChange = (listener: (value: Record<string, VisualPosition>) => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const isVisualPositionEditorEnabled = () => editorEnabled

export const setVisualPositionEditorEnabled = (enabled: boolean) => {
  if (editorEnabled === enabled) return
  editorEnabled = enabled
  for (const listener of editorListeners) listener(enabled)
}

// 对场景输入模块提供更直观的别名，保留上面的长名称供其它调用方使用。
export const isVisualPositionEditMode = isVisualPositionEditorEnabled
export const setVisualPositionEditMode = setVisualPositionEditorEnabled

export const applyVisualPositionEditMode = (scene: object, enabled: boolean) => {
  setVisualPositionEditMode(enabled)
  if (scene && typeof scene === 'object') {
    ;(scene as { visualPositionEditMode?: boolean }).visualPositionEditMode = enabled
    const input = (scene as { input?: { setDraggable?: (object: object, value?: boolean) => unknown } }).input
    for (const object of keyObjects.values()) {
      const target = object as VisualPositionObject & {
        setInteractive?: () => unknown
        disableInteractive?: () => unknown
        input?: { enabled?: boolean }
      }
      const wasInteractive = object.getData?.('visualPositionWasInteractive') === true
      const preserveDraggable = object.getData?.('visualPositionPreserveDraggable') === true
      if (enabled) {
        if (target.input) target.input.enabled = true
        else target.setInteractive?.()
        input?.setDraggable?.(object, true)
      } else {
        if (!preserveDraggable) input?.setDraggable?.(object, false)
        if (!wasInteractive && !preserveDraggable) target.disableInteractive?.()
      }
    }
  }
}

export const onVisualPositionEditorChange = (listener: (enabled: boolean) => void) => {
  editorListeners.add(listener)
  return () => editorListeners.delete(listener)
}

export const onVisualPositionEditModeChange = onVisualPositionEditorChange

/** 生成可直接复制到源码的坐标覆盖块。 */
export const exportVisualPositionOverrides = (): string => {
  const keys = [...overrides.keys()].sort()
  const lines = keys.map(key => {
    const point = overrides.get(key)
    return `  ${JSON.stringify(key)}: { x: ${point?.x.toFixed(1) ?? '0.0'}, y: ${point?.y.toFixed(1) ?? '0.0'} },`
  })
  return [
    '// 从网页端“素材设置 → 坐标编辑 → 复制坐标”导出的临时覆盖值（世界坐标）',
    'export const VISUAL_POSITION_OVERRIDES = {',
    ...lines,
    '} as const',
  ].join('\n')
}
