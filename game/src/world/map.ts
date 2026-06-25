import { TILES } from '../assetManifest'
import {
  MAP_H,
  MAP_W,
  TILE,
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

export const MAIN_ROAD_LAMP_TILES = [12, 22, 31, 43, 54] as const
export const WORKSHOP_STREET_LAMPS: Point[] = [
  { x: 34, y: 15 },
  { x: 39, y: 22 },
  { x: 45, y: 15 },
  { x: 50, y: 22 },
]

export const NIGHT_GLOW_SOURCES: NightGlowSource[] = [
  { x: 880, y: 438, color: 0xffb866, scaleX: 6, base: 0.35 },
  { x: 290, y: 640, color: 0x7fd8ff, scaleX: 3.2, base: 0.4 },
]

export const SPAWN_FENCE_XS = [160, 192, 224, 256, 288, 320, 352, 384, 416] as const
export const SIGNPOST_POS: Point = { x: 332, y: 668 }
export const BENCH_POSITIONS: Point[] = [
  { x: 980, y: 520 },
  { x: 1370, y: 520 },
  { x: 1535, y: 710 },
  { x: 230, y: 700 },
]

export const BUTTERFLY_TINTS = [0xffffff, 0xff9ed2, 0x9ed2ff, 0xfff09e] as const

export const generateGroundMap = (): GroundMap => {
  const rnd = mulberry32(20260611)
  const grid = createGrassField(rnd)
  const waterTiles = carvePond(grid, rnd)
  const path = pathPainter(grid)

  paveLibraryPlaza(grid, rnd)
  paveWorkshopPads(grid, rnd, path)
  paveRoads(path)
  plantSpawnFlowerBed(grid, rnd)

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
  for (let y = 4; y <= 10; y++) {
    for (let x = 3; x <= 11; x++) {
      const edge = y === 4 || y === 10 || x === 3 || x === 11
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
  path(4, 22, 55, 23) // 主路（东西）
  path(8, 19, 9, 22) // 出生地支路
  path(26, 16, 27, 22) // 图书馆支路
  path(30, 15, 55, 16) // 作坊街区北侧门前路
  path(30, 22, 55, 23) // 作坊街区南侧门前路
  path(30, 17, 31, 21) // 作坊街区联络巷
}

const paveLibraryPlaza = (grid: number[][], rnd: () => number) => {
  for (let y = 12; y <= 16; y++) {
    for (let x = 23; x <= 30; x++) {
      grid[y][x] = rnd() > 0.5 ? TILES.plazaA : TILES.plazaB
    }
  }
}

const paveWorkshopPads = (
  grid: number[][],
  rnd: () => number,
  path: ReturnType<typeof pathPainter>,
) => {
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

    const isNorthRow = i < 4
    if (isNorthRow) path(tx - 1, ty + 3, tx + 1, ty + 4)
    else path(tx - 1, ty + 3, tx + 1, ty + 5)
  }
}

const plantSpawnFlowerBed = (grid: number[][], rnd: () => number) => {
  for (let y = 17; y <= 23; y++) {
    for (let x = 5; x <= 13; x++) {
      const d = Math.hypot(x - 9, (y - 20) * 1.3)
      if (d > 2.2 && d < 3.6 && grid[y][x] !== TILES.path) {
        grid[y][x] = rnd() > 0.5 ? TILES.flowerRed : TILES.flowerYellow
      }
    }
  }
}

const scatterTrees = (grid: number[][]): Point[] => {
  const rnd = mulberry32(7)
  const blocked: Rect[] = [
    { x: 100, y: 480, w: 400, h: 320 }, // 出生地一带
    { x: 700, y: 250, w: 1080, h: 520 }, // 图书馆、作坊街区与主街
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
