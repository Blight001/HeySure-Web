/**
 * 浏览器端的临时素材比例覆盖层。
 *
 * `visualScale.ts` 仍然是提交到源码的默认值；本文件只保存调试面板产生的
 * 相对倍率（1 = 使用源码默认值），让网页端可以先试比例，再把 JSON 复制
 * 回对话中由开发者写回统一配置文件。
 */

export const VISUAL_SCALE_GROUPS = [
  'tree',
  'bush',
  'character',
  'building',
  'prop',
  'effect',
  'atmosphere',
] as const

/**
 * 写入源码的默认素材比例覆盖值。
 *
 * 网页端调试面板会将当前值导出为同名代码块；提交后由运行时作为
 * 没有浏览器临时覆盖值时的初始比例使用。
 */
export const VISUAL_SCALE_OVERRIDES = {
  tree: 1.30,
  bush: 1.20,
  character: 0.75,
  building: 0.75,
  prop: 0.90,
  effect: 1.80,
  atmosphere: 0.90,
} as const

export type VisualScaleGroup = (typeof VISUAL_SCALE_GROUPS)[number]
export type VisualScaleOverrides = Record<VisualScaleGroup, number>

// v2 以本次写入的源码覆盖值为新基线，避免旧浏览器临时值覆盖已确认参数。
const STORAGE_KEY = 'heysure.world.visual-scale-overrides.v2'
const MIN_MULTIPLIER = 0.25
const MAX_MULTIPLIER = 3

const defaults = (): VisualScaleOverrides => ({ ...VISUAL_SCALE_OVERRIDES })

const clampMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, value))
}

const readStored = (): VisualScaleOverrides => {
  const result = defaults()
  if (typeof window === 'undefined') return result
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const group of VISUAL_SCALE_GROUPS) {
      const value = Number(parsed[group])
      if (Number.isFinite(value)) result[group] = clampMultiplier(value)
    }
  } catch {
    // 隐私模式或禁用 localStorage 时仍可正常使用本页调试面板。
  }
  return result
}

let current: VisualScaleOverrides = readStored()
const listeners = new Set<(value: VisualScaleOverrides) => void>()

const persist = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // 不阻断预览或复制参数。
  }
}

const emit = () => {
  const snapshot = getVisualScaleOverrides()
  for (const listener of listeners) listener(snapshot)
}

export const getVisualScaleOverrides = (): VisualScaleOverrides => ({ ...current })

export const setVisualScaleOverride = (group: VisualScaleGroup, value: number) => {
  current[group] = clampMultiplier(value)
  persist()
  emit()
}

export const resetVisualScaleOverrides = () => {
  current = defaults()
  persist()
  emit()
}

export const onVisualScaleChange = (listener: (value: VisualScaleOverrides) => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 将源码默认倍率乘上网页端当前调试倍率。 */
export const scaleBy = (group: VisualScaleGroup, base: number): number => base * current[group]

export const exportVisualScaleOverrides = (): string => {
  const lines = VISUAL_SCALE_GROUPS.map(group => `  ${group}: ${current[group].toFixed(2)},`)
  return [
    '// 从网页端“素材设置 → 复制参数”导出的临时覆盖值',
    'export const VISUAL_SCALE_OVERRIDES = {',
    ...lines,
    '} as const',
  ].join('\n')
}

export const visualScaleRange = { min: MIN_MULTIPLIER, max: MAX_MULTIPLIER } as const
