# AgentHub

AgentHub 正在从一个偏重的桌面控制台，收敛成一个 `companion-first` 的 Agent 产品：

- 前台是一个极简、常驻、带陪伴感的桌面入口
- 后台是任务执行、记忆、工具调用和配置控制系统
- 大窗口 Console 只在配置、调试、深度审查时出现

当前仓库里的桌面 App 仍然是主要工作台，但它不再是未来面向普通用户的最终形态。

## 文档入口

新的产品文档统一放在根目录 [doc/README.md](./doc/README.md)。

建议阅读顺序：

1. [产品定义](./doc/product.md)
2. [当前状态](./doc/status.md)
3. [总体架构](./doc/architecture.md)
4. [路线图](./doc/roadmap.md)

模块文档：

- [Companion 前台](./doc/modules/companion.md)
- [Agent 系统](./doc/modules/agent-system.md)
- [记忆系统](./doc/modules/memory.md)
- [Channels 与 Remote](./doc/modules/channels-and-remote.md)
- [Console 后台](./doc/modules/console.md)

## 当前产品判断

现在最重要的产品主线不是“聊天”，而是：

1. 用户交代任务
2. Agent 持续执行
3. 用户只在需要决策、审查或确认时被唤起
4. 结果、过程和经验被沉淀为记忆

文字、语音、文档、视频都只是任务入口，不应该各自长成一套独立产品。

## 仓库结构

```text
doc/                     产品文档和模块文档
src/                     React 桌面前端
src-tauri/               Tauri 后端和 runtime bridge
ios-app/                 原生 iOS App
relay/                   Relay / control plane
web-control/             轻量远程 Web 验证入口
```

## 本地运行

前置依赖：

- Node.js 20+
- Rust toolchain
- macOS 下的 Tauri 运行依赖

安装依赖：

```bash
npm install
```

启动桌面开发版：

```bash
npm run tauri dev
```

前端类型检查：

```bash
npx tsc --noEmit
```

检查 Tauri 后端：

```bash
cd src-tauri
cargo check
```

## 当前代码现实

仓库里已经有这些真实能力：

- 线程式 Chat / Task / Collaboration 基线
- 多 runtime 抽象和 `dolphin` 流式输出
- Feishu gateway 首条完整外部入口
- Remote bridge / relay / iOS 原生壳
- 本地语音与 realtime voice 的实验性纵切

但未来对普通用户可见的主产品，应该是一个极轻的桌面 companion，而不是今天这个重控制台。
