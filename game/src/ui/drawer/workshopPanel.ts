import type { WorldSnapshot, WorldWorkshop } from '../../world/store'
import type { PortraitSpec } from '../portrait'
import { RemoteScreenViewer, type ScreenStatus } from '../../world/remoteScreen'
import { esc } from './dom'
import type { PanelController } from './types'

/** 实时画面可用的端侧类型（图书馆 workshop 不是真实设备，无画面）。 */
const SCREEN_TYPES: ReadonlyArray<WorldWorkshop['type']> = ['desktop', 'browser', 'android']
const canViewScreen = (w: WorldWorkshop) =>
  w.online && w.lifecycle !== 'waiting' && SCREEN_TYPES.includes(w.type)

export const openWorkshopPanel = (
  panel: PanelController,
  deviceId: string,
  snap: WorldSnapshot,
  portrait?: PortraitSpec | null,
) => {
  const w = snap.workshops.find(x => x.deviceId === deviceId)
  if (!w) return
  const typeTitle = w.type === 'desktop'
    ? '机械坊（桌面 Agent）'
    : w.type === 'browser'
      ? '瞭望塔（浏览器 Agent）'
      : w.type === 'android'
        ? '移动工坊（安卓端）'
        : '图书馆'
  panel.openPanel({
    title: `${typeTitle} · ${w.name}`,
    subtitle: w.lifecycle === 'waiting' ? '等待连接' : w.lifecycle === 'dispatching' ? '执行中' : w.online ? '在线' : '离线',
    portrait,
    tabs: [
      {
        name: '设备',
        build: () => {
          const info = panel.section('设备')
          panel.rows(info, [
            ['名称', w.name],
            ['平台', w.platform || 'unknown'],
            ['状态', w.lifecycle === 'waiting' ? '等待连接' : w.lifecycle === 'dispatching' ? '执行中' : w.online ? '在线' : '离线'],
            ['工具', `${w.capabilities} 个端侧工具`],
            ['错误', w.lastError || ''],
          ])
          if (w.lifecycle === 'waiting') {
            const hint = document.createElement('div')
            hint.className = 'd-dim'
            hint.textContent = '这是通用设备插槽：桌面端或浏览器端 Agent 连接后，会自动替换为真实设备。'
            info.appendChild(hint)
          }
          // 详情下方：在线设备（桌面 / 浏览器 / 安卓）的实时画面。
          if (canViewScreen(w)) buildLiveScreen(panel, w)
        },
      },
      ...(w.lifecycle === 'waiting' ? [] : [{
        name: '分配成员',
        build: () => {
          const assign = panel.section('分配成员')
          const fb = panel.feedback(assign)
          const bound = snap.members.find(m => m.id === w.aiConfigId)
          const sel = document.createElement('select')
          sel.className = 'd-sel'
          sel.innerHTML =
            `<option value="">未分配</option>` +
            snap.members
              .filter(m => m.lifecycle !== 'dead')
              .map(m => `<option value="${m.id}" ${m.id === w.aiConfigId ? 'selected' : ''}>${esc(m.name)}（ID ${m.id}）</option>`)
              .join('')
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'd-btn ok'
          btn.textContent = '保存分配'
          btn.onclick = () => {
            const v = sel.value === '' ? null : Number(sel.value)
            void panel.runAction(btn, fb, () => panel.actions.assignAgent(w.deviceId, v), v === null ? '已解绑' : '已分配')
          }
          const formRow = document.createElement('div')
          formRow.className = 'd-formrow'
          formRow.appendChild(sel)
          formRow.appendChild(btn)
          assign.appendChild(formRow)
          if (bound) {
            const hint = document.createElement('div')
            hint.className = 'd-dim'
            hint.textContent = `当前成员：${bound.name}（点击地图上的成员可查看详情）`
            assign.appendChild(hint)
          }
        },
      }]),
      ...(w.lifecycle === 'waiting' ? [] : [{ name: 'MCP 权限', build: () => mcpScopeSection(panel, w.deviceId) }]),
    ],
  })
}

/**
 * 在设备详情下方嵌入只读实时画面：点开在线设备即自动拉流（WebRTC），
 * 仅展示不操作。会话随标签页切换 / 面板关闭通过 panel.onCleanup 释放。
 */
const buildLiveScreen = (panel: PanelController, w: WorldWorkshop) => {
  const sec = panel.section('实时画面')

  const stage = document.createElement('div')
  stage.className = w.type === 'android' ? 'd-screen portrait' : 'd-screen'

  const video = document.createElement('video')
  video.className = 'd-screen-video'
  video.autoplay = true
  video.muted = true
  video.setAttribute('playsinline', '') // iOS：内联播放，不强制全屏

  const overlay = document.createElement('div')
  overlay.className = 'd-screen-overlay'
  overlay.textContent = '正在连接设备…'

  stage.appendChild(video)
  stage.appendChild(overlay)
  sec.appendChild(stage)

  const hint = document.createElement('div')
  hint.className = 'd-dim'
  hint.textContent = '仅查看画面；如需操作设备请在主控制台使用「远程控制」。'
  sec.appendChild(hint)

  const setOverlay = (status: ScreenStatus, message?: string) => {
    if (status === 'streaming') {
      overlay.style.display = 'none'
      return
    }
    overlay.style.display = ''
    overlay.classList.toggle('err', status === 'error')
    overlay.textContent =
      status === 'error' ? (message || '画面获取失败')
        : status === 'ended' ? '画面已结束'
          : '正在连接设备…'
  }

  const viewer = new RemoteScreenViewer({
    onStatus: setOverlay,
    onStream: (stream) => { video.srcObject = stream },
  })
  viewer.start(w.deviceId)

  panel.onCleanup(() => {
    video.srcObject = null
    viewer.stop()
  })
}

const mcpScopeSection = (panel: PanelController, deviceId: string) => {
  const sec = panel.section('Agent MCP 权限')
  const fb = panel.feedback(sec)
  fb.className = 'd-dim'
  fb.textContent = '加载中…'
  void panel.actions.loadDeviceMcpScope(deviceId).then(scope => {
    sec.innerHTML = '<div class="d-sec-title">Agent MCP 权限</div>'
    const info = document.createElement('div')
    info.className = 'd-dim'
    info.textContent = scope.hasRecord ? '已保存自定义权限范围' : '默认允许当前 Agent 宣告的全部 MCP 工具'
    sec.appendChild(info)
    const saveFb = panel.feedback(sec)
    if (!scope.capabilities.length) {
      saveFb.className = 'd-dim'
      saveFb.textContent = '该 Agent 当前没有上报 MCP 工具'
      return
    }
    const selected = new Set(scope.hasRecord ? scope.allowed : scope.capabilities)
    const boxes: HTMLInputElement[] = []
    for (const tool of scope.capabilities) {
      const label = document.createElement('label')
      label.className = 'd-check'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = selected.has(tool)
      box.onchange = () => {
        if (box.checked) selected.add(tool)
        else selected.delete(tool)
      }
      boxes.push(box)
      const span = document.createElement('span')
      span.textContent = tool
      label.appendChild(box)
      label.appendChild(span)
      sec.appendChild(label)
    }
    const all = document.createElement('button')
    all.type = 'button'
    all.className = 'd-btn'
    all.textContent = '全选'
    all.onclick = () => {
      selected.clear()
      for (const tool of scope.capabilities) selected.add(tool)
      boxes.forEach(b => (b.checked = true))
    }
    const none = document.createElement('button')
    none.type = 'button'
    none.className = 'd-btn'
    none.textContent = '清空'
    none.onclick = () => {
      selected.clear()
      boxes.forEach(b => (b.checked = false))
    }
    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'd-btn ok push'
    save.textContent = '保存 MCP 权限'
    save.onclick = () =>
      void panel.runAction(save, saveFb, () => panel.actions.saveDeviceMcpScope(deviceId, Array.from(selected)), 'MCP 权限已保存')
    const btnRow = document.createElement('div')
    btnRow.className = 'd-btnrow'
    btnRow.appendChild(all)
    btnRow.appendChild(none)
    btnRow.appendChild(save)
    sec.appendChild(btnRow)
  }).catch(err => {
    fb.className = 'd-err'
    fb.textContent = err instanceof Error ? err.message : 'MCP 权限加载失败'
  })
}
