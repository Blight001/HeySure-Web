/**
 * DOM 覆盖层：悬浮 tooltip + 右下角 HUD。
 * P0 只读；P1 的设置抽屉 / 操作菜单也挂在这一层（Vue 化）。
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface TooltipRow {
  label: string
  value: string
}

export interface TooltipData {
  title: string
  badge?: string
  rows: TooltipRow[]
  /** 0..1，显示 token 进度条 */
  tokenRatio?: number
  tokenText?: string
}

export class Overlay {
  private tooltip: HTMLDivElement
  private hud: HTMLDivElement
  private govBtn: HTMLButtonElement | null = null
  private govHint: HTMLDivElement | null = null
  private loadingHintEl: HTMLDivElement | null = null
  private bgmBtn: HTMLButtonElement | null = null
  private sfxBtn: HTMLButtonElement | null = null
  private bgmMuted = false
  private sfxMuted = false
  private soundOnChange: ((state: { bgmMuted: boolean; sfxMuted: boolean }) => void) | null = null
  private readonly govHintDefault = 'WASD 移动辅助管理员 · 走到 AI 旁按 <b>F</b> 交互 · 再次点击退出'
  private readonly govHintTouch = '左侧摇杆移动 · 右侧按钮交互 · 再次点击退出操控'
  /** 手机端虚拟摇杆（操控辅助管理员时显示） */
  private padRoot: HTMLDivElement | null = null
  private padKnob: HTMLDivElement | null = null
  private padInteractBtn: HTMLButtonElement | null = null
  private padDx = 0
  private padDy = 0
  private padPointerId: number | null = null
  private padOnInteract: (() => void) | null = null
  private touchUi = false

  constructor(parent: HTMLElement) {
    const style = document.createElement('style')
    style.textContent = `
      .gw-tooltip {
        position: fixed; z-index: 40; pointer-events: none; display: none;
        min-width: 180px; max-width: 280px;
        background: rgba(28, 30, 38, 0.95); border: 2px solid #4a4f5e; border-radius: 4px;
        color: #d6dae2; font: 12px/1.6 ui-monospace, "Cascadia Mono", Consolas, monospace;
        padding: 8px 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.5);
        image-rendering: pixelated;
      }
      .gw-tooltip .t-title { color: #f0c060; font-weight: bold; margin-bottom: 2px; }
      .gw-tooltip .t-badge {
        display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px;
        background: #3a4156; color: #9fc6ff; font-size: 10px; vertical-align: 1px;
      }
      .gw-tooltip .t-row { display: flex; gap: 8px; }
      .gw-tooltip .t-row .k { color: #8a90a0; flex: none; }
      .gw-tooltip .t-row .v { word-break: break-all; }
      .gw-tooltip .t-bar { height: 6px; background: #3a3f4c; border-radius: 3px; margin: 4px 0 2px; overflow: hidden; }
      .gw-tooltip .t-bar > div { height: 100%; }
      .gw-hud {
        position: fixed; right: 12px; bottom: 12px; z-index: 30;
        background: rgba(28, 30, 38, 0.88); border: 2px solid #4a4f5e; border-radius: 4px;
        color: #d6dae2; font: 12px/1.7 ui-monospace, "Cascadia Mono", Consolas, monospace;
        padding: 8px 12px; max-width: 320px; text-align: right;
        transition: border-color 0.6s, color 0.6s;
      }
      .gw-hud .h-dim { color: #8a90a0; }
      .gw-hud .h-err { color: #e08484; }
      .gw-sound-controls {
        position: fixed; left: 12px; bottom: 12px; z-index: 30; cursor: pointer;
        display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
      }
      .gw-sound {
        background: rgba(28, 30, 38, 0.88); border: 2px solid #4a4f5e; border-radius: 4px;
        color: #d6dae2; font: 12px ui-monospace, "Cascadia Mono", Consolas, monospace;
        padding: 5px 10px;
        cursor: pointer;
      }
      .gw-sound:hover { border-color: #5a6175; }
      .gw-gov {
        position: fixed; left: 12px; bottom: 54px; z-index: 30; cursor: pointer;
        background: rgba(28, 30, 38, 0.88); border: 2px solid #4a4f5e; border-radius: 4px;
        color: #d6dae2; font: 12px ui-monospace, "Cascadia Mono", Consolas, monospace;
        padding: 5px 10px;
      }
      .gw-gov:hover { border-color: #5a6175; }
      .gw-gov.active { border-color: #f0c060; color: #f0c060; }
      .gw-gov-hint {
        position: fixed; left: 12px; bottom: 90px; z-index: 30; display: none;
        background: rgba(28, 30, 38, 0.88); border: 2px solid #f0c060; border-radius: 4px;
        color: #f0e0b0; font: 11px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace;
        padding: 5px 10px; max-width: 220px;
      }
      .gw-gov-hint.show { display: block; }
      /* G 键常驻小提示（始终显示，操控激活时隐藏） */
      .gw-gov-idle-tip {
        position: fixed; left: 12px; bottom: 90px; z-index: 30;
        color: #6a7080; font: 10px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace;
        pointer-events: none; transition: opacity 0.3s;
      }
      .gw-gov-idle-tip.hidden { opacity: 0; }
      /* —— 手机虚拟摇杆（辅助管理员操控）—— */
      .gw-vpad {
        position: fixed; inset: 0; z-index: 35; pointer-events: none;
        display: none;
      }
      .gw-vpad.show { display: block; }
      .gw-vpad-stick {
        position: absolute; left: max(16px, env(safe-area-inset-left));
        bottom: max(28px, env(safe-area-inset-bottom));
        width: 128px; height: 128px; pointer-events: auto;
        touch-action: none; user-select: none; -webkit-user-select: none;
      }
      .gw-vpad-base {
        position: absolute; inset: 0; border-radius: 50%;
        background: rgba(28, 30, 38, 0.45); border: 2px solid rgba(240, 192, 96, 0.45);
        box-shadow: inset 0 0 18px rgba(0,0,0,0.35);
      }
      .gw-vpad-knob {
        position: absolute; left: 50%; top: 50%; width: 52px; height: 52px;
        margin: -26px 0 0 -26px; border-radius: 50%;
        background: rgba(240, 192, 96, 0.88); border: 2px solid #fff3c4;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        transition: background 0.1s;
      }
      .gw-vpad-knob.active { background: rgba(255, 214, 120, 0.95); }
      .gw-vpad-actions {
        position: absolute; right: max(18px, env(safe-area-inset-right));
        bottom: max(36px, env(safe-area-inset-bottom));
        display: flex; flex-direction: column; gap: 12px; align-items: center;
        pointer-events: auto;
      }
      .gw-vpad-btn {
        width: 72px; height: 72px; border-radius: 50%;
        background: rgba(28, 30, 38, 0.72); border: 2px solid #4a4f5e;
        color: #d6dae2; font: 600 13px/1.2 ui-monospace, "Cascadia Mono", Consolas, "Microsoft YaHei", sans-serif;
        box-shadow: 0 3px 12px rgba(0,0,0,0.35);
        touch-action: manipulation; user-select: none; -webkit-user-select: none;
        display: flex; align-items: center; justify-content: center; text-align: center;
        padding: 6px;
      }
      .gw-vpad-btn:active { transform: scale(0.94); }
      .gw-vpad-btn.ready {
        border-color: #f0c060; color: #f0e0b0;
        background: rgba(60, 48, 20, 0.82);
        box-shadow: 0 0 0 2px rgba(240, 192, 96, 0.25), 0 3px 12px rgba(0,0,0,0.35);
      }
      /* 触屏：上移操控按钮，避免与摇杆重叠；收窄常驻提示 */
      @media (pointer: coarse), (max-width: 820px) {
        .gw-gov { bottom: max(168px, calc(env(safe-area-inset-bottom) + 148px)); }
        .gw-gov-hint { bottom: max(204px, calc(env(safe-area-inset-bottom) + 184px)); max-width: min(260px, 70vw); }
        .gw-gov-idle-tip { bottom: max(204px, calc(env(safe-area-inset-bottom) + 184px)); max-width: min(240px, 68vw); }
        .gw-sound-controls { left: auto; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); }
      }
      /* 加载提示 */
      .gw-loading-hint {
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        z-index: 450000;
        color: #b0b8c8; font: 13px/1 ui-monospace, "Cascadia Mono", Consolas, monospace;
        pointer-events: none; letter-spacing: 0.06em;
        opacity: 1; transition: opacity 0.8s;
      }
      .gw-loading-hint.fade { opacity: 0; }
      /* 边缘暗角 */
      .gw-vignette {
        position: fixed; inset: 0; z-index: 19; pointer-events: none;
        background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.32) 100%);
      }
    `
    document.head.appendChild(style)

    // 边缘暗角（始终可见，增加地图边界感）
    const vignette = document.createElement('div')
    vignette.className = 'gw-vignette'
    parent.appendChild(vignette)

    this.tooltip = document.createElement('div')
    this.tooltip.className = 'gw-tooltip'
    parent.appendChild(this.tooltip)

    this.hud = document.createElement('div')
    this.hud.className = 'gw-hud'
    parent.appendChild(this.hud)
  }

  showTooltip(data: TooltipData, clientX: number, clientY: number) {
    let html = `<div class="t-title">${esc(data.title)}${data.badge ? `<span class="t-badge">${esc(data.badge)}</span>` : ''}</div>`
    if (data.tokenRatio !== undefined) {
      const pct = Math.min(1, Math.max(0, data.tokenRatio))
      const color = pct >= 0.95 ? '#e05a5a' : pct >= 0.8 ? '#e0a23c' : '#5aa9e0'
      html += `<div class="t-bar"><div style="width:${(pct * 100).toFixed(0)}%;background:${color}"></div></div>`
      if (data.tokenText) html += `<div class="t-row"><span class="k">token</span><span class="v">${esc(data.tokenText)}</span></div>`
    }
    for (const row of data.rows) {
      if (!row.value) continue
      html += `<div class="t-row"><span class="k">${esc(row.label)}</span><span class="v">${esc(row.value)}</span></div>`
    }
    this.tooltip.innerHTML = html
    this.tooltip.style.display = 'block'
    this.moveTooltip(clientX, clientY)
  }

  moveTooltip(clientX: number, clientY: number) {
    if (this.tooltip.style.display === 'none') return
    const pad = 14
    const rect = this.tooltip.getBoundingClientRect()
    let x = clientX + pad
    let y = clientY + pad
    if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad
    if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad
    this.tooltip.style.left = `${Math.max(4, x)}px`
    this.tooltip.style.top = `${Math.max(4, y)}px`
  }

  hideTooltip() {
    this.tooltip.style.display = 'none'
  }

  setHud(html: string) {
    this.hud.innerHTML = html
  }

  /** 夜间对比度自适应：nightness 越大，HUD 边框/文字越亮 */
  setNightness(nightness: number) {
    if (nightness > 0.4) {
      const brightness = 1 + nightness * 0.35
      this.hud.style.filter = `brightness(${brightness.toFixed(2)})`
      this.hud.style.borderColor = nightness > 0.6 ? '#6a7090' : '#4a4f5e'
    } else {
      this.hud.style.filter = ''
      this.hud.style.borderColor = ''
    }
  }

  /** 云层揭幕等待期显示"正在连接世界..."提示 */
  showLoadingHint() {
    if (this.loadingHintEl) return
    const el = document.createElement('div')
    el.className = 'gw-loading-hint'
    el.textContent = '正在连接世界...'
    document.body.appendChild(el)
    this.loadingHintEl = el
  }

  /** 揭幕后淡出并移除加载提示 */
  hideLoadingHint() {
    if (!this.loadingHintEl) return
    const el = this.loadingHintEl
    this.loadingHintEl = null
    el.classList.add('fade')
    window.setTimeout(() => el.remove(), 900)
  }

  /** 左下角声音分类开关（背景音乐 / 音效） */
  initSoundButtons(
    parent: HTMLElement,
    initial: { bgmMuted: boolean; sfxMuted: boolean },
    onChange: (state: { bgmMuted: boolean; sfxMuted: boolean }) => void,
  ) {
    const wrap = document.createElement('div')
    wrap.className = 'gw-sound-controls'
    this.bgmMuted = initial.bgmMuted
    this.sfxMuted = initial.sfxMuted
    this.soundOnChange = onChange

    const bgmBtn = document.createElement('button')
    bgmBtn.type = 'button'
    bgmBtn.className = 'gw-sound'
    this.bgmBtn = bgmBtn
    const sfxBtn = document.createElement('button')
    sfxBtn.type = 'button'
    sfxBtn.className = 'gw-sound'
    this.sfxBtn = sfxBtn

    const render = () => {
      bgmBtn.textContent = this.bgmMuted ? '🔇 背景声关' : '🎵 背景声开'
      sfxBtn.textContent = this.sfxMuted ? '🔕 音效关' : '🔔 音效开'
    }
    const emit = () => onChange({ bgmMuted: this.bgmMuted, sfxMuted: this.sfxMuted })

    bgmBtn.onclick = () => {
      this.bgmMuted = !this.bgmMuted
      render()
      emit()
    }
    sfxBtn.onclick = () => {
      this.sfxMuted = !this.sfxMuted
      render()
      emit()
    }

    render()
    wrap.appendChild(bgmBtn)
    wrap.appendChild(sfxBtn)
    parent.appendChild(wrap)
  }

  /** M 键：同时切换背景声和音效（全静音/全开） */
  toggleMasterMute() {
    if (!this.bgmBtn || !this.sfxBtn || !this.soundOnChange) return
    const newMuted = !(this.bgmMuted && this.sfxMuted)
    this.bgmMuted = newMuted
    this.sfxMuted = newMuted
    this.bgmBtn.textContent = this.bgmMuted ? '🔇 背景声关' : '🎵 背景声开'
    this.sfxBtn.textContent = this.sfxMuted ? '🔕 音效关' : '🔔 音效开'
    this.soundOnChange({ bgmMuted: this.bgmMuted, sfxMuted: this.sfxMuted })
  }

  /** 是否按触屏 UI 展示（粗指针或窄屏） */
  isTouchUi(): boolean {
    return this.touchUi
  }

  private detectTouchUi(): boolean {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return true
      if (window.matchMedia('(max-width: 820px)').matches) return true
    } catch { /* ignore */ }
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }

  private currentGovHintHtml(): string {
    return this.touchUi ? this.govHintTouch : this.govHintDefault
  }

  /** 辅助管理员操控开关 + 操作提示（左下角） */
  initGovernorButton(parent: HTMLElement, initialActive: boolean, onChange: (active: boolean) => void) {
    this.touchUi = this.detectTouchUi()
    // G 键常驻提示（未进入操控模式时显示）
    const idleTip = document.createElement('div')
    idleTip.className = 'gw-gov-idle-tip'
    idleTip.textContent = this.touchUi
      ? '点「操控辅助管理员」进入 · 摇杆移动'
      : '按 G 可操控辅助管理员 · M 键静音'
    parent.appendChild(idleTip)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'gw-gov'
    this.govBtn = btn
    const hint = document.createElement('div')
    hint.className = 'gw-gov-hint'
    hint.innerHTML = this.currentGovHintHtml()
    this.govHint = hint
    this.setGovernorActive(initialActive, idleTip)
    btn.onclick = () => onChange(!btn.classList.contains('active'))
    parent.appendChild(btn)
    parent.appendChild(hint)
  }

  /**
   * 手机端虚拟手柄：左摇杆移动、右「交互」按钮（等价 F 键）。
   * 仅在操控模式 + 触屏 UI 时显示。
   */
  initVirtualPad(parent: HTMLElement, onInteract: () => void) {
    this.touchUi = this.detectTouchUi()
    this.padOnInteract = onInteract
    if (this.padRoot) return

    const root = document.createElement('div')
    root.className = 'gw-vpad'
    root.setAttribute('aria-hidden', 'true')

    const stick = document.createElement('div')
    stick.className = 'gw-vpad-stick'
    const base = document.createElement('div')
    base.className = 'gw-vpad-base'
    const knob = document.createElement('div')
    knob.className = 'gw-vpad-knob'
    stick.appendChild(base)
    stick.appendChild(knob)

    const actions = document.createElement('div')
    actions.className = 'gw-vpad-actions'
    const interact = document.createElement('button')
    interact.type = 'button'
    interact.className = 'gw-vpad-btn'
    interact.textContent = '交互'
    interact.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.padOnInteract?.()
    })
    actions.appendChild(interact)

    const radius = 40 // 摇杆有效半径（px）
    const setKnob = (nx: number, ny: number) => {
      knob.style.transform = `translate(${nx * radius}px, ${ny * radius}px)`
      knob.classList.toggle('active', nx !== 0 || ny !== 0)
    }
    const resetPad = () => {
      this.padDx = 0
      this.padDy = 0
      this.padPointerId = null
      setKnob(0, 0)
    }
    const updateFromEvent = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const dist = Math.hypot(dx, dy) || 1
      const clamped = Math.min(dist, radius)
      dx = (dx / dist) * clamped
      dy = (dy / dist) * clamped
      const nx = dx / radius
      const ny = dy / radius
      // 死区，避免微抖
      const dead = 0.18
      this.padDx = Math.abs(nx) < dead ? 0 : nx
      this.padDy = Math.abs(ny) < dead ? 0 : ny
      setKnob(nx, ny)
    }

    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      stick.setPointerCapture(e.pointerId)
      this.padPointerId = e.pointerId
      updateFromEvent(e)
    })
    stick.addEventListener('pointermove', (e) => {
      if (this.padPointerId !== e.pointerId) return
      e.preventDefault()
      updateFromEvent(e)
    })
    const end = (e: PointerEvent) => {
      if (this.padPointerId !== null && this.padPointerId !== e.pointerId) return
      e.preventDefault()
      resetPad()
    }
    stick.addEventListener('pointerup', end)
    stick.addEventListener('pointercancel', end)
    stick.addEventListener('lostpointercapture', () => resetPad())

    root.appendChild(stick)
    root.appendChild(actions)
    parent.appendChild(root)
    this.padRoot = root
    this.padKnob = knob
    this.padInteractBtn = interact
    this.syncVirtualPadVisibility()
  }

  getPadDirection(): { dx: number; dy: number } {
    return { dx: this.padDx, dy: this.padDy }
  }

  /** 附近有可交互目标时高亮「交互」按钮 */
  setPadInteractReady(ready: boolean) {
    this.padInteractBtn?.classList.toggle('ready', ready)
  }

  private syncVirtualPadVisibility() {
    if (!this.padRoot) return
    const active = this.govBtn?.classList.contains('active') ?? false
    const show = active && this.touchUi
    this.padRoot.classList.toggle('show', show)
    this.padRoot.setAttribute('aria-hidden', show ? 'false' : 'true')
    if (!show) {
      this.padDx = 0
      this.padDy = 0
      if (this.padKnob) {
        this.padKnob.style.transform = 'translate(0, 0)'
        this.padKnob.classList.remove('active')
      }
      this.padInteractBtn?.classList.remove('ready')
    }
  }

  setGovernorActive(active: boolean, idleTip?: HTMLElement) {
    if (this.govBtn) {
      this.govBtn.classList.toggle('active', active)
      this.govBtn.textContent = active ? '🚪 退出操控' : '🎮 操控辅助管理员'
    }
    if (this.govHint) {
      this.govHint.innerHTML = this.currentGovHintHtml()
      // 触屏用手柄，操控时默认不挡画面；桌面仍显示键位提示
      this.govHint.classList.toggle('show', active && !this.touchUi)
    }
    // 操控激活时隐藏常驻提示，退出时恢复
    const tip = idleTip ?? (document.querySelector('.gw-gov-idle-tip') as HTMLElement | null)
    if (tip) tip.classList.toggle('hidden', active)
    this.syncVirtualPadVisibility()
  }

  /** 临时提示（如"无辅助管理员可操控"），2.5s 后恢复默认 */
  flashGovernorHint(text: string) {
    if (!this.govHint) return
    this.govHint.textContent = text
    this.govHint.classList.add('show')
    window.setTimeout(() => {
      if (!this.govHint) return
      this.govHint.innerHTML = this.currentGovHintHtml()
      const active = this.govBtn?.classList.contains('active') ?? false
      this.govHint.classList.toggle('show', active && !this.touchUi)
    }, 2500)
  }
}
