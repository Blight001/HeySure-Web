import type { RcMode, RcStatus } from '@/composables/useRemoteControl'

export const PANEL_CHROME_PX = 160
export const PANEL_SIDE_PAD_PX = 24

export function isDesktopLikeMode(mode: RcMode) {
  return mode === 'desktop' || mode === 'browser' || mode === 'custom'
}

export function remoteModeLabel(mode: RcMode) {
  return mode === 'browser' ? '（浏览器）' : mode === 'desktop' ? '（桌面）' : mode === 'custom' ? '（自定义设备）' : ''
}

export function panelConstraintsStyle(isDesktopLike: boolean) {
  return isDesktopLike
    ? {
      minWidth: 'min(480px, calc(100vw - 16px))',
      minHeight: 'min(360px, calc(100dvh - 16px))',
      maxWidth: 'calc(100vw - 16px)',
      maxHeight: 'calc(100dvh - 16px)',
    }
    : {
      minWidth: 'min(260px, calc(100vw - 16px))',
      minHeight: 'min(320px, calc(100dvh - 16px))',
      maxWidth: 'calc(100vw - 16px)',
      maxHeight: 'calc(100dvh - 16px)',
    }
}

export function remoteStatusText(status: RcStatus, errorMessage: string) {
  switch (status) {
    case 'connecting': return '正在建立连接…'
    case 'streaming': return '远程控制中'
    case 'error': return errorMessage || '连接失败'
    case 'ended': return '会话已结束'
    default: return '未连接'
  }
}

export function isRemotePortrait(width: number, height: number, isDesktopLike: boolean) {
  return (width > 0 && height > 0) ? height >= width : !isDesktopLike
}

export function remoteAspectStyle(width: number, height: number, isDesktopLike: boolean) {
  if (width > 0 && height > 0) return { aspectRatio: `${width} / ${height}` }
  return { aspectRatio: isDesktopLike ? '16 / 9' : '9 / 19.5' }
}

export function fitPanelToOrientation(opts: {
  el: HTMLElement | null
  isMaximized: boolean
  isDesktopLike: boolean
  width: number
  height: number
  isPortrait: boolean
}) {
  const { el, isMaximized, isDesktopLike, width: w, height: h, isPortrait } = opts
  if (!el || isMaximized) return
  if (isDesktopLike) {
    el.style.width = '80vw'
    el.style.height = '85vh'
    return
  }
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width || window.innerWidth
  const viewportHeight = viewport?.height || window.innerHeight
  const maxW = Math.max(1, viewportWidth - 16)
  const maxH = Math.max(1, viewportHeight - 16)
  if (w > 0 && h > 0) {
    const ratio = w / h
    let height = isPortrait ? maxH : Math.min(maxH, window.innerHeight * 0.82)
    let width = Math.max(1, height - PANEL_CHROME_PX) * ratio + PANEL_SIDE_PAD_PX
    if (width > maxW) {
      width = maxW
      height = Math.max(1, width - PANEL_SIDE_PAD_PX) / ratio + PANEL_CHROME_PX
    }
    el.style.width = `${Math.round(Math.min(width, maxW))}px`
    el.style.height = `${Math.round(Math.min(height, maxH))}px`
    return
  }
  el.style.width = isPortrait ? '380px' : '82vw'
  el.style.height = isPortrait ? '85vh' : '64vh'
}
