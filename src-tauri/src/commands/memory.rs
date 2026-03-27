use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub source_agent: String,
    pub source_icon: String,
    pub created_at: String,
    pub tags: Vec<String>,
    pub synced_to: Vec<String>,
}

#[derive(Serialize)]
pub struct AgentMemoryInfo {
    pub agent_id: String,
    pub agent_name: String,
    pub agent_icon: String,
    pub memory_dir: String,
    pub memory_count: usize,
    pub format: String,
    pub entries: Vec<MemoryEntry>,
}

fn scan_dir_for_md_files(dir: &PathBuf) -> Vec<(String, String, String)> {
    // Returns (filename, content, modified_date)
    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let name = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let content = fs::read_to_string(&path).unwrap_or_default();
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        chrono::DateTime::<chrono::Local>::from(t)
                            .format("%Y-%m-%d")
                            .to_string()
                    })
                    .unwrap_or_default();
                results.push((name, content, modified));
            }
        }
    }
    results
}

/// Scan all detected agents for their memory files
#[tauri::command]
pub fn scan_agent_memories() -> Result<Vec<AgentMemoryInfo>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let mut all = Vec::new();

    // OpenClaw memory
    let oc_mem = home.join(".openclaw").join("memory");
    if oc_mem.exists() {
        let files = scan_dir_for_md_files(&oc_mem);
        let entries: Vec<MemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| MemoryEntry {
                id: format!("openclaw-{}", i),
                content: content.lines().take(3).collect::<Vec<_>>().join(" ").chars().take(200).collect(),
                source_agent: "OpenClaw".into(),
                source_icon: "🦞".into(),
                created_at: date.clone(),
                tags: vec![name.clone()],
                synced_to: vec![],
            })
            .collect();
        all.push(AgentMemoryInfo {
            agent_id: "openclaw".into(),
            agent_name: "OpenClaw".into(),
            agent_icon: "🦞".into(),
            memory_dir: oc_mem.to_string_lossy().to_string(),
            memory_count: entries.len(),
            format: "markdown".into(),
            entries,
        });
    }

    // Claude Code — CLAUDE.md files in projects
    let claude_projects = home.join(".claude").join("projects");
    if claude_projects.exists() {
        let mut entries = Vec::new();
        if let Ok(project_dirs) = fs::read_dir(&claude_projects) {
            for dir in project_dirs.filter_map(|e| e.ok()).take(10) {
                let claude_md = dir.path().join("CLAUDE.md");
                if claude_md.exists() {
                    let content = fs::read_to_string(&claude_md).unwrap_or_default();
                    let name = dir.file_name().to_string_lossy().to_string();
                    entries.push(MemoryEntry {
                        id: format!("claude-{}", name),
                        content: content.lines().take(3).collect::<Vec<_>>().join(" ").chars().take(200).collect(),
                        source_agent: "Claude Code".into(),
                        source_icon: "🤖".into(),
                        created_at: String::new(),
                        tags: vec!["CLAUDE.md".into(), name],
                        synced_to: vec![],
                    });
                }
            }
        }
        all.push(AgentMemoryInfo {
            agent_id: "claude-code".into(),
            agent_name: "Claude Code".into(),
            agent_icon: "🤖".into(),
            memory_dir: claude_projects.to_string_lossy().to_string(),
            memory_count: entries.len(),
            format: "markdown (CLAUDE.md)".into(),
            entries,
        });
    }

    // Codex memories
    let codex_mem = home.join(".codex").join("memories");
    if codex_mem.exists() {
        let files = scan_dir_for_md_files(&codex_mem);
        let entries: Vec<MemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| MemoryEntry {
                id: format!("codex-{}", i),
                content: content.lines().take(3).collect::<Vec<_>>().join(" ").chars().take(200).collect(),
                source_agent: "Codex".into(),
                source_icon: "📦".into(),
                created_at: date.clone(),
                tags: vec![name.clone()],
                synced_to: vec![],
            })
            .collect();
        all.push(AgentMemoryInfo {
            agent_id: "codex".into(),
            agent_name: "Codex CLI".into(),
            agent_icon: "📦".into(),
            memory_dir: codex_mem.to_string_lossy().to_string(),
            memory_count: entries.len(),
            format: "markdown".into(),
            entries,
        });
    }

    // QClaw memory
    let qc_mem = home.join(".qclaw").join("qmemory");
    if qc_mem.exists() {
        let files = scan_dir_for_md_files(&qc_mem);
        let entries: Vec<MemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| MemoryEntry {
                id: format!("qclaw-{}", i),
                content: content.lines().take(3).collect::<Vec<_>>().join(" ").chars().take(200).collect(),
                source_agent: "QClaw".into(),
                source_icon: "🦀".into(),
                created_at: date.clone(),
                tags: vec![name.clone()],
                synced_to: vec![],
            })
            .collect();
        all.push(AgentMemoryInfo {
            agent_id: "qclaw".into(),
            agent_name: "QClaw".into(),
            agent_icon: "🦀".into(),
            memory_dir: qc_mem.to_string_lossy().to_string(),
            memory_count: entries.len(),
            format: "markdown".into(),
            entries,
        });
    }

    Ok(all)
}
