/**
 * 2048：4x4 棋盘，方向键/WASD 滑动合并同数字，合并值计分，无路可走时结束。
 */
import type { MinigameContext, MinigameInstance } from './types'

const N = 4
const CELL = 70
const GAP = 8
const BOARD = N * CELL + (N + 1) * GAP
export const G2048_SIZE = { w: BOARD, h: BOARD }

/** 数值 → [底色, 字色]（沿用 2048 经典配色） */
const TILE_COLORS: Record<number, [string, string]> = {
  2: ['#eee4da', '#776e65'],
  4: ['#ede0c8', '#776e65'],
  8: ['#f2b179', '#f9f6f2'],
  16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'],
  64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'],
  256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
}

const DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}

export const createGame2048 = (canvas: HTMLCanvasElement, ctx: MinigameContext): MinigameInstance => {
  const g = canvas.getContext('2d')!
  let board: number[][] = []
  let score = 0
  let over = false

  const emptyCells = (): [number, number][] => {
    const cells: [number, number][] = []
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!board[y][x]) cells.push([x, y])
    return cells
  }

  const spawn = () => {
    const cells = emptyCells()
    if (!cells.length) return
    const [x, y] = cells[Math.floor(Math.random() * cells.length)]
    board[y][x] = Math.random() < 0.9 ? 2 : 4
  }

  const reset = () => {
    board = Array.from({ length: N }, () => Array<number>(N).fill(0))
    score = 0
    over = false
    ctx.setScore(0)
    spawn()
    spawn()
    draw()
  }

  /** 一行向左压缩合并；返回新行、得分与是否发生位移 */
  const slideLine = (line: number[]): { line: number[]; gained: number; moved: boolean } => {
    const packed = line.filter(v => v)
    const out: number[] = []
    let gained = 0
    for (let i = 0; i < packed.length; i++) {
      if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
        out.push(packed[i] * 2)
        gained += packed[i] * 2
        i++
      } else {
        out.push(packed[i])
      }
    }
    while (out.length < N) out.push(0)
    const moved = out.some((v, i) => v !== line[i])
    return { line: out, gained, moved }
  }

  const move = (dx: number, dy: number) => {
    if (over) return
    let moved = false
    let gained = 0
    for (let i = 0; i < N; i++) {
      // 取出一条线（按滑动方向正序），压缩后写回
      const line: number[] = []
      for (let j = 0; j < N; j++) {
        const x = dx ? (dx > 0 ? N - 1 - j : j) : i
        const y = dx ? i : dy > 0 ? N - 1 - j : j
        line.push(board[y][x])
      }
      const r = slideLine(line)
      if (r.moved) moved = true
      gained += r.gained
      for (let j = 0; j < N; j++) {
        const x = dx ? (dx > 0 ? N - 1 - j : j) : i
        const y = dx ? i : dy > 0 ? N - 1 - j : j
        board[y][x] = r.line[j]
      }
    }
    if (!moved) return
    score += gained
    ctx.setScore(score)
    spawn()
    if (!canMove()) over = true
    draw()
  }

  const canMove = (): boolean => {
    if (emptyCells().length) return true
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = board[y][x]
        if ((x + 1 < N && board[y][x + 1] === v) || (y + 1 < N && board[y + 1][x] === v)) return true
      }
    }
    return false
  }

  const draw = () => {
    g.fillStyle = '#3a3f4c'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const px = GAP + x * (CELL + GAP)
        const py = GAP + y * (CELL + GAP)
        const v = board[y][x]
        const [bg, fg] = v ? TILE_COLORS[v] ?? ['#3c3a32', '#f9f6f2'] : ['#4a4f5e', '#4a4f5e']
        g.fillStyle = bg
        g.fillRect(px, py, CELL, CELL)
        if (v) {
          const size = v < 100 ? 30 : v < 1000 ? 26 : 20
          g.fillStyle = fg
          g.font = `bold ${size}px ui-monospace, Consolas, monospace`
          g.fillText(String(v), px + CELL / 2, py + CELL / 2 + 1)
        }
      }
    }
    if (over) {
      g.fillStyle = 'rgba(10, 12, 18, 0.72)'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = '#f0c060'
      g.font = 'bold 22px ui-monospace, Consolas, monospace'
      g.fillText('无路可走', canvas.width / 2, canvas.height / 2 - 18)
      g.fillStyle = '#d6dae2'
      g.font = '14px ui-monospace, Consolas, monospace'
      g.fillText(`得分 ${score}`, canvas.width / 2, canvas.height / 2 + 8)
      g.fillStyle = '#8a90a0'
      g.fillText('按 空格 再来一局', canvas.width / 2, canvas.height / 2 + 32)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    const d = DIRS[e.code]
    if (d) {
      e.preventDefault()
      move(d[0], d[1])
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      if (over) reset()
    }
  }

  window.addEventListener('keydown', onKey)
  reset()

  return {
    destroy() {
      window.removeEventListener('keydown', onKey)
    },
  }
}
