import { useEffect, useState } from "react";
import { SelectRow } from "@/components/shared/SelectRow";
import { EditableRow } from "@/components/shared/EditableRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";

interface Props {
  config: Record<string, unknown> | null;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}

const OUTPUT_STYLE = [{ value: "", label: "默认" }, { value: "Concise", label: "简洁" }, { value: "Explanatory", label: "详细" }, { value: "Verbose", label: "冗长" }];
const LANGUAGE = [{ value: "", label: "English" }, { value: "chinese", label: "中文" }, { value: "japanese", label: "日本語" }, { value: "korean", label: "한국어" }, { value: "spanish", label: "Español" }, { value: "french", label: "Français" }];
const UPDATE = [{ value: "latest", label: "最新" }, { value: "stable", label: "稳定" }];

export default function ClaudeCodeInteractionTab({ config, onSave }: Props) {
  if (!config) return null;
  const env = (config.env || {}) as Record<string, string>;
  const attribution = (config.attribution || {}) as Record<string, string>;
  const worktree = (config.worktree || {}) as Record<string, unknown>;

  const update = (key: string, value: unknown) => {
    const c = { ...config };
    if (value === "" || value === undefined || value === null) delete c[key]; else c[key] = value;
    onSave(c);
  };

  const updateEnv = (key: string, value: string) => {
    const newEnv = { ...env };
    if (value) newEnv[key] = value; else delete newEnv[key];
    const c = { ...config };
    if (Object.keys(newEnv).length > 0) c.env = newEnv; else delete c.env;
    onSave(c);
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">

      <SettingsGroup title="输出">
        <SelectRow label="风格" value={String(config.outputStyle || "")} options={OUTPUT_STYLE}
          onSave={(v) => update("outputStyle", v || undefined)} />
        <SelectRow label="语言" value={String(config.language || "")} options={LANGUAGE}
          onSave={(v) => update("language", v || undefined)} />
        <EditableRow label="Git 工作流指令" value={String(config.includeGitInstructions ?? "true")} type="toggle"
          onSave={(v) => update("includeGitInstructions", v === "true")} hint="system prompt 中注入 git 工作流" />
      </SettingsGroup>

      <SettingsGroup title="输入">
        <EditableRow label="语音输入" value={String(config.voiceEnabled ?? "false")} type="toggle"
          onSave={(v) => update("voiceEnabled", v === "true")} />
      </SettingsGroup>

      <SettingsGroup title="归属标注">
        <EditableRow label="Commit 标注" value={attribution.commit || ""}
          onSave={(v) => update("attribution", { ...attribution, commit: v || undefined })} placeholder="🤖 Generated with Claude Code" />
        <EditableRow label="PR 标注" value={attribution.pr || ""}
          onSave={(v) => update("attribution", { ...attribution, pr: v || undefined })} placeholder="留空则不添加" />
        <EditableRow label="Co-Authored-By" value={String(config.includeCoAuthoredBy ?? "true")} type="toggle"
          onSave={(v) => update("includeCoAuthoredBy", v === "true")} hint="git commit 中添加 co-authored-by" />
      </SettingsGroup>

      <SettingsGroup title="会话与存储">
        <EditableRow label="会话清理天数" value={String(config.cleanupPeriodDays ?? "")}
          onSave={(v) => update("cleanupPeriodDays", v ? parseInt(v) : undefined)} hint="不活跃超过此天数的会话在启动时删除，默认 30" />
        <EditableRow label="计划文件目录" value={String(config.plansDirectory || "")}
          onSave={(v) => update("plansDirectory", v || undefined)} placeholder="~/.claude/plans" />
        <EditableRow label="自动记忆目录" value={String(config.autoMemoryDirectory || "")}
          onSave={(v) => update("autoMemoryDirectory", v || undefined)} placeholder="默认位置" />
      </SettingsGroup>

      <SettingsGroup title="Worktree">
        <EditableRow label="符号链接目录" value={Array.isArray(worktree.symlinkDirectories) ? (worktree.symlinkDirectories as string[]).join(", ") : ""}
          onSave={(v) => {
            const dirs = v.split(",").map(s => s.trim()).filter(Boolean);
            update("worktree", dirs.length > 0 ? { ...worktree, symlinkDirectories: dirs } : undefined);
          }} placeholder="node_modules, .cache" hint="工作树中符号链接而非复制的目录" />
        <EditableRow label="Sparse Checkout" value={Array.isArray(worktree.sparsePaths) ? (worktree.sparsePaths as string[]).join(", ") : ""}
          onSave={(v) => {
            const paths = v.split(",").map(s => s.trim()).filter(Boolean);
            update("worktree", paths.length > 0 ? { ...worktree, sparsePaths: paths } : undefined);
          }} placeholder="packages/my-app, shared/utils" hint="大型 monorepo 中只 checkout 指定路径" />
      </SettingsGroup>

      <SettingsGroup title="状态栏与提示">
        <EditableRow label="加载提示" value={String(config.spinnerTipsEnabled ?? "true")} type="toggle"
          onSave={(v) => update("spinnerTipsEnabled", v === "true")} />
        <EditableRow label="状态栏脚本" value={String(config.statusLine ? JSON.stringify(config.statusLine) : "")} mono
          onSave={(v) => {
            try { update("statusLine", v ? JSON.parse(v) : undefined); } catch { /* */ }
          }} placeholder='{"type":"command","command":"~/.claude/statusline.sh"}' hint="自定义底部状态栏内容" />
        <EditableRow label="文件补全脚本" value={String(config.fileSuggestion ? JSON.stringify(config.fileSuggestion) : "")} mono
          onSave={(v) => {
            try { update("fileSuggestion", v ? JSON.parse(v) : undefined); } catch { /* */ }
          }} placeholder='{"type":"command","command":"script.sh"}' hint="自定义 @ 文件补全" />
        <EditableRow label="遵循 .gitignore" value={String(config.respectGitignore ?? "true")} type="toggle"
          onSave={(v) => update("respectGitignore", v === "true")} hint="@ 文件选择器过滤 .gitignore 中的文件" />
        <EditableRow label="减少动画" value={String(config.prefersReducedMotion ?? "false")} type="toggle"
          onSave={(v) => update("prefersReducedMotion", v === "true")} hint="无障碍：减少 spinner 和闪烁效果" />
      </SettingsGroup>

      <SettingsGroup title="通用">
        <SelectRow label="更新通道" value={String(config.autoUpdatesChannel || "latest")} options={UPDATE}
          onSave={(v) => update("autoUpdatesChannel", v)} />
        <EditableRow label="快速模式按会话启用" value={String(config.fastModePerSessionOptIn ?? "false")} type="toggle"
          onSave={(v) => update("fastModePerSessionOptIn", v === "true")} hint="每次新会话需手动 /fast 开启" />
        <EditableRow label="接受计划时显示清除上下文" value={String(config.showClearContextOnPlanAccept ?? "false")} type="toggle"
          onSave={(v) => update("showClearContextOnPlanAccept", v === "true")} />
        <EditableRow label="反馈调查概率" value={String(config.feedbackSurveyRate ?? "")}
          onSave={(v) => update("feedbackSurveyRate", v ? parseFloat(v) : undefined)} placeholder="0~1，0 为关闭" />
        <EditableRow label="公告" value={Array.isArray(config.companyAnnouncements) ? (config.companyAnnouncements as string[]).join("\n") : ""}
          onSave={(v) => {
            const msgs = v.split("\n").map(s => s.trim()).filter(Boolean);
            update("companyAnnouncements", msgs.length > 0 ? msgs : undefined);
          }} placeholder="启动时显示的公告" />
        <EditableRow label="禁用非必要流量" value={String(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1" ? "true" : "false")} type="toggle"
          onSave={(v) => updateEnv("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", v === "true" ? "1" : "")}
          hint="关闭更新检查、遥测等后台请求" />
        <EditableRow label="遥测" value={String(env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" ? "true" : "false")} type="toggle"
          onSave={(v) => updateEnv("CLAUDE_CODE_ENABLE_TELEMETRY", v === "true" ? "1" : "")} />
        <EditableRow label="OTel Header 脚本" value={String(config.otelHeadersHelper || "")} mono
          onSave={(v) => update("otelHeadersHelper", v || undefined)} placeholder="/bin/generate_otel_headers.sh" hint="动态生成 OTel 认证 header" />
      </SettingsGroup>

      {/* ~/.claude.json 全局设置 */}
      <GlobalSettings />
    </div>
  );
}

const EDITOR_MODE = [{ value: "normal", label: "普通" }, { value: "vim", label: "Vim" }];

function GlobalSettings() {
  const [globals, setGlobals] = useState<Record<string, unknown> | null>(null);
  const [claudeJsonPath, setClaudeJsonPath] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/core").then(async ({ invoke }) => {
      try {
        const agents = await invoke<{ agents: { home_dir: string; agent_type: string }[] }>("detect_agents");
        const claudeAgent = agents.agents?.find(a => a.agent_type === "claude-code");
        if (claudeAgent) {
          const home = claudeAgent.home_dir.replace(/\/.claude$/, "");
          const path = `${home}/.claude.json`;
          setClaudeJsonPath(path);
          const data = await invoke<Record<string, unknown>>("read_json_file", { path });
          setGlobals(data);
        }
      } catch { /* */ }
    });
  }, []);

  if (!globals) return null;

  const saveGlobal = async (key: string, value: unknown) => {
    if (!claudeJsonPath) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = { ...globals };
      if (value === undefined || value === null || value === "") delete updated[key]; else updated[key] = value;
      await invoke("write_json_file", { path: claudeJsonPath, data: JSON.stringify(updated, null, 2) });
      setGlobals(updated);
    } catch { /* */ }
  };

  return (
    <SettingsGroup title="全局偏好" description="存储在 ~/.claude.json，跨项目生效">
      <SelectRow label="编辑器模式" value={String(globals.editorMode || "normal")} options={EDITOR_MODE}
        onSave={(v) => saveGlobal("editorMode", v)} />
      <EditableRow label="显示耗时" value={String(globals.showTurnDuration ?? "true")} type="toggle"
        onSave={(v) => saveGlobal("showTurnDuration", v === "true")} hint="回复后显示 Cooked for 1m 6s" />
      <EditableRow label="终端进度条" value={String(globals.terminalProgressBarEnabled ?? "true")} type="toggle"
        onSave={(v) => saveGlobal("terminalProgressBarEnabled", v === "true")} />
      <EditableRow label="自动连接 IDE" value={String(globals.autoConnectIde ?? "false")} type="toggle"
        onSave={(v) => saveGlobal("autoConnectIde", v === "true")} hint="外部终端启动时自动连接 VS Code" />
      <EditableRow label="自动安装 IDE 扩展" value={String(globals.autoInstallIdeExtension ?? "true")} type="toggle"
        onSave={(v) => saveGlobal("autoInstallIdeExtension", v === "true")} />
    </SettingsGroup>
  );
}
