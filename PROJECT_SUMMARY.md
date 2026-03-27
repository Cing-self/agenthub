# AgentHub — 项目总结

## 项目定位
通用 AI Agent 管理与协作桌面平台，支持管理本机上运行的多种 Agent 运行时及其共享资源。

## 技术栈
- **桌面框架**: Tauri 2 (Rust 后端)
- **前端**: React 18 + Vite + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **状态管理**: Zustand
- **路径**: ~/Desktop/Dolphin/openclaw-manager/

## 已完成功能

### 基础框架
- 暗色/亮色主题切换（亮色参考 AutoClaw 暖橙色风格），Settings 页面切换
- 侧边栏：Resources / Monitor / Agents 三区 + 底部用户头像和设置
- 侧边栏可收缩/展开，收缩状态下顶部展开按钮、底部头像
- Account 页面（Cloud Sync 功能预览）

### Resources（全局资源池）

#### Models（核心功能，完善度最高）
- **Provider 和 Model 解耦**: Provider = API 端点（可以有多个 endpoint），Model = 具体模型（可对应多个 Provider）
- **多 Endpoint 支持**: 同一 Provider 一个 API Key 下支持多个端点（如 DeepSeek 同时有 OpenAI 和 Anthropic 兼容端点）
- **17 个预设 Provider**:
  - Anthropic, OpenAI, Google Gemini, xAI Grok, DeepSeek, OpenRouter
  - MiniMax (Global/CN), Moonshot (Global/CN), 智谱AI, 豆包 Doubao, 通义千问 Qwen (Global/CN), Ollama
- **已验证的 Anthropic 兼容端点**: DeepSeek, MiniMax, Moonshot, 智谱AI, 豆包（全部通过实际 HTTP 请求验证）
- **25+ 预设模型**: Claude 系列, GPT 系列, Gemini, Grok, DeepSeek, MiniMax, GLM, 豆包, Kimi, Qwen
- **Fetch Models**: 点击按钮自动从 Provider 的 /v1/models 端点拉取可用模型列表
- **双维度过滤**: Vendor 标签 + Capability 标签（text/vision/reasoning/coding）
- **Region 标记**: 同一品牌不同站点显示 Global/CN 标签
- **自动保存**: 修改后 1.5 秒无操作自动保存到 ~/.agenthub/hub.json
- **Add 按钮**: 在 Tab 栏右侧，紧凑布局

#### Skills
- 对接 ClawHub API（`GET /api/v1/search?q=...`）进行语义搜索
- 快捷搜索标签（github / web search / database / 翻译等）
- Skill 卡片展示：名称、描述、相关度分数、更新时间
- 链接格式 `clawhub.ai/skills/{slug}`（自动 307 重定向到正确 URL）

#### MCP Servers
- 完整管理页面：添加/编辑/删除/启用禁用 MCP 服务器
- 8 个内置预设（Filesystem, Brave Search, GitHub, PostgreSQL, SQLite, Puppeteer, Memory, Fetch）
- 自定义 MCP 服务器：Command + Args + 环境变量配置
- 环境变量编辑器（动态添加/删除 key-value 对）
- Copy JSON 功能（复制标准 MCP 配置格式供其他工具使用）
- 空状态引导页面
- 数据持久化到 ~/.agenthub/hub.json 的 mcpServers 模块

#### Secrets
- 完整密钥管理页面：添加/编辑/删除密钥
- SecretRef 模式：Agent 配置通过 refKey 引用密钥，而非直接存储敏感值
- 密钥遮罩显示（前4后4位可见）
- Show/Hide 切换、一键复制
- 自动从名称生成 refKey（大写 + 下划线）
- 数据持久化到 ~/.agenthub/hub.json 的 secrets 模块

### Monitor（监控与协作）

#### Token Monitor
- 读取本地文件真实数据：
  - Claude Code: ~/.claude/stats-cache.json（每日消息数/会话数/工具调用数，有柱状图）
  - OpenClaw: ~/.openclaw/logs/gateway.log 行数估算
  - Codex: ~/.codex/session_index.jsonl 会话数

#### API Usage
- **DeepSeek 余额查询** ✅: `GET https://api.deepseek.com/user/balance`，显示 CNY 余额和可用状态
- **Moonshot 余额查询** ✅: `GET https://api.moonshot.ai/v1/users/me/balance`，显示可用余额
- **Anthropic** ✅: 支持 Admin Key 查 usage API
- **智谱AI / MiniMax**: 无公开余额 API，显示 dashboard 跳转链接
- 11 个 Provider Dashboard 快捷跳转（根据已配置的 Provider 动态显示）

#### Prompt Inspector
- Context 组成分析（system/history/tools/user 各占多少 token）
- 可视化 context window 使用率条形图
- 展开可查看每个 section 内容并复制
- 优化建议（history 占比过高、工具定义太多、context 使用率低等）
- 目前是 demo 数据，真实数据需要 proxy 功能

#### Memory
- 扫描各 Agent 记忆文件：
  - OpenClaw: ~/.openclaw/memory/ (markdown)
  - Claude Code: ~/.claude/projects/*/CLAUDE.md
  - Codex: ~/.codex/memories/
  - QClaw: ~/.qclaw/qmemory/
- 跨 Agent 记忆同步选择（多选 + Sync 按钮）
- 搜索功能

#### Collaboration
- Agent 网络拓扑图（显示在线/离线状态）
- ACP/A2A 协议说明卡片
- 路由规则管理（from → to，触发条件，协议选择，启用/禁用）

### Agent 实例管理
- **自动检测 7 种 Agent**:
  - 🦞 OpenClaw (~/.openclaw/)
  - 🦀 QClaw (~/.qclaw/)
  - 🤯 AutoClaw (~/Library/Application Support/AutoClaw/)
  - 🤖 Claude Code (~/.claude/)
  - 👷 WorkBuddy (~/.workbuddy/)
  - 📦 Codex CLI (~/.codex/)
  - ⌨️ OpenCode (~/.config/opencode/)
- 每 15 秒自动刷新进程状态
- 多 OpenClaw 变体识别（进程名 + 目录 + App 路径 + 命令行参数）
- **OpenClaw 实例子 Tab**: Overview / Agents / Channels / Tools / Plugins / Gateway / Raw
  - Channels: Discord 多账号（main/deepme）、Slack、飞书，Token 遮罩，Guild/Channel 层级展示，Agent Bindings
  - Plugins: 7 个插件状态/安装信息/配置详情
  - Gateway: 端口/认证/Tailscale/Session/Hooks/Commands
  - Raw: JSON 只读查看 + 复制
- 每个实例读取各自的配置文件（config_path 参数化）

### Rust 后端 Commands
- `read_config` / `read_config_module` / `write_config_module` — openclaw.json CRUD（支持 config_path 参数）
- `read_hub_config` / `write_hub_config_module` — hub.json CRUD（原子写入 + 自动备份）
- `detect_agents` / `check_health` — 进程扫描 + 目录扫描
- `search_clawhub_skills` / `get_popular_skills` / `get_skill_detail` — ClawHub API 代理
- `fetch_provider_models` — 从 Provider /v1/models 端点拉取模型列表
- `get_token_usage` — 读取本地 Agent 活动数据
- `get_api_usage` — 调用各家余额查询 API（DeepSeek/Moonshot/Anthropic）
- `scan_agent_memories` — 扫描各 Agent 记忆文件
- `create_backup` / `list_backups` — 配置备份管理

---

## 后续要做的

### 短期（当前版本继续完善）
- [x] MCP Servers 页面实现（全局 MCP Server 注册和管理）✅
- [x] Secrets 页面实现（统一密钥管理）✅
- [ ] Agent 实例的 Models/MCP Tab（从全局池选择，Agent 专属配置覆盖）
- [x] Agent 实例配置可编辑（Agents/Tools/Gateway/Raw 全 Tab inline 编辑 + 保存）✅
- [x] Claude Code 完整配置（模型/交互/权限/协作/MCP/Hooks/Skills/Plugins 9 个 tab）✅
- [x] Codex CLI 配置编辑（模型/推理深度/沙箱/审批/功能开关/受信项目）✅
- [x] 项目重命名（openclaw-manager → agenthub）✅
- [ ] Provider Endpoint 可编辑（新增的 endpoint 还不能编辑 URL 和 apiType）

### 中期
- [ ] **本地 Proxy** — AgentHub 起 HTTP proxy，拦截所有 Agent 的 API 请求
  - 真实 token 监控（不依赖本地文件）
  - Prompt Inspector 真实数据
  - Rate limit 剩余额度追踪（订阅用户也能用）
- [ ] **统一记忆层** — 共享记忆池，跨 Agent 自动同步，格式转换（CLAUDE.md ↔ OpenClaw memory ↔ Codex memories）
- [ ] **Cloud Sync** — 账号系统，记忆/Skills/配置云端同步

### 长期
- [ ] 跨 Agent 协作（ACP/A2A 协议实际集成）
- [ ] 更多 Agent 适配（Aider, Continue.dev, Cursor Agent）
- [ ] 远程实例管理（SSH/API）
- [ ] 统一日志（聚合所有 Agent 对话日志）
- [ ] 用量仪表盘（跨实例 token 趋势图）
- [ ] 配置 Diff（可视化对比版本）
- [ ] 自动更新（Tauri updater）
- [ ] 打包发布（macOS .dmg / Windows .msi / Linux .deb）

---

## 关键设计决策

1. **Provider 与 Model 解耦**: 一个模型可对应多个 Provider，用户在 Agent 里选模型时自动匹配可用的 Provider
2. **多 Endpoint per Provider**: 同一个 API Key 下支持多个端点（OpenAI 兼容 + Anthropic 兼容），未来可自动匹配 Agent 所需的协议
3. **AgentRuntime trait**: Rust 后端用统一接口适配不同 Agent 类型，新增 Agent 类型只需实现 detect/read_config/write_config
4. **两层架构**: 全局资源池（hub.json）+ Agent 实例层（各自的配置文件），全局改一次 Key 所有引用自动生效
5. **自动保存**: 1.5s debounce，避免忘记保存
6. **Region 标记**: 同一品牌不同站点（如 Moonshot Global/CN）用 region 字段区分，而非创建不同的品牌名
