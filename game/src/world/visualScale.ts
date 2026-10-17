/**
 * 世界场景的统一素材显示比例配置。
 *
 * 这里的数值只控制“已经加载到 Phaser 后”的显示尺寸；不要把它和
 * `assetManifest.ts` 中的帧尺寸、`generatedAssets.ts` 的 alpha-fit，或
 * 成员外观数据里的逻辑倍率混在一起。需要调整建筑、树、草丛、角色或
 * 任何独立装饰的体量时，只改本文件即可。
 */
export const VISUAL_SCALE = {
  terrain: {
    /** 128px 高分辨率地表帧缩回 32px 世界瓦片。 */
    tile: 0.25,
    runtimeTileFactor: 4,
  },
  tree: {
    /** 树木全局显示倍率；保留每棵树的自然随机变化。 */
    display: 1.36,
    /** tree.png 是 2x 运行时帧，换算到世界像素。 */
    rasterFactor: 0.5,
    /** 安全上下限；大幅调整 display 时可同步调节，避免被 Clamp 截断。 */
    min: 0.58,
    max: 0.74,
    scatter: {
      edgeMin: 1.05,
      edgeRange: 0.4,
      sideMin: 1.0,
      sideRange: 0.4,
      groveMin: 0.85,
      groveRange: 0.45,
      lonelyMin: 0.85,
      lonelyRange: 0.4,
      landmarkSakura: [1.55, 1.45],
    },
  },
  bush: {
    /** bush.png 是 2x 运行时帧。 */
    rasterFactor: 0.25,
    /** 灌木整体显示倍率。 */
    display: 2,
    scatterMin: 0.8,
    scatterRange: 0.5,
  },
  character: {
    /** 64x96 角色帧在世界中的基础显示倍率。 */
    display: 0.58,
    logicalMin: 0.45,
    logicalMax: 1.4,
    gardener: 1.16,
    auraX: 1.6,
    auraY: 0.9,
    bag: 1,
    bagGlowX: 3.0,
    bagGlowY: 2.1,
  },
  building: {
    fixed: {
      spawn: 1.725,
    },
    workshop: 1.44,
    library: 1.17,
    customIconMax: {
      workshop: 240,
      library: 288,
    },
  },
  prop: {
    /** town-decor.png 的装饰帧是 2x，默认缩回逻辑像素。 */
    default: 0.5,
    firefly: 0.45,
    butterfly: {
      homeMin: 0.95,
      homeRange: 0.3,
      evenMin: 0.9,
      evenRange: 0.25,
      spawn: 1.15,
    },
    planter: 0.39,
    blossom: 0.6,
    sparkle: {
      library: 0.9,
      libraryCrown: 1.15,
      spawn: 0.85,
    },
  },
  effect: {
    sparkle: 1,
    smoke: 1,
    petal: 1,
    envelope: 1,
    emote: 1,
    libraryAura: { x: 10.8, y: 3.1, pulseX: 12.2, pulseY: 3.55 },
    libraryCrown: { x: 2.4, y: 2.9 },
    spawnAura: { x: 8.4, y: 2.2, pulseX: 9.2, pulseY: 2.5 },
    spawnInner: { x: 3.8, y: 3 },
    workshopPad: { x: 3.4, y: 1.05, pulseX: 0.5 },
    beacon: { upper: 0.72, lower: 0.82 },
    lampGlow: { core: 3.2, groundX: 7.2, groundY: 3 },
    workshopTaskGlow: {
      x: 6.8,
      y: 5.2,
      baseX: 5.4,
      baseY: 4.1,
      pulseX: 1.2,
      pulseY: 0.9,
    },
    cloud: { min: 3, range: 2.4, revealFactor: 1.25 },
    nightGlow: {
      library: { scaleX: 5.2 },
      spawnUpper: { scaleX: 4, scaleY: 3 },
      spawnLower: { scaleX: 6.2, scaleY: 2 },
      libraryObelisk: { scaleX: 2.4, scaleY: 3.2 },
      libraryBookStand: { scaleX: 2.2, scaleY: 1.8 },
    },
  },
  atmosphere: {
    cloudShadows: [
      { width: 250, height: 48 },
      { width: 330, height: 64 },
      { width: 290, height: 56 },
    ],
    rippleSize: { width: 24, height: 9 },
    lightPools: [
      { scaleX: 6.8, scaleY: 2.2 },
      { scaleX: 4.8, scaleY: 1.9 },
    ],
    ripple: { min: 0.75, range: 0.85 },
  },
  interaction: {
    clickShrink: 0.8,
    buildingBounce: 0.92,
  },
  preview: 3,
} as const

