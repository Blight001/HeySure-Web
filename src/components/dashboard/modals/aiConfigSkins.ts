import memberBlueUrl from '../../../../game/assets/char_member_blue.png?url'
import memberRedUrl from '../../../../game/assets/char_member_red.png?url'
import memberAmberUrl from '../../../../game/assets/char_member_amber.png?url'
import memberSlateUrl from '../../../../game/assets/char_member_slate.png?url'
import type { WorldActorAppearance } from '@/api/world'

export const DEFAULT_APPEARANCE: WorldActorAppearance = { skin: '', tint: '', scale: 1, aura: '' }

export const MEMBER_SKIN_OPTIONS = [
  { key: '', label: '默认', url: '' },
  { key: 'char_member_blue.png', label: '蓝色', url: memberBlueUrl },
  { key: 'char_member_red.png', label: '红色', url: memberRedUrl },
  { key: 'char_member_amber.png', label: '琥珀', url: memberAmberUrl },
  { key: 'char_member_slate.png', label: '青灰', url: memberSlateUrl },
]

const SKIN_URL_BY_KEY: Record<string, string> = Object.fromEntries(
  MEMBER_SKIN_OPTIONS.filter(item => item.key).map(item => [item.key, item.url]),
)

const MEMBER_SKIN_URLS = [memberBlueUrl, memberRedUrl, memberAmberUrl, memberSlateUrl]

export function defaultMemberSkinUrl(configId: number) {
  return MEMBER_SKIN_URLS[Math.abs(configId * 2654435761) % MEMBER_SKIN_URLS.length]
}

export function appearanceSkinUrl(_roleGroup: string | undefined, draft: WorldActorAppearance, configId: number) {
  return SKIN_URL_BY_KEY[draft.skin] || defaultMemberSkinUrl(configId)
}
