import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";

const GITHUB_CLIENT_ID = "Ov23licbW8XpmNbEWKle";
const GITHUB_CLIENT_SECRET = "52edca7c282298046ad3b619ed53fc2d697b9706";

export default function AccountPage() {
  const { user, loading, loadFromDisk, login, logout } = useAuthStore();
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => { loadFromDisk(); }, [loadFromDisk]);

  const handleGitHubLogin = async () => {
    setLoggingIn(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<Record<string, unknown>>("github_oauth_login", {
        clientId: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
      });

      const accessToken = result.access_token as string;
      if (!accessToken) {
        toast.error("登录失败：未获取到 token");
        setLoggingIn(false);
        return;
      }

      await login(accessToken);
      if (useAuthStore.getState().user) {
        toast.success("登录成功");
      } else {
        toast.error("获取用户信息失败");
      }
    } catch (err) {
      toast.error(`登录失败: ${err}`);
    }
    setLoggingIn(false);
  };

  // ── Logged in ──
  if (user) {
    return (
      <div className="space-y-6 max-w-xl pb-8">
        <SettingsGroup title="账户">
          <div className="flex items-center gap-3 min-h-[56px] px-1">
            <img src={user.avatar_url} className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <div className="text-[13px] font-medium">{user.name || user.login}</div>
              <div className="text-[12px] text-muted-foreground">@{user.login}</div>
              {user.email && <div className="text-[11px] text-muted-foreground">{user.email}</div>}
            </div>
            <button onClick={() => { logout(); toast.success("已退出"); }}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">退出</button>
          </div>
        </SettingsGroup>

        <SettingsGroup title="云同步" description="即将推出">
          <div className="min-h-[44px] px-1 flex items-center text-[13px] text-muted-foreground">
            配置同步功能正在开发中
          </div>
        </SettingsGroup>
      </div>
    );
  }

  // ── Login ──
  return (
    <div className="space-y-6 max-w-xl pb-8">
      <div>
        <h1 className="text-lg font-semibold">登录</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">使用 GitHub 账户登录 AgentHub</p>
      </div>

      <button onClick={handleGitHubLogin} disabled={loggingIn}
        className="glass w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left hover:bg-foreground/[0.03] transition-colors disabled:opacity-50">
        {loggingIn ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        )}
        <div>
          <div className="text-[13px] font-medium">{loggingIn ? "正在打开 GitHub..." : "使用 GitHub 登录"}</div>
          <div className="text-[11px] text-muted-foreground">{loggingIn ? "在浏览器中完成授权后自动登录" : "点击后在浏览器中授权"}</div>
        </div>
      </button>
    </div>
  );
}
