# Agent 系统

## 1. 模块定义

Agent 系统是整个产品的后台执行层。

它负责把用户交代的任务转成真正可执行的工作流，并在执行过程中维护状态、结果和审查节点。

## 2. 这个模块真正该管理什么

未来 Agent 系统的核心对象应该是：

- `Agent Identity`
  - 这个伙伴是谁
  - 有什么能力
  - 延续什么记忆
- `Task`
  - 用户这次要它做什么
- `Execution Run`
  - 这次任务具体怎么推进
- `Review Request`
  - 哪些地方需要用户拍板
- `Result Package`
  - 最终交付给用户什么

## 3. 当前系统可以复用什么

当前仓库里已有的数据结构并不需要推翻，可以映射到新模型：

- `thread` 继续代表一条工作线
- `task` 继续代表子任务
- `session` 继续代表 runtime 执行上下文
- `event` 继续代表关键生命周期事件
- `board` 继续代表共享工作记忆视图

这意味着：

- 现有 AgentHub 不是方向错了
- 只是前台产品形态还没切换过来

## 4. 从 chat-first 到 task-first

Agent 系统当前更偏：

- chat-first
- thread-first

未来需要切到：

- task-first
- state-first
- review-first

也就是说，用户最常看到的不是消息列表，而是：

- 当前任务
- 当前进度
- 当前阻塞
- 当前待确认事项
- 当前产物

## 5. 执行状态机

第一版建议把任务执行收敛成有限状态：

1. `queued`
2. `running`
3. `needs-review`
4. `needs-approval`
5. `blocked`
6. `done`
7. `cancelled`

这样前台 companion 和后台 console 才能共享同一套语义。

## 6. Approval / Review

未来产品里，用户最频繁做的动作应该不是“继续聊天”，而是：

- 批准
- 拒绝
- 补充上下文
- 调整方向
- 接受结果

所以 Agent 系统必须把：

- `review`
- `approval`
- `handoff`
- `result`

做成一等对象，而不是消息文本里的隐含语义。

## 7. 当前缺口

这个模块现在最大的问题不是基础不存在，而是产品抽象还没完全升级：

- 还缺一套明确的任务状态机
- 还缺 review / approval 第一公民化
- 还缺结果包和审查面板
- 还缺对外的 companion-first 暴露方式

## 8. MVP 边界

第一版 Agent 系统不必做：

- 全自动自治团队
- 复杂多级审批流
- 多租户权限体系

第一版必须做：

- 任务创建
- 任务状态可见
- review / approval 节点
- 结果交付
- 结果进入记忆
