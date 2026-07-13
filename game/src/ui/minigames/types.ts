/**
 * 小游戏模块公共契约：每个游戏只依赖一块 canvas 与分数上报回调；
 * 弹窗外壳（index.ts）负责打开/关闭、重开、最高分持久化与操作说明。
 */

export interface MinigameContext {
  /** 上报当前局分数（外壳实时显示并维护最高分） */
  setScore(score: number): void
}

export interface MinigameInstance {
  /** 关闭弹窗 / 重开一局时调用：清理计时器与键盘监听 */
  destroy(): void
}

export type MinigameFactory = (canvas: HTMLCanvasElement, ctx: MinigameContext) => MinigameInstance

export interface MinigameDef {
  id: string
  title: string
  /** 操作说明（弹窗底部一行 + 建筑 tooltip） */
  hint: string
  canvasW: number
  canvasH: number
  create: MinigameFactory
}
