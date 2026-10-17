# 小镇世界素材升级 · 2026-09-09

生成方式：内置 ImageGen。下列 PNG 为原创生成素材：人物、建筑与道具使用透明背景，地面使用不透明纹理。最终素材保存在本目录，运行时由 `game/src/generatedAssets.ts`、`generatedCharacters.ts` 与 `generatedTerrain.ts` 归一到原有帧尺寸。原先的生成器与基础 PNG 保持可回退，不会覆盖新 atlas。

## 建筑

文件：`town-buildings-v2.png`；1536 × 1024，3 列 × 2 行。

依次为图书馆、机械坊、观测塔、学者小屋、信号塔、喷泉。帧输出保持原有尺寸，局部灯光与水光由运行时渲染。

最终提示词：

```text
Create a gorgeous cozy pixel-art game asset atlas. Genuine transparent background. A regular 3 columns by 2 rows layout, six separate isolated full objects, generous spacing. Top row: ivory stone library with navy roof and golden rose window; timber workshop with terracotta roof and copper chimney; teal-roofed observatory with telescope. Bottom row: violet-roofed scholar cottage with a magical open book; sage signal tower with copper antenna; aqua tiered stone fountain. Consistent orthographic three-quarter overhead RPG camera, warm sunlight, rich tiny details, crisp refined 32-bit pixel clusters. No text, no grid lines, no scenery behind assets, no checkerboard baked in. Landscape atlas, each cell square, aligned object bases.
```

## 环境

文件：`town-trees.png`；1254 × 1254，2 列 × 2 行。

橡树、云杉、白桦、樱花。树根锚点与原版一致。

当前版本保留四种树的原构图并扩大透明安全边距。运行时由 `generatedAssets.ts` 按完整轮廓归一为 4 帧 192 × 288，避免图集象限接缝的溢出像素被误裁。

最终提示词：

```text
A beautiful pixel game tree sprite atlas on genuine transparent alpha background, square 1024x1024, EXACT regular 2 columns and 2 rows. Four separate fully visible isolated trees: upper left lush mature green oak; upper right tall blue-green layered spruce; lower left delicate silver birch with lime sage foliage; lower right flowering rose-pink cherry tree. All in same cozy premium 32-bit pixel RPG style, crisp detailed foliage clusters, warm upper-left sunlight, slightly overhead orthographic camera. Each tree centered in its own square cell, roots aligned near cell bottom, generous transparent margins, full canopy and trunk. No landscape, no text, no labels, no grid, no checkerboard, no backdrop. Refined storybook village assets.
```

## 人物

文件：`town-gardener-v2.png`；1024 × 1536，单个人物透明原图。

归一为 `resident_gardener.png` 单帧 32 × 48，用于花园环境居民。园艺师在学者小屋旁轻微呼吸，周围花瓣缓慢飘落；触屏及减少动态效果时静止。实际 AI 成员保留原有 20 帧动作契约与角色、任务数据，人物外观在第二轮统一升级。

最终提示词：

```text
A single charming full-body pixel-art village gardener, chestnut hair, green overalls, cream shirt, brown boots, holding a terracotta flower pot with pink blossoms. Cozy 32-bit RPG game sprite, expressive friendly adult chibi character, head one third of body, three-quarter front view, finely detailed crisp pixels, warm daylight. Centered with generous empty margins. Transparent background. No text or scenery.
```

## 人物、地面与街道装饰同步（第二轮）

六类 AI 人物全部使用 `town-character-{blue,red,amber,slate,admin,librarian}-v2.png` 的四方向原图；角色身份、皮肤 ID、32 × 48 帧尺寸保持原约定。动作 atlas 使用 `actions-v3/v4/v5` 的真实 4 × 5 帧，`generatedCharacters.ts` 逐帧扫描透明轮廓并归一到 64 × 96；管理员使用窄袍 v5 素材与轻微纵向补偿，避免宽袍等比缩放后显得偏矮。外观设置预览也使用同一适配结果。人物提示词详见 [CHARACTER-PROMPTS.md](CHARACTER-PROMPTS.md)。

`town-ground-v2.png`：1254 × 1254、2 × 2，不透明草地 / 砂土 / 石板 / 水面纹理。`generatedTerrain.ts` 按既有 24 个瓦片索引适配为 256 × 96，保留道路、水面及场景碰撞语义；地表边缘作对齐，水面两帧加入细微涟漪。

地面最终提示词：

```text
A seamless ground texture atlas for a cozy storybook 32-bit pixel RPG town, square image, exactly 2 by 2 equal square cells, no margins or grid borders. Top left: naturally mottled meadow grass, muted sage and moss green, very fine subtle blades, NO flowers. Top right: warm sandy earth footpath with tiny tan pebbles, softly textured. Bottom left: elegant pale limestone cobblestone paving, irregular rounded rectangular stones, narrow soft taupe joints, no rigid tile perimeter. Bottom right: clear softly rippling teal pond water, pale mint highlights, no shore. Perfect overhead orthographic material textures, evenly lit, fine readable pixel clusters, refined natural material detail, restrained contrast. All four squares individually seamless at their edges, entire canvas fully opaque edge to edge. No objects, characters, shadows, text, labels, frames, dividers or checkerboard.
```

`town-decor.png`：2560 × 1024、5 × 2 透明图集。由 ImageGen 道具素材重新整理为板凳、熄灯路灯、亮灯路灯、路牌、方尖碑、学院旗帜、书台、工具挎包、薰衣草陶盆；`generatedProps.ts` 对应原素材键，路灯保留昼夜 0 / 1 帧，座椅保留原交互坐标。

`town-bushes.png`：2172 × 724、3 × 1 透明图集。顺序为圆灌木、浆果灌木、花灌木；三帧使用完整轮廓归一为 128 × 96，独立于旧道具图集，避免跨格溢出造成裁剪。

装饰最终提示词：

```text
Premium cozy pixel RPG town props atlas on genuine transparent background. Exactly 4 columns by 3 rows, twelve equally sized square cells, generous clear space, objects isolated, fully contained and centered. Row1: elegant warm oak park bench with dark wrought-iron legs; tall brass lantern streetlamp UNLIT clear glass; the IDENTICAL lamp LIT warm amber glass; carved timber directional signpost with blank arrows. Row2: lush round leafy shrub; red-berry shrub; pink and cream flowering shrub; ornate ivory stone obelisk with golden crystal tip. Row3: navy and gold hanging academy banner on a brass pole; open illuminated book on carved oak pedestal; small tan leather tool satchel; terracotta flower planter with lavender. Consistent orthographic slightly overhead front-facing view matching a storybook village, precise refined 32-bit pixel clusters, natural materials, warm top-left lighting, muted sage ivory oak and brass palette, legible silhouettes. No written words, no grid lines, no backdrop, no ground rectangles, no watermark. Bench horizontal, lamp tall and slender, shrubs wide and low. All bases aligned near each cell bottom.
```
