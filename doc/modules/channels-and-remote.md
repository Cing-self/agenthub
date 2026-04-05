# Channels 与 Remote

## 1. 模块定义

这层解决的是“用户从哪里进入 Agent”。

它包括：

- 桌面 companion
- iOS
- Feishu
- Web fallback
- Remote bridge
- 语音
- 视频
- 文档 / 文件输入

## 2. 核心判断

这些都只是入口。

它们不应该各自长成独立产品，而应该统一服务同一个 Agent 核心、任务系统和记忆系统。

## 3. Gateway 与 Remote Control 必须分开

这条判断已经成立，而且要继续坚持。

### Gateway

解决：

- 外部入口如何找到 Agent
- 外部消息如何进入 Agent
- 外部结果如何回给用户

### Remote Control

解决：

- 用户如何远程驱动自己本地的 Agent 系统
- 如何查看状态
- 如何确认或审批
- 如何查看结果和日志

这两层不能混成一个概念。

## 4. 多模态只是输入方式

文字、语音、视频、文档，本质上都应该转成：

- 一个任务
- 一组上下文
- 一组约束
- 一组确认条件

所以未来不该再分别讨论：

- 文本产品
- 语音产品
- 视频产品

而应该讨论：

- 任务入口支持哪些输入模态

## 5. 关于本地 host 与云控制

当前仓库已经验证了：

- 本地 host 可以承接很多能力
- remote bridge / relay 方向成立

但长期要坚持一条原则：

- 如果某个入口只是为了交代任务，不一定必须穿过本地 host
- 如果某个入口要操作本地文件、终端、代码库，那就需要本地 host

所以本地 AgentHub 更适合扮演：

- tool host
- local executor
- workspace bridge

而不是所有入口的唯一前提。

## 6. 当前状态

### 已经成立

- Feishu gateway 第一条完整外部入口
- Remote bridge 第一版
- relay 控制面第一版
- iOS 原生壳和移动 Web 验证路径

### 还没成立

- 统一入口体验
- 统一 inbox / 消息汇总
- voice / video 对 task-first 流程的统一接入
- 完整 remote control 动作面

## 7. 当前优先级

这层下一步不应该再盲目扩入口数量。

更重要的是：

1. 让现有入口都能统一进入任务系统
2. 让 review / approval / result 能在各入口上成立
3. 让 iOS 和 Companion 成为真正前台

更多 channel 应该后置。
