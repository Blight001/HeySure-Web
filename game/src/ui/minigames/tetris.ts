/**
 * 俄罗斯方块：10x20 棋盘 + 右侧预览栏。←→ 移动、↑ 旋转、↓ 软降、空格硬降；
 * 7 袋随机发牌，消行计分升级加速，堆到顶部结束。
 */
import type { MinigameContext, MinigameInstance } from './types'

const COLS = 10
const ROWS = 20
const CELL = 16
const SIDE = 96
export const TETRIS_SIZE = { w: COLS * CELL + SIDE, h: ROWS * CELL }

const START_STEP_MS = 700
const MIN_STEP_MS = 120
const LINE_SCORES = [0, 100, 300, 500, 800]

interface Pt {
  x: number
  y: number
}

/** 形状定义：n x n 旋转盒内的 4 个格子 */
const SHAPES: Record<string, { cells: Pt[]; n: number; color: string }> = {
  I: { cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], n: 4, color: '#5cc8dc' },
  O: { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], n: 2, color: '#eed05c' },
  T: { cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], n: 3, color: '#a676d8' },
  S: { cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], n: 3, color: '#80c864' },
  Z: { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }], n: 3, color: '#e26a60' },
  J: { cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], n: 3, color: '#6284d6' },
  L: { cells: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], n: 3, color: '#f0a05c' },
}
type ShapeKey = keyof typeof SHAPES

const rotateCells = (cells: Pt[], n: number): Pt[] => cells.map(c => ({ x: n - 1 - c.y, y: c.x }))

export const createTetris = (canvas: HTMLCanvasElement, ctx: MinigameContext): MinigameInstance => {
  const g = canvas.getContext('2d')!
  let grid: (string | 0)[][] = []
  let cur: { shape: ShapeKey; cells: Pt[]; x: number; y: number } | null = null
  let bag: ShapeKey[] = []
  let nextShape: ShapeKey = 'I'
  let score = 0
  let lines = 0
  let level = 0
  let over = false
  let timer = 0

  const drawFromBag = (): ShapeKey => {
    if (!bag.length) {
      bag = Object.keys(SHAPES) as ShapeKey[]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
    }
    return bag.pop()!
  }

  const collides = (cells: Pt[], ox: number, oy: number): boolean =>
    cells.some(c => {
      const x = c.x + ox
      const y = c.y + oy
      return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x] !== 0)
    })

  const spawnPiece = () => {
    const shape = nextShape
    nextShape = drawFromBag()
    const def = SHAPES[shape]
    const piece = { shape, cells: def.cells.map(c => ({ ...c })), x: Math.floor((COLS - def.n) / 2), y: -1 }
    if (collides(piece.cells, piece.x, piece.y)) {
      over = true
      cur = null
      return
    }
    cur = piece
  }

  const reset = () => {
    grid = Array.from({ length: ROWS }, () => Array<string | 0>(COLS).fill(0))
    bag = []
    nextShape = drawFromBag()
    score = 0
    lines = 0
    level = 0
    over = false
    ctx.setScore(0)
    spawnPiece()
    schedule()
    draw()
  }

  const stepMs = () => Math.max(MIN_STEP_MS, START_STEP_MS - level * 60)

  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(tick, stepMs())
  }

  const tick = () => {
    if (over || !cur) return
    if (!tryMove(0, 1)) lockPiece()
    draw()
    if (!over) schedule()
  }

  const tryMove = (dx: number, dy: number): boolean => {
    if (!cur || collides(cur.cells, cur.x + dx, cur.y + dy)) return false
    cur.x += dx
    cur.y += dy
    return true
  }

  const tryRotate = () => {
    if (!cur || cur.shape === 'O') return
    const rotated = rotateCells(cur.cells, SHAPES[cur.shape].n)
    // 简易踢墙：原位不行时左右挪 1~2 格再试
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(rotated, cur.x + kick, cur.y)) {
        cur.cells = rotated
        cur.x += kick
        return
      }
    }
  }

  const lockPiece = () => {
    if (!cur) return
    for (const c of cur.cells) {
      const y = c.y + cur.y
      if (y < 0) {
        over = true
        cur = null
        return
      }
      grid[y][c.x + cur.x] = SHAPES[cur.shape].color
    }
    const kept = grid.filter(row => row.some(v => v === 0))
    const cleared = ROWS - kept.length
    if (cleared) {
      while (kept.length < ROWS) kept.unshift(Array<string | 0>(COLS).fill(0))
      grid = kept
      lines += cleared
      level = Math.floor(lines / 10)
      score += LINE_SCORES[cleared] * (level + 1)
      ctx.setScore(score)
    }
    spawnPiece()
  }

  const hardDrop = () => {
    if (!cur) return
    let dist = 0
    while (tryMove(0, 1)) dist++
    score += dist * 2
    ctx.setScore(score)
    lockPiece()
    draw()
    if (!over) schedule()
  }

  /** 幽灵落点：当前块直落到底的位置 */
  const ghostY = (): number => {
    if (!cur) return 0
    let y = cur.y
    while (!collides(cur.cells, cur.x, y + 1)) y++
    return y
  }

  const drawCell = (px: number, py: number, color: string, alpha = 1) => {
    g.globalAlpha = alpha
    g.fillStyle = color
    g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
    g.fillStyle = 'rgba(255,255,255,0.25)'
    g.fillRect(px + 2, py + 2, CELL - 8, 2)
    g.globalAlpha = 1
  }

  const draw = () => {
    g.fillStyle = '#141820'
    g.fillRect(0, 0, canvas.width, canvas.height)
    // 棋盘底纹与已落方块
    g.fillStyle = '#1a202c'
    for (let y = 0; y < ROWS; y++) {
      for (let x = y % 2; x < COLS; x += 2) g.fillRect(x * CELL, y * CELL, CELL, CELL)
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x]) drawCell(x * CELL, y * CELL, grid[y][x] as string)
      }
    }
    if (cur) {
      const gy = ghostY()
      for (const c of cur.cells) {
        if (c.y + gy >= 0) drawCell((c.x + cur.x) * CELL, (c.y + gy) * CELL, SHAPES[cur.shape].color, 0.22)
        if (c.y + cur.y >= 0) drawCell((c.x + cur.x) * CELL, (c.y + cur.y) * CELL, SHAPES[cur.shape].color)
      }
    }
    // 右侧栏：下一块 + 统计
    const sx = COLS * CELL
    g.fillStyle = '#1c2230'
    g.fillRect(sx, 0, SIDE, canvas.height)
    g.strokeStyle = '#3a3f4c'
    g.strokeRect(sx + 0.5, 0.5, SIDE - 1, canvas.height - 1)
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#8a90a0'
    g.font = '12px ui-monospace, Consolas, monospace'
    g.fillText('下一块', sx + 12, 24)
    const preview = SHAPES[nextShape]
    for (const c of preview.cells) {
      drawCell(sx + 16 + c.x * CELL, 36 + c.y * CELL, preview.color)
    }
    g.fillStyle = '#8a90a0'
    g.fillText(`行数 ${lines}`, sx + 12, 120)
    g.fillText(`等级 ${level + 1}`, sx + 12, 142)
    if (over) {
      g.fillStyle = 'rgba(10, 12, 18, 0.72)'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.textAlign = 'center'
      g.fillStyle = '#f0c060'
      g.font = 'bold 22px ui-monospace, Consolas, monospace'
      g.fillText('游戏结束', canvas.width / 2, canvas.height / 2 - 18)
      g.fillStyle = '#d6dae2'
      g.font = '14px ui-monospace, Consolas, monospace'
      g.fillText(`得分 ${score} · 行数 ${lines}`, canvas.width / 2, canvas.height / 2 + 8)
      g.fillStyle = '#8a90a0'
      g.fillText('按 回车 再来一局', canvas.width / 2, canvas.height / 2 + 32)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (over) {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        reset()
      }
      return
    }
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault()
        if (tryMove(-1, 0)) draw()
        break
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault()
        if (tryMove(1, 0)) draw()
        break
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault()
        tryRotate()
        draw()
        break
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault()
        if (tryMove(0, 1)) {
          score += 1
          ctx.setScore(score)
          draw()
          schedule()
        }
        break
      case 'Space':
        e.preventDefault()
        hardDrop()
        break
    }
  }

  window.addEventListener('keydown', onKey)
  reset()

  return {
    destroy() {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    },
  }
}
