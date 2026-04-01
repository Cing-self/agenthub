export interface CliMarketEntry {
  id: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  binary: string;
  agentType?: string;
  installCommand: string;
  upgradeCommand?: string;
  versionArgs: string[];
  docsUrl: string;
  note?: string;
  sourceLabel: "Official" | "Community";
  badges?: string[];
}

export const CLI_MARKET: CliMarketEntry[] = [
  {
    id: "openclaw",
    name: "OpenClaw CLI",
    vendor: "OpenClaw",
    category: "Agent Runtime",
    description: "本地/云端都可用的智能体编排 CLI，也是 AgentHub 当前接得最深的一条 runtime。",
    binary: "openclaw",
    agentType: "openclaw",
    installCommand: "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard",
    upgradeCommand: "openclaw update",
    versionArgs: ["--version", "version"],
    docsUrl: "https://docs.openclaw.ai/install/index",
    note: "安装脚本会自动处理 Node 环境；如果你需要完整引导，再执行 openclaw onboard --install-daemon。",
    sourceLabel: "Official",
    badges: ["script install", "gateway", "session-aware"],
  },
  {
    id: "claude-code",
    name: "Claude Code CLI",
    vendor: "Anthropic",
    category: "Coding Agent",
    description: "Anthropic 官方编码助手 CLI，适合作为 Work 模式下的主 Agent 或专项 coding runtime。",
    binary: "claude",
    agentType: "claude-code",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    upgradeCommand: "npm install -g @anthropic-ai/claude-code@latest",
    versionArgs: ["--version", "-v"],
    docsUrl: "https://code.claude.com/docs/en/quickstart",
    note: "首次运行 claude 时需要登录你的 Claude 账户。",
    sourceLabel: "Official",
    badges: ["npm", "coding", "native install available"],
  },
  {
    id: "codex",
    name: "Codex CLI",
    vendor: "OpenAI",
    category: "Coding Agent",
    description: "OpenAI 官方编码 agent CLI，适合本地执行、审查、批量脚本化工作流。",
    binary: "codex",
    agentType: "codex",
    installCommand: "npm i -g @openai/codex",
    upgradeCommand: "npm i -g @openai/codex@latest",
    versionArgs: ["--version", "version"],
    docsUrl: "https://developers.openai.com/codex/cli",
    note: "首次运行 codex 时需要使用 ChatGPT 账户或 API key 完成登录。",
    sourceLabel: "Official",
    badges: ["npm", "coding", "scriptable"],
  },
  {
    id: "feishu-ae",
    name: "Feishu AE CLI",
    vendor: "Feishu",
    category: "Platform Tooling",
    description: "飞书低代码平台官方 CLI，可用于登录、拉工程、调试、同步和部署低代码应用包。",
    binary: "ae",
    installCommand: "npm install -g @byted-apaas/cli --registry https://registry.npmmirror.com",
    versionArgs: ["-vv", "--version"],
    docsUrl: "https://www.feishu.cn/content/590486693328",
    note: "这是飞书官方文档里的安装方式，依赖本机 Node 和 npm。",
    sourceLabel: "Official",
    badges: ["npm", "low-code", "feishu"],
  },
  {
    id: "clawhub",
    name: "ClawHub CLI",
    vendor: "OpenClaw",
    category: "Extension Marketplace",
    description: "OpenClaw 生态里的技能市场 CLI，可搜索、安装和更新 skills。",
    binary: "clawhub",
    installCommand: "npm i -g clawhub",
    versionArgs: ["--version", "version"],
    docsUrl: "https://docs.openclaw.ai/tools/clawhub",
    note: "适合和 OpenClaw 一起装，用来管理技能市场内容。",
    sourceLabel: "Official",
    badges: ["npm", "skills", "marketplace"],
  },
];
