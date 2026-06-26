import { TILES } from '../assetManifest'
import {
  MAP_H,
  MAP_W,
  LIBRARY_DEVICE_POS,
  TILE,
  WORKSHOP_COLS,
  WORKSHOP_SLOTS,
  WORLD_H,
  WORLD_W,
  mulberry32,
  workshopSlotPos,
  type Point,
  type Rect,
} from './layout'

export interface GroundMap {
  grid: number[][]
  waterTiles: Point[]
  treePositions: Point[]
}

export interface NightGlowSource extends Point {
  color: number
  scaleX: number
  scaleY?: number
  base: number
  pulse?: number
}

const POND_X1 = 3
const POND_X2 = 11
const POND_Y1 = 4
const POND_Y2 = 10

const WORKSHOP_STREET = {
  left: Math.floor(workshopSlotPos(0).x / TILE) - 2,
  right: Math.floor(workshopSlotPos(WORKSHOP_COLS - 1).x / TILE) + 2,
  upperRoadY: Math.floor(workshopSlotPos(0).y / TILE) + 3,
  lowerRoadY: Math.floor(workshopSlotPos(WORKSHOP_COLS).y / TILE) + 4,
  connectorX: Math.floor(workshopSlotPos(0).x / TILE) - 4,
}

export const MAIN_ROAD_LAMP_TILES = [6, WORKSHOP_STREET.connectorX] as const
export const WORKSHOP_STREET_LAMPS: Point[] = Array.from({ length: WORKSHOP_COLS }, (_, i) => {
  const x = Math.floor(workshopSlotPos(i).x / TILE)
  return [
    { x, y: WORKSHOP_STREET.upperRoadY },
    { x, y: WORKSHOP_STREET.lowerRoadY },
  ]
}).flat()

export const NIGHT_GLOW_SOURCES: NightGlowSource[] = [
  { x: LIBRARY_DEVICE_POS.x, y: LIBRARY_DEVICE_POS.y + 8, color: 0xffb866, scaleX: 6, base: 0.35 },
  { x: 194, y: 732, color: 0x7fd8ff, scaleX: 4.4, scaleY: 3.2, base: 0.42, pulse: 0.18 },
  { x: 194, y: 764, color: 0x9df7d6, scaleX: 7.8, scaleY: 2.2, base: 0.2, pulse: 0.08 },
]

export const SIGNPOST_POS: Point = { x: 236, y: 764 }
export const SPAWN_LAMP_TILES: Point[] = [
  { x: 2, y: 23 },
  { x: 10, y: 23 },
  { x: 4, y: 27 },
  { x: 8, y: 27 },
] as const
export const SPAWN_BUTTERFLY_POINTS: Point[] = [
  { x: 109, y: 688 },
  { x: 152, y: 820 },
  { x: 246, y: 674 },
  { x: 299, y: 811 },
] as const
// 图书馆四周装饰精简：每类仅保留一对，避免广场过于拥挤。
export const LIBRARY_CORE_LAMP_POINTS: Point[] = [
  { x: LIBRARY_DEVICE_POS.x - 112, y: LIBRARY_DEVICE_POS.y + 40 },
  { x: LIBRARY_DEVICE_POS.x + 112, y: LIBRARY_DEVICE_POS.y + 40 },
] as const
export const LIBRARY_SPARKLE_POINTS: Point[] = [
  { x: LIBRARY_DEVICE_POS.x - 76, y: LIBRARY_DEVICE_POS.y + 6 },
  { x: LIBRARY_DEVICE_POS.x + 76, y: LIBRARY_DEVICE_POS.y + 6 },
  { x: LIBRARY_DEVICE_POS.x, y: LIBRARY_DEVICE_POS.y - 84 },
] as const
export const LIBRARY_OBELISK_POINTS: Point[] = [
  { x: LIBRARY_DEVICE_POS.x - 138, y: LIBRARY_DEVICE_POS.y + 54 },
  { x: LIBRARY_DEVICE_POS.x + 138, y: LIBRARY_DEVICE_POS.y + 54 },
] as const
export const LIBRARY_BANNER_POINTS: Point[] = [
  { x: LIBRARY_DEVICE_POS.x - 86, y: LIBRARY_DEVICE_POS.y - 18 },
  { x: LIBRARY_DEVICE_POS.x + 86, y: LIBRARY_DEVICE_POS.y - 18 },
] as const
export const LIBRARY_BOOK_STAND_POINTS: Point[] = [
  { x: LIBRARY_DEVICE_POS.x - 48, y: LIBRARY_DEVICE_POS.y + 122 },
  { x: LIBRARY_DEVICE_POS.x + 48, y: LIBRARY_DEVICE_POS.y + 122 },
] as const
export const BENCH_POSITIONS: Point[] = [
  { x: 360, y: 510 },
  { x: 214, y: 716 },
  { x: 398, y: 716 },
  ...Array.from({ length: WORKSHOP_SLOTS }, (_, i) => {
    const pos = workshopSlotPos(i)
    return { x: pos.x, y: pos.y + 74 }
  }),
]

export const BUTTERFLY_TINTS = [0xffffff, 0xff9ed2, 0x9ed2ff, 0xfff09e] as const

export const isWorldBlocked = (p: Point): boolean => {
  const tx = Math.floor(p.x / TILE)
  const ty = Math.floor(p.y / TILE)
  const inPond = tx >= POND_X1 && tx <= POND_X2 && ty >= POND_Y1 && ty <= POND_Y2
  if (inPond) return true

  const inSpawnFountain = Math.hypot((p.x - 194) / 58, (p.y - 744) / 38) <= 1
  if (inSpawnFountain) return true

  return false
}

export const generateGroundMap = (): GroundMap => {
  const rnd = mulberry32(20260611)
  const grid = createGrassField(rnd)
  const waterTiles = carvePond(grid, rnd)
  const path = pathPainter(grid)

  paveLibraryPlaza(grid, rnd)
  paveWorkshopPads(grid, rnd)
  paveRoads(path)
  decorateSpawnGround(grid, rnd)

  return {
    grid,
    waterTiles,
    treePositions: scatterTrees(grid),
  }
}

const createGrassField = (rnd: () => number): number[][] => {
  const grid: number[][] = []
  for (let y = 0; y < MAP_H; y++) {
    const row: number[] = []
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd()
      let t: number = TILES.grassA
      if (r > 0.93) t = TILES.flowerYellow
      else if (r > 0.88) t = TILES.flowerRed
      else if (r > 0.8) t = TILES.tallGrass
      else if (r > 0.55) t = TILES.grassB
      else if (r > 0.35) t = TILES.grassC
      else if (r > 0.33) t = TILES.bush
      else if (r > 0.31) t = TILES.stone
      row.push(t)
    }
    grid.push(row)
  }
  return grid
}

const carvePond = (grid: number[][], rnd: () => number): Point[] => {
  const waterTiles: Point[] = []
  for (let y = POND_Y1; y <= POND_Y2; y++) {
    for (let x = POND_X1; x <= POND_X2; x++) {
      const edge = y === POND_Y1 || y === POND_Y2 || x === POND_X1 || x === POND_X2
      if (edge && rnd() > 0.45) continue
      grid[y][x] = rnd() > 0.5 ? TILES.waterA : TILES.waterB
      waterTiles.push({ x, y })
    }
  }
  return waterTiles
}

const pathPainter = (grid: number[][]) => (x0: number, y0: number, x1: number, y1: number) => {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) grid[y][x] = TILES.path
    }
  }
}

const paveRoads = (path: ReturnType<typeof pathPainter>) => {
  // 道路保持 2 格宽；作坊地皮另铺石板，避免整片区域都被道路吞掉。
  path(4, 22, WORKSHOP_STREET.right + 4, 23) // 主路（东西）
  path(8, 13, 9, 22) // 图书馆 → 出生地 → 主路
  path(WORKSHOP_STREET.left, WORKSHOP_STREET.upperRoadY, WORKSHOP_STREET.right, WORKSHOP_STREET.upperRoadY + 1)
  path(WORKSHOP_STREET.left, WORKSHOP_STREET.lowerRoadY, WORKSHOP_STREET.right, WORKSHOP_STREET.lowerRoadY + 1)
  path(WORKSHOP_STREET.connectorX, WORKSHOP_STREET.upperRoadY, WORKSHOP_STREET.connectorX + 1, WORKSHOP_STREET.lowerRoadY - 1)
  path(WORKSHOP_STREET.connectorX + 2, WORKSHOP_STREET.upperRoadY, WORKSHOP_STREET.left - 1, WORKSHOP_STREET.upperRoadY + 1)
  path(WORKSHOP_STREET.connectorX, 22, WORKSHOP_STREET.left - 1, 23)
}

const paveLibraryPlaza = (grid: number[][], rnd: () => number) => {
  for (let y = 11; y <= 16; y++) {
    for (let x = 5; x <= 13; x++) {
      grid[y][x] = rnd() > 0.5 ? TILES.plazaA : TILES.plazaB
    }
  }
  const cx = Math.floor(LIBRARY_DEVICE_POS.x / TILE)
  const cy = Math.floor((LIBRARY_DEVICE_POS.y + 80) / TILE)
  for (const p of [
    { x: cx, y: cy },
    { x: cx - 2, y: cy },
    { x: cx + 2, y: cy },
    { x: cx, y: cy - 2 },
    { x: cx, y: cy + 2 },
  ]) {
    if (p.y >= 0 && p.y < MAP_H && p.x >= 0 && p.x < MAP_W) grid[p.y][p.x] = TILES.stone
  }
}

const paveWorkshopPads = (grid: number[][], rnd: () => number) => {
  for (let i = 0; i < WORKSHOP_SLOTS; i++) {
    const pos = workshopSlotPos(i)
    const tx = Math.floor(pos.x / TILE)
    const ty = Math.floor(pos.y / TILE)
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) {
        if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) {
          grid[y][x] = rnd() > 0.5 ? TILES.plazaA : TILES.plazaB
        }
      }
    }
  }
}

const decorateSpawnGround = (grid: number[][], rnd: () => number) => {
  const cx = 6
  const cy = 23
  for (let y = 19; y <= 28; y++) {
    for (let x = 1; x <= 12; x++) {
      const d = Math.hypot((x - cx) * 0.9, (y - cy) * 1.15)
      if (d <= 1.7) {
        grid[y][x] = rnd() > 0.45 ? TILES.plazaA : TILES.plazaB
      } else if (d <= 2.55) {
        grid[y][x] = rnd() > 0.5 ? TILES.plazaB : TILES.stone
      } else if (d <= 3.55 && grid[y][x] !== TILES.path) {
        grid[y][x] = rnd() > 0.32 ? TILES.flowerYellow : TILES.flowerRed
      } else if (d <= 4.65 && grid[y][x] !== TILES.path && rnd() > 0.55) {
        grid[y][x] = rnd() > 0.55 ? TILES.tallGrass : TILES.flowerRed
      }
    }
  }

  // Four tiny stone "runes" give the spawn plaza a deliberate, hand-placed center.
  for (const p of [
    { x: cx, y: cy - 3 },
    { x: cx + 3, y: cy },
    { x: cx, y: cy + 3 },
    { x: cx - 3, y: cy },
  ]) {
    if (p.y >= 0 && p.y < MAP_H && p.x >= 0 && p.x < MAP_W) grid[p.y][p.x] = TILES.stone
  }
}

const scatterTrees = (grid: number[][]): Point[] => {
  const rnd = mulberry32(7)
  const blocked: Rect[] = [
    { x: 100, y: 330, w: 400, h: 470 }, // 图书馆与出生地一带
    { x: 400, y: 250, w: 860, h: 540 }, // 作坊街区与主街
    { x: 60, y: 90, w: 360, h: 300 }, // 池塘
  ]
  const inBlocked = (px: number, py: number) =>
    blocked.some(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)
  const treePositions: Point[] = []
  for (let i = 0; i < 80; i++) {
    const px = 40 + rnd() * (WORLD_W - 80)
    const py = 60 + rnd() * (WORLD_H - 120)
    const ty = Math.floor(py / TILE)
    const tx = Math.floor(px / TILE)
    if (inBlocked(px, py)) continue
    const t = grid[ty]?.[tx]
    if (t === TILES.path || t === TILES.waterA || t === TILES.waterB || t === TILES.plazaA || t === TILES.plazaB) continue
    treePositions.push({ x: px, y: py })
  }
  return treePositions
}
