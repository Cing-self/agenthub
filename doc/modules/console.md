# Console 后台

## 1. 模块定义

现在仓库里的桌面 App，本质上已经是一个很强的后台 Console。

它适合：

- 配置
- 调试
- 深度审查
- 运维

它不适合继续作为普通用户的长期主界面。

## 2. Console 的正确定位

未来 Console 应该被明确定位为：

- `Operator Console`
- `Power User Console`
- `Debug Console`

而不是面向所有人的默认前台。

## 3. 什么应该留在 Console

这些模块都适合继续留在 Console：

- Models
- Secrets
- MCP Servers
- Skills
- Runtime / Agent instance 配置
- Remote Hosts
- Channels 配置
- Memory provider 配置
- Usage / Token / Prompt / Diagnostics
- 深度 Collaboration 视图

## 4. 什么不该继续留在主前台

普通用户日常交互不应该默认暴露：

- 一堆模型配置
- Secret 和 API key
- MCP 管理
- 详细日志
- 复杂的 thread / board 编辑
- 重量级聊天历史

这些能力仍然需要，但应该藏在后台。

## 5. Console 与 Companion 的关系

两者不是互斥，而是分层：

- Companion 负责高频、轻量、任务导向、陪伴式交互
- Console 负责低频、重量级、配置和审查

未来合理关系应该是：

- 大多数用户大多数时间只看到 Companion
- 只有少数场景才进入 Console

## 6. 当前问题

当前产品最大的问题之一，就是：

- Console 已经很强
- Companion 还不存在

所以用户现在只能直接面对一个偏重的后台系统。

这不是系统能力不足，而是产品暴露层次还没分开。

## 7. 下一步

Console 这层接下来最重要的不是继续横向加页，而是：

1. 明确哪些页面是后台保留能力
2. 把普通用户高频动作移到 Companion
3. 把 review / approval / result 抽成薄层
4. 让 Console 更像后台操作台，而不是唯一主界面
