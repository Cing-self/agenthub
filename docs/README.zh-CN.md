# AgentHub

[English README](../README.md)

AgentHub 是一个本地优先的桌面控制台，用来管理和协作多个 AI Agent。

它主要由三部分组成：

- `Work`：用于对话、任务线和 Agent 协作
- `Config`：用于模型、记忆、Skills、MCP、Secrets、CLI runtime 和 Agent 实例管理
- `Tauri` 后端：负责桥接本地 runtime，比如 OpenClaw、Claude 系 Agent、Codex 和其他 CLI 工具

这个仓库目前仍处于快速迭代阶段。聊天主线、记忆中间件接入、runtime 抽象层，以及第一版生成式 UI 已经可以使用；外围一些页面和能力还在继续补齐。

## 当前亮点

- 支持多 Agent 任务线，每条线程有一个 `primary agent`
- 已有统一的 runtime abstraction layer，用来接不同 Agent 后端
- `dolphin` 这条 Claude 系 runtime 已经支持流式输出
- 每轮对话会自动归档到兼容 Memos 的记忆后端
- 已接入 CodePilot 风格的 `show-widget` 生成式 UI
- 已有 models、MCP、skills、secrets、memory、remote hosts、CLI market 等配置页
- 桌面端基于 `React + Vite + Tauri`

## 技术栈

- 前端：`React 18`、`TypeScript`、`Vite`、`Tailwind`
- 桌面壳：`Tauri v2`
- 后端：`Rust`
- 状态管理：`Zustand`
- Claude runtime 集成：`@anthropic-ai/claude-agent-sdk`

## 仓库结构

```text
src/                     React 应用
  components/            UI 组件
  lib/                   runtime、聊天解析、共享类型
  pages/                 Work 和 Config 页面
  stores/                Zustand stores

src-tauri/               Tauri 后端
  src/commands/          Rust 命令处理
  scripts/               runtime bridge scripts
```

## 本地运行

### 前置依赖

- Node.js 20+
- Rust toolchain
- macOS 下的 Tauri 运行依赖

### 安装依赖

```bash
npm install
```

### 启动桌面开发版

```bash
npm run tauri dev
```

### 前端类型检查

```bash
npx tsc --noEmit
```

### 检查 Tauri 后端

```bash
cd src-tauri
cargo check
```

## 产品模型

### Work

`Work` 是主要工作台：

- `Chat`：围绕线程进行的 Agent 对话
- `Tasks`：当前线程对应的任务板视图

每条线程都有一个 `primary agent`。在聊天页切换当前 Agent 时，这条线程的负责人也会一起更新。

### Config

`Config` 用于管理围绕这些 Agent 的运行环境：

- dashboard
- models
- CLI market
- MCP servers
- skills
- secrets
- memory
- collaboration
- remote hosts
- agent instance settings

## Memory

AgentHub 当前把记忆视为一个外部中间件能力。

- 每轮聊天都会自动写入配置好的 Memos 兼容 provider
- AgentHub 自己不承担长期记忆智能提炼层
- `Memory` 页主要用于连接和查看这个 provider

## 生成式 UI

当前的生成式 UI 路径参考了 CodePilot：

- 是否需要 UI 由模型自己决定
- 模型可以输出 fenced `show-widget`
- 前端会解析这些 block，并在沙箱 iframe 中渲染

目前这条能力主要在 `dolphin` runtime 上跑通。

## 当前限制

下面这些区域还没有完全做完：

- `Work > Messages` 仍然是占位页
- `Work > Cron` 仍然是占位页
- `Remote Hosts` 现在更偏发现/扫描，不是完整远端控制面
- `CLI Market` 目前还是内置精选 registry，不是完整社区市场
- 生成式 UI 还没有推广到所有 runtime

## 备注

- 这个项目是 local-first 的
- 一部分配置和 runtime 状态会保存在 `~/.agenthub/`
- 当前开发分支里有不少关于 runtime adapters、memory orchestration、Claude 驱动 UI 的实验性能力
