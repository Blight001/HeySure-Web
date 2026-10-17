# 资产来源

本目录下基础 PNG（不含 `town-*-v2.png`）由本仓库脚本 `web/game/tools/generate_assets.py` 程序化生成
（Pillow 绘制，确定性输出），**无第三方素材**，随项目以 Apache-2.0 许可分发。

`bgm/` 下的 MP3 背景音乐由项目作者使用 AI 音乐生成工具创作，用于游戏世界背景循环播放。

后续若引入外部素材（如 Kenney / itch.io CC0 像素包），在此逐条登记：
来源链接、作者、许可证、引入日期、替换了哪些文件。

第二轮同步新增 `town-character-*-v2.png`（六类 AI 人物）、`town-ground-v2.png`（地面）及 `town-props-v2.png`（街道和花园装饰），同样由内置 ImageGen 生成；完整提示词见 [IMAGEGEN.md](IMAGEGEN.md) 和 [CHARACTER-PROMPTS.md](CHARACTER-PROMPTS.md)。人物的运行时动作分层由项目代码派生，原 AI 状态和皮肤 ID 保持一致。

2026-09-09 新增 `town-buildings-v2.png`、`town-trees-v2.png` 与 `town-gardener-v2.png`：按用户要求使用内置 ImageGen 生成的透明建筑、环境、园艺师素材，生成记录与完整提示词见 [IMAGEGEN.md](IMAGEGEN.md)。这些原始图集不由 Pillow 生成器覆盖；游戏、素材预览和头像共用运行时归一后的帧图，失败时保留原素材。
