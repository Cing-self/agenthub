# 平台整体规划

最后更新：`2026-04-03`

这份文档用于统一记录当前这个本地优先 Agent 平台的产品方向、架构分层、已完成事项、未完成事项，以及接下来的执行顺序。

它解决 5 个问题：

- 这个项目最终想变成什么
- 现在已经做到了什么
- 哪些能力是半成品但已经能用
- 哪些事情明确后置，不是当前优先级
- 接下来应该先做什么、后做什么

当前仓库名和桌面显示名 `AgentHub` 仍然是过渡态。项目方向已经不再只是一个桌面聊天产品，而是在往一个本地优先、多入口、可远程控制、带原生移动端的 Agent 平台发展。

## 1. 总体目标

### 1.1 核心判断

长期目标不是“做一个更好看的桌面聊天框”，而是做一个：

- 本地优先
- 多入口
- 单 Agent 身份
- 支持网关和远程控制
- 最终有原生移动端承载

的 Agent 平台。

### 1.2 产品原则

1. 同一个 Agent，可以从多个入口进入  
   飞书、桌面聊天、手机、语音、以后的视频/电话，本质上都应该是在触达同一个 Agent，而不是每个入口都造一个新的人。

2. 本地机器仍然是主执行环境  
   代码、文件、终端、本地工具链、本地上下文，都尽量留在本机执行。

3. 优先复用现有 runtime 能力  
   尤其是 memory、session、runtime 这几层，尽量复用 Claude / Claude Code 现成能力，而不是在平台层重新造一套并行核心。

4. Gateway 和 Remote Control 分层  
   `Gateway` 解决“别人怎么找到这个 Agent”。  
   `Remote Control` 解决“我怎么从别的设备远程操控本地这台机器上的 Agent”。

5. 移动端最终走原生  
   语音、定位、日历、提醒事项、视频/电话、系统级入口，这些都更适合放到原生 iOS App，而不是长期停留在移动网页。

## 2. 目标架构

### 2.1 主要分层

#### Agent Identity

这是“这个人是谁”的层。

应负责：

- persona / prompt
- tool profile
- runtime 选择
- session 归属
- 未来的 memory 归属

#### Runtime Host

这是 Agent 实际执行的地方。

当前重点：

- 本地机器 runtime
- Claude / Claude Code 系 runtime
- CLI 驱动执行

#### Gateway

这是外部入口接入层。

当前或未来入口包括：

- 桌面聊天
- 飞书
- Web 远程聊天
- iOS 原生 App
- 原生语音
- 未来的 Discord / Telegram / QQ 等

它应负责：

- 消息收和发
- mention / group policy
- thread session policy
- transport 自己的 streaming 策略
- 外部会话和 runtime session 的映射

#### Remote Bridge / Control Plane

这是本地机器暴露给别的设备的控制层。

它不等于 gateway。

它应负责：

- 远程线程列表
- 远程线程详情
- 远程发消息
- 本地 runtime 健康状态
- 后续任务控制
- 后续权限确认
- 后续日志和活动流

#### Native Mobile App

未来移动端主入口，承担：

- 聊天
- 语音入口
- 远程控制
- 设备原生能力，如日历、定位等

## 3. 当前已经完成的部分

### 3.1 桌面端基础工作台

状态：`可用`

已完成：

- Tauri 桌面壳
- React/Vite 工作台
- 线程式聊天
- Work / Config 双工作面
- models / secrets / skills / MCP / memory / remote hosts 等配置页
- 桌面窗口和侧边栏视觉收敛

相关文件：

- [README.md](/Users/dolphin/Desktop/Dolphin/agenthub/README.md)
- [src/App.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/App.tsx)
- [src/components/layout/Sidebar.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/components/layout/Sidebar.tsx)
- [src/pages/work/ChatPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx)

### 3.2 飞书网关

状态：`第一条完整打通的外部入口`

已完成：

- 飞书渠道接入弹窗与配置流
- App ID / Secret 验证
- Agent 绑定
- 群聊 / mention 策略
- Card Kit 能力探测
- 长驻 gateway worker
- 飞书消息 -> 本地 runtime -> 飞书回复 的闭环

说明：

飞书已经不只是一个“配置页”，而是第一条真正跑通的 Gateway 路径。后续别的 IM 平台应该参考这条链路抽象，而不是重新瞎拼。

相关文件：

- [src/pages/ChannelsPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/ChannelsPage.tsx)
- [src/lib/types/channels.ts](/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/types/channels.ts)
- [src-tauri/src/commands/channels.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/channels.rs)
- [src-tauri/scripts/gateway-worker.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/gateway-worker.mjs)

### 3.3 桌面端语音原型

状态：`原型可用`

已完成：

- 麦克风权限请求
- 录音电平反馈
- 语音转文字路径
- 原始录音片段持久化
- 聊天里显示音频消息气泡

说明：

这条线目前更像“桌面原型验证”，不是最终的移动端语音形态。长期语音入口应该转向原生 iOS。

相关文件：

- [src/hooks/useSpeechTranscription.ts](/Users/dolphin/Desktop/Dolphin/agenthub/src/hooks/useSpeechTranscription.ts)
- [src/pages/work/ChatPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx)
- [src-tauri/src/commands/cli.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/cli.rs)

### 3.4 Remote Bridge

状态：`第一版可用`

已完成：

- 本地 bridge worker
- `health`
- `threads`
- `thread detail`
- `turn`
- 桌面端 Remote Hosts 管理页

相关文件：

- [src-tauri/src/commands/remote.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/remote.rs)
- [src-tauri/scripts/remote-bridge-worker.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/remote-bridge-worker.mjs)
- [src/pages/RemoteHostsPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/RemoteHostsPage.tsx)

### 3.5 移动 Web 远程聊天

状态：`验证型工具完成，不是长期主方向`

已完成：

- 轻量远程 Web 客户端
- 移动优先的聊天界面收敛
- 桌面端二维码分享流
- Cloudflare 方式的对外入口验证

说明：

这条线仍然有价值，但更像验证桥接体验和做临时 fallback，不是未来移动端主产品。

相关文件：

- [web-control/index.html](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/index.html)
- [web-control/styles.css](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/styles.css)
- [web-control/app.js](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/app.js)
- [web-control/server.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/server.mjs)

### 3.6 原生 iOS App 骨架

状态：`MVP 壳子已完成，并已验证可编译`

已完成：

- 真正的 Xcode 工程已进仓库
- SwiftUI 原生聊天壳
- 左侧历史抽屉
- 本地 bridge 连接页
- bridge API client
- 本地配置持久化
- iOS 基础 Info.plist
- 已用 `xcodebuild` 验证通过

说明：

这不是一个 WebView 包壳，而是原生 SwiftUI 第一版。  
目前仍是聊天 MVP，不是最终形态。

相关文件：

- [ios-app/LobsterMobile.xcodeproj](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/LobsterMobile.xcodeproj)
- [ios-app/Sources/App/LobsterMobileApp.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/App/LobsterMobileApp.swift)
- [ios-app/Sources/Features/Chat/RootChatView.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/RootChatView.swift)
- [ios-app/Sources/Features/Chat/HistoryDrawerView.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/HistoryDrawerView.swift)
- [ios-app/Sources/Features/Chat/ConnectionSheet.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/ConnectionSheet.swift)
- [ios-app/Sources/Services/BridgeClient.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Services/BridgeClient.swift)
- [ios-app/README.md](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/README.md)

## 4. 当前哪些算“已经做完”

以下能力在当前阶段可以视为“已完成到可继续迭代”：

### 平台基础

- 桌面工作台
- 本地 runtime 接入基线
- 线程式聊天
- remote bridge
- 移动 Web 验证路径

### 第一条 Gateway

- 飞书这条完整外部入口
- 从外部消息进入本地 runtime 再回到外部的完整链路

### 第一版原生移动端

- 原生 iOS 工程
- 原生聊天壳
- 可编译、可继续演进的基础工程

## 5. 哪些是半成品但已经能用

### 飞书

- 已打通
- 但还不是最终抽象形态
- 后面仍需逐步清理和硬化

### 桌面语音

- 原型可用
- 但不是最终语音方案

### Remote Control

- 现在更像“远程聊天 + 基础桥接”
- 还不是完整控制面

### 移动 Web

- 能用
- 但不是战略终局

### 原生 iOS

- 第一版壳子有了
- 但还没有原生语音、控制动作和产品级细节

## 6. 当前明确后置的事情

这些不是不做，而是现在不优先。

### 额外 IM 平台

例如：

- Discord
- Telegram
- QQ
- 更完整的微信侧能力

原因：

先把一条 Gateway 路打透，比同时接很多平台更重要。

### 更复杂的白名单 / 黑名单 / 多账号管理

原因：

这些有价值，但不是验证整体平台方向的关键阻塞。

### 飞书所有流式细节打磨到极致

原因：

飞书已经足够支撑 Gateway 路径验证。短期更高价值的是原生 iOS 和语音入口。

### 最终品牌命名

原因：

当前命名仍在过渡态，不应该让最终品牌决定工程优先级。

## 7. 已经做出的关键架构决定

### 7.1 Gateway 和 Remote Control 必须分开

现在已经明确：

- `Gateway`：别人怎么找到这个 Agent
- `Remote Control`：我怎么远程操控本地运行中的 Agent

二者不能混成一层。

### 7.2 Agent Identity 不等于 Channel Identity

同一个 Agent 应该可以被多个入口触达。

Channel 只应该定义：

- transport
- policy
- 外部会话映射

而不应该定义“这个 Agent 是谁”。

### 7.3 Session / Memory 优先复用 runtime 能力

平台层尽量只做：

- 外部会话到 runtime session 的映射
- transport 策略
- control plane

而不在平台层重建一套完整 memory / session 核心。

### 7.4 移动端的长期方向已经转向原生 iOS

移动 Web 会保留，但主要作为：

- 验证工具
- fallback 入口

真正需要长期发展的移动端能力应放在原生 iOS 上：

- 语音
- 通知
- 定位
- 日历 / 提醒事项
- 未来电话 / 视频壳

## 8. 还差什么

### 8.1 第一优先级：iOS 原生语音入口

目标：

- 在 iOS App 里做原生录音入口
- 把语音输入送入同一个本地 Agent
- 不再长期依赖桌面语音原型

大致包含：

- 麦克风权限
- 录音 UI
- 波形 / 电平反馈
- 第一版先走：
  - 语音 -> 转文字 -> remote bridge turn
- 后续再评估：
  - 原始音频消息语义

### 8.2 第二优先级：Remote Control 真正成形

目标：

从“远程发消息”升级到“远程控制本地 Agent”。

下一批能力应包括：

- 查看当前线程 / 当前任务
- 停止任务
- 查看日志
- 后续做权限确认

### 8.3 第三优先级：iOS 原生设备能力

建议顺序：

- 推送
- 快捷入口 / 系统触发
- 日历
- 提醒事项
- 定位

重要原则：

高风险写操作必须有确认机制。

### 8.4 第四优先级：更强的控制平面

后续要继续判断：

- 是否引入 Cloudflare Worker / Durable Object 做更正式的控制平面
- 移动 App 和 Web fallback 是否都走云控制层
- 如何做设备注册、权限和安全模型

这部分不应该先于原生 iOS 语音和基础 remote control。

## 9. 接下来的实际执行顺序

明确顺序如下：

1. iOS 原生语音入口
2. iOS 原生聊天体验继续收口
3. Remote Control 从聊天升级到控制动作
4. iOS 原生设备能力接入
5. 如有必要，再加强云控制面
6. 最后再扩别的 IM 平台

## 10. 下一阶段的验收标准

下一阶段完成时，应至少满足：

- iOS App 能稳定连接本地 bridge
- iOS App 能浏览历史、发送文字消息
- iOS App 能原生录音
- 语音能进入同一个本地 Agent 工作流
- iOS App 不只会聊天，还能执行至少一个 remote control 动作

## 11. 一句话状态总结

如果只看最短结论：

- 平台基础已经成立
- 飞书已经是第一条真正可用的 Gateway
- Remote Bridge 已经有了
- Web 远程入口已经验证过
- 原生 iOS 壳子已经存在并能编译
- 下一步最重要的是：`原生 iOS 语音 + Remote Control`
