/**
 * 贪吃蛇：20x20 网格，方向键/WASD 转向，吃果子得分并加速，撞墙/撞己出局。
 */
import type { MinigameContext, MinigameInstance } from './types'

const COLS = 20
const ROWS = 20
const CELL = 16
export const SNAKE_SIZE = { w: COLS * CELL, h: ROWS * CELL }

const START_STEP_MS = 150
const MIN_STEP_MS = 70

interface Pt {
  x: number
  y: number
}

const DIRS: Record<string, Pt> = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
}

export const createSnake = (canvas: HTMLCanvasElement, ctx: MinigameContext): MinigameInstance => {
  const g = canvas.getContext('2d')!
  let snake: Pt[] = []
  let dir: Pt = { x: 1, y: 0 }
  /** 输入队列：一步只消费一个转向，避免一拍内连按两键直接掉头自杀 */
  let pendingDirs: Pt[] = []
  let food: Pt = { x: 0, y: 0 }
  let score = 0
  let stepMs = START_STEP_MS
  let over = false
  let timer = 0

  const placeFood = () => {
    do {
      food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
    } while (snake.some(s => s.x === food.x && s.y === food.y))
  }

  const reset = () => {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ]
    dir = { x: 1, y: 0 }
    pendingDirs = []
    score = 0
    stepMs = START_STEP_MS
    over = false
    ctx.setScore(0)
    placeFood()
    schedule()
    draw()
  }

  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(tick, stepMs)
  }

  const tick = () => {
    if (over) return
    const next = pendingDirs.shift()
    if (next && !(next.x === -dir.x && next.y === -dir.y)) dir = next
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }
    const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS
    const eat = !hitWall && head.x === food.x && head.y === food.y
    const body = eat ? snake : snake.slice(0, -1)
    if (hitWall || body.some(s => s.x === head.x && s.y === head.y)) {
      over = true
      draw()
      return
    }
    snake = [head, ...body]
    if (eat) {
      score += 10
      ctx.setScore(score)
      stepMs = Math.max(MIN_STEP_MS, stepMs - 3)
      placeFood()
    }
    draw()
    schedule()
  }

  const draw = () => {
    g.fillStyle = '#141820'
    g.fillRect(0, 0, canvas.width, canvas.height)
    // 棋盘格底纹
    g.fillStyle = '#1a202c'
    for (let y = 0; y < ROWS; y++) {
      for (let x = y % 2; x < COLS; x += 2) g.fillRect(x * CELL, y * CELL, CELL, CELL)
    }
    // 果子（红果 + 绿蒂）
    g.fillStyle = '#e85c4a'
    g.fillRect(food.x * CELL + 3, food.y * CELL + 4, CELL - 6, CELL - 6)
    g.fillStyle = '#6a9440'
    g.fillRect(food.x * CELL + CELL / 2 - 1, food.y * CELL + 1, 2, 4)
    // 蛇（头亮身暗，双色相间）
    snake.forEach((s, i) => {
      g.fillStyle = i === 0 ? '#a4f08e' : i % 2 ? '#5cb45c' : '#4da052'
      g.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2)
    })
    if (over) {
      g.fillStyle = 'rgba(10, 12, 18, 0.72)'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.textAlign = 'center'
      g.fillStyle = '#f0c060'
      g.font = 'bold 22px ui-monospace, Consolas, monospace'
      g.fillText('游戏结束', canvas.width / 2, canvas.height / 2 - 18)
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
      if (pendingDirs.length < 3) pendingDirs.push(d)
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
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    },
  }
}
