/**
 * 游戏内自封装确认弹窗：替代浏览器原生 window.confirm，统一像素风格。
 * 返回 Promise<boolean>，确认 resolve(true)、取消/关闭 resolve(false)。
 * 框架无关，自挂 DOM、自注入样式，同一时刻只允许一个弹窗。
 */

const STYLE_ID = 'gw-confirm-styles'

const CONFIRM_CSS = `
  .gw-confirm-mask {
    position: fixed; inset: 0; z-index: 500; pointer-events: auto;
    background: rgba(8, 9, 13, 0.55); backdrop-filter: blur(1px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.12s ease-out;
  }
  .gw-confirm-mask.show { opacity: 1; }
  .gw-confirm {
    min-width: 280px; max-width: min(420px, 86vw);
    background: rgba(28, 30, 38, 0.98); border: 2px solid #4a4f5e; border-radius: 6px;
    color: #d6dae2; font: 13px/1.7 ui-monospace, "Cascadia Mono", Consolas, monospace;
    box-shadow: 0 10px 30px rgba(0,0,0,0.55); padding: 14px 16px 12px;
    image-rendering: pixelated;
    transform: translateY(6px) scale(0.98); transition: transform 0.12s ease-out;
  }
  .gw-confirm-mask.show .gw-confirm { transform: none; }
  .gw-confirm .c-title { color: #f0c060; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
  .gw-confirm .c-msg { color: #cdd3dd; white-space: pre-wrap; word-break: break-word; margin-bottom: 14px; }
  .gw-confirm .c-msg .c-em { color: #9fc6ff; }
  .gw-confirm .c-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .gw-confirm button.c-btn {
    cursor: pointer; border: 1px solid #4a4f5e; border-radius: 3px;
    background: #2b2f3a; color: #9aa0b0; font: inherit; font-size: 13px; padding: 4px 14px;
  }
  .gw-confirm button.c-btn:hover { background: #343949; color: #d6dae2; }
  .gw-confirm button.c-btn.ok { border-color: #4a7a55; background: #2c3b32; color: #9fdcae; }
  .gw-confirm button.c-btn.ok:hover { background: #36533f; color: #b6ecc4; }
  .gw-confirm button.c-btn.warn { border-color: #7a4a4a; background: #3b2c2c; color: #e0a0a0; }
  .gw-confirm button.c-btn.warn:hover { background: #533636; color: #f0b6b6; }
`

const installStyles = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CONFIRM_CSS
  document.head.appendChild(style)
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 'default' 绿色确认；'warn' 红色确认（解绑等破坏性操作） */
  tone?: 'default' | 'warn'
}

let activeClose: (() => void) | null = null

export const gameConfirm = (opts: ConfirmOptions): Promise<boolean> => {
  installStyles()
  // 同一时刻只保留一个弹窗：新弹窗出现时把旧的当作取消关掉。
  activeClose?.()

  return new Promise<boolean>(resolve => {
    const mask = document.createElement('div')
    mask.className = 'gw-confirm-mask'

    const box = document.createElement('div')
    box.className = 'gw-confirm'
    const confirmText = opts.confirmText ?? '确认'
    const cancelText = opts.cancelText ?? '取消'
    const okClass = opts.tone === 'warn' ? 'warn' : 'ok'
    box.innerHTML = `
      ${opts.title ? `<div class="c-title">${esc(opts.title)}</div>` : ''}
      <div class="c-msg">${esc(opts.message)}</div>
      <div class="c-actions">
        <button type="button" class="c-btn c-cancel">${esc(cancelText)}</button>
        <button type="button" class="c-btn ${okClass} c-ok">${esc(confirmText)}</button>
      </div>
    `
    mask.appendChild(box)
    document.body.appendChild(mask)
    requestAnimationFrame(() => mask.classList.add('show'))

    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      if (activeClose === close) activeClose = null
      document.removeEventListener('keydown', onKey, true)
      mask.classList.remove('show')
      window.setTimeout(() => mask.remove(), 140)
      resolve(result)
    }
    const close = () => finish(false)
    activeClose = close

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        finish(true)
      }
    }
    // capture 阶段拦截，避免 Phaser 画布同时响应回车/Esc。
    document.addEventListener('keydown', onKey, true)

    mask.addEventListener('pointerdown', e => {
      if (e.target === mask) finish(false)
    })
    box.querySelector<HTMLButtonElement>('.c-cancel')!.onclick = () => finish(false)
    const okBtn = box.querySelector<HTMLButtonElement>('.c-ok')!
    okBtn.onclick = () => finish(true)
    okBtn.focus()
  })
}
