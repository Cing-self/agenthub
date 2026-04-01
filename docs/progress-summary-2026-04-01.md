# AgentHub 进度总结（2026-04-01）

这份文档总结当前 `codex/dialog-memory-design` 分支的主要成果、已跑通链路、剩余边界，以及下一阶段最值得继续推进的方向。

## 一句话现状

AgentHub 已经从一个偏“管理壳”的桌面原型，推进到一个可以演示的多 Agent 工作台：

- 有线程（thread）
- 有主 Agent（primary agent）
- 有 runtime 抽象层
- 有自动写入 Memos 的记忆中间件
- 有 `dolphin` 这条独立 Agent 线
- 有 CodePilot 风格的生成式 UI

但外围产品层还没有完全闭环，尤其是 `Messages / Cron / Remote Control / Task Action Flow` 这些区域。

---

## 本轮完成了什么

## 1. Work / Chat 主线

`Work > Chat` 现在已经是整套产品中最完整的一条主线。

### 已实现

- 线程级对话
- 每条线程有 `primary_agent_id`
- 顶部切换 Agent 时，同时更新该线程的主 Agent
- 线程切回来时，默认回到该主 Agent
- 聊天记录从协作事件中恢复，不会因为切到 `Config` 再回来就丢失
- 顶部控制条固定，不跟消息列表一起滚动
- 输入框支持 Markdown 预览

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/stores/collaboration-store.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/types/collaboration.ts`

---

## 2. Runtime 抽象层

已经从“聊天页直接分支调用具体 CLI”，重构为统一 runtime 层。

### 已实现

- `RuntimeAdapter` 抽象
- `runtime_family`
- runtime capability flags
- 统一 `sendMessage()` 出口

### 当前 runtime

- `openclaw`
- `claude-code`
- `codex`
- `opencode`

### 当前意义

这一步的价值不是“功能立刻暴涨”，而是后面要接：

- Claude Code SDK
- OpenClaw native session
- memory tool
- generative UI

这些能力时，不需要再拆聊天页。

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/runtime/types.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/runtime/index.ts`

---

## 3. `dolphin` 独立 Agent

`dolphin` 已经不再只是一个“Claude Code”文字替身，而是一个独立 Agent 实例。

### 已实现

- 作为自定义 Agent 被检测和展示
- 可独立出现在 Agent 列表和聊天页切换器
- 具有自己的 runtime profile
- 当前底层执行仍挂在 Claude runtime family 上

### 当前边界

它现在已经是**产品层独立 Agent**，但还没有完全发展成完整的 `Runtime Auth` 产品配置体验。

也就是说，底层能力已经能跑：

- `runtime_family = claude-code`
- `auth_source = claude-subscription`

但界面上还没有一块很清晰的 “Runtime / Auth / Model” 组合配置面板。

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/health.rs`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/types/agents.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/instance-tabs/OverviewTab.tsx`

---

## 4. Claude Runtime + 流式输出

这一轮里，`dolphin` 这条 Claude runtime 已经支持真正的流式输出。

### 已实现

- Node 脚本基于 `@anthropic-ai/claude-agent-sdk`
- 支持 `includePartialMessages`
- 输出 partial / final 事件
- Rust 逐行读 stdout
- 前端实时更新 assistant 占位消息

### 实际效果

在聊天页里不再是“等整段回来再一下子显示”，而是：

- partial 文本不断流出
- 最终消息收口为正式内容

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/claude-runtime.mjs`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/cli.rs`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx`

---

## 5. Memory 中间件接入

当前记忆系统的产品边界已经比较清楚：

- AgentHub 不做记忆智能提炼
- Memos 作为 memory middleware
- AgentHub 负责写入与读取编排

### 已实现

- `Memory` 页配置 provider
- 聊天消息自动写入 Memos 兼容后端
- `Memory` 页支持浏览和配置

### 当前结论

现在已经是：

- `聊天 = 自动写入记忆中间件`
- `AgentHub = orchestration shell`
- `Memos = memory backend`

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/memory.rs`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/stores/memory-store.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/MemoryPage.tsx`

---

## 6. 生成式 UI

这是本轮最重要的一条新能力。

### 当前实现目标

参考 CodePilot 的核心模式：

- 模型自主判断是否需要 UI
- 输出 `show-widget`
- 前端解析 fenced block
- 在 sandbox iframe 中渲染

### 已实现

- `show-widget` fenced block 解析
- 兼容 CodePilot 风格的最小 JSON：

```json
{
  "title": "demo",
  "widget_code": "<div>Hello</div>"
}
```

- sandbox iframe receiver
- 主题同步
- 高度同步
- 错误兜底
- partial widget 预览
- final widget finalize

### 当前协议

内部仍然会归一成 `MessageBlock[]`，但主路径已经偏向 CodePilot 风格的自由 widget。

### 仍保留的兼容能力

- `weather_card`
- `memory_card`
- `task_board_card`
- `sandbox_widget`

### 当前结论

生成式 UI 已经“跑通”，但目前只在 `dolphin` 这条 runtime 上作为主能力启用。

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/chat/message-blocks.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/components/chat/MessageBlocksRenderer.tsx`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/types/chat.ts`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/claude-runtime.mjs`

---

## 7. CLI Market

CLI 页面已不再只是几个固定 runtime 状态，而是开始朝市场方向演化。

### 已实现

- `CLI Market` 页面
- 内置 registry
- 搜索
- 安装状态探测
- 一键安装 / 升级
- 复制安装命令
- 官方文档入口

### 当前边界

还不是完整市场：

- 没有社区 registry
- 没有自定义 registry
- 没有安装信任流程
- 没有发布入口

### 关键文件

- `/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/CliPage.tsx`
- `/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/cli-market.ts`

---

## 8. 文档

已经补上项目级 README，并提供中英文入口：

- `/Users/dolphin/Desktop/Dolphin/agenthub/README.md`
- `/Users/dolphin/Desktop/Dolphin/agenthub/docs/README.zh-CN.md`

---

## 生成式 UI：实际验证情况

这一轮我做了以下验证：

## 编译与运行检查

- `npx tsc --noEmit`
- `cargo check`

两者通过。

## Claude runtime 脚本级真实调用

我直接用 `node src-tauri/scripts/claude-runtime.mjs` 做了真实输入，确认：

- 普通问答可以保持纯 Markdown
- 天气问题会自主输出 `show-widget`
- 天气趋势请求会自主输出自由 widget
- 线程概览会自主输出 widget
- 长期记忆回忆会自主输出 widget

## parser 验证

额外验证了两件事：

- 闭合 `show-widget` 能正确解析
- 未闭合 `show-widget` 能先生成 partial widget block

这意味着：

- 流式中途已经可以开始渲染 widget 雏形
- 不需要等 fenced block 完整闭合才看到 UI

## 浏览器级验证说明

尝试直接用浏览器打开 `http://127.0.0.1:1420/work/chat` 做前端验收时，发现纯浏览器环境无法直接跑通，因为页面依赖 Tauri `invoke` 能力。

这不是生成式 UI 本身的问题，而是：

- 浏览器 dev server 不带 Tauri API bridge
- 所以 `detect agents / load threads` 等调用会失败

因此本轮对生成式 UI 的有效验收，主要以：

- runtime 脚本真实执行
- parser 验证
- 桌面开发版重启成功

为准。

---

## 还没做完的部分

下面这些还是明显未完成项：

## Work 外围

- `Work > Messages` 仍是占位页
- `Work > Cron` 仍是占位页
- `Work > Tasks` 主要是展示，不是完整任务执行闭环

## Remote

- `Remote Hosts` 更偏扫描与发现
- 还不是完整远端控制面
- 缺少启动、停止、日志、接管等能力

## Runtime 产品化

- `dolphin` 底层可用，但 `Runtime Auth` 体验没产品化
- 还没有完整的 “Runtime / Auth / Model” 配置区

## 生成式 UI rollout

- 当前主要只在 `dolphin` 上跑通
- 其他 runtime 尚未统一接入这套能力

## 生成式 UI 上下文能力

虽然 widget 路径已跑通，但某些场景仍然不一定自然转成 UI，比如：

- GitHub 项目分析
- repo key metrics
- 架构摘要

根本原因不是 widget 渲染不行，而是这类问题缺少稳定的结构化工具层。

例如：

- 没有 `repo_overview`
- 没有 `repo_stats`
- 没有 `repo_activity`

所以模型在“没有可靠结构化数据源”的情况下会更保守，倾向退回文本。

---

## 当前最推荐的下一阶段

如果继续往前推进，我建议优先级如下：

1. `Runtime Auth` 配置化
2. `Tasks` 从只读展示升级成可操作流
3. `Remote Hosts` 从扫描页升级成控制面
4. 给生成式 UI 补更通用的结构化工具层
   - repo summary
   - repo stats
   - task analytics
   - memory summary
5. 再考虑把 `show-widget` 能力推广到更多 runtime

---

## 当前发布判断

如果按“能不能演示”来判断：

### 可以演示

- `dolphin` 对话
- 流式输出
- 自动写入 Memos
- CodePilot 风格生成式 UI
- CLI Market 第一版
- Thread / primary agent / collaboration 基础链路

### 不建议当成完成品演示

- Messages
- Cron
- Remote 控制
- 完整任务编排
- 全 runtime 统一生成式 UI

---

## 总结

当前 AgentHub 的主线已经不再是空壳，而是到了“可以对外演示核心方向”的阶段。

尤其是这三条已经基本成立：

- `多 Agent 工作台`
- `Memos 作为 memory middleware`
- `CodePilot 风格的自主生成式 UI`

剩下的主要工作，已经不是“证明想法可行”，而是把外围工作台能力补成真正的产品闭环。
