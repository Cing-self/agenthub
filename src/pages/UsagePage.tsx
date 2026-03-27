import { useEffect, useState } from "react";
import { DollarSign, RefreshCw, Loader2, AlertTriangle, Check, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface BalanceInfo {
  currency: string;
  total_balance: string;
  is_available: boolean;
}

interface ProviderUsage {
  provider_id: string;
  provider_name: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  balance: BalanceInfo | null;
  period: string;
  error: string | null;
}

interface UsageSummary {
  providers: ProviderUsage[];
  total_cost_usd: number;
}

const DASHBOARD_LINKS: { name: string; url: string; providerIds: string[] }[] = [
  { name: "Anthropic Console", url: "https://console.anthropic.com/settings/billing", providerIds: ["anthropic"] },
  { name: "OpenAI Usage", url: "https://platform.openai.com/usage", providerIds: ["openai"] },
  { name: "DeepSeek Dashboard", url: "https://platform.deepseek.com/usage", providerIds: ["deepseek"] },
  { name: "Google AI Studio", url: "https://aistudio.google.com/billing", providerIds: ["googleapis"] },
  { name: "xAI Console", url: "https://console.x.ai/billing", providerIds: ["xai"] },
  { name: "OpenRouter Activity", url: "https://openrouter.ai/activity", providerIds: ["openrouter"] },
  { name: "MiniMax Platform", url: "https://platform.minimax.io/console/billing", providerIds: ["minimax-io", "minimaxi"] },
  { name: "智谱 AI 开放平台", url: "https://open.bigmodel.cn/console/billing", providerIds: ["bigmodel"] },
  { name: "火山引擎 (豆包)", url: "https://console.volcengine.com/billing", providerIds: ["volcengine"] },
  { name: "Moonshot 平台", url: "https://platform.moonshot.ai/console/billing", providerIds: ["moonshot-ai", "moonshot-cn"] },
  { name: "阿里云 DashScope", url: "https://dashscope.console.aliyun.com/billing", providerIds: ["dashscope", "dashscope-intl"] },
];

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<UsageSummary>("get_api_usage");
      setUsage(data);
    } catch (err) {
      console.error("Failed to load API usage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsage(); }, []);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // Get configured provider ids for filtering dashboard links
  const configuredIds = usage?.providers.map((p) => p.provider_id) || [];
  const relevantLinks = DASHBOARD_LINKS.filter((l) =>
    l.providerIds.some((pid) => configuredIds.includes(pid))
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <DollarSign size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">API Usage</h1>
            <p className="text-sm text-muted-foreground">Account-level usage from provider APIs</p>
          </div>
        </div>
        <button onClick={loadUsage} disabled={loading} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
      )}

      {usage && !loading && (
        <>
          {/* Total cost */}
          {usage.total_cost_usd > 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <div className="text-xs text-muted-foreground mb-1">Total Estimated Cost (This Month)</div>
              <div className="text-3xl font-semibold text-primary">${usage.total_cost_usd.toFixed(2)}</div>
            </div>
          )}

          {/* Provider cards */}
          {usage.providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
              <p>No providers configured</p>
              <p className="text-sm mt-1">Add API keys in the Models page to see usage data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usage.providers.map((p) => {
                const hasData = !p.error && (p.total_input_tokens > 0 || p.total_output_tokens > 0);
                const hasBalance = !p.error && p.balance;
                const isUnsupported = p.error?.includes("No usage API") || p.error?.includes("dashboard");
                const isNoKey = p.error?.includes("No API key");

                return (
                  <div key={p.provider_id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{p.provider_name}</span>
                      <div className="flex items-center gap-2">
                        {(hasData || hasBalance) && (
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <Check size={12} /> Connected
                          </span>
                        )}
                        {isNoKey && (
                          <span className="text-xs text-yellow-500 flex items-center gap-1">
                            <AlertTriangle size={12} /> No API key
                          </span>
                        )}
                        {isUnsupported && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info size={12} /> Use dashboard
                          </span>
                        )}
                        {p.error && !isUnsupported && !isNoKey && (
                          <span className="text-xs text-yellow-500 flex items-center gap-1">
                            <AlertTriangle size={12} /> {p.error}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Balance info */}
                    {hasBalance && p.balance && (
                      <div className="flex items-center gap-4 text-sm mb-1">
                        <div>
                          <div className="text-muted-foreground text-xs">Balance</div>
                          <div className="text-lg font-semibold text-primary">
                            {p.balance.currency === "CNY" ? "¥" : "$"}{p.balance.total_balance}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Status</div>
                          <div className={cn("text-sm font-medium", p.balance.is_available ? "text-emerald-400" : "text-red-400")}>
                            {p.balance.is_available ? "Available" : "Insufficient"}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Token usage details */}
                    {hasData && (
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">Period</div>
                          <div className="font-mono text-xs">{p.period || "—"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Input Tokens</div>
                          <div className="font-mono">{fmt(p.total_input_tokens)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Output Tokens</div>
                          <div className="font-mono">{fmt(p.total_output_tokens)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Est. Cost</div>
                          <div className="font-mono text-primary">${p.total_cost_usd.toFixed(2)}</div>
                        </div>
                      </div>
                    )}

                    {/* Show relevant dashboard link for this provider */}
                    {(isUnsupported || hasData || hasBalance) && (() => {
                      const link = DASHBOARD_LINKS.find((l) => l.providerIds.includes(p.provider_id));
                      return link ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener"
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
                        >
                          <ExternalLink size={11} />
                          View on {link.name}
                        </a>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {/* All dashboard links */}
          {relevantLinks.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">All Provider Dashboards</h2>
              <div className="flex flex-wrap gap-2">
                {relevantLinks.map((link) => (
                  <a key={link.name} href={link.url} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary px-3 py-1.5 rounded-md transition-colors">
                    <ExternalLink size={12} />
                    {link.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="rounded-lg bg-muted/30 p-4 flex items-start gap-3 text-xs text-muted-foreground">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>Usage API availability varies by provider. Anthropic requires an Admin key (<code className="bg-secondary px-1 rounded">sk-ant-admin...</code>). Most providers don't expose a usage API — use their web dashboard instead.</p>
              <p>For real-time per-request tracking, enable the AgentHub proxy (coming soon).</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
