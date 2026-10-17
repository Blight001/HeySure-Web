import type { GeneratedAssetDef } from './generatedAssets'

const DECOR_CELLS = {
  bench: 0, lampOff: 1, lampOn: 2, signpost: 3, obelisk: 4,
  banner: 5, book: 6, satchel: 7, planter: 8,
} as const
type PropCell = keyof typeof DECOR_CELLS
export const BUSH_CELLS = { bush: 0, berries: 1, flowers: 2 } as const

const prop = (cell: PropCell, frameWidth: number, frameHeight: number, frames: PropCell[] = [cell]): GeneratedAssetDef => ({
  file: 'town-decor.png', columns: 5, rows: 2, cells: DECOR_CELLS, cell,
  frameCells: frames, frameWidth, frameHeight, frameColumns: frames.length, frameRows: 1,
  pulse: null, baseline: Math.round(frameHeight * 0.9),
})

export const GENERATED_PROPS: Readonly<Record<string, GeneratedAssetDef>> = {
  'bench.png': prop('bench', 80, 48),
  'lamp.png': prop('lampOff', 48, 112, ['lampOff', 'lampOn']),
  'signpost.png': prop('signpost', 64, 80),
  // Bush variants use a dedicated 3-cell atlas; 2x runtime frames avoid a
  // blurry 64x48 intermediate before Phaser scales to world pixels.
  'bush.png': {
    file: 'town-bushes.png', columns: 3, rows: 1, cells: BUSH_CELLS, cell: 'bush',
    frameCells: ['bush', 'berries', 'flowers'], frameWidth: 128, frameHeight: 96,
    frameColumns: 3, frameRows: 1, pulse: null, baseline: 86,
  },
  'decor_library_obelisk.png': prop('obelisk', 72, 128),
  'decor_library_banner.png': prop('banner', 56, 112),
  'decor_book_stand.png': prop('book', 72, 72),
  'effect_toolbox_bag.png': prop('satchel', 24, 32),
  'decor_planter.png': prop('planter', 64, 72),
}
