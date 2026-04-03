use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelayAgentStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub status: String,
    pub relay_base_url: Option<String>,
    pub host_id: Option<String>,
    pub host_display_name: Option<String>,
    pub session_count: usize,
    pub started_at: Option<String>,
    pub updated_at: Option<String>,
    pub last_sync_at: Option<String>,
    pub connected_at: Option<String>,
    pub last_error: Option<String>,
    pub log_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RelayPairingInvite {
    pub invite_id: String,
    pub host_id: String,
    pub relay_base_url: String,
    pub code: String,
    pub expires_at: String,
    pub pairing_url: String,
}

fn agenthub_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".agenthub");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create .agenthub dir: {}", error))?;
    }
    Ok(dir)
}

fn agenthub_runtime_dir() -> Result<PathBuf, String> {
    let dir = agenthub_dir()?.join("runtime");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create runtime dir: {}", error))?;
    }
    Ok(dir)
}

fn agenthub_logs_dir() -> Result<PathBuf, String> {
    let dir = agenthub_dir()?.join("logs");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create logs dir: {}", error))?;
    }
    Ok(dir)
}

fn relay_agent_pid_path() -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join("relay-agent.pid"))
}

fn relay_agent_state_path() -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join("relay-agent.json"))
}

fn relay_agent_log_path() -> Result<PathBuf, String> {
    Ok(agenthub_logs_dir()?.join("relay-agent.log"))
}

fn relay_agent_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("scripts")
        .join("relay-agent.mjs")
}

fn agenthub_project_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or("Cannot determine AgentHub project root".to_string())
}

fn with_augmented_path(cmd: &mut Command) {
    if let Some(home) = dirs::home_dir() {
        let cargo_bin = home.join(".cargo/bin");
        let npm_bin = home.join(".npm-global/bin");
        let local_bin = home.join(".local/bin");
        let brew_bin = std::path::PathBuf::from("/opt/homebrew/bin");
        let usr_local_bin = std::path::PathBuf::from("/usr/local/bin");
        let current_path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!(
                "{}:{}:{}:{}:{}:{}",
                cargo_bin.to_string_lossy(),
                npm_bin.to_string_lossy(),
                local_bin.to_string_lossy(),
                brew_bin.to_string_lossy(),
                usr_local_bin.to_string_lossy(),
                current_path
            ),
        );
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn read_pid_file(path: &PathBuf) -> Result<Option<u32>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("Failed to read pid file: {}", error))?;
    Ok(content.trim().parse::<u32>().ok())
}

fn write_pid_file(path: &PathBuf, pid: u32) -> Result<(), String> {
    fs::write(path, format!("{}\n", pid))
        .map_err(|error| format!("Failed to write pid file: {}", error))
}

fn pid_is_running(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn remove_file_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn default_host_display_name() -> String {
    sysinfo::System::host_name().unwrap_or_else(|| "This Mac".to_string())
}

fn generate_relay_host_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("host_{}_{:x}", std::process::id(), now)
}

fn generate_pairing_invite_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("invite_{}_{}", std::process::id(), now)
}

fn generate_pairing_code() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("PAIR-{:x}", now).chars().take(13).collect()
}

pub(crate) fn normalize_relay_base_url(input: &str) -> Option<String> {
    let trimmed = input.trim().trim_end_matches('/').trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

pub(crate) fn build_pairing_url(
    relay_base_url: &str,
    host_id: &str,
    invite_id: &str,
    code: &str,
    expires_at: &str,
) -> String {
    let normalized = normalize_relay_base_url(relay_base_url)
        .unwrap_or_else(|| relay_base_url.trim().to_string());
    let landing_base = normalized
        .strip_suffix("/api")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    let payload = json!({
        "v": 1,
        "relayBaseUrl": normalized,
        "hostId": host_id,
        "inviteId": invite_id,
        "code": code,
        "expiresAt": expires_at
    });
    let encoded = URL_SAFE_NO_PAD.encode(payload.to_string());
    format!("{}/pair#pairing={}", landing_base, encoded)
}

fn default_relay_agent_status() -> Result<RelayAgentStatus, String> {
    Ok(RelayAgentStatus {
        running: false,
        pid: None,
        status: "stopped".to_string(),
        relay_base_url: None,
        host_id: None,
        host_display_name: Some(default_host_display_name()),
        session_count: 0,
        started_at: None,
        updated_at: None,
        last_sync_at: None,
        connected_at: None,
        last_error: None,
        log_path: relay_agent_log_path()?.to_string_lossy().to_string(),
    })
}

fn read_relay_agent_state() -> Result<RelayAgentStatus, String> {
    let path = relay_agent_state_path()?;
    if !path.exists() {
        return default_relay_agent_status();
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read relay agent state: {}", error))?;
    let mut raw_value = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("Failed to parse relay agent state: {}", error))?;
    if raw_value
        .get("logPath")
        .map(|value| value.is_null())
        .unwrap_or(false)
    {
        raw_value["logPath"] = serde_json::Value::String(String::new());
    }

    let mut status = serde_json::from_value::<RelayAgentStatus>(raw_value)
        .map_err(|error| format!("Failed to parse relay agent status payload: {}", error))?;
    status.log_path = relay_agent_log_path()?.to_string_lossy().to_string();
    Ok(status)
}

fn write_relay_agent_state(status: &RelayAgentStatus) -> Result<(), String> {
    let path = relay_agent_state_path()?;
    let mut next = status.clone();
    next.log_path = relay_agent_log_path()?.to_string_lossy().to_string();
    let json = serde_json::to_string_pretty(&next)
        .map_err(|error| format!("Failed to serialize relay agent state: {}", error))?;
    fs::write(path, format!("{}\n", json))
        .map_err(|error| format!("Failed to write relay agent state: {}", error))
}

fn find_node_path() -> Option<String> {
    for candidate in [
        "node",
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        &format!(
            "{}/.cargo/bin/node",
            dirs::home_dir()
                .map(|home| home.to_string_lossy().to_string())
                .unwrap_or_default()
        ),
    ] {
        let mut command = Command::new(candidate);
        command.arg("--version");
        with_augmented_path(&mut command);
        if command
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
        {
            return Some(candidate.to_string());
        }
    }
    None
}

fn stop_relay_agent_internal() -> Result<RelayAgentStatus, String> {
    let mut pid = read_pid_file(&relay_agent_pid_path()?)?;
    if pid.is_none() {
        pid = read_relay_agent_state()
            .ok()
            .and_then(|status| status.pid)
            .filter(|value| pid_is_running(*value));
    }

    if let Some(pid) = pid {
        let _ = Command::new("kill").arg(pid.to_string()).status();
        std::thread::sleep(Duration::from_millis(400));
        if pid_is_running(pid) {
            let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
        }
    }

    remove_file_if_exists(relay_agent_pid_path()?);

    let mut status = read_relay_agent_state().or_else(|_| default_relay_agent_status())?;
    status.running = false;
    status.pid = None;
    status.status = "stopped".to_string();
    status.updated_at = Some(Utc::now().to_rfc3339());
    write_relay_agent_state(&status)?;
    Ok(status)
}

fn spawn_relay_agent(
    force_restart: bool,
    relay_base_url: Option<String>,
) -> Result<RelayAgentStatus, String> {
    if force_restart {
        let _ = stop_relay_agent_internal();
    } else {
        let existing = get_relay_agent_status()?;
        if existing.running {
            return Ok(existing);
        }
    }

    let existing = read_relay_agent_state().or_else(|_| default_relay_agent_status())?;
    let relay_base_url = relay_base_url
        .and_then(|value| normalize_relay_base_url(&value))
        .or(existing.relay_base_url.clone())
        .ok_or("请先配置 Relay URL。".to_string())?;
    let host_id = existing.host_id.clone().unwrap_or_else(generate_relay_host_id);
    let host_display_name = existing
        .host_display_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(default_host_display_name);

    let script_path = relay_agent_script_path();
    if !script_path.exists() {
        let mut errored = default_relay_agent_status()?;
        errored.status = "error".to_string();
        errored.relay_base_url = Some(relay_base_url);
        errored.host_id = Some(host_id);
        errored.host_display_name = Some(host_display_name);
        errored.last_error = Some(format!(
            "relay agent 脚本不存在：{}",
            script_path.display()
        ));
        errored.updated_at = Some(Utc::now().to_rfc3339());
        write_relay_agent_state(&errored)?;
        return Ok(errored);
    }

    let node = match find_node_path() {
        Some(path) => path,
        None => {
            let mut errored = default_relay_agent_status()?;
            errored.status = "error".to_string();
            errored.relay_base_url = Some(relay_base_url);
            errored.host_id = Some(host_id);
            errored.host_display_name = Some(host_display_name);
            errored.last_error = Some("没有找到可用的 node 可执行文件。".to_string());
            errored.updated_at = Some(Utc::now().to_rfc3339());
            write_relay_agent_state(&errored)?;
            return Ok(errored);
        }
    };

    let log_path = relay_agent_log_path()?;
    let mut starting = default_relay_agent_status()?;
    starting.status = "starting".to_string();
    starting.running = false;
    starting.relay_base_url = Some(relay_base_url.clone());
    starting.host_id = Some(host_id.clone());
    starting.host_display_name = Some(host_display_name.clone());
    starting.updated_at = Some(Utc::now().to_rfc3339());
    write_relay_agent_state(&starting)?;

    let shell_command = format!(
        "nohup {} {} >> {} 2>&1 < /dev/null & echo $!",
        shell_quote(&node),
        shell_quote(&script_path.to_string_lossy()),
        shell_quote(&log_path.to_string_lossy())
    );

    let mut command = Command::new("sh");
    command.arg("-lc").arg(shell_command);
    command.env(
        "AGENTHUB_PROJECT_ROOT",
        agenthub_project_root()?.to_string_lossy().to_string(),
    );
    command.env(
        "AGENTHUB_RELAY_AGENT_STATE_PATH",
        relay_agent_state_path()?.to_string_lossy().to_string(),
    );
    command.env(
        "AGENTHUB_RELAY_AGENT_LOG_PATH",
        log_path.to_string_lossy().to_string(),
    );
    command.env("AGENTHUB_RELAY_BASE_URL", relay_base_url);
    command.env("AGENTHUB_RELAY_HOST_ID", host_id);
    command.env("AGENTHUB_RELAY_HOST_DISPLAY_NAME", host_display_name);
    with_augmented_path(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("Failed to start relay agent: {}", error))?;
    if !output.status.success() {
        let mut errored = read_relay_agent_state().or_else(|_| default_relay_agent_status())?;
        errored.status = "error".to_string();
        errored.last_error = Some(format!(
            "启动 relay agent 失败：{}",
            String::from_utf8_lossy(&output.stderr)
        ));
        errored.updated_at = Some(Utc::now().to_rfc3339());
        write_relay_agent_state(&errored)?;
        return Ok(errored);
    }

    let pid = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok();
    if let Some(pid) = pid {
        write_pid_file(&relay_agent_pid_path()?, pid)?;
    }

    std::thread::sleep(Duration::from_millis(900));
    get_relay_agent_status()
}

#[tauri::command]
pub fn get_relay_agent_status() -> Result<RelayAgentStatus, String> {
    let mut status = read_relay_agent_state().or_else(|_| default_relay_agent_status())?;
    let pid_path = relay_agent_pid_path()?;
    let pid_from_file = read_pid_file(&pid_path)?;
    let pid_from_state = status.pid.filter(|pid| pid_is_running(*pid));
    let running_pid = pid_from_file
        .filter(|pid| pid_is_running(*pid))
        .or(pid_from_state);

    if let Some(pid) = running_pid {
        status.running = true;
        status.pid = Some(pid);
        if status.status == "starting" || status.status == "stopped" {
            status.status = "running".to_string();
        }
        let _ = write_pid_file(&pid_path, pid);
    } else {
        status.running = false;
        status.pid = None;
        if status.status == "running" || status.status == "starting" {
            status.status = "stopped".to_string();
        }
    }

    status.log_path = relay_agent_log_path()?.to_string_lossy().to_string();
    Ok(status)
}

#[tauri::command]
pub fn sync_relay_agent(
    force_restart: Option<bool>,
    relay_base_url: Option<String>,
) -> Result<RelayAgentStatus, String> {
    spawn_relay_agent(force_restart.unwrap_or(false), relay_base_url)
}

#[tauri::command]
pub fn stop_relay_agent() -> Result<RelayAgentStatus, String> {
    stop_relay_agent_internal()
}

#[tauri::command]
pub fn create_relay_pairing_invite(ttl_secs: Option<i64>) -> Result<RelayPairingInvite, String> {
    let status = get_relay_agent_status()?;
    let relay_base_url = status
        .relay_base_url
        .clone()
        .ok_or("Relay URL 尚未配置。".to_string())?;
    let host_id = status
        .host_id
        .clone()
        .ok_or("Host ID 尚未初始化。".to_string())?;

    let invite_id = generate_pairing_invite_id();
    let code = generate_pairing_code();
    let expires_at = (Utc::now() + ChronoDuration::seconds(ttl_secs.unwrap_or(300)))
        .to_rfc3339();
    let pairing_url = build_pairing_url(&relay_base_url, &host_id, &invite_id, &code, &expires_at);

    Ok(RelayPairingInvite {
        invite_id,
        host_id,
        relay_base_url,
        code,
        expires_at,
        pairing_url,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_pairing_url, normalize_relay_base_url};

    #[test]
    fn normalize_relay_base_url_trims_and_removes_trailing_slash() {
        assert_eq!(
            normalize_relay_base_url(" https://relay.example.workers.dev/api/ "),
            Some("https://relay.example.workers.dev/api".to_string())
        );
        assert_eq!(normalize_relay_base_url("   "), None);
    }

    #[test]
    fn build_pairing_url_uses_pair_route_and_embeds_payload() {
        let url = build_pairing_url(
            "https://relay.example.workers.dev/api",
            "host_123",
            "invite_123",
            "PAIR-123",
            "2026-04-03T12:05:00.000Z",
        );

        assert!(url.starts_with("https://relay.example.workers.dev/pair#pairing="));
        assert!(url.contains("pairing="));
    }
}
