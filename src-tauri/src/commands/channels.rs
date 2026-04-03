use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChannelRouteConfig {
    pub default_agent_id: Option<String>,
    pub default_thread_id: Option<String>,
    pub thread_mode: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPolicyConfig {
    pub dm_policy: Option<String>,
    pub group_policy: Option<String>,
    pub require_mention: Option<bool>,
    pub streaming: Option<bool>,
    pub allowed_chat_ids: Option<Vec<String>>,
    pub allowed_user_ids: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAccountConfig {
    pub enabled: Option<bool>,
    pub label: Option<String>,
    pub domain: Option<String>,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub verification_token: Option<String>,
    pub encrypt_key: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub last_tested_at: Option<String>,
    pub token_expires_in: Option<i64>,
    pub cardkit_available: Option<bool>,
    pub cardkit_checked_at: Option<String>,
    pub cardkit_message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FeishuChannelConfig {
    pub enabled: Option<bool>,
    pub transport: Option<String>,
    pub default_account_id: Option<String>,
    pub policy: Option<ChannelPolicyConfig>,
    pub route: Option<ChannelRouteConfig>,
    pub accounts: Option<HashMap<String, FeishuAccountConfig>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ChannelsConfig {
    pub feishu: Option<FeishuChannelConfig>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeishuConnectionResult {
    pub domain: String,
    pub endpoint: String,
    pub tested_at: String,
    pub expires_in: Option<i64>,
    pub token_preview: Option<String>,
    pub message: String,
    pub cardkit_available: bool,
    pub cardkit_message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GatewayWorkerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub status: String,
    pub started_at: Option<String>,
    pub updated_at: Option<String>,
    pub last_message_at: Option<String>,
    pub last_reply_at: Option<String>,
    pub last_error: Option<String>,
    pub account_id: Option<String>,
    pub agent_id: Option<String>,
    pub transport: Option<String>,
    pub runtime_backend: Option<String>,
    pub runtime_backend_detail: Option<String>,
    pub bot_open_id: Option<String>,
    pub gateway_id: Option<String>,
    pub gateway_kind: Option<String>,
    pub conversation_store_path: Option<String>,
    pub log_path: String,
}

pub type FeishuDaemonStatus = GatewayWorkerStatus;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GatewayWorkerLogTail {
    pub log_path: String,
    pub lines: Vec<String>,
    pub truncated: bool,
    pub updated_at: String,
}

#[derive(Deserialize, Default)]
struct FeishuTenantTokenResponse {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    msg: String,
    #[serde(default)]
    tenant_access_token: Option<String>,
    #[serde(default)]
    expire: Option<i64>,
}

#[derive(Deserialize, Default)]
struct FeishuCardCreateData {
    #[serde(default)]
    card_id: Option<String>,
}

#[derive(Deserialize, Default)]
struct FeishuCardCreateResponse {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    msg: String,
    #[serde(default)]
    data: Option<FeishuCardCreateData>,
}

fn default_channel_policy() -> ChannelPolicyConfig {
    ChannelPolicyConfig {
        dm_policy: Some("allow".to_string()),
        group_policy: Some("mentions-only".to_string()),
        require_mention: Some(true),
        streaming: Some(false),
        allowed_chat_ids: Some(vec![]),
        allowed_user_ids: Some(vec![]),
    }
}

fn default_channel_route() -> ChannelRouteConfig {
    ChannelRouteConfig {
        default_agent_id: Some("dolphin".to_string()),
        default_thread_id: None,
        thread_mode: Some("thread-per-chat".to_string()),
    }
}

fn default_feishu_channel() -> FeishuChannelConfig {
    FeishuChannelConfig {
        enabled: Some(false),
        transport: Some("websocket".to_string()),
        default_account_id: None,
        policy: Some(default_channel_policy()),
        route: Some(default_channel_route()),
        accounts: Some(HashMap::new()),
    }
}

fn with_channel_defaults(mut config: ChannelsConfig) -> ChannelsConfig {
    let mut feishu = config.feishu.unwrap_or_else(default_feishu_channel);
    if feishu.enabled.is_none() {
        feishu.enabled = Some(false);
    }
    if feishu.transport.is_none() {
        feishu.transport = Some("websocket".to_string());
    }
    if feishu.policy.is_none() {
        feishu.policy = Some(default_channel_policy());
    } else if let Some(policy) = feishu.policy.as_mut() {
        if policy.dm_policy.is_none() {
            policy.dm_policy = Some("allow".to_string());
        }
        if policy.group_policy.is_none() {
            policy.group_policy = Some("mentions-only".to_string());
        }
        if policy.require_mention.is_none() {
            policy.require_mention = Some(true);
        }
        if policy.streaming.is_none() {
            policy.streaming = Some(false);
        }
        if policy.allowed_chat_ids.is_none() {
            policy.allowed_chat_ids = Some(vec![]);
        }
        if policy.allowed_user_ids.is_none() {
            policy.allowed_user_ids = Some(vec![]);
        }
    }
    if feishu.route.is_none() {
        feishu.route = Some(default_channel_route());
    } else if let Some(route) = feishu.route.as_mut() {
        if route.default_agent_id.is_none() {
            route.default_agent_id = Some("dolphin".to_string());
        }
        if route.thread_mode.is_none() {
            route.thread_mode = Some("thread-per-chat".to_string());
        }
    }
    if feishu.accounts.is_none() {
        feishu.accounts = Some(HashMap::new());
    }
    config.feishu = Some(feishu);
    config
}

fn mask_token(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= 12 {
        return trimmed.to_string();
    }
    format!("{}...{}", &trimmed[..6], &trimmed[trimmed.len() - 4..])
}

fn feishu_base_url(domain: Option<&str>) -> (&'static str, &'static str) {
    match domain.unwrap_or("feishu").trim().to_ascii_lowercase().as_str() {
        "larksuite" | "lark" | "global" => ("larksuite", "https://open.larksuite.com"),
        _ => ("feishu", "https://open.feishu.cn"),
    }
}

fn agenthub_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".agenthub");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| format!("Failed to create .agenthub dir: {}", error))?;
    }
    Ok(dir)
}

fn agenthub_runtime_dir() -> Result<PathBuf, String> {
    let dir = agenthub_dir()?.join("runtime");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| format!("Failed to create runtime dir: {}", error))?;
    }
    Ok(dir)
}

fn agenthub_logs_dir() -> Result<PathBuf, String> {
    let dir = agenthub_dir()?.join("logs");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| format!("Failed to create logs dir: {}", error))?;
    }
    Ok(dir)
}

fn normalize_gateway_kind(kind: Option<&str>) -> Result<String, String> {
    match kind.unwrap_or("feishu").trim() {
        "" | "feishu" => Ok("feishu".to_string()),
        other => Err(format!("当前暂不支持 gateway kind: {}", other)),
    }
}

fn gateway_worker_pid_path(kind: &str) -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join(format!("gateway-{}.pid", kind)))
}

fn legacy_feishu_daemon_pid_path() -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join("feishu-daemon.pid"))
}

fn gateway_worker_state_path(kind: &str) -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join(format!("gateway-{}.json", kind)))
}

fn legacy_feishu_daemon_state_path() -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join("feishu-daemon.json"))
}

fn gateway_worker_conversation_store_path(kind: &str) -> Result<PathBuf, String> {
    Ok(agenthub_runtime_dir()?.join(format!("gateway-{}-conversations.json", kind)))
}

fn gateway_worker_log_path(kind: &str) -> Result<PathBuf, String> {
    Ok(agenthub_logs_dir()?.join(format!("gateway-{}.log", kind)))
}

fn gateway_worker_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("scripts")
        .join("gateway-worker.mjs")
}

fn agenthub_project_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or("Cannot determine AgentHub project root".to_string())
}

fn claude_code_main_dir() -> Result<PathBuf, String> {
    let project_root = agenthub_project_root()?;
    Ok(project_root
        .parent()
        .unwrap_or(project_root.as_path())
        .join("claude-code-main"))
}

fn with_augmented_path(cmd: &mut Command) {
    if let Some(home) = dirs::home_dir() {
        let npm_bin = home.join(".npm-global/bin");
        let local_bin = home.join(".local/bin");
        let brew_bin = std::path::PathBuf::from("/opt/homebrew/bin");
        let usr_local_bin = std::path::PathBuf::from("/usr/local/bin");
        let current_path = std::env::var("PATH").unwrap_or_default();
        cmd.env(
            "PATH",
            format!(
                "{}:{}:{}:{}:{}",
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

fn read_pid_file(path: &PathBuf, label: &str) -> Result<Option<u32>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|error| format!("Failed to read {} pid: {}", label, error))?;
    Ok(content.trim().parse::<u32>().ok())
}

fn read_gateway_worker_pid(kind: &str) -> Result<Option<u32>, String> {
    let pid = read_pid_file(&gateway_worker_pid_path(kind)?, "gateway worker")?;
    if pid.is_some() {
        return Ok(pid);
    }
    if kind == "feishu" {
        return read_pid_file(&legacy_feishu_daemon_pid_path()?, "legacy feishu daemon");
    }
    Ok(None)
}

fn pid_is_running(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn default_gateway_worker_status(kind: &str) -> Result<GatewayWorkerStatus, String> {
    Ok(GatewayWorkerStatus {
        running: false,
        pid: None,
        status: "stopped".to_string(),
        started_at: None,
        updated_at: None,
        last_message_at: None,
        last_reply_at: None,
        last_error: None,
        account_id: None,
        agent_id: None,
        transport: Some("websocket".to_string()),
        runtime_backend: None,
        runtime_backend_detail: None,
        bot_open_id: None,
        gateway_id: Some(kind.to_string()),
        gateway_kind: Some(kind.to_string()),
        conversation_store_path: Some(
            gateway_worker_conversation_store_path(kind)?
                .to_string_lossy()
                .to_string(),
        ),
        log_path: gateway_worker_log_path(kind)?.to_string_lossy().to_string(),
    })
}

fn read_gateway_worker_state(kind: &str) -> Result<GatewayWorkerStatus, String> {
    let path = gateway_worker_state_path(kind)?;
    let legacy_path = if kind == "feishu" {
        Some(legacy_feishu_daemon_state_path()?)
    } else {
        None
    };
    let source_path = if path.exists() {
        path
    } else if let Some(candidate) = legacy_path {
        if candidate.exists() {
            candidate
        } else {
            return default_gateway_worker_status(kind);
        }
    } else {
        return default_gateway_worker_status(kind);
    };

    let content = fs::read_to_string(source_path)
        .map_err(|error| format!("Failed to read gateway state: {}", error))?;
    let mut status = serde_json::from_str::<GatewayWorkerStatus>(&content)
        .map_err(|error| format!("Failed to parse gateway state: {}", error))?;
    status.gateway_id = Some(kind.to_string());
    status.gateway_kind = Some(kind.to_string());
    status.conversation_store_path = Some(
        gateway_worker_conversation_store_path(kind)?
            .to_string_lossy()
            .to_string(),
    );
    status.log_path = gateway_worker_log_path(kind)?.to_string_lossy().to_string();
    Ok(status)
}

fn write_gateway_worker_state(kind: &str, status: &GatewayWorkerStatus) -> Result<(), String> {
    let path = gateway_worker_state_path(kind)?;
    let mut next = status.clone();
    next.gateway_id = Some(kind.to_string());
    next.gateway_kind = Some(kind.to_string());
    next.conversation_store_path = Some(
        gateway_worker_conversation_store_path(kind)?
            .to_string_lossy()
            .to_string(),
    );
    next.log_path = gateway_worker_log_path(kind)?.to_string_lossy().to_string();
    let json = serde_json::to_string_pretty(&next)
        .map_err(|error| format!("Failed to serialize gateway state: {}", error))?;
    fs::write(path, format!("{}\n", json))
        .map_err(|error| format!("Failed to write gateway state: {}", error))
}

fn status_with_gateway_error(kind: &str, message: &str) -> Result<GatewayWorkerStatus, String> {
    let mut status = default_gateway_worker_status(kind)?;
    status.status = "error".to_string();
    status.last_error = Some(message.to_string());
    status.updated_at = Some(Utc::now().to_rfc3339());
    write_gateway_worker_state(kind, &status)?;
    Ok(status)
}

fn remove_file_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn resolve_feishu_route_agent(
    agent_id: &str,
) -> Result<super::custom_agents::CustomAgentConfig, String> {
    let agent = super::custom_agents::read_custom_agents()
        .into_iter()
        .find(|item| item.id == agent_id)
        .ok_or_else(|| {
            format!(
                "飞书渠道只能选择 Agent 页面里创建的自定义智能体，当前未找到：{}",
                agent_id
            )
        })?;

    if agent.runtime_profile.runtime_family.trim() != "claude-code" {
        return Err(format!(
            "当前飞书渠道只支持基于 Claude Code 的自定义智能体，收到：{}",
            agent.runtime_profile.runtime_family
        ));
    }

    Ok(agent)
}

fn validate_feishu_daemon_config(config: &ChannelsConfig) -> Result<(String, FeishuAccountConfig), String> {
    let feishu = config
        .feishu
        .clone()
        .unwrap_or_else(default_feishu_channel);

    if !feishu.enabled.unwrap_or(false) {
        return Err("飞书渠道未启用。".to_string());
    }

    if feishu.transport.as_deref().unwrap_or("websocket") != "websocket" {
        return Err("当前只支持 WebSocket 长连。".to_string());
    }

    let account = get_primary_account(&feishu).1;

    if account.enabled == Some(false) {
        return Err("飞书账号已被禁用。".to_string());
    }

    if account
        .app_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return Err("缺少飞书 App ID。".to_string());
    }

    if account
        .app_secret
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return Err("缺少飞书 App Secret。".to_string());
    }

    let agent_id = feishu
        .route
        .as_ref()
        .and_then(|route| route.default_agent_id.clone())
        .filter(|value| !value.trim().is_empty())
        .ok_or("还没有为飞书渠道选择处理智能体。".to_string())?;

    resolve_feishu_route_agent(&agent_id)?;

    Ok((agent_id, FeishuAccountConfig {
        enabled: Some(true),
        domain: Some(account.domain.unwrap_or_else(|| "feishu".to_string())),
        ..account
    }))
}

fn get_primary_account_id(feishu: &FeishuChannelConfig) -> String {
    if let Some(account_id) = feishu.default_account_id.as_ref() {
        if feishu
            .accounts
            .as_ref()
            .and_then(|accounts| accounts.get(account_id))
            .is_some()
        {
            return account_id.clone();
        }
    }
    feishu
        .accounts
        .as_ref()
        .and_then(|accounts| accounts.keys().next().cloned())
        .unwrap_or_else(|| "default".to_string())
}

fn get_primary_account(feishu: &FeishuChannelConfig) -> (String, FeishuAccountConfig) {
    let account_id = get_primary_account_id(feishu);
    (
        account_id.clone(),
        feishu
            .accounts
            .as_ref()
            .and_then(|accounts| accounts.get(&account_id))
            .cloned()
            .unwrap_or_default(),
    )
}

fn stop_gateway_worker_internal(kind: &str) -> Result<GatewayWorkerStatus, String> {
    if let Some(pid) = read_gateway_worker_pid(kind)? {
        let _ = Command::new("kill").arg(pid.to_string()).status();
        std::thread::sleep(Duration::from_millis(400));
        if pid_is_running(pid) {
            let _ = Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .status();
        }
    }

    remove_file_if_exists(gateway_worker_pid_path(kind)?);
    if kind == "feishu" {
        remove_file_if_exists(legacy_feishu_daemon_pid_path()?);
    }

    let mut status = read_gateway_worker_state(kind).or_else(|_| default_gateway_worker_status(kind))?;
    status.running = false;
    status.pid = None;
    status.status = "stopped".to_string();
    status.updated_at = Some(Utc::now().to_rfc3339());
    write_gateway_worker_state(kind, &status)?;
    Ok(status)
}

fn validate_gateway_worker_config(
    kind: &str,
    config: &ChannelsConfig,
) -> Result<(String, FeishuAccountConfig), String> {
    match kind {
        "feishu" => validate_feishu_daemon_config(config),
        other => Err(format!("当前暂不支持 gateway kind: {}", other)),
    }
}

fn spawn_gateway_worker(kind: &str, force_restart: bool) -> Result<GatewayWorkerStatus, String> {
    let config = with_channel_defaults(get_channels_config()?);
    let validation = validate_gateway_worker_config(kind, &config);

    if let Err(error) = validation {
        let _ = stop_gateway_worker_internal(kind);
        return status_with_gateway_error(kind, &error);
    }

    if force_restart {
        let _ = stop_gateway_worker_internal(kind);
    } else if let Some(pid) = read_gateway_worker_pid(kind)? {
        if pid_is_running(pid) {
            return get_gateway_worker_status(Some(kind.to_string()));
        }
    }

    let log_path = gateway_worker_log_path(kind)?;
    let script_path = gateway_worker_script_path();
    if !script_path.exists() {
        return status_with_gateway_error(kind, &format!(
            "gateway worker 脚本不存在：{}",
            script_path.display()
        ));
    }

    let mut node_path = None;
    for candidate in ["node", "/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        let mut command = Command::new(candidate);
        command.arg("--version");
        with_augmented_path(&mut command);
        if command.status().map(|status| status.success()).unwrap_or(false) {
            node_path = Some(candidate.to_string());
            break;
        }
    }

    let node = match node_path {
        Some(path) => path,
        None => return status_with_gateway_error(kind, "没有找到可用的 node 可执行文件。"),
    };

    let shell_command = format!(
        "nohup {} {} >> {} 2>&1 < /dev/null & echo $!",
        shell_quote(&node),
        shell_quote(&script_path.to_string_lossy()),
        shell_quote(&log_path.to_string_lossy())
    );

    let mut command = Command::new("sh");
    command.arg("-lc").arg(shell_command);
    command.env("AGENTHUB_GATEWAY_KIND", kind);
    command.env(
        "AGENTHUB_PROJECT_ROOT",
        agenthub_project_root()?.to_string_lossy().to_string(),
    );
    command.env(
        "AGENTHUB_CLAUDE_CODE_MAIN_DIR",
        claude_code_main_dir()?.to_string_lossy().to_string(),
    );
    with_augmented_path(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("Failed to start gateway worker: {}", error))?;
    if !output.status.success() {
        return status_with_gateway_error(kind, &format!(
            "启动 {} gateway worker 失败：{}",
            kind,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let pid = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok();

    std::thread::sleep(Duration::from_millis(800));

    let mut status = get_gateway_worker_status(Some(kind.to_string()))?;
    if status.pid.is_none() {
        status.pid = pid;
    }
    if status.running {
        return Ok(status);
    }

    if let Some(daemon_pid) = pid {
        status.pid = Some(daemon_pid);
    }

    if status.last_error.is_none() {
        status.last_error = Some(format!("{} gateway worker 已启动，但还没有进入运行态。", kind));
    }
    Ok(status)
}

#[tauri::command]
pub fn get_channels_config() -> Result<ChannelsConfig, String> {
    let hub = super::config::read_hub_config()?;
    let config = hub
        .get("channels")
        .and_then(|value| serde_json::from_value::<ChannelsConfig>(value.clone()).ok())
        .unwrap_or_default();
    Ok(with_channel_defaults(config))
}

#[tauri::command]
pub fn save_channels_config(config: ChannelsConfig) -> Result<ChannelsConfig, String> {
    let config = with_channel_defaults(config);
    if config
        .feishu
        .as_ref()
        .and_then(|feishu| feishu.enabled)
        .unwrap_or(false)
    {
        if let Some(agent_id) = config
            .feishu
            .as_ref()
            .and_then(|feishu| feishu.route.as_ref())
            .and_then(|route| route.default_agent_id.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            resolve_feishu_route_agent(agent_id)?;
        }
    }
    super::config::write_hub_config_module(
        "channels".to_string(),
        serde_json::to_value(&config)
            .map_err(|error| format!("Failed to serialize channels config: {}", error))?,
    )?;
    Ok(config)
}

#[tauri::command]
pub fn get_gateway_worker_status(kind: Option<String>) -> Result<GatewayWorkerStatus, String> {
    let kind = normalize_gateway_kind(kind.as_deref())?;
    let mut status =
        read_gateway_worker_state(&kind).or_else(|_| default_gateway_worker_status(&kind))?;
    let running_pid = read_gateway_worker_pid(&kind)?.filter(|pid| pid_is_running(*pid));

    status.pid = running_pid;
    status.running = running_pid.is_some();

    if status.running {
        if status.status != "running" {
            status.status = "running".to_string();
        }
    } else if status.status == "running" || status.status == "starting" {
        status.status = "stopped".to_string();
    }

    status.gateway_id = Some(kind.clone());
    status.gateway_kind = Some(kind.clone());
    status.conversation_store_path = Some(
        gateway_worker_conversation_store_path(&kind)?
            .to_string_lossy()
            .to_string(),
    );
    status.log_path = gateway_worker_log_path(&kind)?.to_string_lossy().to_string();
    Ok(status)
}

#[tauri::command]
pub fn read_gateway_worker_log(
    kind: Option<String>,
    tail_lines: Option<usize>,
) -> Result<GatewayWorkerLogTail, String> {
    let kind = normalize_gateway_kind(kind.as_deref())?;
    let log_path = gateway_worker_log_path(&kind)?;
    let limit = tail_lines.unwrap_or(80).clamp(10, 400);

    let content = if log_path.exists() {
        fs::read_to_string(&log_path)
            .map_err(|error| format!("Failed to read gateway log: {}", error))?
    } else {
        String::new()
    };

    let all_lines: Vec<String> = content.lines().map(|line| line.to_string()).collect();
    let truncated = all_lines.len() > limit;
    let start = all_lines.len().saturating_sub(limit);

    Ok(GatewayWorkerLogTail {
        log_path: log_path.to_string_lossy().to_string(),
        lines: all_lines.into_iter().skip(start).collect(),
        truncated,
        updated_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn stop_gateway_worker(kind: Option<String>) -> Result<GatewayWorkerStatus, String> {
    let kind = normalize_gateway_kind(kind.as_deref())?;
    stop_gateway_worker_internal(&kind)
}

#[tauri::command]
pub fn sync_gateway_worker(
    kind: Option<String>,
    force_restart: Option<bool>,
) -> Result<GatewayWorkerStatus, String> {
    let kind = normalize_gateway_kind(kind.as_deref())?;
    spawn_gateway_worker(&kind, force_restart.unwrap_or(false))
}

#[tauri::command]
pub fn get_feishu_channel_daemon_status() -> Result<FeishuDaemonStatus, String> {
    get_gateway_worker_status(Some("feishu".to_string()))
}

#[tauri::command]
pub fn stop_feishu_channel_daemon() -> Result<FeishuDaemonStatus, String> {
    stop_gateway_worker(Some("feishu".to_string()))
}

#[tauri::command]
pub fn sync_feishu_channel_daemon(force_restart: Option<bool>) -> Result<FeishuDaemonStatus, String> {
    sync_gateway_worker(Some("feishu".to_string()), force_restart)
}

#[tauri::command]
pub async fn test_feishu_channel_connection(
    account: FeishuAccountConfig,
) -> Result<FeishuConnectionResult, String> {
    let app_id = account
        .app_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("缺少 App ID")?;
    let app_secret = account
        .app_secret
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("缺少 App Secret")?;

    let (domain, base_url) = feishu_base_url(account.domain.as_deref());
    let endpoint = format!("{}/open-apis/auth/v3/tenant_access_token/internal", base_url);
    let client = Client::new();
    let response = client
        .post(&endpoint)
        .json(&serde_json::json!({
            "app_id": app_id,
            "app_secret": app_secret,
        }))
        .send()
        .await
        .map_err(|error| format!("飞书连接失败: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取响应".to_string());
        return Err(format!("飞书 API 返回 {}: {}", status, body));
    }

    let payload = response
        .json::<FeishuTenantTokenResponse>()
        .await
        .map_err(|error| format!("解析飞书响应失败: {}", error))?;

    if payload.code != 0 {
        return Err(format!(
            "飞书鉴权失败: {}",
            if payload.msg.trim().is_empty() {
                "未知错误".to_string()
            } else {
                payload.msg
            }
        ));
    }

    let token_preview = payload
        .tenant_access_token
        .as_deref()
        .map(mask_token);

    let tested_at = Utc::now().to_rfc3339();
    let cardkit_endpoint = format!("{}/open-apis/cardkit/v1/cards", base_url);
    let mut cardkit_available = false;
    let mut cardkit_message = None;

    if let Some(token) = payload.tenant_access_token.as_deref() {
        let cardkit_response = client
            .post(&cardkit_endpoint)
            .bearer_auth(token)
            .json(&serde_json::json!({
                "type": "card_json",
                "data": serde_json::json!({
                    "schema": "2.0",
                    "config": {
                        "summary": { "content": "[AgentHub capability probe]" }
                    },
                    "body": {
                        "elements": [
                            {
                                "tag": "markdown",
                                "content": "AgentHub Card Kit capability probe",
                                "element_id": "content"
                            }
                        ]
                    }
                }).to_string(),
            }))
            .send()
            .await;

        match cardkit_response {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<FeishuCardCreateResponse>().await {
                        Ok(payload) => {
                            let has_card_id = payload
                                .data
                                .as_ref()
                                .and_then(|data| data.card_id.as_ref())
                                .is_some();
                            if payload.code == 0 && has_card_id {
                                cardkit_available = true;
                                cardkit_message = Some("Card Kit 流式卡片能力可用".to_string());
                            } else {
                            cardkit_message = Some(format!(
                                "Card Kit 探测未通过：{}",
                                if payload.msg.trim().is_empty() {
                                    "未知错误".to_string()
                                } else {
                                    payload.msg
                                }
                            ));
                            }
                        }
                        Err(error) => {
                            cardkit_message =
                                Some(format!("Card Kit 探测响应解析失败：{}", error));
                        }
                    }
                } else {
                    let status = response.status();
                    let body = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "无法读取响应".to_string());
                    cardkit_message = Some(format!(
                        "Card Kit 探测失败：飞书 API 返回 {}: {}",
                        status, body
                    ));
                }
            }
            Err(error) => {
                cardkit_message = Some(format!("Card Kit 探测失败：{}", error));
            }
        }
    }

    let message = if cardkit_available {
        "飞书租户 token 获取成功，Card Kit 可用".to_string()
    } else {
        "飞书租户 token 获取成功，但 Card Kit 暂不可用".to_string()
    };

    Ok(FeishuConnectionResult {
        domain: domain.to_string(),
        endpoint,
        tested_at,
        expires_in: payload.expire,
        token_preview,
        message,
        cardkit_available,
        cardkit_message,
    })
}
