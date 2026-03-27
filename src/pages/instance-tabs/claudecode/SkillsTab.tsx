import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface Props {
  agent: { home_dir: string };
}

interface SkillItem { name: string; displayName?: string; description?: string; path: string; isSymlink: boolean; }
interface TreeNode { name: string; path: string; isDir: boolean; size: number; children?: TreeNode[]; }
interface HubSkill { slug: string; name: string; description: string; author: string; author_image: string | null; downloads: number; installs: number; stars: number; version: string; updated_at: number | null; score: number | null; changelog: string | null; }
interface ListResult { skills: HubSkill[]; total: number; has_more: boolean; next_cursor: unknown; }

type SortKey = "downloads" | "stars" | "updatedAt";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 3600000) return `${Math.floor(d / 60000)}分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}小时前`;
  return `${Math.floor(d / 86400000)}天前`;
}

// ── Tree ──
function TreeItem({ node, depth, selectedPath, onSelect }: { node: TreeNode; depth: number; selectedPath: string; onSelect: (p: string, n: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.isDir) return (
    <div>
      <div className="flex items-center gap-1 py-1 cursor-pointer hover:bg-foreground/[0.03] rounded px-1" style={{ paddingLeft: depth * 12 }} onClick={() => setOpen(!open)}>
        <span className="text-[11px] text-muted-foreground/40 w-3">{open ? "▾" : "▸"}</span>
        <span className="text-[12px]">{node.name}/</span>
      </div>
      {open && node.children?.map(c => <TreeItem key={c.path} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />)}
    </div>
  );
  return (
    <div className={cn("flex items-center gap-1 py-1 cursor-pointer rounded px-1", selectedPath === node.path ? "bg-foreground/5" : "hover:bg-foreground/[0.03]")}
      style={{ paddingLeft: depth * 12 + 16 }} onClick={() => onSelect(node.path, node.name)}>
      <span className="text-[12px] truncate">{node.name}</span>
      <span className="text-[10px] text-muted-foreground/30 ml-auto shrink-0">{formatSize(node.size)}</span>
    </div>
  );
}

// ── File Viewer ──
function FileViewer({ path, name }: { path: string; name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    import("@tauri-apps/api/core").then(({ invoke }) => invoke<string>("read_text_file", { path, maxBytes: 500000 }))
      .then(setContent).catch(() => setContent(null)).finally(() => setLoading(false));
  }, [path]);
  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={16} /></div>;
  if (!content) return <div className="text-[12px] text-muted-foreground/50 py-4">无法读取</div>;
  if (name.toLowerCase().endsWith(".md")) return (
    <div className="prose prose-sm dark:prose-invert max-w-none px-1 py-2 text-[13px] leading-relaxed
      [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
      [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1.5 [&_p]:text-[13px]
      [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5 [&_li]:text-[13px]
      [&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
      [&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
      [&_a]:text-foreground/70 [&_a]:underline [&_a]:decoration-foreground/20">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
  return <pre className="text-[11px] font-mono leading-relaxed p-3 overflow-x-auto bg-foreground/[0.02] rounded-lg whitespace-pre">{content}</pre>;
}

// ── Hub Skill Detail Panel ──
interface ConvexFile { path: string; contentType: string; size: number; }
interface ConvexDetail {
  skill: { slug: string; displayName: string; summary: string; stats: { downloads: number; installsAllTime: number; stars: number }; updatedAt: number };
  owner: { handle: string; displayName: string; image: string } | null;
  latestVersion: { _id: string; version: string; changelog: string; files: ConvexFile[] } | null;
}

function HubSkillDetail({ slug }: { slug: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ConvexDetail | null>(null);
  const [readme, setReadme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    import("@tauri-apps/api/core").then(async ({ invoke }) => {
      const d = await invoke<ConvexDetail>("get_skill_detail_convex", { slug });
      setDetail(d);
      // Load readme
      if (d?.latestVersion?._id) {
        const r = await invoke<{ path: string; text: string }>("get_skill_readme", { versionId: d.latestVersion._id });
        if (r?.text) setReadme(r.text);
      }
    }).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="rounded-b-lg bg-card/80 p-4"><Loader2 className="animate-spin text-muted-foreground mx-auto" size={16} /></div>;
  if (!detail?.skill) return <div className="rounded-b-lg bg-card/80 p-4 text-[13px] text-muted-foreground/50">加载失败</div>;

  const { skill, owner, latestVersion } = detail;
  const files = latestVersion?.files || [];

  return (
    <div className="rounded-b-lg bg-card/80 border-t border-border/30">
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          {owner?.image && <img src={owner.image} className="w-7 h-7 rounded-full" />}
          <div>
            <span className="text-[13px] font-medium">{skill.displayName}</span>
            {owner && <span className="text-[11px] text-muted-foreground/40 ml-2">{owner.handle}</span>}
          </div>
        </div>
        <div className="flex gap-4 text-[11px] text-muted-foreground/40">
          {latestVersion?.version && <span>v{latestVersion.version}</span>}
          {skill.stats?.downloads > 0 && <span>{Math.round(skill.stats.downloads).toLocaleString()} 下载</span>}
          {skill.stats?.installsAllTime > 0 && <span>{Math.round(skill.stats.installsAllTime).toLocaleString()} 安装</span>}
          {skill.stats?.stars > 0 && <span>{Math.round(skill.stats.stars)} ★</span>}
        </div>
      </div>

      {/* Content: file list + readme */}
      <div className="flex min-h-[250px] max-h-[400px] border-t border-border/20">
        {/* File list */}
        {files.length > 0 && (
          <div className="w-[180px] shrink-0 border-r border-border/20 p-2 overflow-y-auto">
            {files.map(f => (
              <div key={f.path}
                className={cn("text-[11px] py-1 px-2 rounded cursor-pointer truncate",
                  selectedFile === f.path ? "bg-foreground/5" : "hover:bg-foreground/[0.03]",
                  f.path === "SKILL.md" && "font-medium"
                )}
                onClick={() => setSelectedFile(f.path)}
                title={f.path}>
                {f.path}
              </div>
            ))}
          </div>
        )}

        {/* Content preview */}
        <div className="flex-1 overflow-auto p-3">
          {selectedFile && selectedFile !== "SKILL.md" ? (
            <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
              <div className="text-center">
                <div className="font-mono text-[12px]">{selectedFile}</div>
                <div className="text-[11px] mt-1">远程文件暂不支持预览，安装后可查看</div>
              </div>
            </div>
          ) : readme ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed
              [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
              [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1.5 [&_p]:text-[13px]
              [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5 [&_li]:text-[13px]
              [&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
              [&_table]:text-[12px] [&_th]:text-left [&_th]:font-medium [&_th]:pb-1 [&_td]:py-0.5">
              <Markdown remarkPlugins={[remarkGfm]}>{readme}</Markdown>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground/50">{skill.summary}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-border/20">
        {latestVersion?.changelog && (
          <p className="text-[11px] text-muted-foreground/40 line-clamp-1 flex-1 mr-4">更新: {latestVersion.changelog.split('\n')[0]}</p>
        )}
        <a href={`https://clawhub.ai/skills/${slug}`} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors shrink-0">
          ClawHub →
        </a>
      </div>
    </div>
  );
}

// ── Main ──
export default function ClaudeCodeSkillsTab({ agent }: Props) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);

  const [tab, setTab] = useState<"installed" | "market">("installed");
  const [searchQuery, setSearchQuery] = useState("");
  const [hubResults, setHubResults] = useState<HubSkill[]>([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("downloads");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<unknown>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

  const loadInstalled = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const items = await invoke<SkillItem[]>("scan_directory_items", { path: `${agent.home_dir}/skills`, readFrontmatter: true });
      setSkills(items);
    } catch { setSkills([]); }
    setLoading(false);
  };

  useEffect(() => { loadInstalled(); }, [agent.home_dir]);

  const openSkill = async (skill: SkillItem) => {
    if (selectedSkill === skill.name) { setSelectedSkill(null); setTree(null); setSelectedFile(null); return; }
    setSelectedSkill(skill.name); setTreeLoading(true); setSelectedFile(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const nodes = await invoke<TreeNode[]>("scan_directory_tree", { path: skill.path });
      setTree(nodes);
      const md = nodes.find(n => n.name === "SKILL.md");
      if (md) setSelectedFile({ path: md.path, name: md.name });
    } catch { setTree([]); }
    setTreeLoading(false);
  };

  const loadList = async (sort?: SortKey, cursor?: unknown) => {
    setHubLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const s = sort || sortKey;
      const result = await invoke<ListResult>("list_clawhub_skills", {
        sort: s, dir: "desc", numItems: 25, cursor: cursor || null,
      });
      if (cursor) {
        setHubResults(prev => [...prev, ...result.skills]);
      } else {
        setHubResults(result.skills);
      }
      setHasMore(result.has_more);
      setNextCursor(result.next_cursor);
      setIsSearchMode(false);
    } catch { setHubResults([]); }
    setHubLoading(false);
  };

  const searchHub = async () => {
    if (!searchQuery.trim()) { loadList(); return; }
    setHubLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result: { skills: HubSkill[] } = await invoke("search_clawhub_skills", { query: searchQuery.trim(), limit: 50 });
      setHubResults(result.skills || []);
      setHasMore(false);
      setIsSearchMode(true);
    } catch { setHubResults([]); }
    setHubLoading(false);
  };

  const installSkill = async (slug: string) => {
    setInstalling(slug);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ success: boolean; stderr: string }>("run_openclaw_cmd", { args: ["skills", "install", slug], configPath: null });
      if (result.success) { toast.success(`已安装 ${slug}`); await loadInstalled(); }
      else toast.error(`安装失败: ${result.stderr.slice(0, 100)}`);
    } catch (err) { toast.error(`安装失败: ${err}`); }
    setInstalling(null);
  };

  useEffect(() => { if (tab === "market" && hubResults.length === 0) loadList(); }, [tab]);

  return (
    <div className="space-y-4 max-w-3xl pb-8">
      <div className="flex items-center gap-4 px-1">
        <button onClick={() => setTab("installed")}
          className={cn("text-[13px] pb-1 transition-colors", tab === "installed" ? "text-foreground border-b border-foreground" : "text-muted-foreground/50 hover:text-foreground")}>
          已安装 ({skills.length})
        </button>
        <button onClick={() => setTab("market")}
          className={cn("text-[13px] pb-1 transition-colors", tab === "market" ? "text-foreground border-b border-foreground" : "text-muted-foreground/50 hover:text-foreground")}>
          市场
        </button>
      </div>

      {/* ── Installed ── */}
      {tab === "installed" && (
        loading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
        : skills.length === 0 ? <div className="rounded-xl bg-card/80 py-8 text-center text-[13px] text-muted-foreground/50">没有安装 Skill</div>
        : <div className="space-y-1">
            {skills.map(skill => {
              const isOpen = selectedSkill === skill.name;
              return (
                <div key={skill.name} className="group">
                  <div className={cn("rounded-lg px-3 py-2.5 cursor-pointer transition-colors", isOpen ? "bg-card/80" : "hover:bg-foreground/[0.03]")}
                    onClick={() => openSkill(skill)}>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] flex-1">{skill.displayName || skill.name}</span>
                      {skill.isSymlink && <span className="text-[10px] text-muted-foreground/25">↗</span>}
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`确定卸载 ${skill.displayName || skill.name}？`)) return;
                        try {
                          const { invoke } = await import("@tauri-apps/api/core");
                          await invoke("uninstall_skill", { path: `${agent.home_dir}/skills/${skill.name}` });
                          toast.success(`已卸载 ${skill.name}`);
                          if (selectedSkill === skill.name) setSelectedSkill(null);
                          await loadInstalled();
                        } catch (err) { toast.error(`卸载失败: ${err}`); }
                      }} className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">
                        卸载
                      </button>
                    </div>
                    {skill.description && <div className={cn("text-[12px] text-muted-foreground mt-0.5 leading-tight", !isOpen && "line-clamp-1")}>{skill.description}</div>}
                  </div>
                  {isOpen && (
                    <div className="rounded-b-lg bg-card/80 border-t border-border/30">
                      {treeLoading ? <div className="flex items-center justify-center py-6"><Loader2 className="animate-spin" size={16} /></div>
                      : <div>
                          <div className="flex min-h-[300px] max-h-[500px]">
                            <div className="w-[200px] shrink-0 border-r border-border/30 p-2 overflow-y-auto">
                              {tree?.map(n => <TreeItem key={n.path} node={n} depth={0} selectedPath={selectedFile?.path || ""} onSelect={(p, n) => setSelectedFile({ path: p, name: n })} />)}
                            </div>
                            <div className="flex-1 overflow-auto p-3">
                              {selectedFile ? <div><div className="text-[11px] text-muted-foreground mb-2 font-mono">{selectedFile.name}</div><FileViewer key={selectedFile.path} path={selectedFile.path} name={selectedFile.name} /></div>
                              : <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">选择文件查看</div>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2 border-t border-border/30">
                            <span className="text-[11px] text-muted-foreground font-mono">{skill.path}</span>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`确定卸载 ${skill.displayName || skill.name}？`)) return;
                              try {
                                const { invoke } = await import("@tauri-apps/api/core");
                                const skillDir = `${agent.home_dir}/skills/${skill.name}`;
                                await invoke("uninstall_skill", { path: skillDir });
                                toast.success(`已卸载 ${skill.name}`);
                                setSelectedSkill(null);
                                await loadInstalled();
                              } catch (err) { toast.error(`卸载失败: ${err}`); }
                            }} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                              卸载
                            </button>
                          </div>
                        </div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      )}

      {/* ── Market ── */}
      {tab === "market" && (
        <>
          <div className="flex items-center gap-2 px-1">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchHub()}
              placeholder="搜索 ClawHub..."
              className="flex-1 text-[13px] placeholder:text-muted-foreground rounded-lg border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground/20" />
          </div>
          {!isSearchMode && (
            <div className="flex gap-3 px-1">
              {([["downloads", "下载量"], ["stars", "星标"], ["updatedAt", "最近更新"]] as [SortKey, string][]).map(([key, label]) => (
                <button key={key} onClick={() => { setSortKey(key); loadList(key); }}
                  className={cn("text-[11px] transition-colors", sortKey === key ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {hubLoading && hubResults.length === 0 ? <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>
          : hubResults.length === 0 ? <div className="text-center text-[13px] text-muted-foreground/50 py-8">没有结果</div>
          : <div className="space-y-1">
              {hubResults.map(skill => {
                const isInstalled = skills.some(s => s.name === skill.slug);
                const isExpanded = expandedSlug === skill.slug;
                return (
                  <div key={skill.slug}>
                    <div className={cn("rounded-lg px-3 py-2.5 transition-colors cursor-pointer", isExpanded ? "bg-card/80" : "hover:bg-foreground/[0.03]")}
                      onClick={() => setExpandedSlug(isExpanded ? null : skill.slug)}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px]">{skill.name}</span>
                            {skill.author && <span className="text-[10px] text-muted-foreground">{skill.author}</span>}
                          </div>
                          <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{skill.description}</div>
                          <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                            {skill.downloads > 0 && <span>{skill.downloads.toLocaleString()} 下载</span>}
                            {skill.stars > 0 && <span>{skill.stars} ★</span>}
                            {skill.updated_at && <span>{timeAgo(skill.updated_at)}</span>}
                          </div>
                        </div>
                        {isInstalled ? (
                          <span className="text-[11px] text-muted-foreground/40 shrink-0 ml-3">已安装</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); installSkill(skill.slug); }}
                            disabled={installing === skill.slug}
                            className="text-[12px] text-foreground/60 hover:text-foreground shrink-0 ml-3 transition-colors">
                            {installing === skill.slug ? <Loader2 className="animate-spin" size={12} /> : "安装"}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && <HubSkillDetail slug={skill.slug} onClose={() => setExpandedSlug(null)} />}
                  </div>
                );
              })}
              {hasMore && !isSearchMode && (
                <button onClick={() => loadList(sortKey, nextCursor)}
                  disabled={hubLoading}
                  className="w-full py-3 text-center text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors">
                  {hubLoading ? <Loader2 className="animate-spin mx-auto" size={14} /> : "加载更多"}
                </button>
              )}
            </div>}
        </>
      )}
    </div>
  );
}
