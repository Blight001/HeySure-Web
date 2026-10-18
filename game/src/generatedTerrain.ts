/**
 * 将 ImageGen 的四格地表 atlas 适配成既有 8×3 Phaser tileset。
 * 这里不写回 assets/：加载失败时，调用方仍可继续使用旧 tileset.png。
 */
// Keep terrain tiles at 2x the world raster.  The world renderer downsamples
// these to 32px logical tiles with nearest-neighbour filtering.
const TILE = 128
const LOGICAL_TILE = TILE / 2
const OUTPUT_COLUMNS = 8
const OUTPUT_ROWS = 3
// Large atlases can take a few seconds to decode on the first visit, while
// Vite is also transforming the game bundle. Give the browser enough time to
// finish the initial decode instead of silently falling back to the tiny legacy
// tileset (which does not contain all 24 runtime tiles).
const LOAD_TIMEOUT_MS = 20_000

type TerrainImage = HTMLImageElement | HTMLCanvasElement
type TerrainKind = 'grass' | 'path' | 'plaza' | 'water'

const terrainUrls = import.meta.glob('../assets/town-ground-v2.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

let sheetPromise: Promise<HTMLCanvasElement> | null = null

/** 载入新地表并转换；错误交给入口决定是否回退。 */
export const loadTerrainSheet = (): Promise<HTMLCanvasElement> => {
  sheetPromise ??= loadTerrainAtlas().then(renderTerrainSheet).catch(error => {
    sheetPromise = null
    throw error
  })
  return sheetPromise
}

/** 方便单测及预览页传入已加载的 atlas。 */
export const renderTerrainSheet = (image: TerrainImage): HTMLCanvasElement => {
  const sheet = document.createElement('canvas')
  sheet.width = TILE * OUTPUT_COLUMNS
  sheet.height = TILE * OUTPUT_ROWS
  const ctx = requiredContext(sheet)
  const samples = makeSamples(image)
  drawBaseTiles(ctx, samples)
  drawDecoratedTiles(ctx, samples.grass)
  forceOpaque(ctx, sheet)
  return sheet
}

const loadTerrainAtlas = (): Promise<HTMLImageElement> => {
  const url = terrainUrls['../assets/town-ground-v2.png']
  if (!url) return Promise.reject(new Error('生成地表素材尚未提供: town-ground-v2.png'))
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => reject(new Error('生成地表素材加载超时: town-ground-v2.png')), LOAD_TIMEOUT_MS)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error('生成地表素材加载失败: town-ground-v2.png')) }
    image.src = url
  })
}

const requiredContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
  return ctx
}

const imageSize = (image: TerrainImage) => image instanceof HTMLImageElement
  ? { width: image.naturalWidth, height: image.naturalHeight }
  : { width: image.width, height: image.height }

const makeSamples = (image: TerrainImage): Record<TerrainKind, HTMLCanvasElement> => {
  const { width, height } = imageSize(image)
  if (width < 2 || height < 2) throw new Error('生成地表 atlas 尺寸无效')
  const cellWidth = Math.floor(width / 2)
  const cellHeight = Math.floor(height / 2)
  return {
    grass: sampleCell(image, 0, 0, cellWidth, cellHeight),
    path: sampleCell(image, 1, 0, cellWidth, cellHeight),
    plaza: sampleCell(image, 0, 1, cellWidth, cellHeight),
    water: sampleCell(image, 1, 1, cellWidth, cellHeight),
  }
}

const sampleCell = (
  image: TerrainImage, cellX: number, cellY: number, cellWidth: number, cellHeight: number,
): HTMLCanvasElement => {
  const sample = document.createElement('canvas')
  sample.width = TILE
  sample.height = TILE
  const ctx = requiredContext(sample)
  // 使用 64px 高分辨率瓦片，场景层通过 0.5 缩放保持 32px 逻辑尺寸。
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, cellX * cellWidth, cellY * cellHeight, cellWidth, cellHeight, 0, 0, TILE, TILE)
  stitchSampleEdges(ctx)
  return sample
}

/**
 * ImageGen 的同类纹理不一定在首末像素已完全闭合。把相对两侧各两列（行）融合，
 * 使重复绘制时交界像素一致；四角一起处理，避免水平和垂直修边互相破坏。
 */
const stitchSampleEdges = (ctx: CanvasRenderingContext2D) => {
  const image = ctx.getImageData(0, 0, TILE, TILE)
  const { data } = image
  for (let p = 1; p < TILE - 1; p++) {
    blendPixelPair(data, p, TILE * (TILE - 1) + p)
    blendPixelPair(data, p * TILE, p * TILE + TILE - 1)
    blendPixelPair(data, TILE + p, TILE * (TILE - 2) + p)
    blendPixelPair(data, p * TILE + 1, p * TILE + TILE - 2)
  }
  const corners = [0, TILE - 1, TILE * (TILE - 1), TILE * TILE - 1]
  const average = [0, 1, 2, 3].map(channel => Math.round(corners.reduce((sum, pixel) => sum + data[pixel * 4 + channel], 0) / corners.length))
  for (const pixel of corners) for (let channel = 0; channel < 4; channel++) data[pixel * 4 + channel] = average[channel]
  ctx.putImageData(image, 0, 0)
}

const blendPixelPair = (data: Uint8ClampedArray, first: number, second: number) => {
  for (let channel = 0; channel < 4; channel++) {
    const average = Math.round((data[first * 4 + channel] + data[second * 4 + channel]) / 2)
    data[first * 4 + channel] = average
    data[second * 4 + channel] = average
  }
}

const drawBaseTiles = (ctx: CanvasRenderingContext2D, samples: Record<TerrainKind, HTMLCanvasElement>) => {
  const grass = samples.grass
  for (const index of [0, 1, 2, 3, 20, 21, 22, 23]) drawTile(ctx, grass, index)
  for (const index of [7, 8, 17]) drawTile(ctx, samples.path, index)
  for (const index of [9, 10]) drawTile(ctx, samples.water, index)
  for (const index of [13, 14]) drawTile(ctx, samples.plaza, index)
  tintInterior(ctx, 1, '#d9f0bb', 0.08)
  tintInterior(ctx, 2, '#f3dfae', 0.055)
  tintInterior(ctx, 3, '#173f33', 0.10)
  tintInterior(ctx, 8, '#ffe8bd', 0.045)
  tintInterior(ctx, 14, '#e8d8bd', 0.07)
  tintInterior(ctx, 17, '#a96f42', 0.1)
  drawWaterRipples(ctx, 9, 0)
  drawWaterRipples(ctx, 10, 4)
}

const drawTile = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, index: number) => {
  const x = (index % OUTPUT_COLUMNS) * TILE
  const y = Math.floor(index / OUTPUT_COLUMNS) * TILE
  ctx.drawImage(source, x, y)
}

/** Phaser tilemap 不应从地表图集拿到半透明像素，避免格边露出底色。 */
const forceOpaque = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255
  ctx.putImageData(pixels, 0, 0)
}

/** 仅调节内区，留出 4px 原边缘，让相邻格仍可无缝衔接。 */
const tintInterior = (ctx: CanvasRenderingContext2D, index: number, color: string, alpha: number) => {
  const x = (index % OUTPUT_COLUMNS) * TILE
  const y = Math.floor(index / OUTPUT_COLUMNS) * TILE
  const gradient = ctx.createRadialGradient(x + 16, y + 16, 2, x + 16, y + 16, 15)
  gradient.addColorStop(0, withAlpha(color, alpha))
  gradient.addColorStop(0.72, withAlpha(color, alpha * 0.42))
  gradient.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(x + 3, y + 3, 26, 26)
}

const withAlpha = (color: string, alpha: number) => {
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${color}${value}`
}

const drawWaterRipples = (ctx: CanvasRenderingContext2D, index: number, shift: number) => {
  const x = (index % OUTPUT_COLUMNS) * TILE
  const y = Math.floor(index / OUTPUT_COLUMNS) * TILE
  ctx.save()
  ctx.strokeStyle = 'rgba(224, 255, 244, 0.52)'
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  for (const [dx, dy, width] of [[4, 8, 7], [17, 17, 10], [8, 25, 6]] as const) {
    ctx.beginPath()
    ctx.moveTo(x + dx + shift, y + dy)
    ctx.quadraticCurveTo(x + dx + shift + width / 2, y + dy - 1.4, x + dx + shift + width, y + dy)
    ctx.stroke()
  }
  ctx.restore()
}

const drawDecoratedTiles = (ctx: CanvasRenderingContext2D, grass: HTMLCanvasElement) => {
  const decorations: Record<number, () => void> = {
    4: () => flowers(ctx, 4, '#ee7d93', '#fff0a9'),
    5: () => flowers(ctx, 5, '#f4c858', '#fff7c9'),
    6: () => tallGrass(ctx, 6),
    11: () => stones(ctx, 11),
    12: () => bush(ctx, 12),
    15: () => flowers(ctx, 15, '#8ebef6', '#f7fbff'),
    16: () => mushrooms(ctx, 16),
    18: () => sprout(ctx, 18),
    19: () => leafLitter(ctx, 19),
  }
  for (const index of Object.keys(decorations).map(Number)) {
    drawTile(ctx, grass, index)
    // Decoration coordinates are authored in the 64px logical grid. Render
    // them into the 128px output without interpolation so grass/flowers keep
    // crisp pixel clusters at runtime.
    ctx.save()
    ctx.scale(2, 2)
    decorations[index]()
    ctx.restore()
  }
}

const tileOrigin = (index: number) => ({ x: (index % OUTPUT_COLUMNS) * LOGICAL_TILE, y: Math.floor(index / OUTPUT_COLUMNS) * LOGICAL_TILE })

const flowers = (ctx: CanvasRenderingContext2D, index: number, petal: string, center: string) => {
  const { x, y } = tileOrigin(index)
  for (const [dx, dy] of [[9, 12], [22, 19], [15, 25]] as const) {
    ctx.fillStyle = petal
    ctx.fillRect(x + dx - 1, y + dy, 3, 2); ctx.fillRect(x + dx, y + dy - 1, 2, 4)
    ctx.fillStyle = center; ctx.fillRect(x + dx, y + dy, 1, 1)
  }
}

const tallGrass = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  ctx.strokeStyle = '#4f8a52'; ctx.lineWidth = 1
  for (const [dx, height] of [[8, 8], [11, 11], [15, 7], [20, 10], [23, 6]] as const) {
    ctx.beginPath(); ctx.moveTo(x + dx, y + 26); ctx.quadraticCurveTo(x + dx - 2, y + 22, x + dx + 1, y + 26 - height); ctx.stroke()
  }
}

const stones = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  for (const [dx, dy, size] of [[8, 10, 5], [20, 17, 4], [13, 24, 3]] as const) {
    ctx.fillStyle = '#b5b5a1'; ctx.fillRect(x + dx, y + dy, size, size - 1)
    ctx.fillStyle = '#e5dfc7'; ctx.fillRect(x + dx + 1, y + dy, size - 2, 1)
  }
}

const bush = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  ctx.fillStyle = '#315e43'
  for (const [dx, dy, size] of [[10, 18, 8], [17, 15, 9], [22, 20, 6]] as const) ctx.fillRect(x + dx, y + dy, size, size)
  ctx.fillStyle = '#6da85e'
  for (const [dx, dy] of [[12, 19], [19, 16], [23, 21]] as const) ctx.fillRect(x + dx, y + dy, 4, 3)
}

const mushrooms = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  for (const [dx, dy] of [[11, 20], [20, 14]] as const) {
    ctx.fillStyle = '#f3ddbb'; ctx.fillRect(x + dx + 1, y + dy + 3, 2, 4)
    ctx.fillStyle = '#cd655a'; ctx.fillRect(x + dx, y + dy, 5, 4)
    ctx.fillStyle = '#fff2d0'; ctx.fillRect(x + dx + 2, y + dy + 1, 1, 1)
  }
}

const sprout = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  ctx.strokeStyle = '#3f774a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 16, y + 25); ctx.lineTo(x + 16, y + 16); ctx.stroke()
  ctx.fillStyle = '#85bf62'; ctx.fillRect(x + 11, y + 15, 5, 3); ctx.fillRect(x + 16, y + 12, 5, 3)
}

const leafLitter = (ctx: CanvasRenderingContext2D, index: number) => {
  const { x, y } = tileOrigin(index)
  for (const [dx, dy, color] of [[8, 16, '#c57f4c'], [20, 11, '#d9a45b'], [17, 24, '#a76542'], [25, 22, '#d6bd65']] as const) {
    ctx.fillStyle = color; ctx.fillRect(x + dx, y + dy, 3, 2); ctx.fillRect(x + dx + 1, y + dy - 1, 1, 4)
  }
}
