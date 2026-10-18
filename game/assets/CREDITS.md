# 资产来源

本目录下基础 PNG（不含 `town-*-v2.png`）由本仓库脚本 `web/game/tools/generate_assets.py` 程序化生成
（Pillow 绘制，确定性输出），**无第三方素材**，随项目以 Apache-2.0 许可分发。

`bgm/` 下的 MP3 背景音乐由项目作者使用 AI 音乐生成工具创作，用于游戏世界背景循环播放。

后续若引入外部素材（如 Kenney / itch.io CC0 像素包），在此逐条登记：
来源链接、作者、许可证、引入日期、替换了哪些文件。

第二轮同步新增 `town-character-*-v2.png`（六类 AI 人物）、`town-character-*-actions-v3/v4/v5.png`（真实行走与动作图集）、`town-ground-v2.png`（地面）及后续整理为 `town-decor.png` 的街道和花园装饰，同样由内置 ImageGen 生成；完整提示词见 [IMAGEGEN.md](IMAGEGEN.md)、[CHARACTER-PROMPTS.md](CHARACTER-PROMPTS.md) 和 [ACTION-ANIMATION.md](ACTION-ANIMATION.md)。人物的 AI 状态和皮肤 ID 保持一致。

2026-09-09 新增 `town-buildings.png` 与 `town-gardener-v2.png`；树木图集现整理为 `town-trees.png`：按用户要求使用内置 ImageGen 生成的透明建筑、环境、园艺师与树木素材，生成记录与完整提示词见 [IMAGEGEN.md](IMAGEGEN.md)。这些原始图集不由 Pillow 生成器覆盖；游戏、素材预览和头像共用运行时归一后的帧图。

2026-10-17 新增 `town-trees.png`、`town-bushes.png` 与整理后的 `town-decor.png`：按用户要求使用内置 ImageGen 重新生成并整理树木、灌木及道具图集；运行时按完整透明轮廓提取帧，修复上下左右接缝溢出造成的过度裁剪。旧 `town-trees-v2.png` 与 `town-props-v2.png` 已移除。

2026-10-17 建筑图集改为正面视角并统一命名为 `town-buildings.png`，移除旧版建筑图集。
