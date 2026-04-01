use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use sysinfo::System;

// ── Agent Instance (auto-detected) ────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct DetectedAgent {
    pub id: String,
    pub agent_type: String,
    pub runtime_family: Option<String>,
    pub name: String,
    pub icon: String,
    pub config_path: String,
    pub home_dir: String,
    pub running: bool,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub version: Option<String>,
    pub runtime_profile: Option<RuntimeProfile>,
    pub details: AgentDetails,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RuntimeProfile {
    pub runtime_family: String,
    pub auth_source: Option<String>,
    pub default_model: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum AgentDetails {
    #[serde(rename = "openclaw")]
    OpenClaw {
        variant: String, // "openclaw", "qclaw", etc.
        has_discord: bool,
        has_telegram: bool,
        has_whatsapp: bool,
        has_feishu: bool,
        has_slack: bool,
        has_weixin: bool,
        agent_count: usize,
        workspace_count: usize,
    },
    #[serde(rename = "claude-code")]
    ClaudeCode {
        has_skills: bool,
        has_plugins: bool,
        project_count: usize,
    },
    #[serde(rename = "codex")]
    Codex {
        has_config: bool,
        has_skills: bool,
    },
    #[serde(rename = "opencode")]
    OpenCode {
        has_agents: bool,
        has_skills: bool,
    },
    #[serde(rename = "custom-agent")]
    CustomAgent {
        based_on_runtime: String,
        auth_source: Option<String>,
        default_model: Option<String>,
    },
}

#[derive(Serialize)]
pub struct HealthStatus {
    pub agents: Vec<DetectedAgent>,
    pub total_running: usize,
    pub total_detected: usize,
}

// ── Helpers ───────────────────────────────────────────

fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"))
}

fn dir_entry_count(path: &PathBuf) -> usize {
    std::fs::read_dir(path)
        .map(|entries| entries.filter_map(|e| e.ok()).count())
        .unwrap_or(0)
}

fn count_dirs_with_prefix(dir: &PathBuf, prefix: &str) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with(prefix)
                        && e.file_type().map(|ft| ft.is_dir()).unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn read_version(dir: &PathBuf) -> Option<String> {
    std::fs::read_to_string(dir.join("update-check.json"))
        .ok()
        .and_then(|s| {
            serde_json::from_str::<serde_json::Value>(&s)
                .ok()
                .and_then(|v| v.get("version").and_then(|v| v.as_str().map(String::from)))
        })
}

// ── OpenClaw variant definition ──────────────────────

struct ClawVariant {
    id: &'static str,
    name: &'static str,
    icon: &'static str,
    dir_name: &'static str,          // ~/.{dir_name}/
    alt_config_dir: Option<&'static str>, // for apps that store config elsewhere (e.g. ~/Library/Application Support/X/)
    config_filename: &'static str,    // usually "openclaw.json" or "settings.json"
    process_keywords: Vec<&'static str>,
    app_path: Option<&'static str>,
}

#[derive(Deserialize, Clone, Debug)]
struct CustomAgentConfig {
    id: String,
    name: String,
    icon: Option<String>,
    runtime_profile: RuntimeProfile,
}

fn claw_variants() -> Vec<ClawVariant> {
    vec![
        ClawVariant {
            id: "openclaw",
            name: "OpenClaw",
            icon: "🦞",
            dir_name: "openclaw",
            alt_config_dir: None,
            config_filename: "openclaw.json",
            process_keywords: vec!["openclaw-gateway", "openclaw"],
            app_path: None,
        },
        ClawVariant {
            id: "qclaw",
            name: "QClaw",
            icon: "🦀",
            dir_name: "qclaw",
            alt_config_dir: None,
            config_filename: "openclaw.json",
            process_keywords: vec!["qclaw", "QClaw"],
            app_path: Some("/Applications/QClaw.app"),
        },
        ClawVariant {
            id: "autoclaw",
            name: "AutoClaw",
            icon: "🤯",
            dir_name: "autoclaw",    // may not exist; uses alt_config_dir
            alt_config_dir: Some("AutoClaw"), // ~/Library/Application Support/AutoClaw/
            config_filename: "settings.json",
            process_keywords: vec!["autoclaw", "AutoClaw"],
            app_path: Some("/Applications/AutoClaw.app"),
        },
    ]
}

/// Resolve the home directory of a claw variant
fn resolve_claw_dir(variant: &ClawVariant) -> Option<PathBuf> {
    let home = home_dir();

    // First try ~/.{dir_name}/
    let dot_dir = home.join(format!(".{}", variant.dir_name));
    if dot_dir.exists() {
        return Some(dot_dir);
    }

    // Then try ~/Library/Application Support/{alt}/
    if let Some(alt) = variant.alt_config_dir {
        let app_support = home.join("Library/Application Support").join(alt);
        if app_support.exists() {
            return Some(app_support);
        }
    }

    // Check if the .app exists even if no config dir yet
    if let Some(app) = variant.app_path {
        if PathBuf::from(app).exists() {
            // App installed but no config created yet — still detect it
            return variant.alt_config_dir.map(|alt| {
                home.join("Library/Application Support").join(alt)
            });
        }
    }

    None
}

// ── Fallback process detection via pgrep (macOS) ─────
// sysinfo on macOS often returns wrong process names (e.g. "node" instead of
// "openclaw-gateway") because the kernel's PROC_PIDTASKALLINFO truncates names
// and cmd() returns empty due to privacy restrictions. `pgrep -f` reads the
// full command line and works reliably.

#[derive(Debug)]
struct PgrepMatch {
    pid: u32,
    /// Full line from `pgrep -fl`, includes env vars on macOS
    info: String,
}

/// Use `pgrep -fl <pattern>` to find processes matching a keyword in their
/// full command line. Returns a list of (pid, info_line).
fn pgrep_find(pattern: &str) -> Vec<PgrepMatch> {
    let output = Command::new("pgrep")
        .args(["-fl", pattern])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .filter_map(|line| {
                    let (pid_str, rest) = line.split_once(' ')?;
                    let pid = pid_str.parse::<u32>().ok()?;
                    Some(PgrepMatch { pid, info: rest.to_string() })
                })
                .collect()
        }
        _ => vec![],
    }
}

// ── Detection functions ──────────────────────────────

fn detect_claw_variant(sys: &System, variant: &ClawVariant) -> Option<DetectedAgent> {
    let claw_dir = resolve_claw_dir(variant)?;
    let config_path = claw_dir.join(variant.config_filename);

    // Check process — two strategies:
    // 1) sysinfo name matching (fast but unreliable on macOS — node processes
    //    show as "node", Electron helpers show as "AppName Helper", cmd() is empty)
    // 2) pgrep -f fallback (reads full command line, always works on macOS)
    let mut running = false;
    let mut pid = None;
    let mut proc_name = None;

    // Strategy 1: sysinfo
    for (p, proc) in sys.processes() {
        let name = proc.name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();

        // Skip our own manager process
        if name_lower.contains("openclaw-manager") || name_lower.contains("openclaw-manage") {
            continue;
        }

        // Match by process name keywords
        let name_match = variant
            .process_keywords
            .iter()
            .any(|kw| name_lower.contains(&kw.to_lowercase()));

        // Also check exe() path which is more reliable than name() on macOS
        let exe_match = proc.exe().map(|exe| {
            let exe_str = exe.to_string_lossy().to_lowercase();
            variant.process_keywords.iter().any(|kw| exe_str.contains(&kw.to_lowercase()))
        }).unwrap_or(false);

        // Match by app path
        let app_match = variant
            .app_path
            .map(|app| {
                proc.exe().map(|exe| exe.to_string_lossy().to_lowercase().contains(&app.to_lowercase())).unwrap_or(false)
            })
            .unwrap_or(false);

        if name_match || exe_match || app_match {
            // For the generic openclaw variant, skip processes belonging to other variants
            if variant.id == "openclaw" {
                let is_other = name_lower.contains("qclaw") || name_lower.contains("autoclaw");
                if is_other {
                    continue;
                }
            }
            running = true;
            pid = Some(p.as_u32());
            proc_name = Some(name.clone());
            if name_lower.contains("gateway") {
                break;
            }
        }
    }

    // Strategy 2: pgrep fallback (macOS — sysinfo often misses node-based processes)
    if !running {
        // For each keyword, try pgrep -f
        let pgrep_keywords: Vec<&str> = if variant.id == "openclaw" {
            // For CLI openclaw, search for the gateway process specifically
            vec!["openclaw-gateway"]
        } else {
            variant.process_keywords.to_vec()
        };

        for kw in &pgrep_keywords {
            let matches = pgrep_find(kw);
            for m in &matches {
                let info_lower = m.info.to_lowercase();
                // Skip our own manager
                if info_lower.contains("openclaw-manager") || info_lower.contains("pgrep") {
                    continue;
                }
                // For generic openclaw, skip other variants
                if variant.id == "openclaw" && (info_lower.contains("qclaw") || info_lower.contains("autoclaw")) {
                    continue;
                }
                // For other variants, make sure it actually matches this variant
                if variant.id != "openclaw" {
                    let variant_match = info_lower.contains(&variant.id.to_lowercase())
                        || variant.app_path.map(|p| info_lower.contains(&p.to_lowercase())).unwrap_or(false);
                    if !variant_match {
                        continue;
                    }
                }
                running = true;
                pid = Some(m.pid);
                proc_name = Some(format!("{}-gateway", variant.id));
                break;
            }
            if running { break; }
        }
    }

    // Parse details from directory structure
    let has_discord = claw_dir.join("discord").exists();
    let has_telegram = claw_dir.join("telegram").exists();
    let has_whatsapp = claw_dir.join("whatsapp").exists();
    let has_feishu = claw_dir.join("feishu").exists()
        || claw_dir.join("lark").exists();
    let has_slack = claw_dir.join("slack").exists();
    let has_weixin = claw_dir.join("weixin").exists()
        || claw_dir.join("openclaw-weixin").exists();
    let agent_count = dir_entry_count(&claw_dir.join("agents"));
    let workspace_count = count_dirs_with_prefix(&claw_dir, "workspace");

    let version = read_version(&claw_dir);

    Some(DetectedAgent {
        id: variant.id.to_string(),
        agent_type: "openclaw".to_string(),
        runtime_family: Some("openclaw".to_string()),
        name: variant.name.to_string(),
        icon: variant.icon.to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        home_dir: claw_dir.to_string_lossy().to_string(),
        running,
        pid,
        process_name: proc_name,
        version,
        runtime_profile: None,
        details: AgentDetails::OpenClaw {
            variant: variant.id.to_string(),
            has_discord,
            has_telegram,
            has_whatsapp,
            has_feishu,
            has_slack,
            has_weixin,
            agent_count,
            workspace_count,
        },
    })
}

fn detect_claude_code(sys: &System) -> Option<DetectedAgent> {
    let home = home_dir();
    let claude_dir = home.join(".claude");
    let config_path = claude_dir.join("settings.json");

    if !claude_dir.exists() {
        return None;
    }

    let mut running = false;
    let mut pid = None;
    let mut proc_name = None;

    // Strategy 1: sysinfo
    for (p, proc) in sys.processes() {
        let name = proc.name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();

        if (name_lower == "claude" || name_lower.starts_with("claude-"))
            && !name_lower.contains("openclaw")
            && !name_lower.contains("manager")
        {
            running = true;
            pid = Some(p.as_u32());
            proc_name = Some(name);
            break;
        }

        // Also check exe path
        if let Some(exe) = proc.exe() {
            let exe_str = exe.to_string_lossy().to_lowercase();
            if (exe_str.contains("/claude") || exe_str.contains("claude-code"))
                && !exe_str.contains("openclaw")
            {
                running = true;
                pid = Some(p.as_u32());
                proc_name = Some(name);
                break;
            }
        }
    }

    // Strategy 2: pgrep fallback
    if !running {
        let matches = pgrep_find("claude");
        for m in &matches {
            let info_lower = m.info.to_lowercase();
            if (info_lower.starts_with("claude") || info_lower.contains("claude-code") || info_lower.contains("claude-cli"))
                && !info_lower.contains("openclaw")
                && !info_lower.contains("manager")
                && !info_lower.contains("pgrep")
            {
                running = true;
                pid = Some(m.pid);
                proc_name = Some("claude".to_string());
                break;
            }
        }
    }

    let has_skills = claude_dir.join("skills").exists() && dir_entry_count(&claude_dir.join("skills")) > 0;
    let has_plugins = claude_dir.join("plugins").exists() && dir_entry_count(&claude_dir.join("plugins")) > 0;
    let project_count = dir_entry_count(&claude_dir.join("projects"));

    Some(DetectedAgent {
        id: "claude-code".into(),
        agent_type: "claude-code".into(),
        runtime_family: Some("claude-code".into()),
        name: "Claude Code".into(),
        icon: "🤖".into(),
        config_path: config_path.to_string_lossy().to_string(),
        home_dir: claude_dir.to_string_lossy().to_string(),
        running,
        pid,
        process_name: proc_name,
        version: None,
        runtime_profile: None,
        details: AgentDetails::ClaudeCode {
            has_skills,
            has_plugins,
            project_count,
        },
    })
}

fn detect_workbuddy(sys: &System) -> Option<DetectedAgent> {
    let home = home_dir();
    let wb_dir = home.join(".workbuddy");
    let config_path = wb_dir.join("settings.json");

    if !wb_dir.exists() {
        // Also check /Applications/WorkBuddy.app
        if !PathBuf::from("/Applications/WorkBuddy.app").exists() {
            return None;
        }
    }

    let mut running = false;
    let mut pid = None;
    let mut proc_name = None;

    for (p, proc) in sys.processes() {
        let name = proc.name().to_string_lossy().to_string();
        let name_lower = name.to_lowercase();
        let cmd_str = proc.cmd().iter().map(|a| a.to_string_lossy().to_string()).collect::<Vec<_>>().join(" ").to_lowercase();

        if name_lower.contains("workbuddy") || name_lower.contains("codebuddy")
            || cmd_str.contains("workbuddy") || cmd_str.contains("/applications/workbuddy")
        {
            running = true;
            pid = Some(p.as_u32());
            proc_name = Some(name);
            break;
        }
    }

    let has_skills = false; // WorkBuddy uses plugins, not skills dirs
    let has_plugins = wb_dir.join("plugins").exists() && dir_entry_count(&wb_dir.join("plugins")) > 0;
    let has_mcp = wb_dir.join("mcp.json").exists();

    Some(DetectedAgent {
        id: "workbuddy".into(),
        agent_type: "claude-code".into(), // similar to Claude Code
        runtime_family: Some("claude-code".into()),
        name: "WorkBuddy".into(),
        icon: "👷".into(),
        config_path: config_path.to_string_lossy().to_string(),
        home_dir: wb_dir.to_string_lossy().to_string(),
        running,
        pid,
        process_name: proc_name,
        version: None,
        runtime_profile: None,
        details: AgentDetails::ClaudeCode {
            has_skills,
            has_plugins: has_plugins || has_mcp,
            project_count: 0,
        },
    })
}

fn detect_codex(sys: &System) -> Option<DetectedAgent> {
    let home = home_dir();
    let codex_dir = home.join(".codex");
    let config_path = codex_dir.join("config.toml");

    if !codex_dir.exists() {
        return None;
    }

    let mut running = false;
    let mut pid = None;
    let mut proc_name = None;

    for (p, proc) in sys.processes() {
        let name = proc.name().to_string_lossy().to_lowercase();
        let cmd_match = proc
            .cmd()
            .iter()
            .any(|arg| arg.to_string_lossy().to_lowercase().contains("codex"));

        if name.contains("codex") || cmd_match {
            running = true;
            pid = Some(p.as_u32());
            proc_name = Some(proc.name().to_string_lossy().to_string());
            break;
        }
    }

    let version = read_version(&codex_dir);
    let has_config = config_path.exists();
    let has_skills = codex_dir.join("skills").exists() && dir_entry_count(&codex_dir.join("skills")) > 0;

    Some(DetectedAgent {
        id: "codex".into(),
        agent_type: "codex".into(),
        runtime_family: Some("codex".into()),
        name: "Codex CLI".into(),
        icon: "📦".into(),
        config_path: config_path.to_string_lossy().to_string(),
        home_dir: codex_dir.to_string_lossy().to_string(),
        running,
        pid,
        process_name: proc_name,
        version,
        runtime_profile: None,
        details: AgentDetails::Codex {
            has_config,
            has_skills,
        },
    })
}

fn detect_opencode(sys: &System) -> Option<DetectedAgent> {
    let home = home_dir();
    let opencode_dir = home.join(".config").join("opencode");

    if !opencode_dir.exists() {
        return None;
    }

    let config_path = opencode_dir.join("opencode.json");

    let mut running = false;
    let mut pid = None;
    let mut proc_name = None;

    for (p, proc) in sys.processes() {
        let name = proc.name().to_string_lossy().to_lowercase();
        if name.contains("opencode") {
            running = true;
            pid = Some(p.as_u32());
            proc_name = Some(proc.name().to_string_lossy().to_string());
            break;
        }
    }

    let has_agents = opencode_dir.join("agents").exists() && dir_entry_count(&opencode_dir.join("agents")) > 0;
    let has_skills = opencode_dir.join("skills").exists() && dir_entry_count(&opencode_dir.join("skills")) > 0;

    Some(DetectedAgent {
        id: "opencode".into(),
        agent_type: "opencode".into(),
        runtime_family: Some("opencode".into()),
        name: "OpenCode".into(),
        icon: "⌨️".into(),
        config_path: config_path.to_string_lossy().to_string(),
        home_dir: opencode_dir.to_string_lossy().to_string(),
        running,
        pid,
        process_name: proc_name,
        version: None,
        runtime_profile: None,
        details: AgentDetails::OpenCode {
            has_agents,
            has_skills,
        },
    })
}

fn default_custom_agents() -> Vec<CustomAgentConfig> {
    vec![CustomAgentConfig {
        id: "dolphin".to_string(),
        name: "dolphin".to_string(),
        icon: Some("🐬".to_string()),
        runtime_profile: RuntimeProfile {
            runtime_family: "claude-code".to_string(),
            auth_source: Some("claude-subscription".to_string()),
            default_model: None,
        },
    }]
}

fn read_custom_agents() -> Vec<CustomAgentConfig> {
    let hub = match super::config::read_hub_config() {
        Ok(value) => value,
        Err(_) => return default_custom_agents(),
    };

    let custom_agents = hub
        .get("customAgents")
        .and_then(|value| serde_json::from_value::<Vec<CustomAgentConfig>>(value.clone()).ok())
        .unwrap_or_default();

    if custom_agents.is_empty() {
        default_custom_agents()
    } else {
        custom_agents
    }
}

fn derive_runtime_health_template<'a>(
    agents: &'a [DetectedAgent],
    runtime_family: &str,
) -> Option<&'a DetectedAgent> {
    agents.iter().find(|agent| {
        agent
            .runtime_family
            .as_deref()
            .unwrap_or(agent.agent_type.as_str())
            == runtime_family
            && agent.runtime_profile.is_none()
    })
}

fn build_custom_agent(config: &CustomAgentConfig, runtime_template: Option<&DetectedAgent>) -> DetectedAgent {
    let runtime_family = config.runtime_profile.runtime_family.clone();
    let icon = config.icon.clone().unwrap_or_else(|| "✨".to_string());
    let home_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".agenthub")
        .join("agents")
        .join(&config.id);

    DetectedAgent {
        id: config.id.clone(),
        agent_type: "custom-agent".to_string(),
        runtime_family: Some(runtime_family.clone()),
        name: config.name.clone(),
        icon,
        config_path: format!("agenthub://agents/{}", config.id),
        home_dir: home_dir.to_string_lossy().to_string(),
        running: runtime_template.map(|agent| agent.running).unwrap_or(false),
        pid: runtime_template.and_then(|agent| agent.pid),
        process_name: runtime_template.and_then(|agent| agent.process_name.clone()),
        version: runtime_template.and_then(|agent| agent.version.clone()),
        runtime_profile: Some(config.runtime_profile.clone()),
        details: AgentDetails::CustomAgent {
            based_on_runtime: runtime_family,
            auth_source: config.runtime_profile.auth_source.clone(),
            default_model: config.runtime_profile.default_model.clone(),
        },
    }
}

// ── Tauri Commands ────────────────────────────────────

#[tauri::command]
pub fn detect_agents() -> Result<HealthStatus, String> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut agents: Vec<DetectedAgent> = Vec::new();

    // Detect all OpenClaw variants
    for variant in claw_variants() {
        if let Some(a) = detect_claw_variant(&sys, &variant) {
            agents.push(a);
        }
    }

    // Detect other agent types
    if let Some(a) = detect_claude_code(&sys) {
        agents.push(a);
    }
    if let Some(a) = detect_workbuddy(&sys) {
        agents.push(a);
    }
    if let Some(a) = detect_codex(&sys) {
        agents.push(a);
    }
    if let Some(a) = detect_opencode(&sys) {
        agents.push(a);
    }

    for custom_agent in read_custom_agents() {
        let runtime_template = derive_runtime_health_template(&agents, &custom_agent.runtime_profile.runtime_family);
        agents.push(build_custom_agent(&custom_agent, runtime_template));
    }

    let total_running = agents.iter().filter(|a| a.running).count();
    let total_detected = agents.len();

    Ok(HealthStatus {
        agents,
        total_running,
        total_detected,
    })
}

#[tauri::command]
pub fn check_health() -> Result<HealthStatus, String> {
    detect_agents()
}
