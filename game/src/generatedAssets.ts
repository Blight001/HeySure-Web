import { BUSH_CELLS, GENERATED_PROPS } from './generatedProps'

/**
 * 将当前 ImageGen atlas 规范化为现有 Phaser spritesheet 的运行时适配层。
 * 树木、灌木与装饰已使用整理后的独立命名图集。
 */
export interface GeneratedAssetDef {
  /** ImageGen atlas 文件名。 */
  file: string
  columns: number
  rows: number
  /** atlas 内所有格子的稳定名称与行优先索引。 */
  cells: Readonly<Record<string, number>>
  cell: string
  /** 可选：每个输出帧分别取 atlas 的哪个格，供树木/角色方向帧使用。 */
  frameCells?: readonly string[]
  frameWidth: number
  frameHeight: number
  frameColumns: number
  frameRows: number
  pulse: 'warm' | 'cyan' | 'blue' | 'violet' | 'green' | 'water' | null
  baseline?: number
}

const BUILDING_CELLS = {
  library: 0,
  desktop: 1,
  browser: 2,
  knowledge: 3,
  android: 4,
  spawn: 5,
} as const

const TREE_CELLS = { oak: 0, pine: 1, birch: 2, sakura: 3 } as const
const GARDENER_CELLS = { gardener: 0 } as const

/** Key 是原 spritesheet 文件名，保证接线无需改动世界规则。 */
export const GENERATED_ASSETS: Readonly<Record<string, GeneratedAssetDef>> = {
  ...GENERATED_PROPS,
  'building_library.png': building('library', 192, 192, 2, 'warm'),
  'building_workshop_desktop.png': building('desktop', 128, 128, 4, 'cyan'),
  'building_workshop_browser.png': building('browser', 128, 160, 4, 'blue'),
  'building_workshop_knowledge.png': building('knowledge', 128, 160, 4, 'violet'),
  'building_workshop_android.png': building('android', 128, 160, 4, 'green'),
  'building_spawn.png': building('spawn', 128, 128, 4, 'water'),
  'tree.png': {
    file: 'town-trees.png', columns: 2, rows: 2, cells: TREE_CELLS, cell: 'oak',
    // Keep a 2x logical raster so the 32px world can downscale with nearest
    // sampling without first throwing away the atlas detail.
    frameCells: ['oak', 'pine', 'birch', 'sakura'], frameWidth: 192, frameHeight: 288,
    frameColumns: 4, frameRows: 1, pulse: null, baseline: 136,
  },
  'resident_gardener.png': {
    file: 'town-gardener-v2.png', columns: 1, rows: 1, cells: GARDENER_CELLS, cell: 'gardener',
    // 与人物 sheet 统一为高分辨率运行时帧；场景可通过 scale 保持原有占位。
    frameWidth: 64, frameHeight: 96, frameColumns: 1, frameRows: 1, pulse: null, baseline: 92,
  },
}

function building(
  cell: keyof typeof BUILDING_CELLS,
  frameWidth: number,
  frameHeight: number,
  frameColumns: number,
  pulse: Exclude<GeneratedAssetDef['pulse'], null>,
): GeneratedAssetDef {
  return {
    file: 'town-buildings-pixel-v3.png', columns: 3, rows: 2, cells: BUILDING_CELLS, cell,
    frameWidth, frameHeight, frameColumns, frameRows: 1, pulse,
  }
}

type RenderableImage = HTMLImageElement | HTMLCanvasElement

const atlasUrls = import.meta.glob('../assets/town-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const imageCache = new Map<string, Promise<HTMLImageElement>>()
const sheetCache = new Map<string, HTMLCanvasElement>()

const sourceSize = (image: RenderableImage) => ({
  width: image instanceof HTMLImageElement ? image.naturalWidth : image.width,
  height: image instanceof HTMLImageElement ? image.naturalHeight : image.height,
})

const atlasUrlFor = (file: string): string => {
  const url = atlasUrls[`../assets/${file}`]
  if (!url) throw new Error(`生成素材尚未提供: ${file}`)
  return url
}

const loadAtlas = (file: string): Promise<HTMLImageElement> => {
  const cached = imageCache.get(file)
  if (cached) return cached
  const url = atlasUrlFor(file)
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => reject(new Error(`生成素材加载超时: ${file}`)), 10000)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error(`生成素材加载失败: ${file}`)) }
    image.src = url
  })
  imageCache.set(file, promise)
  return promise
}

/**
 * 载入并缓存原尺寸规范化 sheet。用于 Phaser loader、预览与头像模块。
 * 只在首次渲染某个 sheet 时扫描一次对应 atlas cell 的 alpha 边界。
 */
export const loadGeneratedAssetImage = async (file: string): Promise<RenderableImage> => {
  const cached = sheetCache.get(file)
  if (cached) return cached
  const def = GENERATED_ASSETS[file]
  if (!def) throw new Error(`没有 ${file} 的生成素材定义`)
  return renderGeneratedSheet(file, await loadAtlas(def.file))
}

export const renderGeneratedSheet = (file: string, image: RenderableImage): HTMLCanvasElement => {
  const cached = sheetCache.get(file)
  if (cached) return cached
  const def = GENERATED_ASSETS[file]
  if (!def) throw new Error(`没有 ${file} 的生成素材定义`)
  const canvas = document.createElement('canvas')
  canvas.width = def.frameWidth * def.frameColumns
  canvas.height = def.frameHeight * def.frameRows
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  // 生成图集会被压回 Phaser 的运行时帧；这里必须使用最近邻，
  // 否则高分辨率素材在缩小时先被插值，放大后就会出现模糊边缘。
  ctx.imageSmoothingEnabled = false
  for (let frame = 0; frame < def.frameColumns * def.frameRows; frame++) {
    const x = (frame % def.frameColumns) * def.frameWidth
    const y = Math.floor(frame / def.frameColumns) * def.frameHeight
    const bounds = alphaBounds(image, def, sourceCellForFrame(def, frame))
    const fit = fittedRect(bounds, def)
    ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, x + fit.x, y + fit.y, fit.w, fit.h)
    drawPulse(ctx, def, frame, x + fit.x, y + fit.y, fit.w, fit.h)
  }
  sheetCache.set(file, canvas)
  return canvas
}

interface Bounds { x: number; y: number; w: number; h: number }

const boundsCache = new Map<string, Bounds>()
const atlasBoundsCache = new Map<string, Readonly<Record<string, Bounds>>>()
const bushBoundsCache = new Map<string, Readonly<Record<string, Bounds>>>()

const sourceCellForFrame = (def: GeneratedAssetDef, frame: number): string =>
  def.frameCells?.[frame] ?? def.cell

const alphaBounds = (image: RenderableImage, def: GeneratedAssetDef, cell: string): Bounds => {
  const cacheKey = `${def.file}:${cell}`
  const cached = boundsCache.get(cacheKey)
  if (cached) return cached
  if (def.file === 'town-trees.png') return cacheAtlasBounds(def.file, cell, treeAlphaBounds(image))
  if (def.file === 'town-bushes.png') return cacheAtlasBounds(def.file, cell, bushAlphaBounds(image))
  const { width, height } = sourceSize(image)
  const cellWidth = Math.floor(width / def.columns)
  const cellHeight = Math.floor(height / def.rows)
  const index = def.cells[cell]
  if (!cellWidth || !cellHeight || index === undefined) throw new Error(`无效 atlas: ${def.file}`)
  const left = (index % def.columns) * cellWidth
  const top = Math.floor(index / def.columns) * cellHeight
  const canvas = document.createElement('canvas')
  canvas.width = cellWidth
  canvas.height = cellHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return cacheBounds(cacheKey, { x: left, y: top, w: cellWidth, h: cellHeight })
  ctx.drawImage(image, left, top, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
  const pixels = ctx.getImageData(0, 0, cellWidth, cellHeight).data
  let minX = cellWidth; let minY = cellHeight; let maxX = -1; let maxY = -1
  for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) {
    if (pixels[(y * cellWidth + x) * 4 + 3] <= 20) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (maxX < 0) return cacheBounds(cacheKey, { x: left, y: top, w: cellWidth, h: cellHeight })
  return cacheBounds(cacheKey, { x: left + minX, y: top + minY, w: maxX - minX + 1, h: maxY - minY + 1 })
}

const cacheAtlasBounds = (file: string, cell: string, all: Readonly<Record<string, Bounds>>): Bounds => {
  const bounds = all[cell]
  if (!bounds) throw new Error(`无效生成 atlas 帧: ${cell}`)
  return cacheBounds(`${file}:${cell}`, bounds)
}

const ATLAS_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const

type AtlasComponent = { area: number; bounds: Bounds }

const atlasAlphaPixels = (image: RenderableImage, width: number, height: number): Uint8ClampedArray => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法读取生成素材 alpha')
  ctx.drawImage(image, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height).data
}

const atlasComponentAt = (
  start: number,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  visited: Uint8Array,
): AtlasComponent => {
  const stack = [start]; visited[start] = 1
  const startX = start % width; const startY = Math.floor(start / width)
  let area = 0; let minX = startX; let minY = startY; let maxX = startX; let maxY = startY
  while (stack.length) {
    const index = stack.pop()!; const px = index % width; const py = Math.floor(index / width)
    area++; minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
    for (const [dx, dy] of ATLAS_NEIGHBORS) {
      const nx = px + dx; const ny = py + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const next = ny * width + nx
      if (!visited[next] && pixels[next * 4 + 3] > 20) { visited[next] = 1; stack.push(next) }
    }
  }
  return { area, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

const atlasComponents = (image: RenderableImage, width: number, height: number): AtlasComponent[] => {
  const pixels = atlasAlphaPixels(image, width, height); const visited = new Uint8Array(width * height)
  const components: AtlasComponent[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const start = y * width + x
    if (visited[start] || pixels[start * 4 + 3] <= 20) continue
    const component = atlasComponentAt(start, width, height, pixels, visited)
    if (component.area > 1000) components.push(component)
  }
  return components
}

const nearestAtlasComponent = (
  candidates: readonly AtlasComponent[],
  used: ReadonlySet<number>,
  targetX: number,
  targetY: number,
): number => {
  let best = -1; let bestDistance = Number.POSITIVE_INFINITY
  candidates.forEach((candidate, candidateIndex) => {
    if (used.has(candidateIndex)) return
    const centerX = candidate.bounds.x + candidate.bounds.w / 2
    const centerY = candidate.bounds.y + candidate.bounds.h / 2
    const distance = Math.hypot(centerX - targetX, centerY - targetY)
    if (distance < bestDistance) { best = candidateIndex; bestDistance = distance }
  })
  return best
}

const assignAtlasComponents = (
  candidates: readonly AtlasComponent[],
  width: number,
  height: number,
  cells: Readonly<Record<string, number>>,
  columns: number,
  rows: number,
): Readonly<Record<string, Bounds>> => {
  const result: Record<string, Bounds> = {}; const used = new Set<number>()
  for (const [cell, index] of Object.entries(cells)) {
    const targetX = (index % columns + 0.5) * width / columns
    const targetY = (Math.floor(index / columns) + 0.5) * height / rows
    const best = nearestAtlasComponent(candidates, used, targetX, targetY)
    if (best < 0) throw new Error(`无法定位生成 atlas 帧: ${cell}`)
    used.add(best); result[cell] = candidates[best].bounds
  }
  return result
}

/**
 * Tree atlas cells slightly overlap at the old quadrant seams. Detect the four
 * complete silhouettes globally, then assign each to the nearest intended cell
 * center; this prevents seam pixels from becoming clipped edges or stray roots.
 */
const treeAlphaBounds = (image: RenderableImage): Readonly<Record<string, Bounds>> => {
  const { width, height } = sourceSize(image); const cacheKey = `${width}x${height}`
  const cached = atlasBoundsCache.get(`tree:${cacheKey}`)
  if (cached) return cached
  const candidates = atlasComponents(image, width, height).sort((a, b) => b.area - a.area).slice(0, 4)
  if (candidates.length !== 4) throw new Error('树木 atlas 未检测到四个完整轮廓')
  const frozen = Object.freeze(assignAtlasComponents(candidates, width, height, TREE_CELLS, 2, 2))
  atlasBoundsCache.set(`tree:${cacheKey}`, frozen)
  return frozen
}

const bushAlphaBounds = (image: RenderableImage): Readonly<Record<string, Bounds>> => {
  const { width, height } = sourceSize(image); const cacheKey = `${width}x${height}`
  const cached = bushBoundsCache.get(cacheKey)
  if (cached) return cached
  const candidates = atlasComponents(image, width, height).sort((a, b) => b.area - a.area).slice(0, 3)
  if (candidates.length !== 3) throw new Error('灌木 atlas 未检测到三个完整轮廓')
  const frozen = Object.freeze(assignAtlasComponents(candidates, width, height, BUSH_CELLS, 3, 1))
  bushBoundsCache.set(cacheKey, frozen)
  return frozen
}

const cacheBounds = (key: string, bounds: Bounds): Bounds => (boundsCache.set(key, bounds), bounds)

const fittedRect = (bounds: Bounds, def: GeneratedAssetDef) => {
  const baseline = def.baseline ?? def.frameHeight - 2
  const availableHeight = Math.min(def.frameHeight - 4, baseline - 2)
  const scale = Math.min((def.frameWidth - 4) / bounds.w, availableHeight / bounds.h)
  const w = Math.max(1, Math.round(bounds.w * scale))
  const h = Math.max(1, Math.round(bounds.h * scale))
  return { x: Math.round((def.frameWidth - w) / 2), y: baseline - h, w, h }
}

const PULSE_COLORS: Record<Exclude<GeneratedAssetDef['pulse'], null>, string> = {
  warm: '#ffe2a3', cyan: '#a8f5ff', blue: '#9edcff', violet: '#efb9ff', green: '#d2ff9a', water: '#b9f7ff',
}

const drawPulse = (
  ctx: CanvasRenderingContext2D, def: GeneratedAssetDef, frame: number, x: number, y: number, w: number, h: number,
) => {
  if (!def.pulse) return
  const strength = [0.24, 0.58, 0.92, 0.48][frame % 4]
  const size = Math.max(1, Math.round(1 + strength * 1.5))
  const points = def.pulse === 'water' ? [[.43, .72], [.58, .67]] : [[.38, .46], [.62, .46]]
  ctx.fillStyle = PULSE_COLORS[def.pulse]
  ctx.globalAlpha = strength
  for (const [px, py] of points) ctx.fillRect(Math.round(x + w * px), Math.round(y + h * py), size, size)
  ctx.globalAlpha = 1
}

