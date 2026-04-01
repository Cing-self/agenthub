import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { toast } from "sonner";

type ConnType = "ssh" | "docker-local" | "docker-ssh" | "gateway-ws";

interface RemoteHost {
  id: string;
  name: string;
  connType: ConnType;
  // SSH
  host?: string;
  user?: string;
  port?: number;
  keyPath?: string;
  // Docker
  containerId?: string;
  // Docker over SSH (reuses host/user/port/keyPath + containerId)
  // Gateway WebSocket
  wsUrl?: string;
  wsToken?: string;
  // State
  agents: { id: string; name: string; type: string; running: boolean }[];
  lastScan: string | null;
  status: "connected" | "disconnected" | "scanning";
}

const CONN_OPTIONS = [
  { value: "ssh", label: "SSH 直连" },
  { value: "docker-local", label: "本地 Docker" },
  { value: "docker-ssh", label: "远程 Docker (SSH)" },
  { value: "gateway-ws", label: "Gateway WebSocket" },
];

const HOSTS_PATH = "/Users/dolphin/.agenthub/remote-hosts.json";

export default function RemoteHostsPage() {
  const [hosts, setHosts] = useState<RemoteHost[]>([]);
  const [adding, setAdding] = useState(false);
  const [newConn, setNewConn] = useState<ConnType>("ssh");
  const [form, setForm] = useState({ name: "", host: "", user: "root", port: 22, keyPath: "~/.ssh/id_rsa", containerId: "", wsUrl: "", wsToken: "" });
  const [scanning, setScanning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/core").then(async ({ invoke }) => {
      try {
        const data = await invoke<Record<string, unknown>>("read_json_file", { path: HOSTS_PATH });
        if (Array.isArray(data?.hosts)) setHosts(data.hosts as RemoteHost[]);
      } catch { /* */ }
    });
  }, []);

  const saveHosts = async (updated: RemoteHost[]) => {
    setHosts(updated);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_json_file", { path: HOSTS_PATH, data: JSON.stringify({ hosts: updated }, null, 2) });
    } catch { /* */ }
  };

  const addHost = async () => {
    const host: RemoteHost = {
      id: `remote-${Date.now()}`,
      name: form.name || form.host || form.containerId || form.wsUrl || "未命名",
      connType: newConn,
      host: newConn !== "docker-local" && newConn !== "gateway-ws" ? form.host : undefined,
      user: newConn === "ssh" || newConn === "docker-ssh" ? form.user : undefined,
      port: newConn === "ssh" || newConn === "docker-ssh" ? form.port : undefined,
      keyPath: newConn === "ssh" || newConn === "docker-ssh" ? form.keyPath : undefined,
      containerId: newConn === "docker-local" || newConn === "docker-ssh" ? form.containerId : undefined,
      wsUrl: newConn === "gateway-ws" ? form.wsUrl : undefined,
      wsToken: newConn === "gateway-ws" ? form.wsToken : undefined,
      agents: [], lastScan: null, status: "disconnected",
    };
    const updated = [...hosts, host];
    await saveHosts(updated);
    setAdding(false);
    setForm({ name: "", host: "", user: "root", port: 22, keyPath: "~/.ssh/id_rsa", containerId: "", wsUrl: "", wsToken: "" });
    toast.success(`已添加 ${host.name}`);
    scanHost(host.id, updated);
  };

  const removeHost = async (id: string) => {
    await saveHosts(hosts.filter(h => h.id !== id));
    toast.success("已删除");
  };

  const scanHost = async (id: string, currentHosts?: RemoteHost[]) => {
    const list = currentHosts || hosts;
    const host = list.find(h => h.id === id);
    if (!host) return;
    setScanning(id);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const agents: RemoteHost["agents"] = [];

      if (host.connType === "gateway-ws") {
        // Gateway WebSocket — just check health
        const url = (host.wsUrl || "").replace("ws://", "http://").replace("wss://", "https://").replace(/\/$/, "");
        const result = await invoke<{ stdout: string; success: boolean }>("run_shell_cmd", {
          command: `curl -s -m 5 ${url}/health 2>/dev/null`, timeoutSecs: 10,
        });
        if (result.stdout.includes('"ok":true')) {
          agents.push({ id: "openclaw-remote", name: "OpenClaw (Gateway)", type: "openclaw", running: true });
        }
      } else {
        // Build exec prefix based on connection type
        let execPrefix = "";
        if (host.connType === "ssh") {
          execPrefix = `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -p ${host.port || 22} -i ${host.keyPath || "~/.ssh/id_rsa"} ${host.user || "root"}@${host.host}`;
        } else if (host.connType === "docker-local") {
          execPrefix = `docker exec ${host.containerId}`;
        } else if (host.connType === "docker-ssh") {
          const sshPart = `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -p ${host.port || 22} -i ${host.keyPath || "~/.ssh/id_rsa"} ${host.user || "root"}@${host.host}`;
          execPrefix = `${sshPart} docker exec ${host.containerId}`;
        }

        // Scan for agent directories
        const result = await invoke<{ stdout: string; success: boolean }>("run_shell_cmd", {
          command: `${execPrefix} sh -c 'ls -d ~/.openclaw 2>/dev/null && echo OPENCLAW; ls -d ~/.claude 2>/dev/null && echo CLAUDE; ls -d ~/.codex 2>/dev/null && echo CODEX; ls -d ~/.qclaw 2>/dev/null && echo QCLAW' 2>/dev/null`,
          timeoutSecs: 15,
        });

        const output = result.stdout || "";
        if (output.includes("OPENCLAW")) agents.push({ id: "openclaw", name: "OpenClaw", type: "openclaw", running: false });
        if (output.includes("CLAUDE")) agents.push({ id: "claude-code", name: "Claude Code", type: "claude-code", running: false });
        if (output.includes("CODEX")) agents.push({ id: "codex", name: "Codex CLI", type: "codex", running: false });
        if (output.includes("QCLAW")) agents.push({ id: "qclaw", name: "QClaw", type: "openclaw", running: false });

        // Check running processes
        const psResult = await invoke<{ stdout: string; success: boolean }>("run_shell_cmd", {
          command: `${execPrefix} sh -c 'pgrep -fl "openclaw\\|claude\\|codex" 2>/dev/null || true'`, timeoutSecs: 10,
        });
        const ps = (psResult.stdout || "").toLowerCase();
        agents.forEach(a => {
          if (a.type === "openclaw" && ps.includes("openclaw")) a.running = true;
          if (a.type === "claude-code" && ps.includes("claude")) a.running = true;
          if (a.type === "codex" && ps.includes("codex")) a.running = true;
        });
      }

      const updated = list.map(h => h.id === id ? { ...h, agents, lastScan: new Date().toISOString(), status: "connected" as const } : h);
      await saveHosts(updated);
      toast.success(`扫描到 ${agents.length} 个 Agent`);
    } catch (err) {
      const updated = list.map(h => h.id === id ? { ...h, status: "disconnected" as const } : h);
      await saveHosts(updated);
      toast.error(`连接失败: ${err}`);
    }
    setScanning(null);
  };

  const connLabel = (t: ConnType) => CONN_OPTIONS.find(o => o.value === t)?.label || t;

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <div>
        <h1 className="text-lg font-semibold">远程主机</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">管理远程服务器、Docker 容器和 Gateway 上的 Agent</p>
      </div>

      <SettingsGroup title={`主机 (${hosts.length})`}>
        {hosts.length === 0 && !adding && (
          <div className="min-h-[44px] px-1 flex items-center text-[13px] text-muted-foreground">没有远程主机</div>
        )}
        {hosts.map(host => {
          const isOpen = expanded === host.id;
          return (
            <div key={host.id} className="py-2 px-1 group">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isOpen ? null : host.id)}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", host.status === "connected" ? "bg-emerald-500" : "bg-muted-foreground/20")} />
                    <span className="text-[13px] font-medium">{host.name}</span>
                    <span className="text-[10px] text-muted-foreground">{connLabel(host.connType)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono ml-4">
                    {host.connType === "ssh" && `${host.user}@${host.host}:${host.port}`}
                    {host.connType === "docker-local" && `container: ${host.containerId}`}
                    {host.connType === "docker-ssh" && `${host.user}@${host.host} → ${host.containerId}`}
                    {host.connType === "gateway-ws" && host.wsUrl}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); scanHost(host.id); }} disabled={scanning === host.id}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    {scanning === host.id ? <Loader2 className="animate-spin" size={12} /> : "扫描"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); removeHost(host.id); }}
                    className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">删除</button>
                </div>
              </div>
              {host.agents.length > 0 && (
                <div className="mt-1.5 ml-4 space-y-0.5">
                  {host.agents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-2 text-[12px]">
                      <span className={cn("w-1.5 h-1.5 rounded-full", agent.running ? "bg-emerald-500" : "bg-muted-foreground/20")} />
                      <span className="text-muted-foreground">{agent.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add new host */}
        {adding ? (
          <div className="py-3 px-1 space-y-2">
            <SelectRow label="连接方式" value={newConn} options={CONN_OPTIONS}
              onSave={(v) => setNewConn(v as ConnType)} />
            <EditableRow label="名称" value={form.name}
              onSave={(v) => setForm(p => ({ ...p, name: v }))} placeholder="我的服务器" />

            {(newConn === "ssh" || newConn === "docker-ssh") && (
              <>
                <EditableRow label="主机" value={form.host} mono
                  onSave={(v) => setForm(p => ({ ...p, host: v }))} placeholder="192.168.1.100" />
                <EditableRow label="用户" value={form.user} mono
                  onSave={(v) => setForm(p => ({ ...p, user: v }))} />
                <EditableRow label="端口" value={String(form.port)}
                  onSave={(v) => setForm(p => ({ ...p, port: parseInt(v) || 22 }))} />
                <EditableRow label="密钥" value={form.keyPath} mono
                  onSave={(v) => setForm(p => ({ ...p, keyPath: v }))} />
              </>
            )}

            {(newConn === "docker-local" || newConn === "docker-ssh") && (
              <EditableRow label="容器 ID/名称" value={form.containerId} mono
                onSave={(v) => setForm(p => ({ ...p, containerId: v }))} placeholder="openclaw-container 或 abc123" />
            )}

            {newConn === "gateway-ws" && (
              <>
                <EditableRow label="WebSocket URL" value={form.wsUrl} mono
                  onSave={(v) => setForm(p => ({ ...p, wsUrl: v }))} placeholder="ws://192.168.1.100:18789" />
                <EditableRow label="Token" value={form.wsToken} mono
                  onSave={(v) => setForm(p => ({ ...p, wsToken: v }))} placeholder="Gateway auth token" />
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={addHost}
                className="text-[12px] px-3 py-1 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors">
                添加并扫描
              </button>
              <button onClick={() => setAdding(false)}
                className="text-[12px] text-muted-foreground hover:text-foreground">取消</button>
            </div>
          </div>
        ) : (
          <div className="min-h-[44px] px-1 flex items-center">
            <button onClick={() => setAdding(true)}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">+ 添加远程主机</button>
          </div>
        )}
      </SettingsGroup>

      <div className="text-[11px] text-muted-foreground px-1 space-y-1">
        <p><strong>SSH 直连</strong> — 通过 SSH 直接读取远程服务器上的 Agent 配置</p>
        <p><strong>本地 Docker</strong> — 通过 docker exec 读取本机容器中的 Agent</p>
        <p><strong>远程 Docker</strong> — SSH 到服务器后再 docker exec 进容器</p>
        <p><strong>Gateway WebSocket</strong> — 直连 OpenClaw Gateway，不需要 SSH 权限</p>
      </div>
    </div>
  );
}
