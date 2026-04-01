import { useState } from "react";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";
interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}
export default function PluginsTab({ config, onSave }: Props) {
  const plugins = (config?.plugins || {}) as Record<string, unknown>;
  const allow = (plugins.allow || []) as string[];
  const entries = (plugins.entries || {}) as Record<string, Record<string, unknown>>;
  const installs = (plugins.installs || {}) as Record<string, unknown>;
  const [addingPlugin, setAddingPlugin] = useState(false);
  const [newName, setNewName] = useState("");
  const savePlugins = (updated: Record<string, unknown>) => onSave?.("plugins", updated);
  const togglePlugin = (name: string) => {
    const e = JSON.parse(JSON.stringify(entries));
    if (e[name]) e[name].enabled = !e[name].enabled;
    else e[name] = { enabled: true };
    savePlugins({ ...plugins, entries: e });
  };
  const removePlugin = (name: string) => {
    const p = JSON.parse(JSON.stringify(plugins));
    const a = (p.allow || []).filter((n: string) => n !== name);
    if (p.entries) delete p.entries[name];
    p.allow = a;
    savePlugins(p);
    toast.success(`已删除 ${name}`);
  };
  const addPlugin = () => {
    if (!newName.trim()) return;
    const p = JSON.parse(JSON.stringify(plugins));
    const a = [...(p.allow || [])];
    if (!a.includes(newName.trim())) a.push(newName.trim());
    p.allow = a;
    if (!p.entries) p.entries = {};
    (p.entries as Record<string, unknown>)[newName.trim()] = { enabled: true };
    savePlugins(p);
    setNewName(""); setAddingPlugin(false);
    toast.success(`已添加 ${newName.trim()}`);
  };
  const pluginNames = [...new Set([...allow, ...Object.keys(entries)])];
  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title={`插件 (${pluginNames.length})`}>
        {pluginNames.length === 0 && !addingPlugin && (
          <div className="py-6 text-center text-[13px] text-muted-foreground">没有配置插件</div>
        )}
        {pluginNames.map(name => {
          const entry = entries[name];
          const enabled = entry?.enabled ?? allow.includes(name);
          const installInfo = (installs as Record<string, Record<string, unknown>>)[name];
          return (
            <div key={name} className="flex items-center justify-between min-h-[44px] px-1 group">
              <div className="flex-1">
                <span className="text-[13px]">{name}</span>
                {installInfo?.version != null && <span className="text-[11px] text-muted-foreground ml-2">v{String(installInfo.version)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => togglePlugin(name)}
                  className={cn("text-[11px] px-2 py-0.5 rounded-full",
                    enabled ? "text-foreground bg-foreground/5" : "text-muted-foreground bg-foreground/[0.02]")}>
                  {enabled ? "开" : "关"}
                </button>
                {onSave && (
                  <button onClick={() => removePlugin(name)}
                    className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">删除</button>
                )}
              </div>
            </div>
          );
        })}
        {onSave && (
          addingPlugin ? (
            <div className="flex items-center gap-2 min-h-[44px] px-1">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addPlugin(); if (e.key === "Escape") setAddingPlugin(false); }}
                placeholder="插件名称"
                className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground" autoFocus />
              <button onClick={addPlugin} className="text-[12px] text-foreground/70 hover:text-foreground">添加</button>
              <button onClick={() => setAddingPlugin(false)} className="text-[12px] text-muted-foreground">取消</button>
            </div>
          ) : (
            <div className="min-h-[44px] px-1 flex items-center">
              <button onClick={() => setAddingPlugin(true)}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">+ 添加插件</button>
            </div>
          )
        )}
      </SettingsGroup>
    </div>
  );
}
