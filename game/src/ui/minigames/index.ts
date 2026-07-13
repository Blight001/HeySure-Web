/**
 * 小游戏弹窗外壳：点击世界里的小游戏建筑打开。
 * 负责：游戏注册表、弹窗 DOM/样式、得分与最高分（localStorage）、重开/关闭。
 * 游戏本体只依赖 canvas + setScore 回调（见 ./types.ts）。
 */
import type { MinigameId } from '../../world/layout'
import type { MinigameDef, MinigameInstance } from './types'
import { SNAKE_SIZE, createSnake } from './snake'
import { G2048_SIZE, createGame2048 } from './game2048'
import { TETRIS_SIZE, createTetris } from './tetris'

export const MINIGAME_DEFS: Record<MinigameId, MinigameDef> = {
  snake: {
    id: 'snake',
    title: '贪吃蛇',
    hint: '方向键 / WASD 转向 · 吃果子得分加速 · 空格重开',
    canvasW: SNAKE_SIZE.w,
    canvasH: SNAKE_SIZE.h,
    create: createSnake,
  },
  g2048: {
    id: 'g2048',
    title: '2048',
    hint: '方向键 / WASD 滑动合并同数字 · 拼出 2048 · 空格重开',
    canvasW: G2048_SIZE.w,
    canvasH: G2048_SIZE.h,
    create: createGame2048,
  },
  tetris: {
    id: 'tetris',
    title: '俄罗斯方块',
    hint: '← → 移动 · ↑ 旋转 · ↓ 软降 · 空格硬降 · 回车重开',
    canvasW: TETRIS_SIZE.w,
    canvasH: TETRIS_SIZE.h,
    create: createTetris,
  },
}

const bestKey = (id: MinigameId) => `gw-minigame-best:${id}`

export const minigameBestScore = (id: MinigameId): number => {
  try {
    return Number(localStorage.getItem(bestKey(id))) || 0
  } catch {
    return 0
  }
}

const saveBestScore = (id: MinigameId, score: number) => {
  try {
    localStorage.setItem(bestKey(id), String(score))
  } catch {
    /* 隐私模式等场景下静默失败 */
  }
}

let stylesInjected = false
const ensureStyles = () => {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .gw-arcade-backdrop {
      position: fixed; inset: 0; z-index: 500000;
      background: rgba(10, 12, 18, 0.72);
      display: flex; align-items: center; justify-content: center;
    }
    .gw-arcade-panel {
      background: rgba(28, 30, 38, 0.97); border: 2px solid #4a4f5e; border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      color: #d6dae2; font: 13px/1.6 ui-monospace, "Cascadia Mono", Consolas, monospace;
      padding: 12px 14px 10px;
    }
    .gw-arcade-head {
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
    }
    .gw-arcade-title { color: #f0c060; font-weight: bold; font-size: 15px; }
    .gw-arcade-score { color: #8a90a0; flex: 1; text-align: right; }
    .gw-arcade-score b { color: #d6dae2; }
    .gw-arcade-btn {
      background: #2a3040; border: 2px solid #4a4f5e; border-radius: 4px;
      color: #d6dae2; font: 12px ui-monospace, "Cascadia Mono", Consolas, monospace;
      padding: 2px 8px; cursor: pointer;
    }
    .gw-arcade-btn:hover { border-color: #f0c060; color: #f0c060; }
    .gw-arcade-canvas {
      display: block; background: #141820;
      border: 2px solid #3a3f4c; border-radius: 4px;
    }
    .gw-arcade-hint { color: #8a90a0; font-size: 11px; margin-top: 8px; text-align: center; }
  `
  document.head.appendChild(style)
}

export class MinigameModal {
  private backdrop: HTMLDivElement | null = null
  private instance: MinigameInstance | null = null
  private currentId: MinigameId | null = null
  private onCloseCb: (() => void) | null = null
  private scoreEl: HTMLElement | null = null
  private bestEl: HTMLElement | null = null
  private best = 0
  private escHandler: ((e: KeyboardEvent) => void) | null = null

  get isOpen(): boolean {
    return this.backdrop !== null
  }

  open(id: MinigameId, onClose?: () => void) {
    if (this.isOpen) this.close()
    ensureStyles()
    const def = MINIGAME_DEFS[id]
    this.currentId = id
    this.onCloseCb = onClose ?? null
    this.best = minigameBestScore(id)

    const backdrop = document.createElement('div')
    backdrop.className = 'gw-arcade-backdrop'
    backdrop.addEventListener('pointerdown', e => {
      if (e.target === backdrop) this.close()
    })

    const panel = document.createElement('div')
    panel.className = 'gw-arcade-panel'

    const head = document.createElement('div')
    head.className = 'gw-arcade-head'
    const title = document.createElement('span')
    title.className = 'gw-arcade-title'
    title.textContent = `🕹 ${def.title}`
    const scoreWrap = document.createElement('span')
    scoreWrap.className = 'gw-arcade-score'
    scoreWrap.innerHTML = '得分 <b class="s">0</b> · 最高 <b class="b">0</b>'
    this.scoreEl = scoreWrap.querySelector('.s')
    this.bestEl = scoreWrap.querySelector('.b')
    if (this.bestEl) this.bestEl.textContent = String(this.best)

    const restartBtn = document.createElement('button')
    restartBtn.type = 'button'
    restartBtn.className = 'gw-arcade-btn'
    restartBtn.textContent = '↻ 重开'
    restartBtn.addEventListener('click', () => this.restart())

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'gw-arcade-btn'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', () => this.close())

    head.append(title, scoreWrap, restartBtn, closeBtn)

    const canvas = document.createElement('canvas')
    canvas.className = 'gw-arcade-canvas'
    canvas.width = def.canvasW
    canvas.height = def.canvasH

    const hint = document.createElement('div')
    hint.className = 'gw-arcade-hint'
    hint.textContent = `${def.hint} · Esc 关闭`

    panel.append(head, canvas, hint)
    backdrop.appendChild(panel)
    document.body.appendChild(backdrop)
    this.backdrop = backdrop

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    }
    window.addEventListener('keydown', this.escHandler, true)

    this.instance = def.create(canvas, { setScore: s => this.setScore(s) })
  }

  private setScore(score: number) {
    if (this.scoreEl) this.scoreEl.textContent = String(score)
    if (score > this.best && this.currentId) {
      this.best = score
      saveBestScore(this.currentId, score)
      if (this.bestEl) this.bestEl.textContent = String(score)
    }
  }

  private restart() {
    if (!this.backdrop || !this.currentId) return
    const def = MINIGAME_DEFS[this.currentId]
    this.instance?.destroy()
    const canvas = this.backdrop.querySelector('canvas')!
    this.instance = def.create(canvas, { setScore: s => this.setScore(s) })
  }

  close() {
    if (!this.backdrop) return
    this.instance?.destroy()
    this.instance = null
    if (this.escHandler) {
      window.removeEventListener('keydown', this.escHandler, true)
      this.escHandler = null
    }
    this.backdrop.remove()
    this.backdrop = null
    this.currentId = null
    this.scoreEl = null
    this.bestEl = null
    const cb = this.onCloseCb
    this.onCloseCb = null
    cb?.()
  }
}
