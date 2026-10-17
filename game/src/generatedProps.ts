import type { GeneratedAssetDef } from './generatedAssets'

const CELLS = {
  bench: 0, lampOff: 1, lampOn: 2, signpost: 3,
  bush: 4, berries: 5, flowers: 6, obelisk: 7,
  banner: 8, book: 9, satchel: 10, planter: 11,
} as const
type PropCell = keyof typeof CELLS

const prop = (cell: PropCell, frameWidth: number, frameHeight: number, frames: PropCell[] = [cell]): GeneratedAssetDef => ({
  file: 'town-props-v2.png', columns: 4, rows: 3, cells: CELLS, cell,
  frameCells: frames, frameWidth, frameHeight, frameColumns: frames.length, frameRows: 1,
  pulse: null, baseline: Math.round(frameHeight * 0.9),
})

export const GENERATED_PROPS: Readonly<Record<string, GeneratedAssetDef>> = {
  'bench.png': prop('bench', 80, 48),
  'lamp.png': prop('lampOff', 48, 112, ['lampOff', 'lampOn']),
  'signpost.png': prop('signpost', 64, 80),
  // Bushes are also authored from the large ImageGen atlas; 2x runtime frames
  // avoid a blurry 64x48 intermediate before Phaser scales to world pixels.
  'bush.png': prop('bush', 128, 96, ['bush', 'berries', 'flowers']),
  'decor_library_obelisk.png': prop('obelisk', 72, 128),
  'decor_library_banner.png': prop('banner', 56, 112),
  'decor_book_stand.png': prop('book', 72, 72),
  'effect_toolbox_bag.png': prop('satchel', 24, 32),
  'decor_planter.png': prop('planter', 64, 72),
}
