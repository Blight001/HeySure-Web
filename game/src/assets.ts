const assetUrls = import.meta.glob('../assets/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// 新环境居民的兜底取旧蓝色成员第 0 帧，不影响真实 AI 成员的皮肤。
assetUrls['../assets/resident_gardener.png'] = assetUrls['../assets/char_member_blue.png']
assetUrls['../assets/decor_planter.png'] = assetUrls['../assets/decor_book_stand.png']

let preparation: Promise<void> | null = null

/** 所有入口共用同一组帧图；生成图失败时保留原素材，世界仍可打开。 */
export const prepareWorldAssets = (): Promise<void> => {
  preparation ??= Promise.allSettled([
    prepareGeneratedSheets(), prepareCharacterSheets(), prepareTerrainSheet(),
  ]).then(results => {
    if (results.some(result => result.status === 'rejected')) console.warn('部分生成素材不可用，已保留原版素材')
  })
  return preparation
}

const prepareCharacterSheets = async () => {
  const { CHARACTER_FILES, loadCharacterSheet } = await import('./generatedCharacters')
  await Promise.all(Object.keys(CHARACTER_FILES).map(async file => {
    try {
      assetUrls[`../assets/${file}`] = (await loadCharacterSheet(file)).toDataURL('image/png')
    } catch {
      console.warn(`使用原版人物素材: ${file}`)
    }
  }))
}

const prepareTerrainSheet = async () => {
  const { loadTerrainSheet } = await import('./generatedTerrain')
  assetUrls['../assets/tileset.png'] = (await loadTerrainSheet()).toDataURL('image/png')
}

const prepareGeneratedSheets = async () => {
  const { GENERATED_ASSETS, loadGeneratedAssetImage } = await import('./generatedAssets')
  // 建筑使用按像素风格重新生成的 town-buildings-pixel-v3 图集；其余树木、
  // 装饰素材继续走同一套生成适配层。
  await Promise.all(Object.keys(GENERATED_ASSETS).map(async file => {
    try {
      const canvas = await loadGeneratedAssetImage(file)
      if (canvas instanceof HTMLCanvasElement) assetUrls[`../assets/${file}`] = canvas.toDataURL('image/png')
    } catch {
      console.warn(`使用原版世界素材: ${file}`)
    }
  }))
}

export const sfxUrls = import.meta.glob('../assets/sfx/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const bgmUrls = import.meta.glob('../assets/bgm/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface BgmTrack {
  key: string
  url: string
  name: string
}

export const bgmTracks: BgmTrack[] = Object.entries(bgmUrls)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url], index) => ({
    key: `bgm_${index}`,
    url,
    name: path.split('/').pop() ?? `bgm_${index}`,
  }))

export const urlForAsset = (file: string): string => {
  const url = assetUrls[`../assets/${file}`]
  if (!url) throw new Error(`资产缺失: ${file}`)
  return url
}
