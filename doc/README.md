# AgentHub 文档

这是 AgentHub 当前唯一的产品文档入口。

这套文档替换了旧的 `docs/` 目录，目标是把产品重新收敛到一条清晰主线：

- 前台是一个常驻桌面的陪伴式 companion
- 后台是任务执行、记忆、工具调用和配置系统
- Console 是后台操作台，不是用户日常主界面

## 建议阅读顺序

1. [产品定义](./product.md)
2. [当前状态](./status.md)
3. [总体架构](./architecture.md)
4. [路线图](./roadmap.md)

## 模块文档

- [模块索引](./modules/README.md)
- [Companion 前台](./modules/companion.md)
- [Agent 系统](./modules/agent-system.md)
- [记忆系统](./modules/memory.md)
- [Channels 与 Remote](./modules/channels-and-remote.md)
- [Console 后台](./modules/console.md)

## 这套文档回答什么

这套文档统一回答 5 个问题：

1. AgentHub 最终想变成什么
2. 当前已经做成了什么
3. 哪些能力只是半成品
4. 哪些事情明确不是当前优先级
5. 接下来一段时间应该收敛哪条主线

## 这套文档的阅读层次

### 第一层：方向

- [产品定义](./product.md)

解决“这个产品最终是什么”。

### 第二层：盘点

- [当前状态](./status.md)

解决“之前做了什么、现在在做什么、之后要做什么”。

### 第三层：执行

- [路线图](./roadmap.md)

解决“按什么顺序做、每阶段要勾掉哪些项”。

### 第四层：模块

- [模块索引](./modules/README.md)

解决“每个模块到底负责什么、边界在哪里”。

## 一句话结论

AgentHub 不该继续长成一个越来越重的大聊天软件。

它应该收敛成：

- 一个极简、温暖、可陪伴的前台入口
- 一个稳定、可执行、可记忆的后台 Agent 系统
- 一个默认隐藏、只在高级场景才进入的 Console
