import { VISUAL_SCALE } from './world/visualScale'

/**
 * ImageGen 人物 atlas 到 64 x 96、4 x 5 spritesheet 契约的适配层。
 * actions-v3 atlas 已包含真实步态与动作；v2 四方向图仍作为资源失败时的回退。
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
  'char_member_blue.png': 'town-character-blue-actions-v3.png',
  'char_member_red.png': 'town-character-red-actions-v3.png',
  'char_member_amber.png': 'town-character-amber-actions-v3.png',
  'char_member_slate.png': 'town-character-slate-actions-v3.png',
  'char_admin.png': 'town-character-admin-actions-v3.png',
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
const actionAtlasUrls = import.meta.glob('../assets/town-character-*-actions-v3.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const atlasCache = new Map<string, Promise<HTMLImageElement>>()
const actionAtlasCache = new Map<string, Promise<HTMLImageElement>>()
const sheetCache = new Map<string, Promise<HTMLCanvasElement>>()
const boundsCache = new Map<string, Bounds[]>()
const actionBoundsCache = new Map<string, Bounds[]>()

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
  bounds.forEach((bound, frame) => {
    const frameScale = Math.min(scale, (FRAME_WIDTH - 4) / bound.w, (FRAME_HEIGHT - 4) / bound.h)
    const width = Math.max(1, Math.round(bound.w * frameScale))
    const height = Math.max(1, Math.round(bound.h * frameScale))
    const x = (frame % DIRECTIONS) * FRAME_WIDTH + Math.round((FRAME_WIDTH - width) / 2)
    const y = Math.floor(frame / DIRECTIONS) * FRAME_HEIGHT + FRAME_HEIGHT - 2 - height
    ctx.drawImage(image, bound.x, bound.y, bound.w, bound.h, x, y, width, height)
  })
  return canvas
}

const actionBounds = (file: CharacterFile, image: ImageSource): Bounds[] => {
  const cached = actionBoundsCache.get(file)
  if (cached) return cached
  const { width, height } = imageSize(image)
  const cellWidth = Math.floor(width / DIRECTIONS)
  const cellHeight = Math.floor(height / 5)
  if (!cellWidth || !cellHeight) throw new Error(`无效人物动作 atlas: ${file}`)
  const bounds = Array.from({ length: DIRECTIONS * 5 }, (_, frame) => scanAlphaBounds(
    image,
    (frame % DIRECTIONS) * cellWidth,
    Math.floor(frame / DIRECTIONS) * cellHeight,
    cellWidth,
    cellHeight,
  ))
  // Wide lying poses may reach left of the last cell; select that row component
  // instead of clipping the head at the cell boundary.
  bounds[bounds.length - 1] = scanLastPoseBounds(image, width, height, cellHeight, cellWidth)
  actionBoundsCache.set(file, bounds)
  return bounds
}

const scanLastPoseBounds = (
  image: ImageSource, width: number, height: number, cellHeight: number, cellWidth: number,
): Bounds => {
  const top = cellHeight * 4
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height - top
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return scanAlphaBounds(image, cellWidth * 3, top, cellWidth, height - top)
  ctx.drawImage(image, 0, top, width, height - top, 0, 0, width, height - top)
  const pixels = ctx.getImageData(0, 0, width, height - top).data
  const visited = new Uint8Array(width * (height - top))
  let best: { distance: number; bounds: Bounds } | null = null
  for (let y = 0; y < height - top; y++) for (let x = 0; x < width; x++) {
    const start = y * width + x
    if (visited[start] || pixels[start * 4 + 3] <= 20) continue
    const stack = [start]; visited[start] = 1
    let minX = x; let minY = y; let maxX = x; let maxY = y; let size = 0
    while (stack.length) {
      const index = stack.pop()!; const px = index % width; const py = Math.floor(index / width)
      size++; minX = Math.min(minX, px); minY = Math.min(minY, py)
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = px + dx; const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height - top) continue
        const next = ny * width + nx
        if (!visited[next] && pixels[next * 4 + 3] > 20) { visited[next] = 1; stack.push(next) }
      }
    }
    if (size < 100) continue
    const distance = Math.abs((minX + maxX) / 2 - cellWidth * 3.5)
    if (!best || distance < best.distance) best = {
      distance,
      bounds: { x: minX, y: top + minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    }
  }
  return best?.bounds ?? scanAlphaBounds(image, cellWidth * 3, top, cellWidth, height - top)
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
