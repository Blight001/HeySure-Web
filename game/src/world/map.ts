import { TILES, TREE_VARIANTS } from '../assetManifest'
import {
  FIXED_BUILDINGS,
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

export interface TreeSpot extends Point {
  /** tree.png 帧索引（TREE_VARIANTS） */
  variant: number
  scale: number
  flip: boolean
}

export interface BushSpot extends Point {
  /** bush.png 帧索引（0 圆灌木 / 1 浆果 / 2 花灌木） */
  variant: number
  scale: number
  flip: boolean
}

export interface GroundMap {
  grid: number[][]
  waterTiles: Point[]
  trees: TreeSpot[]
  bushes: BushSpot[]
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

// 出生地泉水建筑贴图（64×64）的固定显示尺寸，用于推导寻路碰撞盒
const SPAWN_BUILDING_FRAME = 64
// 碰撞盒比贴图略收一点：底座圆角/顶部尖塔留作可踩的草地与遮挡，
// 但泉池上方那段（原先只挡椭圆水池、露出的空当）必须封死，
// 否则随机寻路会把目标点丢进建筑内部，角色走进去站住看似"卡死"。
const SPAWN_HALF_W = 46
const SPAWN_TOP_INSET = 14 // 顶部尖塔留白
const SPAWN_BOTTOM_INSET = 0

// 出生地建筑实心footprint（覆盖整座泉水基座，而非仅水池椭圆）
const spawnBuildingRect = (): Rect | null => {
  const def = FIXED_BUILDINGS.find(b => b.key === 'spawn')
  if (!def) return null
  const h = SPAWN_BUILDING_FRAME * def.scale
  const top = def.pos.y - h * 0.55 // sprite origin (0.5, 0.55)
  const bottom = def.pos.y + h * 0.45
  return {
    x: def.pos.x - SPAWN_HALF_W,
    y: top + SPAWN_TOP_INSET,
    w: SPAWN_HALF_W * 2,
    h: bottom - top - SPAWN_TOP_INSET - SPAWN_BOTTOM_INSET,
  }
}

const SPAWN_BUILDING_RECT = spawnBuildingRect()

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

export interface ButterflyHome extends Point {
  /** 游荡半径（像素）：蝴蝶只在自己家园附近选新目标，不再全图直线穿越 */
  r: number
}

/** 蝴蝶家园：分散在全图各处的花草区（避开作坊街与建筑），每处 1~2 只 */
export const BUTTERFLY_HOMES: ButterflyHome[] = [
  { x: 250, y: 210, r: 110 }, // 池塘畔花甸
  { x: 610, y: 150, r: 130 }, // 北部草原
  { x: 1060, y: 170, r: 120 }, // 东北草地
  { x: 1330, y: 430, r: 90 }, // 东缘林间
  { x: 1240, y: 860, r: 110 }, // 东南草甸
  { x: 780, y: 895, r: 120 }, // 南部草地
  { x: 470, y: 870, r: 100 }, // 西南绿地
  { x: 330, y: 630, r: 80 }, // 图书馆南侧
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

  // 出生地：封死整座泉水建筑footprint（含水池上方原本露出的空当），
  // 否则随机寻路会把游荡目标点丢进建筑内部导致角色"走进去卡死"。
  const r = SPAWN_BUILDING_RECT
  if (r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return true

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

  const trees = scatterTrees(grid)
  return {
    grid,
    waterTiles,
    trees,
    bushes: scatterBushes(grid, trees),
  }
}

/** 低频值噪声：粗网格随机值 + smoothstep 双线性插值，让草色/花丛成片分布而非均匀噪点 */
const makeValueNoise = (seed: number, cell: number) => {
  const rnd = mulberry32(seed)
  const gw = Math.ceil(MAP_W / cell) + 2
  const gh = Math.ceil(MAP_H / cell) + 2
  const g: number[][] = Array.from({ length: gh }, () => Array.from({ length: gw }, () => rnd()))
  return (x: number, y: number): number => {
    const fx = x / cell
    const fy = y / cell
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const a = g[y0][x0] * (1 - sx) + g[y0][x0 + 1] * sx
    const b = g[y0 + 1][x0] * (1 - sx) + g[y0 + 1][x0 + 1] * sx
    return a * (1 - sy) + b * sy
  }
}

const createGrassField = (rnd: () => number): number[][] => {
  const shade = makeValueNoise(101, 6) // 草色明暗成片（草甸/浅草/深草过渡）
  const meadow = makeValueNoise(202, 5) // 花甸分布（高值区聚成花丛）
  const grid: number[][] = []
  for (let y = 0; y < MAP_H; y++) {
    const row: number[] = []
    for (let x = 0; x < MAP_W; x++) {
      const s = shade(x, y)
      const m = meadow(x, y)
      const r = rnd()
      // 基底草色按低频噪声成片
      let t: number =
        s < 0.34 ? TILES.grassC :
        s < 0.62 ? TILES.grassA :
        s < 0.86 ? TILES.grassB : TILES.grassDark
      if (m > 0.72) {
        // 花甸核心：红/黄/蓝白野花混开，间杂高草
        if (r > 0.5) t = [TILES.flowerRed, TILES.flowerYellow, TILES.flowerBlue][Math.floor(rnd() * 3)]
        else if (r > 0.3) t = TILES.tallGrass
      } else if (m > 0.64 && r > 0.7) {
        // 花甸边缘：高草过渡
        t = TILES.tallGrass
      } else {
        // 零星点缀：蘑菇/灌木/碎石/嫩芽/落叶
        if (r > 0.985) t = TILES.mushroom
        else if (r > 0.97) t = TILES.bush
        else if (r > 0.955) t = TILES.stone
        else if (r > 0.94) t = TILES.sprout
        else if (r > 0.928) t = TILES.leafLitter
      }
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

/** 种植禁区：建筑/广场/主街一带不长树与灌木 */
const PLANT_BLOCKED: Rect[] = [
  { x: 100, y: 330, w: 400, h: 470 }, // 图书馆与出生地一带
  { x: 400, y: 250, w: 860, h: 540 }, // 作坊街区与主街
  { x: 60, y: 90, w: 360, h: 300 }, // 池塘
]

const inPlantBlocked = (px: number, py: number) =>
  PLANT_BLOCKED.some(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)

const plantGroundOk = (grid: number[][], px: number, py: number): boolean => {
  const t = grid[Math.floor(py / TILE)]?.[Math.floor(px / TILE)]
  return t !== undefined && t !== TILES.path && t !== TILES.waterA && t !== TILES.waterB && t !== TILES.plazaA && t !== TILES.plazaB
}

const scatterTrees = (grid: number[][]): TreeSpot[] => {
  const rnd = mulberry32(7)
  const trees: TreeSpot[] = []
  const usedTiles = new Set<string>()

  const tryPlant = (px: number, py: number, variant: number, scale: number, force = false) => {
    if (!force && inPlantBlocked(px, py)) return
    if (!plantGroundOk(grid, px, py)) return
    // 同一瓦片只种一棵，避免树冠完全重叠成一团
    const key = `${Math.floor(px / TILE)},${Math.floor(py / TILE)}`
    if (usedTiles.has(key)) return
    usedTiles.add(key)
    trees.push({ x: px, y: py, variant, scale, flip: rnd() > 0.5 })
  }

  // 边缘林带偏针叶/橡树（森林感），内部偏阔叶；樱花全图稀有点缀
  const pickVariant = (edge: boolean): number => {
    const r = rnd()
    if (edge) {
      if (r < 0.45) return TREE_VARIANTS.pine
      if (r < 0.82) return TREE_VARIANTS.oak
      if (r < 0.96) return TREE_VARIANTS.birch
      return TREE_VARIANTS.sakura
    }
    if (r < 0.36) return TREE_VARIANTS.oak
    if (r < 0.62) return TREE_VARIANTS.birch
    if (r < 0.92) return TREE_VARIANTS.pine
    return TREE_VARIANTS.sakura
  }

  // 1) 边缘林带：四周种树形成"森林环抱小镇"的边界；
  //    间距随机并留 ~15% 缺口，避免排成整齐的树篱
  for (let x = 30; x < WORLD_W - 20; x += 30 + rnd() * 42) {
    if (rnd() > 0.85) continue
    tryPlant(x + rnd() * 14, 84 + rnd() * 60, pickVariant(true), 1.05 + rnd() * 0.4)
    if (rnd() > 0.85) continue
    tryPlant(x + rnd() * 14, WORLD_H - 16 - rnd() * 52, pickVariant(true), 1.05 + rnd() * 0.4)
  }
  for (let y = 150; y < WORLD_H - 70; y += 34 + rnd() * 40) {
    if (rnd() > 0.85) continue
    tryPlant(24 + rnd() * 46, y + rnd() * 12, pickVariant(true), 1.0 + rnd() * 0.4)
    if (rnd() > 0.85) continue
    tryPlant(WORLD_W - 22 - rnd() * 50, y + rnd() * 12, pickVariant(true), 1.0 + rnd() * 0.4)
  }
  // 2) 内部树丛：随机丛心，每丛 2~5 棵聚成小林子（比均匀散点自然）
  for (let g = 0; g < 22; g++) {
    const cx = 70 + rnd() * (WORLD_W - 140)
    const cy = 90 + rnd() * (WORLD_H - 180)
    const n = 2 + Math.floor(rnd() * 4)
    for (let i = 0; i < n; i++) {
      tryPlant(cx + (rnd() - 0.5) * 170, cy + (rnd() - 0.5) * 130, pickVariant(false), 0.85 + rnd() * 0.45)
    }
  }
  // 3) 零星独树填空
  for (let i = 0; i < 26; i++) {
    tryPlant(40 + rnd() * (WORLD_W - 80), 60 + rnd() * (WORLD_H - 120), pickVariant(false), 0.85 + rnd() * 0.4)
  }
  // 4) 手植地标樱花：池塘东南 + 出生地西北各一棵大树
  tryPlant(392, 300, TREE_VARIANTS.sakura, 1.55)
  tryPlant(88, 620, TREE_VARIANTS.sakura, 1.45, true)
  return trees
}

/** 灌木丛：一部分簇拥在树脚下，一部分独立成小簇散在草地上 */
const scatterBushes = (grid: number[][], trees: TreeSpot[]): BushSpot[] => {
  const rnd = mulberry32(17)
  const bushes: BushSpot[] = []

  const tryPlant = (px: number, py: number, force = false) => {
    if (!force && inPlantBlocked(px, py)) return
    if (!plantGroundOk(grid, px, py)) return
    bushes.push({
      x: px,
      y: py,
      variant: Math.floor(rnd() * 3),
      scale: 0.8 + rnd() * 0.5,
      flip: rnd() > 0.5,
    })
  }

  // 1) 约 1/3 的树脚下伴生 1~2 丛灌木（长在树前侧，深度排序天然在树冠之下）
  for (const t of trees) {
    if (rnd() > 0.34) continue
    const n = 1 + Math.floor(rnd() * 2)
    for (let i = 0; i < n; i++) {
      tryPlant(t.x + (rnd() - 0.5) * 56, t.y + 8 + rnd() * 22)
    }
  }
  // 2) 独立灌木小簇：草地上 2~3 丛一组
  for (let g = 0; g < 14; g++) {
    const cx = 60 + rnd() * (WORLD_W - 120)
    const cy = 90 + rnd() * (WORLD_H - 170)
    const n = 2 + Math.floor(rnd() * 2)
    for (let i = 0; i < n; i++) {
      tryPlant(cx + (rnd() - 0.5) * 60, cy + (rnd() - 0.5) * 44)
    }
  }
  return bushes
}
