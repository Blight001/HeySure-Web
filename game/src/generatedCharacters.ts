import { VISUAL_SCALE } from './world/visualScale'

/**
 * ImageGen 人物 atlas 到 64 x 96、4 x 5 spritesheet 契约的适配层。
 * actions-v3/v4 atlas 已包含真实步态与动作；v2 四方向图仍作为资源失败时的回退。
 */
export const CHARACTER_FILES = {
  'char_member_blue.png': 'town-character-blue-v2.png',
  'char_member_red.png': 'town-character-red-v2.png',
  'char_member_amber.png': 'town-character-amber-v2.png',
  'char_member_slate.png': 'town-character-slate-v2.png',
  'char_admin.png': 'town-character-admin-v2.png',
  'char_librarian.png': 'town-character-librarian-v2.png',
} as const

type CharacterFile = keyof typeof CHARACTER_FILES
type ImageSource = HTMLImageElement | HTMLCanvasElement

const ACTION_FILES: Record<CharacterFile, string> = {
  'char_member_blue.png': 'town-character-blue-actions-v4.png',
  'char_member_red.png': 'town-character-red-actions-v3.png',
  'char_member_amber.png': 'town-character-amber-actions-v3.png',
  'char_member_slate.png': 'town-character-slate-actions-v3.png',
  'char_admin.png': 'town-character-admin-actions-v5.png',
  'char_librarian.png': 'town-character-librarian-actions-v3.png',
}

interface Bounds { x: number; y: number; w: number; h: number }
interface DirectionFrame { bounds: Bounds; scale: number; x: number; y: number }
interface DrawTarget { x: number; y: number; scale: number }

/**
 * 运行时人物帧尺寸。源图会在此尺寸内按最近邻重采样，Phaser 可以再用
 * 任意整数/小数 scale 显示，因此世界场景无需绑定某个固定分辨率。
 */
export const CHARACTER_FRAME_WIDTH = 64
export const CHARACTER_FRAME_HEIGHT = 96
/** 世界显示高度约 56px；图集仍保持 64x96 的高分辨率帧。 */
/** 兼容旧调用方；新的可调真值位于 world/visualScale.ts。 */
export const CHARACTER_DISPLAY_SCALE = VISUAL_SCALE.character.display
export const CHARACTER_DISPLAY_HEIGHT = CHARACTER_FRAME_HEIGHT * CHARACTER_DISPLAY_SCALE
const FRAME_WIDTH = CHARACTER_FRAME_WIDTH
const FRAME_HEIGHT = CHARACTER_FRAME_HEIGHT
const DIRECTIONS = 4
const atlasUrls = import.meta.glob('../assets/town-character-*-v2.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const actionAtlasUrls = import.meta.glob('../assets/town-character-*-actions-v*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const atlasCache = new Map<string, Promise<HTMLImageElement>>()
const actionAtlasCache = new Map<string, Promise<HTMLImageElement>>()
const sheetCache = new Map<string, Promise<HTMLCanvasElement>>()
const boundsCache = new Map<string, Bounds[]>()
const actionBoundsCache = new Map<string, Bounds[]>()

/**
 * ImageGen 的动作图集不是严格的等高网格：部分角色的脚/头发会跨过
 * nominal height / 5 边界。固定用 height / 5 会把上一行的脚切到下一
 * 行顶部（或反过来），所以为当前六套已生成素材记录实际行缝。值以
 * 原始图高度为基准，运行时按实际加载高度同比例缩放；管理员 v5 使用独立
 * 行缝，未知素材仍回退
 * 到等高切分。
 */
const ACTION_ROW_CUTS: Partial<Record<CharacterFile, readonly number[]>> = {
  'char_member_blue.png': [0, 305, 584, 870, 1142, 1402],
  'char_member_red.png': [0, 284, 538, 803, 1081, 1402],
  'char_member_amber.png': [0, 281, 544, 809, 1090, 1402],
  'char_member_slate.png': [0, 261, 501, 747, 988, 1230],
  'char_admin.png': [0, 285, 550, 820, 1098, 1402],
  'char_librarian.png': [0, 286, 559, 840, 1117, 1402],
}

// The regenerated admin atlas has a deliberately narrow robe, but its wide
// silhouette still needs a small vertical compensation to match the other
// town characters without clipping the crown or cape.
const ACTION_VERTICAL_STRETCH: Partial<Record<CharacterFile, number>> = {
  'char_admin.png': 1.2,
}

const imageSize = (image: ImageSource) => ({
  width: image instanceof HTMLImageElement ? image.naturalWidth : image.width,
  height: image instanceof HTMLImageElement ? image.naturalHeight : image.height,
})

const atlasUrl = (file: CharacterFile): string => {
  const name = CHARACTER_FILES[file]
  const url = atlasUrls[`../assets/${name}`]
  if (!url) throw new Error(`人物素材尚未提供: ${name}`)
  return url
}

const actionAtlasUrl = (file: CharacterFile): string | null =>
  actionAtlasUrls[`../assets/${ACTION_FILES[file]}`] ?? null

const loadAtlas = (file: CharacterFile, action: boolean): Promise<HTMLImageElement> => {
  const cache = action ? actionAtlasCache : atlasCache
  const url = action ? actionAtlasUrl(file) : atlasUrl(file)
  if (!url) return Promise.reject(new Error(`人物动作素材尚未提供: ${ACTION_FILES[file]}`))
  const previous = cache.get(file)
  if (previous) return previous
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => reject(new Error(`人物素材加载超时: ${file}`)), 10000)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error(`人物素材加载失败: ${file}`)) }
    image.src = url
  })
  cache.set(file, pending)
  return pending
}

/**
 * 输出 20 帧的人物 sheet。优先使用 ImageGen 的真实 4x5 动画图集，
 * 仅在动作图集加载失败时回退到旧的四方向派生逻辑。
 */
export const loadCharacterSheet = (file: string): Promise<HTMLCanvasElement> => {
  const characterFile = file as CharacterFile
  if (!CHARACTER_FILES[characterFile]) return Promise.reject(new Error(`未知人物贴图: ${file}`))
  const previous = sheetCache.get(characterFile)
  if (previous) return previous
  const pending = actionAtlasUrl(characterFile)
    ? loadAtlas(characterFile, true).then(image => renderActionSheet(characterFile, image))
    : loadAtlas(characterFile, false).then(image => renderCharacterSheet(characterFile, image))
  sheetCache.set(characterFile, pending)
  return pending
}

export const renderCharacterSheet = (file: CharacterFile, image: ImageSource): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH * DIRECTIONS
  canvas.height = FRAME_HEIGHT * 5
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  // 角色最终按 64x96 帧交给 Phaser；禁止 canvas 缩放插值，保持像素边缘。
  ctx.imageSmoothingEnabled = false
  const directions = layoutDirections(file, image)
  for (let direction = 0; direction < DIRECTIONS; direction++) drawWalkRow(ctx, image, directions[direction], direction)
  drawPoseRow(ctx, image, directions[0])
  return canvas
}

/** 将严格 4x5 的动作图集归一到运行时帧；全局缩放和统一脚底基线避免抖动。 */
const renderActionSheet = (file: CharacterFile, image: ImageSource): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH * DIRECTIONS
  canvas.height = FRAME_HEIGHT * 5
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  const bounds = actionBounds(file, image)
  const walkBounds = bounds.slice(0, DIRECTIONS * 4)
  const maxWidth = Math.max(...walkBounds.map(item => item.w))
  const maxHeight = Math.max(...walkBounds.map(item => item.h))
  const scale = Math.min((FRAME_WIDTH - 4) / maxWidth, (FRAME_HEIGHT - 3) / maxHeight)
  const frameCanvas = document.createElement('canvas')
  frameCanvas.width = FRAME_WIDTH
  frameCanvas.height = FRAME_HEIGHT
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })
  if (!frameCtx) return canvas
  frameCtx.imageSmoothingEnabled = false
  bounds.forEach((bound, frame) => {
    const frameScale = Math.min(scale, (FRAME_WIDTH - 4) / bound.w, (FRAME_HEIGHT - 4) / bound.h)
    const width = Math.max(1, Math.round(bound.w * frameScale))
    const verticalStretch = frame < DIRECTIONS * 5 - 1 ? ACTION_VERTICAL_STRETCH[file] ?? 1 : 1
    const height = Math.max(1, Math.round(bound.h * frameScale * verticalStretch))
    const x = (frame % DIRECTIONS) * FRAME_WIDTH + Math.round((FRAME_WIDTH - width) / 2)
    const localX = Math.round((FRAME_WIDTH - width) / 2)
    const localY = FRAME_HEIGHT - 2 - height
    frameCtx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    frameCtx.drawImage(image, bound.x, bound.y, bound.w, bound.h, localX, localY, width, height)
    const pixels = frameCtx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data
    let bottom = -1
    for (let y = FRAME_HEIGHT - 1; y >= 0 && bottom < 0; y--) {
      for (let px = 0; px < FRAME_WIDTH; px++) {
        if (pixels[(y * FRAME_WIDTH + px) * 4 + 3] > 20) { bottom = y; break }
      }
    }
    const row = Math.floor(frame / DIRECTIONS)
    const baselineShift = frame < DIRECTIONS * 4 && bottom >= 0 ? FRAME_HEIGHT - 3 - bottom : 0
    ctx.drawImage(frameCanvas, x - localX, row * FRAME_HEIGHT + baselineShift)
  })
  return canvas
}

const actionBounds = (file: CharacterFile, image: ImageSource): Bounds[] => {
  const cached = actionBoundsCache.get(file)
  if (cached) return cached
  const { width, height } = imageSize(image)
  const bounds = scanActionRows(file, image, width, height)
  actionBoundsCache.set(file, bounds)
  return bounds
}

/**
 * ImageGen occasionally adds transparent margins around individual cells, so
 * width/4 slicing can split a character across two frames (blue v3 is one
 * example). Group each row's occupied alpha columns instead of trusting the
 * nominal grid boundaries, then restore row-major frame order. The union bbox
 * keeps disconnected hair, hands, or props that belong to the same pose.
 */
const scanActionRows = (file: CharacterFile, image: ImageSource, width: number, height: number): Bounds[] => {
  const fallbackWidth = Math.floor(width / DIRECTIONS)
  const fallbackHeight = Math.floor(height / 5)
  if (!fallbackWidth || !fallbackHeight) throw new Error('无效人物动作 atlas')
  // Both v3 and v4 atlases can have feet/capes crossing nominal row seams;
  // use the measured cuts for every known action atlas instead of splitting
  // those pixels into the next frame.
  const referenceCuts = ACTION_ROW_CUTS[file]
  const cuts = referenceCuts?.map(cut => Math.round(cut * height / referenceCuts[referenceCuts.length - 1]))
    ?? Array.from({ length: 6 }, (_, row) => Math.floor(row * height / 5))
  return Array.from({ length: 5 }, (_, row) => {
    const top = cuts[row]
    const rowHeight = cuts[row + 1] - top
    const candidates = scanAlphaProjection(image, 0, top, width, rowHeight)
    if (candidates.length === DIRECTIONS) return candidates
    return Array.from({ length: DIRECTIONS }, (_, column) => scanAlphaBounds(
      image, column * fallbackWidth, top, fallbackWidth, rowHeight,
    ))
  }).flat()
}

const scanAlphaProjection = (
  image: ImageSource, left: number, top: number, width: number, height: number,
): Bounds[] => {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(image, left, top, width, height, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height).data
  const runs: Array<[number, number]> = []
  let start = -1
  for (let x = 0; x <= width; x++) {
    const occupied = x < width && columnHasAlpha(pixels, width, height, x)
    if (occupied && start < 0) start = x
    if (occupied || start < 0) continue
    if (runs.length && start - runs[runs.length - 1][1] - 1 <= 24) runs[runs.length - 1][1] = x - 1
    else runs.push([start, x - 1])
    start = -1
  }
  if (runs.length !== DIRECTIONS) return []
  return runs.map(([runLeft, runRight]) => alphaBoundsInRange(
    pixels, width, height, runLeft, runRight, left, top,
  ))
}

const columnHasAlpha = (pixels: Uint8ClampedArray, width: number, height: number, x: number): boolean => {
  for (let y = 0; y < height; y++) if (pixels[(y * width + x) * 4 + 3] > 20) return true
  return false
}

const alphaBoundsInRange = (
  pixels: Uint8ClampedArray, width: number, height: number,
  left: number, right: number, offsetX: number, offsetY: number,
): Bounds => {
  let minX = right; let minY = height; let maxX = left; let maxY = -1
  for (let y = 0; y < height; y++) for (let x = left; x <= right; x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 20) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return { x: offsetX + minX, y: offsetY + minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

const layoutDirections = (file: CharacterFile, image: ImageSource): DirectionFrame[] => {
  const bounds = directionBounds(file, image)
  const maxWidth = Math.max(...bounds.map(item => item.w))
  const maxHeight = Math.max(...bounds.map(item => item.h))
  const scale = Math.min((FRAME_WIDTH - 4) / maxWidth, (FRAME_HEIGHT - 3) / maxHeight)
  return bounds.map(bound => ({
    bounds: bound,
    scale,
    x: Math.round((FRAME_WIDTH - bound.w * scale) / 2),
    y: Math.round(FRAME_HEIGHT - 2 - bound.h * scale),
  }))
}

const directionBounds = (file: CharacterFile, image: ImageSource): Bounds[] => {
  const cached = boundsCache.get(file)
  if (cached) return cached
  const { width, height } = imageSize(image)
  const cellWidth = Math.floor(width / 2)
  const cellHeight = Math.floor(height / 2)
  if (!cellWidth || !cellHeight) throw new Error(`无效人物 atlas: ${file}`)
  const bounds = Array.from({ length: DIRECTIONS }, (_, index) => {
    const left = (index % 2) * cellWidth
    const top = Math.floor(index / 2) * cellHeight
    return scanAlphaBounds(image, left, top, cellWidth, cellHeight)
  })
  boundsCache.set(file, bounds)
  return bounds
}

const scanAlphaBounds = (image: ImageSource, left: number, top: number, width: number, height: number): Bounds => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { x: left, y: top, w: width, h: height }
  ctx.drawImage(image, left, top, width, height, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height).data
  let minX = width; let minY = height; let maxX = -1; let maxY = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 20) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return maxX < 0
    ? { x: left, y: top, w: width, h: height }
    : { x: left + minX, y: top + minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

const drawWalkRow = (ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame, row: number) => {
  for (let step = 0; step < 4; step++) {
    const x = step * FRAME_WIDTH
    const y = row * FRAME_HEIGHT
    drawWalker(ctx, image, frame, x, y, step)
  }
}

const drawWalker = (
  ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame, x: number, y: number, _step: number,
) => {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, FRAME_WIDTH, FRAME_HEIGHT)
  ctx.clip()
  // 原始 ImageGen 图只有四个方向静态姿态，因此在生成 4 帧 walk 行时做
  // 小幅重心起伏和左右步幅。动作幅度按新帧尺寸放大到 2px，既能看出行走又不会
  // 破坏像素角色的脚底基线。
  const step = _step % 4
  const offsets = [
    { x: 0, y: 0 },
    { x: -2, y: -2 },
    { x: 0, y: 0 },
    { x: 2, y: -2 },
  ]
  const offset = offsets[step]
  const { bounds, scale } = frame
  drawPart(ctx, image, bounds, { x: x + frame.x + offset.x, y: y + frame.y + offset.y, scale })
  ctx.restore()
}

const drawPart = (
  ctx: CanvasRenderingContext2D, image: ImageSource, source: Bounds, target: DrawTarget,
) => ctx.drawImage(image, source.x, source.y, source.w, source.h, Math.round(target.x), Math.round(target.y), Math.round(source.w * target.scale), Math.round(source.h * target.scale))

const drawPoseRow = (ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame) => {
  drawWalker(ctx, image, frame, 0, FRAME_HEIGHT * 4, 0)
  drawClosedEyes(ctx, frame, 0, FRAME_HEIGHT * 4)
  drawSeatedPose(ctx, image, frame, FRAME_WIDTH, FRAME_HEIGHT * 4)
  drawKneelingPose(ctx, image, frame, FRAME_WIDTH * 2, FRAME_HEIGHT * 4)
  drawLyingPose(ctx, image, frame, FRAME_WIDTH * 3, FRAME_HEIGHT * 4)
}

const drawClosedEyes = (ctx: CanvasRenderingContext2D, frame: DirectionFrame, x: number, y: number) => {
  const eyeY = y + Math.max(8, Math.round(frame.y + frame.bounds.h * frame.scale * 0.31))
  const center = x + FRAME_WIDTH / 2
  ctx.fillStyle = '#292338'
  ctx.fillRect(Math.round(center - 12), eyeY, 6, 2)
  ctx.fillRect(Math.round(center + 6), eyeY, 6, 2)
}

const drawSeatedPose = (ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame, x: number, y: number) => {
  const { bounds, scale } = frame
  const split = Math.round(bounds.h * 0.62)
  const bodyY = y + frame.y + 6
  withFrameClip(ctx, x, y, () => {
    drawPart(ctx, image, { x: bounds.x, y: bounds.y, w: bounds.w, h: split }, { x: x + frame.x, y: bodyY, scale })
    drawPoseLegs(ctx, image, bounds, split, x + frame.x - 2, bodyY + split * scale - 1, bounds.w * scale * 1.14, (bounds.h - split) * scale * 0.48)
  })
}

const drawKneelingPose = (ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame, x: number, y: number) => {
  const { bounds, scale } = frame
  const split = Math.round(bounds.h * 0.62)
  const bodyY = y + frame.y + 4
  withFrameClip(ctx, x, y, () => {
    drawPart(ctx, image, { x: bounds.x, y: bounds.y, w: bounds.w, h: split }, { x: x + frame.x, y: bodyY, scale })
    drawPoseLegs(ctx, image, bounds, split, x + frame.x + 2, bodyY + split * scale - 1, bounds.w * scale * 1.22, (bounds.h - split) * scale * 0.34)
  })
}

const drawPoseLegs = (
  ctx: CanvasRenderingContext2D, image: ImageSource, bounds: Bounds, split: number, x: number, y: number, width: number, height: number,
) => ctx.drawImage(image, bounds.x, bounds.y + split, bounds.w, bounds.h - split, Math.round(x), Math.round(y), Math.round(width), Math.round(height))

const drawLyingPose = (ctx: CanvasRenderingContext2D, image: ImageSource, frame: DirectionFrame, x: number, y: number) => {
  const { bounds, scale } = frame
  const naturalWidth = bounds.w * scale
  const naturalHeight = bounds.h * scale
  const fit = Math.min((FRAME_WIDTH - 4) / naturalHeight, (FRAME_HEIGHT - 4) / naturalWidth, 1)
  const width = naturalWidth * fit
  const height = naturalHeight * fit
  withFrameClip(ctx, x, y, () => {
    ctx.translate(x + FRAME_WIDTH / 2 + height / 2, y + FRAME_HEIGHT - 2 - width / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, Math.round(-width / 2), Math.round(-height), Math.round(width), Math.round(height))
  })
}

const withFrameClip = (ctx: CanvasRenderingContext2D, x: number, y: number, draw: () => void) => {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, FRAME_WIDTH, FRAME_HEIGHT)
  ctx.clip()
  draw()
  ctx.restore()
}
