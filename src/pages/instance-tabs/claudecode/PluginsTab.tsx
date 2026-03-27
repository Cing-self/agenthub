import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  agent: { home_dir: string };
}

interface MarketPlugin {
  name: string;
  description?: string;
  category?: string;
  homepage?: string;
  author?: { name?: string };
}

interface MarketplaceData {
  name: string;
  description: string;
  plugins: MarketPlugin[];
}

type FilterCategory = "all" | string;

export default function ClaudeCodePluginsTab({ agent }: Props) {
  const [marketplaces, setMarketplaces] = useState<MarketplaceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [search, setSearch] = useState("");
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const data = await invoke<{ marketplaces: MarketplaceData[] }>("list_marketplace_plugins", { homeDir: agent.home_dir });
        setMarketplaces(data.marketplaces || []);
      } catch { setMarketplaces([]); }
      setLoading(false);
    };
    load();
  }, [agent.home_dir]);

  const allPlugins = marketplaces.flatMap(m => m.plugins);
  const categories = [...new Set(allPlugins.map(p => p.category || "uncategorized").filter(Boolean))].sort();

  const filtered = allPlugins.filter(p => {
    if (category !== "all" && (p.category || "uncategorized") !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const expandPlugin = async (name: string) => {
    if (expandedPlugin === name) { setExpandedPlugin(null); setReadmeContent(null); return; }
    setExpandedPlugin(name);
    setReadmeContent(null);
    setReadmeLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const mp of marketplaces) {
        for (const subdir of ["plugins", "external_plugins"]) {
          try {
            const text = await invoke<string>("read_text_file", {
              path: `${agent.home_dir}/plugins/marketplaces/${mp.name}/${subdir}/${name}/README.md`,
              maxBytes: 200000,
            });
            if (text) { setReadmeContent(text); setReadmeLoading(false); return; }
          } catch { /* next */ }
        }
      }
    } catch { /* */ }
    setReadmeLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;
  }

  return (
    <div className="space-y-4 max-w-3xl pb-8">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1">
        插件市场 ({allPlugins.length})
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="搜索插件..."
        className="w-full text-[13px] placeholder:text-muted-foreground rounded-lg border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground/20" />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategory("all")}
          className={cn("text-[11px] px-2.5 py-1 rounded-full transition-colors",
            category === "all" ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground")}>
          全部
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={cn("text-[11px] px-2.5 py-1 rounded-full transition-colors",
              category === cat ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground")}>
            {cat}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-muted-foreground px-1">{filtered.length} 个插件</div>

      <div className="space-y-1">
        {filtered.map(plugin => {
          const isOpen = expandedPlugin === plugin.name;
          return (
            <div key={plugin.name}>
              <div className={cn("rounded-lg px-3 py-2.5 cursor-pointer transition-colors", isOpen ? "bg-card/80" : "hover:bg-foreground/[0.03]")}
                onClick={() => expandPlugin(plugin.name)}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{plugin.name}</span>
                  {plugin.category && <span className="text-[10px] text-muted-foreground">{plugin.category}</span>}
                </div>
                {plugin.description && <div className={cn("text-[12px] text-muted-foreground mt-0.5 leading-tight", !isOpen && "line-clamp-1")}>{plugin.description}</div>}
              </div>
              {isOpen && (
                <div className="rounded-b-lg bg-card/80 border-t border-border/30 max-h-[400px] overflow-auto">
                  {readmeLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="animate-spin text-muted-foreground" size={16} /></div>
                  ) : readmeContent ? (
                    <div className="p-4 prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed
                      [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
                      [&_p]:my-1.5 [&_p]:text-[13px] [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5 [&_li]:text-[13px]
                      [&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                      [&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0">
                      <Markdown remarkPlugins={[remarkGfm]}>{readmeContent}</Markdown>
                    </div>
                  ) : (
                    <div className="p-4 text-[13px] text-muted-foreground">没有 README</div>
                  )}
                  {plugin.homepage && (
                    <div className="px-4 pb-3 border-t border-border/20 pt-2">
                      <a href={plugin.homepage} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">查看主页 →</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
