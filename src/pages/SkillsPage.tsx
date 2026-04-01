import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface HubSkill {
  slug: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  installs: number;
  stars: number;
  version: string;
  url: string;
  updated_at: number | null;
  score: number | null;
}

interface ListResult { skills: HubSkill[]; total: number; has_more: boolean; next_cursor: unknown; }
type SortKey = "downloads" | "stars" | "updatedAt";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 3600000) return `${Math.floor(d / 60000)}分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}小时前`;
  return `${Math.floor(d / 86400000)}天前`;
}

const QUICK_TAGS = ["github", "web search", "database", "翻译", "file", "browser", "memory", "code"];

export default function SkillsPage() {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<HubSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("downloads");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<unknown>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const syncDolphinSkills = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("sync_custom_agent_resources", {
        id: "dolphin",
        includeModels: false,
        includeMcpServers: false,
        includeSkills: true,
      });
      const { useAgentsStore } = await import("@/stores/agents-store");
      await useAgentsStore.getState().refresh();
      toast.success("已把 Skills 目录同步到 dolphin");
    } catch (error) {
      toast.error(`同步到 dolphin 失败: ${error}`);
    }
  };

  const installSkill = async (slug: string) => {
    setInstalling(slug);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ success: boolean; stderr: string }>("run_openclaw_cmd", {
        args: ["skills", "install", slug], configPath: null,
      });
      if (result.success) toast.success(`已安装 ${slug}`);
      else toast.error(`安装失败: ${result.stderr.slice(0, 100)}`);
    } catch (err) { toast.error(`安装失败: ${err}`); }
    setInstalling(null);
  };

  const loadList = async (sort?: SortKey, cursor?: unknown) => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const s = sort || sortKey;
      const result = await invoke<ListResult>("list_clawhub_skills", {
        sort: s, dir: "desc", numItems: 25, cursor: cursor || null,
      });
      if (cursor) setSkills(prev => [...prev, ...result.skills]);
      else setSkills(result.skills);
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
      setIsSearchMode(false);
    } catch { setSkills([]); }
    setLoading(false);
  };

  const search = async (q?: string) => {
    const searchQ = q ?? query;
    if (!searchQ.trim()) { loadList(); return; }
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result: { skills: HubSkill[] } = await invoke("search_clawhub_skills", { query: searchQ.trim(), limit: 50 });
      setSkills(result.skills || []);
      setHasMore(false);
      setIsSearchMode(true);
    } catch { setSkills([]); }
    setLoading(false);
  };

  useEffect(() => { loadList(); }, []);

  return (
    <div className="space-y-5 max-w-3xl pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Skills 市场</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">搜索和浏览 ClawHub 上的 Skills</p>
        </div>
        <button
          onClick={() => {
            void syncDolphinSkills();
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          同步到 dolphin
        </button>
      </div>

      {/* Search */}
      <input value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === "Enter" && search()}
        placeholder="搜索..."
        className="glass-input w-full text-[13px] placeholder:text-muted-foreground rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-foreground/10" />

      {/* Quick tags */}
      <div className="flex flex-wrap gap-2">
        {QUICK_TAGS.map(tag => (
          <button key={tag} onClick={() => { setQuery(tag); search(tag); }}
            className="glass-tag text-[11px] px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors">
            {tag}
          </button>
        ))}
      </div>

      {/* Sort */}
      {!isSearchMode && (
        <div className="flex gap-3 px-1">
          {([["downloads", "下载量"], ["stars", "星标"], ["updatedAt", "最近更新"]] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => { setSortKey(key); loadList(key); }}
              className={cn("text-[11px] transition-colors", sortKey === key ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
          <span className="text-[11px] text-muted-foreground ml-auto">{skills.length} 个结果</span>
        </div>
      )}

      {/* Results */}
      {loading && skills.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
      ) : skills.length === 0 ? (
        <div className="glass rounded-2xl py-8 text-center text-[13px] text-muted-foreground">没有结果</div>
      ) : (
        <div className="space-y-2">
          {skills.map(skill => {
            const isExpanded = expandedSlug === skill.slug;
            return (
              <div key={skill.slug} className={cn("rounded-2xl transition-all", isExpanded ? "glass" : "")}>
                <div className={cn("rounded-2xl px-4 py-3 cursor-pointer transition-colors",
                    !isExpanded && "hover:bg-foreground/[0.03]")}
                  onClick={() => setExpandedSlug(isExpanded ? null : skill.slug)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{skill.name}</span>
                      {skill.updated_at && <span className="text-[10px] text-muted-foreground">{timeAgo(skill.updated_at)}</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); installSkill(skill.slug); }}
                      disabled={installing === skill.slug}
                      className="text-[12px] text-muted-foreground hover:text-foreground shrink-0 ml-3 transition-colors">
                      {installing === skill.slug ? <Loader2 className="animate-spin" size={12} /> : "安装"}
                    </button>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{skill.description}</div>
                  <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    {skill.downloads > 0 && <span>{skill.downloads.toLocaleString()} 下载</span>}
                    {skill.stars > 0 && <span>{skill.stars} ★</span>}
                  </div>
                </div>
                {isExpanded && <SkillDetailPanel slug={skill.slug} />}
              </div>
            );
          })}
          {hasMore && !isSearchMode && (
            <button onClick={() => loadList(sortKey, nextCursor)} disabled={loading}
              className="glass-subtle w-full py-3 text-center text-[12px] text-muted-foreground hover:text-foreground rounded-2xl transition-colors">
              {loading ? <Loader2 className="animate-spin mx-auto" size={14} /> : "加载更多"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SkillDetailPanel({ slug }: { slug: string }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [readme, setReadme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    import("@tauri-apps/api/core").then(async ({ invoke }) => {
      const d = await invoke<Record<string, unknown>>("get_skill_detail_convex", { slug });
      setDetail(d);
      const lv = d?.latestVersion as Record<string, unknown> | undefined;
      if (lv?._id) {
        const r = await invoke<{ path: string; text: string }>("get_skill_readme", { versionId: lv._id as string });
        if (r?.text) setReadme(r.text);
      }
    }).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="px-4 pb-4"><Loader2 className="animate-spin text-muted-foreground mx-auto" size={16} /></div>;
  if (!detail) return <div className="px-4 pb-4 text-[13px] text-muted-foreground">加载失败</div>;

  const skill = (detail.skill || {}) as Record<string, unknown>;
  const owner = detail.owner as Record<string, unknown> | null;
  const stats = (skill.stats || {}) as Record<string, number>;
  const lv = detail.latestVersion as Record<string, unknown> | null;
  const files = (lv?.files || []) as { path: string; size: number }[];

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="h-px bg-foreground/5" />

      <div className="flex items-center gap-3">
        {owner?.image != null && <img src={String(owner.image)} className="w-7 h-7 rounded-full" />}
        <span className="text-[13px] font-medium">{String(skill.displayName || slug)}</span>
        {owner?.handle != null && <span className="text-[11px] text-muted-foreground">{String(owner.handle)}</span>}
      </div>

      <div className="flex gap-4 text-[11px] text-muted-foreground">
        {lv?.version != null && <span>v{String(lv.version)}</span>}
        {stats.downloads > 0 && <span>{Math.round(stats.downloads).toLocaleString()} 下载</span>}
        {stats.installsAllTime > 0 && <span>{Math.round(stats.installsAllTime).toLocaleString()} 安装</span>}
        {stats.stars > 0 && <span>{Math.round(stats.stars)} ★</span>}
      </div>

      {/* Readme + files */}
      <div className="flex min-h-[200px] max-h-[400px] glass-subtle rounded-xl overflow-hidden">
        {files.length > 0 && (
          <div className="w-[160px] shrink-0 border-r border-foreground/5 p-2 overflow-y-auto">
            {files.map(f => (
              <div key={f.path} className="text-[11px] py-1 px-2 text-muted-foreground truncate" title={f.path}>{f.path}</div>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-auto p-3">
          {readme ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed
              [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
              [&_p]:my-1.5 [&_p]:text-[13px] [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5 [&_li]:text-[13px]
              [&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
              [&_table]:text-[12px] [&_th]:text-left [&_th]:font-medium [&_th]:pb-1 [&_td]:py-0.5">
              <Markdown remarkPlugins={[remarkGfm]}>{readme}</Markdown>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">{String(skill.summary || "")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {lv?.changelog != null && <p className="text-[11px] text-muted-foreground line-clamp-1 flex-1 mr-4">更新: {String(lv.changelog).split('\n')[0]}</p>}
        <a href={`https://clawhub.ai/skills/${slug}`} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0">ClawHub →</a>
      </div>
    </div>
  );
}
