# AgentHub 当前状态

更新时间：`2026-04-06`

## 1. 一句话现状

AgentHub 已经长出了一个很强的后台控制台和多条实验性入口，但还没有收敛成一个清晰的前台产品。

今天最接近成品的是：

- 桌面 Console 基线
- Feishu gateway
- 本地 runtime 抽象
- Thread / Board / Task / Session 这套协作数据模型

今天最不完整的是：

- 面向普通用户的前台 companion
- task-first 的异步工作流
- 围绕任务的记忆闭环

## 2. 先看总表

| 模块 | 当前状态 | 完成度判断 | 说明 |
| --- | --- | --- | --- |
| 桌面 Console | 已上线可用 | 高 | 这是当前最完整的产品面，但它更像后台操作台 |
| Chat / Thread 基线 | 已上线可用 | 高 | 对话、线程、基础状态已经成立 |
| Collaboration | 半成品可用 | 中 | 数据模型很完整，但 orchestration 还弱 |
| Runtime 抽象 | 已成立 | 中高 | 底座成立，但跨 runtime 能力不一致 |
| Feishu gateway | 已打通 | 高 | 目前最像完整外部入口的模块 |
| Remote bridge / relay | 第一版可用 | 中 | 验证成功，但还不是完整 control plane |
| iOS 原生壳 | 第一版可用 | 中 | Companion app 雏形有了，但不是最终前台 |
| Voice | 实验线 | 中低 | 纵切打通，但不是主线产品 |
| Video | 未真正开始 | 低 | 只有规划和少量脚手架 |
| Memory | 半成品 | 中低 | 有 provider 接入，但没有完整产品机制 |
| Messages 聚合 | 基本未做 | 低 | 页面还是占位 |
| Cron / Automation | 第一版可用 | 中低 | 能用，但还不够可靠 |
| Prompt / Usage / 观测 | 半成品 | 中低 | 一部分是 preview，一部分是账户级粗视图 |
| Companion 前台 | 未开始 | 低 | 这是当前最大产品空白 |

## 3. 我们之前已经做了什么

下面这些能力可以视为“已经做出来了”，只是成熟度不同。

### 3.1 已完成清单

- [x] `Work / Config` 双工作面
- [x] 线程式聊天
- [x] 基础 Task / Board / Session / Event 数据模型
- [x] 多 runtime 抽象层
- [x] `dolphin` 流式输出主链路
- [x] Models / MCP / Skills / Secrets / Memory / Remote Hosts / CLI Market 页面
- [x] Feishu 第一条完整 gateway 路径
- [x] Remote bridge 第一版
- [x] relay 第一版控制面
- [x] iOS 原生聊天壳和配对路径
- [x] 语音 realtime 实验纵切

### 3.2 已完成模块说明

#### 桌面 Console 基线

已经有：

- `Work / Config` 双工作面
- 线程式聊天
- Task / Collaboration 基线
- Models / MCP / Skills / Secrets / Memory / Remote Hosts / CLI Market 等页面

结论：

- 后台操作台已经成立
- 但它不是未来普通用户的主入口

#### Runtime 抽象

已经有：

- runtime 抽象层
- 多 runtime 接入
- `dolphin` 流式输出主链路

结论：

- 后台执行能力有基线
- 但跨 runtime 的能力一致性还不够

#### Feishu gateway

已经有：

- 外部消息接入
- 路由到本地 runtime
- 外部回复回传

结论：

- 这是当前最完整的一条外部入口
- 已经足够证明 gateway 方向成立

#### Remote bridge / relay / iOS 壳

已经有：

- 本地 bridge
- relay control plane 第一版
- iOS 原生聊天壳
- paired hosts / session 选择

结论：

- 远程访问和移动入口已完成第一阶段验证
- 但还不等于完整移动产品

#### 语音实验纵切

已经有：

- 本地 voice bridge
- realtime provider session
- iPhone 发起 audio call
- transcript / reply 写回线程

结论：

- 语音能力已证明可打通
- 但它仍是实验线，不是当前产品主线

## 4. 我们现在实际上在做什么

从产品方向上看，当前真正在做的不是“再加一个能力页”，而是在完成一次产品重定义：

- 从 `console-first`
- 转向 `companion-first`

### 4.1 当前正在收敛的核心问题

- [x] 明确前台不是大聊天窗口
- [x] 明确 AgentHub Console 是后台操作台
- [x] 明确产品主线是“交代任务 -> 后台执行 -> 需要时唤起 -> 用户审查 -> 结果沉淀”
- [ ] 把记忆从 provider 接入升级成真正的产品机制
- [ ] 把任务执行从 chat-first 升级成 task-first
- [ ] 做出真正的 Companion 前台

### 4.2 当前正在收敛但还没落地的模块

| 模块 | 现在处于什么状态 | 主要问题 |
| --- | --- | --- |
| Collaboration | 模型已完成，工作流未完成 | 更像人工维护板，不像自动协作系统 |
| Memory | 有底座，无机制 | 还没有提炼、升级、过期、修正规则 |
| Voice | 有实验线，无产品位 | 它还没服务主任务链 |
| Remote | 有桥，无完整控制面 | 缺 review / approval / stop / status 等完整动作 |
| iOS | 有 companion app 雏形 | 但还不是主前台，也不是 review-first |

## 5. 之后要做什么

如果按新的产品目标，接下来真正要做的不是平铺能力，而是收敛主线。

### 5.1 最高优先级

- [ ] Companion 前台
- [ ] Review Sheet
- [ ] task-first 执行状态机
- [ ] 记忆机制第一版

### 5.2 第二优先级

- [ ] iOS 与 Companion 共用同一套任务状态
- [ ] remote control 从“聊天”升级到“控制”
- [ ] 多模态输入统一进入任务入口

### 5.3 明确后置

- [ ] 更多 channel adapter
- [ ] 完整社区 CLI 市场
- [ ] 完整视频形态
- [ ] 极致的 voice duplex 打磨
- [ ] 全量 Prompt / Usage 平台

## 6. 还没做成的关键空白

### 6.1 Companion 前台

这是当前最大的产品空白。

还没有：

- 常驻桌面 companion
- 快捷唤起的轻输入层
- review-first 的轻面板
- 需要确认时的前台弹出机制

### 6.2 task-first 异步工作流

还没有完全形成：

- 交代任务
- 后台持续推进
- 关键节点唤起用户
- 用户 review / confirm
- 任务结束并沉淀

今天更多还是：

- chat-first
- console-first

### 6.3 记忆闭环

还没有形成：

- 工作记忆
- 用户记忆
- 环境记忆
- 反思记忆

之间的稳定边界和提炼机制。

### 6.4 多模态统一任务入口

文字、语音、文档、视频这些入口还没有真正统一成一个任务模型。

今天更多是：

- 多条独立能力线

而不是：

- 一个统一任务入口

### 6.5 多渠道消息聚合

`Work > Messages` 还没有做成。

这意味着：

- 不同入口的统一 inbox / 流水线
- 统一审查和决策界面

都还缺失。

### 6.6 Prompt / Usage / 可观测性

当前这块也还不完整：

- Prompt Inspector 还是 preview
- per-request usage 还没有
- 运行时可观测性还偏运维视角

## 7. 当前 MVP 阻塞项

如果按新的产品定义，当前 MVP 真正的阻塞项只有这些：

1. Companion 前台不存在
2. task-first 异步交互还没成形
3. 记忆还没有成为产品中轴
4. review / approval / result 的轻交互还没成形

语音、视频、remote、channel 都重要，但它们都应该围绕这 4 件事收敛。
