# AGENTS.md — web/ 前端控制台 (HeySure-Web)

Vue 3 + Vite + TypeScript + Tailwind 的单页控制台。端口 **58150**，dev 时通过 vite proxy 把 `/api` `/socket.io` `/avatars` `/tmp-images` 转发到后端 `:3000`。

**注意**：本目录是独立仓库 `HeySure-Web`。完整项目使用时请通过上层 workspace 的 git submodule 拉取其余组件。
同内容的 Claude 版见 [`CLAUDE.md`](CLAUDE.md)。

**两个 Vite 入口**：`index.html`（主控制台）+ `game/index.html`（Agent 进化与实战区域，dev 访问 `/game/`）。

## 目录

```
src/
  api/           ← 后端接口封装，按域分文件
                   http.ts — 统一客户端（token/超时/错误处理）
                   auth.ts / chat.ts / ai.ts / mcp.ts / devices.ts
                   task.ts / admin.ts / workshop.ts / librarian.ts
                   workspace.ts / world.ts / projects.ts / deviceTools.ts
                   rtc.ts — WebRTC ICE / 远控相关
  components/    ← Vue 组件，按域分目录
                   chat/       聊天界面（ChatInterface/ChatMessage/ChatInput/TaskProgressPanel…）
                   dashboard/  仪表盘
                     cards/    AgentCard
                     modals/   AiConfig / McpTools / TaskManagement / Device* …
                     panels/   BrainCore / KnowledgeBase / Workshop / WorldArena …
                     RemoteControlModal / RemoteTerminalModal
                   home/       首页（HomePage）
                   common/     通用（LoginModal/ProfileModal/MessageDialog/AmbientBackground…）
  composables/   ← 组合式逻辑
                   useAuth / useMessage / useChatRunStream / useBreakpoint
                   useRemoteControl / useRemoteTerminal / useUiEffects / usePopupZIndex
                   dashboard/* （仪表盘数据与模态状态）
  constants/     ← 静态常量（dashboard / mcp）
  types/         ← TS 类型定义（agent / mcp / user / admin / index）
  utils/         ← 工具函数（chatMarkdown / chatParser / mcpTools / mcpFormat /
                              avatar / taskSystem / permission…）
  styles/        ← main.css（Tailwind 全局样式）
  App.vue main.ts ← 应用入口
```

## 组件 → API → 后端路由 对照

| 组件/功能 | 调用 API 文件 | 后端路由文件 |
| --- | --- | --- |
| 登录 / 注册 | `api/auth.ts` | `gateway/routers/auth.py` |
| 聊天发消息 / 历史 | `api/chat.ts` | `gateway/routers/chat.py` |
| AI 成员列表 / 配置 | `api/ai.ts` | `gateway/routers/ai.py` |
| MCP 工具列表 / 调用 | `api/mcp.ts` | `gateway/routers/mcp.py` |
| 设备列表 / 状态 | `api/devices.ts` | `gateway/routers/devices.py` |
| 任务创建 / 查询 | `api/task.ts` | `gateway/routers/ai_task_routes.py` |
| 知识工坊 | `api/workshop.ts` | `gateway/routers/workshop.py` |
| 图书馆 / 知识库 | `api/librarian.ts` | `gateway/routers/librarian_routes.py` |
| 系统管理 | `api/admin.ts` | `gateway/routers/admin.py` |
| 设备工具调用 | `api/deviceTools.ts` | `gateway/routers/device_tools.py` |
| 远控 ICE / RTC | `api/rtc.ts` | `gateway/routers/rtc.py` |
| 世界观 | `api/world.ts` | `gateway/routers/world.py` |
| Codex 维护中心 | `api/maintenance.ts` | `gateway/routers/maintenance.py` |

## MCP 工具相关文件

| 文件 | 职责 |
| --- | --- |
| `src/utils/mcpTools.ts` | 工具展示名称、图标、分组逻辑 |
| `src/utils/mcpFormat.ts` | 工具调用结果格式化渲染 |
| `src/constants/mcp.ts` | 工具类型常量、分类映射 |
| `src/api/mcp.ts` | 工具列表/调用/权限设置接口 |

## Socket.IO 实时事件（前端监听）

| 事件名 | 来源 | 触发场景 |
| --- | --- | --- |
| `chat_message` | Gateway / AI Runtime | 推理完成，推送新消息 |
| `chat_stream` | AI Runtime | 流式输出逐 token |
| `task_update` | Gateway 调度器 | 任务状态变更 |
| `device_status` | Connector Runtime | 端侧设备上下线 |
| `agent_presence` | Gateway | AI 成员在线状态变化 |
| `maintenance:update` | Gateway / Connector Runtime | Codex 维护工单、事件或审批状态变化 |

监听位置：`src/composables/useMessage.ts` / `useChatRunStream.ts`（聊天）、`src/composables/dashboard/`（仪表盘状态）。
远控：`useRemoteControl.ts`（画面 `rc:*`）、`useRemoteTerminal.ts`（命令行 `rt:*`）。

## "改 X 去哪里"

| 需求 | 位置 |
| --- | --- |
| 调某个后端接口 | `src/api/<域>.ts`，新接口加在对应域文件，复用 `http.ts` |
| 改某个页面/组件 | `src/components/<域>/` |
| 跨组件复用逻辑 | `src/composables/` |
| 共享类型 | `src/types/` |
| MCP 工具展示/格式化 | `src/utils/mcpTools.ts` + `mcpFormat.ts` + `constants/mcp.ts` |
| 任务系统前端解析 | `src/utils/taskSystem.ts` |
| Codex 维护中心 | `src/components/maintenance/` + `src/composables/maintenance/` + `src/api/maintenance.ts` |
| 远程画面 / 终端 | `composables/useRemoteControl.ts` / `useRemoteTerminal.ts` + dashboard 下对应 Modal |
| 统一请求配置（超时/token） | `src/api/http.ts` |

## 前端 7 大设计原则

| 原则 | 项目约定 |
| --- | --- |
| 开闭原则 | 新功能优先加在现有域目录的独立组件 / composable / 常量文件里，通过 props、emits、配置表扩展 |
| 依赖倒置原则 | 组件依赖 `src/api`、`src/composables`、`src/constants`、`src/types` 的稳定接口，不直接拼请求 |
| 里氏代换原则 | 共享类型里的对象契约保持可替换，不假设特殊子形态 |
| 合成-聚合复用原则 | 跨页面逻辑放 composable，静态表放 constants，纯格式化放 utils |
| 单一职责原则 | 组件→视图编排；API→请求；composable→状态流程；utils→无副作用转换 |
| 迪米特法则 | 一个模块只调相邻层，不穿透其它组件内部状态 |
| 接口隔离原则 | 新增类型/常量/API 时按域拆小接口，不堆进单个大组件 |

## 常见问题排查

| 症状 | 排查位置 |
| --- | --- |
| API 请求 401 | `src/api/http.ts` token 处理 / 后端 JWT_SECRET 是否一致 |
| API 请求 404 | 检查 `src/api/` 对应文件的路径；后端路由是否注册 |
| Socket.IO 无法连接 | vite proxy 配置（`vite.config.ts`）/ Connector Runtime (3002) 是否运行 |
| 聊天消息不显示 | `composables/useMessage.ts` / `useChatRunStream.ts`；`chat_message` 事件是否收到 |
| MCP 工具不显示 | `api/mcp.ts` 返回数据；`utils/mcpTools.ts` 工具映射是否包含该工具 |
| 任务进度不更新 | `composables/dashboard/` 中 `task_update` 事件是否在监听 |
| 远控连不上 | `useRemoteControl.ts` / `api/rtc.ts`；后端 ICE 设置（`access/ice_settings.py`） |
| 样式不生效 | Tailwind 类名是否在 `main.css` 的 content 扫描路径内；构建是否刷新 |

## 复杂度门禁

与 `deploy/server` 同一套渐进式规则，提交前至少运行 `npm run verify`。

| 指标 | 生产 `src/` `game/src/` | 测试 `*.spec.ts` / `*.test.ts` / `__tests__/` |
| --- | --- | --- |
| 文件有效行 | 500 | 800 |
| 函数有效行 | 80 | 120 |
| 圈复杂度 | 15 | 20 |
| 参数个数 | 8 | 8 |
| 嵌套深度 | 4 | 4 |
| 顶层依赖数 | 15 | 15 |

- 实现：`scripts/check_guardrails.mjs`，对照 `scripts/guardrail_baseline.json`。
- 已有旧债可暂留；**新违规或同一条债数值变大则失败**。baseline 只能下降，禁止扩大或增加豁免。
- `.vue` 有效行 = script + template + style 中的非注释代码行。
- 接近上限时先拆 types / utils / composable / 子组件，不要把逻辑继续堆进大 SFC。
- 不要用 `--write-baseline` 把新债写进去过关；只在复核后记录已下降的债务。

## 命令

```bash
npm install
npm run dev      # 启动开发服务器，端口 58150
npm run guardrails  # 复杂度门禁
npm run verify   # 复杂度门禁 + vue-tsc
npm run build    # vue-tsc 类型检查 + vite build → web/dist（gitignored）
```

## 注意点

- **构建配置只保留 `vite.config.ts`**（曾同时存在 `.js`/`.ts` 两份，已清理）。
- **改接口契约时**，前端 `src/api/` 与后端 `gateway/routers/` 要同步。
- **`web/dist`、`node_modules`、`package-lock.json`** 已 gitignore，不要提交。
- **游戏世界**相关代码在 `game/` 目录下，资产生成约定见 [`game/README.md`](game/README.md)。
- **移动端性能约定**：触屏设备（`hover: none` + `pointer: coarse`）自动降级——`main.css` 末尾的媒体查询会停掉无限装饰动画并关闭全部 backdrop-filter（磨砂用不透明底色补偿）；`AmbientBackground` 只画静态星野不跑动画循环。新增常驻动画/磨砂效果时必须纳入该门控。固定视口高度用 `.h-app-viewport` / `.min-h-app-viewport`（vh 回退 + dvh），**不要**用 `h-screen`/`100vh`，否则移动端地址栏会裁掉底部内容。
- **重依赖组件必须懒加载**：`@xterm`（RemoteControl/RemoteTerminalModal）、大体量面板（KnowledgeBasePanel/WorkshopPanel）均用 `defineAsyncComponent` 按需拆包，新增大依赖时同样处理。
