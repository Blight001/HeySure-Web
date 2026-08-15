import Phaser from 'phaser'
import { hudHtml } from '../ui/worldText'
import { WORLD_H, WORLD_W } from '../world/layout'
import { clockLabel } from '../world/time'
import type { WorldSnapshot } from '../world/store'
import type { WorkshopView } from './types'
import type { WorldSceneHost } from './worldSceneTypes'

export const DEVICE_ICON_CACHE_BUST = Date.now().toString(36)
export const CUSTOM_WORKSHOP_ICON_SIZE = 138
export const CUSTOM_LIBRARY_ICON_SIZE = 168
export const WORKSHOP_BASE_ORIGIN_Y = 1
export const WORKSHOP_LABEL_GAP = 8
export const WORKSHOP_LABEL_WRAP_WIDTH = 170

export const deviceIconLoadUrl = (url: string): string => {
  if (!url.startsWith('/device_png/')) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${DEVICE_ICON_CACHE_BUST}`
}

export const setSpriteMaxDisplaySize = (sprite: Phaser.GameObjects.Sprite, maxSize: number) => {
  const width = sprite.frame?.realWidth || sprite.frame?.width || sprite.width
  const height = sprite.frame?.realHeight || sprite.frame?.height || sprite.height
  if (!width || !height) {
    sprite.setScale(1)
    return
  }
  sprite.setScale(Math.min(maxSize / width, maxSize / height))
}

export const positionWorkshopLabel = (view: WorkshopView) => {
  const topY = view.sprite.y - view.sprite.displayHeight * view.sprite.originY
  view.label.setPosition(view.sprite.x, topY - WORKSHOP_LABEL_GAP)
  view.label.setDepth(view.sprite.depth + 12)
}

export const worldMinZoom = (scene: Phaser.Scene): number => {
  return Math.max(scene.scale.width / WORLD_W, scene.scale.height / WORLD_H)
}

export const postToDashboard = (message: Record<string, unknown>) => {
  if (window.parent !== window) {
    window.parent.postMessage(message, window.location.origin)
  }
}

export const isTextInputFocused = (): boolean => {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export const updateHud = (scene: WorldSceneHost, snap: WorldSnapshot) => {
  scene.overlay.setHud(hudHtml(snap, clockLabel(window.location.search, scene.worldHour)))
}
