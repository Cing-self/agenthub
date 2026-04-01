import { useState } from "react";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";

interface Props {
  config: Record<string, unknown> | null;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}

const HOOK_EVENTS = [
  { value: "SessionStart", label: "SessionStart", hint: "会话启动时" },
  { value: "SessionEnd", label: "SessionEnd", hint: "会话结束时" },
  { value: "UserPromptSubmit", label: "UserPromptSubmit", hint: "用户提交 prompt 后" },
  { value: "PreToolUse", label: "PreToolUse", hint: "工具调用前" },
  { value: "PostToolUse", label: "PostToolUse", hint: "工具调用后" },
  { value: "PostToolUseFailure", label: "PostToolUseFailure", hint: "工具调用失败后" },
  { value: "PermissionRequest", label: "PermissionRequest", hint: "请求权限时" },
  { value: "Notification", label: "Notification", hint: "通知触发时" },
  { value: "SubagentStart", label: "SubagentStart", hint: "子代理启动" },
  { value: "SubagentStop", label: "SubagentStop", hint: "子代理停止" },
  { value: "Stop", label: "Stop", hint: "主线程停止" },
  { value: "StopFailure", label: "StopFailure", hint: "停止失败（rate limit 等）" },
  { value: "TeammateIdle", label: "TeammateIdle", hint: "队友空闲" },
  { value: "TaskCompleted", label: "TaskCompleted", hint: "任务完成" },
  { value: "InstructionsLoaded", label: "InstructionsLoaded", hint: "CLAUDE.md 加载" },
  { value: "ConfigChange", label: "ConfigChange", hint: "配置变更" },
  { value: "WorktreeCreate", label: "WorktreeCreate", hint: "Worktree 创建" },
  { value: "WorktreeRemove", label: "WorktreeRemove", hint: "Worktree 删除" },
  { value: "PreCompact", label: "PreCompact", hint: "压缩对话前" },
  { value: "PostCompact", label: "PostCompact", hint: "压缩对话后" },
];

const HOOK_TYPE_OPTIONS = [
  { value: "command", label: "命令" },
  { value: "http", label: "HTTP" },
  { value: "prompt", label: "Prompt" },
  { value: "agent", label: "Agent" },
];

interface HookHandler {
  type: string;
  command?: string;
  url?: string;
  prompt?: string;
  timeout?: number;
  matcher?: string;
  [key: string]: unknown;
}

interface MatcherGroup {
  matcher?: string;
  hooks: HookHandler[];
}

export default function ClaudeCodeHooksTab({ config, onSave }: Props) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEventType, setNewEventType] = useState("");

  if (!config) return null;

  const hooks = (config.hooks || {}) as Record<string, MatcherGroup[]>;
  const disableAllHooks = config.disableAllHooks as boolean | undefined;

  const configuredEvents = Object.keys(hooks).filter(k => Array.isArray(hooks[k]) && hooks[k].length > 0);

  const saveHooks = (newHooks: Record<string, MatcherGroup[]>) => {
    // Clean empty events
    const cleaned: Record<string, MatcherGroup[]> = {};
    for (const [k, v] of Object.entries(newHooks)) {
      if (Array.isArray(v) && v.length > 0) cleaned[k] = v;
    }
    onSave({ ...config, hooks: Object.keys(cleaned).length > 0 ? cleaned : undefined });
  };

  const addHookToEvent = (event: string) => {
    const current = hooks[event] || [];
    const newGroup: MatcherGroup = { hooks: [{ type: "command", command: "" }] };
    saveHooks({ ...hooks, [event]: [...current, newGroup] });
  };

  const removeMatcherGroup = (event: string, groupIdx: number) => {
    const current = [...(hooks[event] || [])];
    current.splice(groupIdx, 1);
    saveHooks({ ...hooks, [event]: current });
  };

  const updateHandler = (event: string, groupIdx: number, hookIdx: number, updates: Partial<HookHandler>) => {
    const current = JSON.parse(JSON.stringify(hooks[event] || [])) as MatcherGroup[];
    if (current[groupIdx]?.hooks?.[hookIdx]) {
      current[groupIdx].hooks[hookIdx] = { ...current[groupIdx].hooks[hookIdx], ...updates };
      saveHooks({ ...hooks, [event]: current });
    }
  };

  const updateMatcher = (event: string, groupIdx: number, matcher: string) => {
    const current = JSON.parse(JSON.stringify(hooks[event] || [])) as MatcherGroup[];
    if (current[groupIdx]) {
      if (matcher) current[groupIdx].matcher = matcher;
      else delete current[groupIdx].matcher;
      saveHooks({ ...hooks, [event]: current });
    }
  };

  const addEvent = () => {
    if (!newEventType) return;
    addHookToEvent(newEventType);
    setExpandedEvent(newEventType);
    setAddingEvent(false);
    setNewEventType("");
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">

      <SettingsGroup title="全局">
        <EditableRow label="禁用所有 Hooks" value={String(disableAllHooks ?? "false")} type="toggle"
          onSave={(v) => onSave({ ...config, disableAllHooks: v === "true" ? true : undefined })} />
      </SettingsGroup>

      <SettingsGroup title={`已配置的 Hooks (${configuredEvents.length})`}>
        {configuredEvents.length === 0 && !addingEvent && (
          <div className="py-6 text-center text-[13px] text-muted-foreground/50">没有配置 Hook</div>
        )}

        {configuredEvents.map(event => {
          const groups = hooks[event] || [];
          const isExpanded = expandedEvent === event;
          const eventInfo = HOOK_EVENTS.find(e => e.value === event);
          return (
            <div key={event}>
              <div className="flex items-center justify-between min-h-[44px] px-1 cursor-pointer"
                onClick={() => setExpandedEvent(isExpanded ? null : event)}>
                <div>
                  <div className="text-[13px]">{event}</div>
                  <div className="text-[11px] text-muted-foreground/40">{eventInfo?.hint || ""} · {groups.length} 组</div>
                </div>
                <span className="text-[11px] text-muted-foreground/30">{isExpanded ? "收起" : "展开"}</span>
              </div>

              {isExpanded && (
                <div className="pb-3 px-1 space-y-2">
                  {groups.map((group, gi) => (
                    <div key={gi} className="rounded-lg bg-foreground/[0.02] p-3 space-y-2">
                      <EditableRow label="Matcher" value={group.matcher || ""} mono
                        onSave={(v) => updateMatcher(event, gi, v)} placeholder="正则，如 Bash|Write" />

                      {group.hooks.map((handler, hi) => (
                        <div key={hi} className="space-y-1 pt-1 border-t border-border/30">
                          <SelectRow label="类型" value={handler.type || "command"} options={HOOK_TYPE_OPTIONS}
                            onSave={(v) => updateHandler(event, gi, hi, { type: v })} />

                          {handler.type === "command" && (
                            <EditableRow label="命令" value={handler.command || ""} mono
                              onSave={(v) => updateHandler(event, gi, hi, { command: v })} placeholder="./scripts/hook.sh" />
                          )}
                          {handler.type === "http" && (
                            <EditableRow label="URL" value={handler.url || ""} mono
                              onSave={(v) => updateHandler(event, gi, hi, { url: v })} placeholder="http://localhost:8080/hook" />
                          )}
                          {(handler.type === "prompt" || handler.type === "agent") && (
                            <EditableRow label="Prompt" value={handler.prompt || ""}
                              onSave={(v) => updateHandler(event, gi, hi, { prompt: v })} placeholder="分析这个操作..." />
                          )}
                          <EditableRow label="超时" value={String(handler.timeout || "")} mono
                            onSave={(v) => updateHandler(event, gi, hi, { timeout: v ? parseInt(v) : undefined })} placeholder="600" hint="秒" />
                        </div>
                      ))}

                      <button onClick={() => removeMatcherGroup(event, gi)}
                        className="text-[11px] text-muted-foreground/40 hover:text-foreground">删除此组</button>
                    </div>
                  ))}

                  <button onClick={() => addHookToEvent(event)}
                    className="text-[12px] text-foreground/50 hover:text-foreground">+ 添加 Hook 组</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new event */}
        {addingEvent ? (
          <div className="flex items-center gap-2 min-h-[44px] px-1">
            <select value={newEventType} onChange={e => setNewEventType(e.target.value)}
              style={{ WebkitAppearance: "none", appearance: "none", border: "none", outline: "none", background: "none", padding: 0, font: "inherit" }}
              className="flex-1 text-[13px] cursor-pointer">
              <option value="">选择事件...</option>
              {HOOK_EVENTS.filter(e => !configuredEvents.includes(e.value)).map(e => (
                <option key={e.value} value={e.value}>{e.label} — {e.hint}</option>
              ))}
            </select>
            <button onClick={addEvent} className="text-[12px] text-foreground/60 hover:text-foreground">添加</button>
            <button onClick={() => { setAddingEvent(false); setNewEventType(""); }}
              className="text-[12px] text-muted-foreground/40 hover:text-foreground">取消</button>
          </div>
        ) : (
          <div className="min-h-[44px] px-1 flex items-center">
            <button onClick={() => setAddingEvent(true)}
              className="text-[13px] text-muted-foreground/40 hover:text-foreground transition-colors">
              + 添加事件 Hook
            </button>
          </div>
        )}
      </SettingsGroup>

      <div className="text-[11px] text-muted-foreground/40 px-1">
        Hooks 支持 22 种生命周期事件，每种可配多组 matcher + handler。详见 <span className="font-mono">code.claude.com/docs/en/hooks</span>
      </div>
    </div>
  );
}
