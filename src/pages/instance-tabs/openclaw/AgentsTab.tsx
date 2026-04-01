import { useState } from "react";
// @ts-ignore
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}

const COMPACTION_OPTIONS = [
  { value: "", label: "默认" },
  { value: "smart", label: "智能" },
  { value: "full", label: "完整" },
  { value: "safeguard", label: "安全" },
  { value: "off", label: "关闭" },
];

export default function AgentsTab({ config, onSave }: Props) {
  const agents = (config?.agents || {}) as Record<string, unknown>;
  const defaults = (agents.defaults || {}) as Record<string, unknown>;
  const model = (defaults.model || {}) as Record<string, unknown>;
  const models = (defaults.models || {}) as Record<string, Record<string, unknown>>;
  const list = (agents.list || []) as Record<string, unknown>[];
  const compaction = (defaults.compaction || {}) as Record<string, unknown>;
  const subagents = (defaults.subagents || {}) as Record<string, unknown>;
  const [addingAgent, setAddingAgent] = useState(false);
  const [newId, setNewId] = useState("");

  const save = (updated: Record<string, unknown>) => {
    onSave?.("agents", updated);
  };

  const updateDefaults = (key: string, value: unknown) => {
    const d = JSON.parse(JSON.stringify(defaults));
    if (value === "" || value === undefined) delete d[key]; else d[key] = value;
    save({ ...agents, defaults: d });
  };

  const updateModel = (key: string, value: unknown) => {
    const m = JSON.parse(JSON.stringify(model));
    if (value === "" || value === undefined) delete m[key]; else m[key] = value;
    updateDefaults("model", m);
  };

  const updateAgent = (idx: number, key: string, value: unknown) => {
    const l = JSON.parse(JSON.stringify(list));
    if (value === "" || value === undefined) delete l[idx][key]; else l[idx][key] = value;
    save({ ...agents, list: l });
  };

  const removeAgent = (idx: number) => {
    const l = [...list]; l.splice(idx, 1);
    save({ ...agents, list: l });
    toast.success("已删除");
  };

  const addAgent = () => {
    if (!newId.trim()) return;
    const l = [...list, { id: newId.trim() }];
    save({ ...agents, list: l });
    setNewId(""); setAddingAgent(false);
    toast.success("已添加");
  };

  const removeModelAlias = (modelId: string) => {
    const m = JSON.parse(JSON.stringify(models));
    delete m[modelId];
    updateDefaults("models", Object.keys(m).length > 0 ? m : undefined);
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">

      <SettingsGroup title="默认模型">
        <EditableRow label="主模型" value={String(model.primary || "")} mono
          onSave={onSave ? (v) => updateModel("primary", v) : undefined} placeholder="provider/model-id" />
        <EditableRow label="降级模型" value={Array.isArray(model.fallbacks) ? (model.fallbacks as string[]).join(", ") : ""} mono
          onSave={onSave ? (v) => updateModel("fallbacks", v.split(",").map(s => s.trim()).filter(Boolean)) : undefined}
          placeholder="逗号分隔" hint="主模型不可用时依次尝试" />
      </SettingsGroup>

      <SettingsGroup title="默认参数">
        <EditableRow label="工作目录" value={String(defaults.workspace || "")} mono
          onSave={onSave ? (v) => updateDefaults("workspace", v) : undefined} />
        <EditableRow label="最大并发" value={String(defaults.maxConcurrent ?? "")}
          onSave={onSave ? (v) => updateDefaults("maxConcurrent", v ? parseInt(v) : undefined) : undefined} />
        <EditableRow label="子代理并发" value={String(subagents.maxConcurrent ?? "")}
          onSave={onSave ? (v) => updateDefaults("subagents", v ? { ...subagents, maxConcurrent: parseInt(v) } : undefined) : undefined} />
        <SelectRow label="对话压缩" value={String(compaction.mode || "")} options={COMPACTION_OPTIONS}
          onSave={onSave ? (v) => updateDefaults("compaction", v ? { ...compaction, mode: v } : undefined) : undefined} />
        <EditableRow label="超时（秒）" value={String(defaults.timeoutSeconds ?? "")}
          onSave={onSave ? (v) => updateDefaults("timeoutSeconds", v ? parseInt(v) : undefined) : undefined} />
      </SettingsGroup>

      {Object.keys(models).length > 0 && (
        <SettingsGroup title="模型白名单">
          {Object.entries(models).map(([id, meta]) => (
            <div key={id} className="flex items-center justify-between min-h-[40px] px-1 group">
              <div>
                <span className="text-[12px] font-mono">{id}</span>
                {meta.alias != null && <span className="text-[11px] text-muted-foreground ml-2">别名: {String(meta.alias)}</span>}
              </div>
              {onSave && (
                <button onClick={() => removeModelAlias(id)}
                  className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">删除</button>
              )}
            </div>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup title={`Agent 列表 (${list.length})`}>
        {list.map((agent, idx) => (
          <div key={String(agent.id || idx)} className="py-2 px-1 group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium">{String(agent.name || agent.id)}</span>
              {onSave && (
                <button onClick={() => removeAgent(idx)}
                  className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">删除</button>
              )}
            </div>
            <div className="space-y-0.5">
              <EditableRow label="模型" value={String(agent.model || "")} mono
                onSave={onSave ? (v) => updateAgent(idx, "model", v) : undefined} placeholder="使用默认" />
              <EditableRow label="工作目录" value={String(agent.workspace || "")} mono
                onSave={onSave ? (v) => updateAgent(idx, "workspace", v) : undefined} />
            </div>
          </div>
        ))}

        {onSave && (
          addingAgent ? (
            <div className="flex items-center gap-2 min-h-[44px] px-1">
              <input value={newId} onChange={e => setNewId(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addAgent(); if (e.key === "Escape") setAddingAgent(false); }}
                placeholder="Agent ID"
                className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground" autoFocus />
              <button onClick={addAgent} className="text-[12px] text-foreground/70 hover:text-foreground">添加</button>
              <button onClick={() => setAddingAgent(false)} className="text-[12px] text-muted-foreground">取消</button>
            </div>
          ) : (
            <div className="min-h-[44px] px-1 flex items-center">
              <button onClick={() => setAddingAgent(true)}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">+ 添加 Agent</button>
            </div>
          )
        )}
      </SettingsGroup>
    </div>
  );
}
