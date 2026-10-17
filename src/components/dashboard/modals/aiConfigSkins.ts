import memberBlueUrl from '../../../../game/assets/char_member_blue.png?url'
import memberRedUrl from '../../../../game/assets/char_member_red.png?url'
import memberAmberUrl from '../../../../game/assets/char_member_amber.png?url'
import memberSlateUrl from '../../../../game/assets/char_member_slate.png?url'
import adminUrl from '../../../../game/assets/char_admin.png?url'
import librarianUrl from '../../../../game/assets/char_librarian.png?url'
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
SKIN_URL_BY_KEY['char_admin.png'] = adminUrl
SKIN_URL_BY_KEY['char_librarian.png'] = librarianUrl

const MEMBER_SKIN_URLS = [memberBlueUrl, memberRedUrl, memberAmberUrl, memberSlateUrl]

export function defaultMemberSkinUrl(configId: number) {
  return MEMBER_SKIN_URLS[Math.abs(configId * 2654435761) % MEMBER_SKIN_URLS.length]
}

export function appearanceSkinFile(roleGroup: string | undefined, draft: WorldActorAppearance, configId: number) {
  const role = roleGroup?.toLowerCase() || ''
  if (role.includes('librarian')) return 'char_librarian.png'
  if (role.includes('admin') || role.includes('manager') || role.includes('assistant_default')) return 'char_admin.png'
  return draft.skin || MEMBER_SKIN_OPTIONS[Math.abs(configId * 2654435761) % MEMBER_SKIN_URLS.length + 1].key
}

export function appearanceSkinUrl(roleGroup: string | undefined, draft: WorldActorAppearance, configId: number) {
  const file = appearanceSkinFile(roleGroup, draft, configId)
  return SKIN_URL_BY_KEY[file] || defaultMemberSkinUrl(configId)
}

/** UI 预览使用世界同一套运行时图集；加载未完成时由调用方保留旧图。 */
export async function loadAppearanceSkinUrl(roleGroup: string | undefined, draft: WorldActorAppearance, configId: number) {
  const file = appearanceSkinFile(roleGroup, draft, configId)
  return await loadSkinPreviewUrl(file) || appearanceSkinUrl(roleGroup, draft, configId)
}

export async function loadSkinPreviewUrl(file: string): Promise<string> {
  try {
    const { loadCharacterSheet } = await import('../../../../game/src/generatedCharacters')
    return (await loadCharacterSheet(file)).toDataURL('image/png')
  } catch {
    return SKIN_URL_BY_KEY[file] || ''
  }
}
