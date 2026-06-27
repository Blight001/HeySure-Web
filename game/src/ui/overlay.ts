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

  /** 辅助管理员操控开关 + 操作提示（左下角） */
  initGovernorButton(parent: HTMLElement, initialActive: boolean, onChange: (active: boolean) => void) {
    // G 键常驻提示（未进入操控模式时显示）
    const idleTip = document.createElement('div')
    idleTip.className = 'gw-gov-idle-tip'
    idleTip.textContent = '按 G 可操控辅助管理员 · M 键静音'
    parent.appendChild(idleTip)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'gw-gov'
    this.govBtn = btn
    const hint = document.createElement('div')
    hint.className = 'gw-gov-hint'
    hint.innerHTML = this.govHintDefault
    this.govHint = hint
    this.setGovernorActive(initialActive, idleTip)
    btn.onclick = () => onChange(!btn.classList.contains('active'))
    parent.appendChild(btn)
    parent.appendChild(hint)
  }

  setGovernorActive(active: boolean, idleTip?: HTMLElement) {
    if (this.govBtn) {
      this.govBtn.classList.toggle('active', active)
      this.govBtn.textContent = active ? '🚪 退出操控' : '🎮 操控辅助管理员'
    }
    if (this.govHint) {
      this.govHint.innerHTML = this.govHintDefault
      this.govHint.classList.toggle('show', active)
    }
    // 操控激活时隐藏常驻提示，退出时恢复
    const tip = idleTip ?? (document.querySelector('.gw-gov-idle-tip') as HTMLElement | null)
    if (tip) tip.classList.toggle('hidden', active)
  }

  /** 临时提示（如"无辅助管理员可操控"），2.5s 后恢复默认 */
  flashGovernorHint(text: string) {
    if (!this.govHint) return
    this.govHint.textContent = text
    this.govHint.classList.add('show')
    window.setTimeout(() => {
      if (!this.govHint) return
      this.govHint.innerHTML = this.govHintDefault
      this.govHint.classList.toggle('show', this.govBtn?.classList.contains('active') ?? false)
    }, 2500)
  }
}
