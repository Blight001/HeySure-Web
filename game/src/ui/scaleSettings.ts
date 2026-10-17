import {
  exportVisualScaleOverrides,
  getVisualScaleOverrides,
  onVisualScaleChange,
  resetVisualScaleOverrides,
  setVisualScaleOverride,
  type VisualScaleGroup,
  visualScaleRange,
  VISUAL_SCALE_GROUPS,
} from '../world/visualScaleRuntime'
import {
  exportVisualPositionOverrides,
  getVisualPositionOverrides,
  isVisualPositionEditMode,
  onVisualPositionChange,
  onVisualPositionEditModeChange,
  resetVisualPositionOverrides,
  setVisualPositionEditMode,
} from '../world/visualPositionRuntime'

const GROUP_LABELS: Record<VisualScaleGroup, string> = {
  tree: '树木',
  bush: '灌木 / 草丛',
  character: '角色',
  building: '建筑',
  prop: '独立素材',
  effect: '特效 / 光晕',
  atmosphere: '环境素材',
}

const numberText = (value: number) => `×${value.toFixed(2)}`

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

export interface ScaleSettingsOptions {
  parent: HTMLElement
  onPreview: () => void
}

/** 社会显示内的轻量调试面板：调节的是相对倍率，不会改写源码。 */
export class ScaleSettingsPanel {
  private readonly root: HTMLElement
  private readonly body: HTMLDivElement
  private readonly status: HTMLDivElement
  private readonly values = new Map<VisualScaleGroup, HTMLSpanElement>()
  private readonly inputs = new Map<VisualScaleGroup, HTMLInputElement>()
  private readonly unsubscribe: () => boolean
  private readonly unsubscribePosition: () => boolean
  private readonly unsubscribePositionMode: () => boolean
  private positionModeButton: HTMLButtonElement | null = null
  private previewTimer: number | null = null
  private open = false

  constructor(options: ScaleSettingsOptions) {
    this.injectStyle()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gw-scale-button'
    button.textContent = '⚙ 素材设置'
    button.title = '拖动调整社会显示素材比例'
    button.onclick = () => this.toggle()
    options.parent.appendChild(button)

    this.root = document.createElement('section')
    this.root.className = 'gw-scale-panel'
    this.root.hidden = true
    this.root.setAttribute('aria-label', '素材比例设置')
    this.root.appendChild(this.createHeader())
    this.body = document.createElement('div')
    this.body.className = 'gw-scale-body'
    this.root.appendChild(this.body)
    this.createRows()
    this.status = document.createElement('div')
    this.status.className = 'gw-scale-status'
    this.status.textContent = '拖动后会自动刷新预览；也可以点击“应用预览”立即刷新。'
    this.root.appendChild(this.status)
    options.parent.appendChild(this.root)
    this.unsubscribe = onVisualScaleChange(value => this.renderValues(value))
    this.unsubscribePosition = onVisualPositionChange(value => this.renderPositionSummary(value))
    this.unsubscribePositionMode = onVisualPositionEditModeChange(enabled => this.renderPositionMode(enabled))
    this.renderValues(getVisualScaleOverrides())
    this.renderPositionSummary(getVisualPositionOverrides())
    this.renderPositionMode(isVisualPositionEditMode())
    this.preview = options.onPreview
  }

  private preview: () => void

  private injectStyle() {
    if (document.getElementById('gw-scale-settings-style')) return
    const style = document.createElement('style')
    style.id = 'gw-scale-settings-style'
    style.textContent = `
      .gw-scale-button {
        position: fixed; left: 12px; bottom: 52px; z-index: 35;
        border: 2px solid #4a4f5e; border-radius: 4px; padding: 5px 10px;
        background: rgba(28,30,38,.9); color: #d6dae2; cursor: pointer;
        font: 12px ui-monospace, "Cascadia Mono", Consolas, monospace;
      }
      .gw-scale-button:hover, .gw-scale-panel button:hover { border-color: #8fb8ff; }
      .gw-scale-panel {
        position: fixed; right: 12px; top: 12px; z-index: 60; width: min(360px, calc(100vw - 24px));
        max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
        padding: 12px; color: #d6dae2; background: rgba(24,27,35,.97);
        border: 2px solid #59647d; border-radius: 7px; box-shadow: 0 8px 28px rgba(0,0,0,.48);
        font: 12px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace;
      }
      .gw-scale-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; }
      .gw-scale-title { color:#f0c060; font-weight:bold; font-size:13px; }
      .gw-scale-subtitle { color:#8a90a0; margin-bottom:10px; }
      .gw-scale-close, .gw-scale-actions button {
        border:1px solid #4a4f5e; border-radius:4px; background:#2c303a; color:#d6dae2;
        padding:4px 8px; cursor:pointer; font:inherit;
      }
      .gw-scale-row { margin:9px 0; }
      .gw-scale-label { display:flex; justify-content:space-between; gap:8px; color:#e3e7f0; }
      .gw-scale-value { color:#8fb8ff; }
      .gw-scale-range { width:100%; accent-color:#8fb8ff; cursor:ew-resize; }
      .gw-scale-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
      .gw-scale-actions .primary { border-color:#648dd4; color:#dce8ff; }
      .gw-scale-position { border-top:1px solid #414858; margin-top:12px; padding-top:10px; }
      .gw-scale-position-title { color:#f0c060; font-weight:bold; margin-bottom:4px; }
      .gw-scale-position-help { color:#8a90a0; margin-bottom:7px; }
      .gw-scale-actions .active { border-color:#76cf9d; color:#b8f2cd; background:#203d32; }
      .gw-scale-status { color:#8a90a0; margin-top:9px; min-height:2.8em; }
    `
    document.head.appendChild(style)
  }

  private createHeader() {
    const header = document.createElement('div')
    header.className = 'gw-scale-head'
    const title = document.createElement('div')
    title.className = 'gw-scale-title'
    title.textContent = '素材比例调试'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'gw-scale-close'
    close.textContent = '×'
    close.title = '关闭'
    close.onclick = () => this.toggle(false)
    header.append(title, close)
    const subtitle = document.createElement('div')
    subtitle.className = 'gw-scale-subtitle'
    subtitle.textContent = '拖动倍率会自动应用预览；1.00 = 当前源码比例。只保存在本浏览器。'
    const wrap = document.createElement('div')
    wrap.append(header, subtitle)
    return wrap
  }

  private createRows() {
    const { min, max } = visualScaleRange
    const current = getVisualScaleOverrides()
    for (const group of VISUAL_SCALE_GROUPS) {
      const row = document.createElement('label')
      row.className = 'gw-scale-row'
      const label = document.createElement('span')
      label.className = 'gw-scale-label'
      label.textContent = GROUP_LABELS[group]
      const value = document.createElement('span')
      value.className = 'gw-scale-value'
      label.appendChild(value)
      const input = document.createElement('input')
      input.type = 'range'
      input.className = 'gw-scale-range'
      input.min = String(min)
      input.max = String(max)
      input.step = '0.05'
      input.value = String(current[group])
      input.oninput = () => {
        setVisualScaleOverride(group, Number(input.value))
        this.status.textContent = '正在自动应用预览…'
        this.schedulePreview()
      }
      row.append(label, input)
      this.body.appendChild(row)
      this.values.set(group, value)
      this.inputs.set(group, input)
    }
    const actions = document.createElement('div')
    actions.className = 'gw-scale-actions'
    actions.append(
      this.actionButton('应用预览', 'primary', () => {
        this.previewNow()
      }),
      this.actionButton('复制参数', '', () => void this.copy()),
      this.actionButton('恢复默认', '', () => {
        resetVisualScaleOverrides()
        this.previewNow()
      }),
    )
    this.body.appendChild(actions)
    this.createPositionControls()
  }

  private createPositionControls() {
    const section = document.createElement('div')
    section.className = 'gw-scale-position'
    const title = document.createElement('div')
    title.className = 'gw-scale-position-title'
    title.textContent = '素材坐标编辑'
    const help = document.createElement('div')
    help.className = 'gw-scale-position-help'
    help.textContent = '开启后可直接拖动画面素材；坐标按世界像素记录。'
    const actions = document.createElement('div')
    actions.className = 'gw-scale-actions'
    const modeButton = this.actionButton('坐标编辑：关', '', () => {
      setVisualPositionEditMode(!isVisualPositionEditMode())
    })
    this.positionModeButton = modeButton
    actions.append(
      modeButton,
      this.actionButton('复制坐标', '', () => void this.copyPositions()),
      this.actionButton('恢复坐标', '', () => {
        resetVisualPositionOverrides()
        this.previewNow()
      }),
    )
    section.append(title, help, actions)
    this.body.appendChild(section)
  }

  private actionButton(text: string, className: string, onClick: () => void) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    if (className) button.className = className
    button.onclick = onClick
    return button
  }

  private renderValues(value: Record<VisualScaleGroup, number>) {
    for (const group of VISUAL_SCALE_GROUPS) {
      const amount = value[group]
      const label = this.values.get(group)
      const input = this.inputs.get(group)
      if (label) label.textContent = numberText(amount)
      if (input && document.activeElement !== input) input.value = String(amount)
    }
  }

  private async copy() {
    const copied = await copyText(exportVisualScaleOverrides())
    this.status.textContent = copied
      ? '参数已复制。把剪贴板内容发给开发者即可写回 visualScale.ts。'
      : '复制失败，请手动选择浏览器剪贴板权限后重试。'
  }

  private async copyPositions() {
    const copied = await copyText(exportVisualPositionOverrides())
    this.status.textContent = copied
      ? '坐标已复制。把 VISUAL_POSITION_OVERRIDES 内容发给开发者即可写回地图配置。'
      : '坐标复制失败，请手动选择浏览器剪贴板权限后重试。'
  }

  private renderPositionSummary(value: Record<string, { x: number; y: number }>) {
    const count = Object.keys(value).length
    if (isVisualPositionEditMode()) return
    this.status.textContent = count > 0
      ? `已记录 ${count} 个素材坐标；开启“坐标编辑”可继续拖动。`
      : '尚未记录素材坐标；开启“坐标编辑”后拖动素材。'
  }

  private renderPositionMode(enabled: boolean) {
    const button = this.positionModeButton
    if (!button) return
    button.textContent = enabled ? '坐标编辑：开' : '坐标编辑：关'
    button.classList.toggle('active', enabled)
    this.status.textContent = enabled
      ? '坐标编辑已开启：拖动素材后点击“复制坐标”。'
      : '坐标编辑已关闭。'
  }

  private schedulePreview() {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null
      this.previewNow()
    }, 260)
  }

  private previewNow() {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
    this.previewTimer = null
    this.preview()
    this.status.textContent = '预览已触发；场景连接完成后画面会更新。'
  }

  private toggle(force?: boolean) {
    this.open = force ?? !this.open
    this.root.hidden = !this.open
  }

  destroy() {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
    this.unsubscribe()
    this.unsubscribePosition()
    this.unsubscribePositionMode()
    this.root.remove()
  }
}
