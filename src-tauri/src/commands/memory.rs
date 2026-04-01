use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const AGENTHUB_MEMO_PREFIX: &str = "<!-- agenthub-memory:";
const AGENTHUB_OPENMEM_APP_ID: &str = "agenthub";
const AGENTHUB_OPENMEM_SCENE: &str = "agenthub";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemoryItem {
    pub id: String,
    pub content: String,
    pub kind: String,
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub visibility: String,
    pub source: String,
    pub confidence: f64,
    pub pinned: bool,
    pub hidden: bool,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_used_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CapabilityProfile {
    pub id: String,
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    pub source: String,
    #[serde(default)]
    pub enabled_skills: Vec<String>,
    #[serde(default)]
    pub enabled_mcp_servers: Vec<String>,
    #[serde(default)]
    pub preferred_models: Vec<String>,
    #[serde(default)]
    pub preferred_providers: Vec<String>,
    #[serde(default)]
    pub secret_refs: Vec<String>,
    #[serde(default)]
    pub default_agent_id: Option<String>,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MemoryProviderConfig {
    #[serde(default = "default_memory_provider")]
    pub provider: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub access_token: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MemoryConnectionState {
    pub provider: String,
    pub provider_label: String,
    pub config: MemoryProviderConfig,
    pub configured: bool,
    pub connected: bool,
    #[serde(default)]
    pub current_user: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMemoryContext {
    pub memories: Vec<MemoryItem>,
    pub capability_profile: CapabilityProfile,
}

#[derive(Serialize)]
pub struct AgentMemoryEntry {
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
    pub entries: Vec<AgentMemoryEntry>,
}

#[derive(Serialize)]
pub struct MemoryDashboard {
    pub items: Vec<MemoryItem>,
    pub profiles: Vec<CapabilityProfile>,
    pub external_sources: Vec<AgentMemoryInfo>,
    pub connection: MemoryConnectionState,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct LegacyMemosConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub access_token: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct AgentHubMemoMeta {
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub scope_id: Option<String>,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub confidence: f64,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub last_used_at: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
struct MemosListResponse {
    #[serde(default)]
    memos: Vec<MemosMemo>,
    #[serde(default, alias = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct MemosMemo {
    #[serde(default)]
    name: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    pinned: bool,
    #[serde(default, alias = "createTime")]
    create_time: Option<String>,
    #[serde(default, alias = "updateTime")]
    update_time: Option<String>,
}

#[derive(Serialize)]
struct MemosMemoUpsertPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    state: String,
    content: String,
    visibility: String,
    pinned: bool,
}

#[derive(Serialize)]
struct OpenMemMessagePayload {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    chat_time: Option<String>,
}

#[derive(Serialize)]
struct OpenMemAddMessagePayload {
    user_id: String,
    conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    info: Option<serde_json::Map<String, Value>>,
    messages: Vec<OpenMemMessagePayload>,
}

#[derive(Deserialize, Default)]
struct OpenMemEnvelope<T> {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    data: T,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Deserialize, Default)]
struct OpenMemSearchData {
    #[serde(default)]
    memory_detail_list: Vec<OpenMemMemoryDetail>,
    #[serde(default)]
    preference_detail_list: Vec<OpenMemPreferenceDetail>,
}

#[derive(Deserialize, Default)]
struct OpenMemMemoryDetail {
    #[serde(default)]
    id: String,
    #[serde(default)]
    memory_key: String,
    #[serde(default)]
    memory_value: String,
    #[serde(default)]
    memory_type: String,
    #[serde(default)]
    conversation_id: String,
    #[serde(default)]
    confidence: f64,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    create_time: Option<String>,
    #[serde(default)]
    update_time: Option<String>,
    #[serde(default)]
    relativity: Option<f64>,
}

#[derive(Deserialize, Default)]
struct OpenMemPreferenceDetail {
    #[serde(default)]
    id: String,
    #[serde(default)]
    preference: String,
    #[serde(default)]
    preference_type: String,
    #[serde(default)]
    conversation_id: String,
    #[serde(default)]
    create_time: Option<String>,
    #[serde(default)]
    update_time: Option<String>,
}

#[derive(Serialize)]
struct OpenMemSearchPayload {
    user_id: String,
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filter: Option<Value>,
    memory_limit_number: u32,
    include_preference: bool,
    preference_limit_number: u32,
    include_tool_memory: bool,
}

#[derive(Serialize)]
struct OpenMemGetMessagePayload {
    user_id: String,
    conversation_id: String,
    page_size: u32,
}

#[derive(Deserialize, Default)]
struct OpenMemGetMessageData {
    #[serde(default)]
    message_list: Vec<OpenMemStoredMessage>,
}

#[derive(Deserialize, Default)]
struct OpenMemStoredMessage {
    #[serde(default)]
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    chat_time: Option<String>,
}

#[derive(Serialize)]
struct OpenMemDeletePayload {
    user_ids: Vec<String>,
    memory_ids: Vec<String>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn compact_display_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let path = PathBuf::from(trimmed);
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .unwrap_or_else(|| trimmed.to_string())
}

fn normalize_base_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn default_memory_provider() -> String {
    "memos".to_string()
}

fn provider_label(provider: &str) -> String {
    match provider.trim() {
        "memos" => "Memos".to_string(),
        "openmem" => "MemOS Cloud".to_string(),
        "" => "Unknown".to_string(),
        other => other.to_string(),
    }
}

fn looks_like_openmem_endpoint(value: &str) -> bool {
    let lowered = value.trim().to_ascii_lowercase();
    lowered.contains("/api/openmem/")
        || lowered.contains("memos.memtensor.cn")
        || lowered.contains("openmem.net")
}

fn normalize_provider_base_url(provider: &str, value: &str) -> String {
    let normalized = normalize_base_url(value);
    if provider.eq_ignore_ascii_case("openmem") && !normalized.is_empty() && !normalized.ends_with("/api/openmem/v1") {
        return format!("{}/api/openmem/v1", normalized);
    }
    normalized
}

fn read_memory_provider_config() -> Result<MemoryProviderConfig, String> {
    let hub = super::config::read_hub_config()?;
    let config = match hub.get("memory") {
        Some(raw) => serde_json::from_value::<MemoryProviderConfig>(raw.clone()).unwrap_or_default(),
        None => match hub.get("memos") {
            Some(raw) => {
                let legacy = serde_json::from_value::<LegacyMemosConfig>(raw.clone()).unwrap_or_default();
                MemoryProviderConfig {
                    provider: default_memory_provider(),
                    enabled: legacy.enabled,
                    base_url: legacy.base_url,
                    access_token: legacy.access_token,
                }
            }
            None => MemoryProviderConfig::default(),
        },
    };
    let provider = if looks_like_openmem_endpoint(&config.base_url) {
        "openmem".to_string()
    } else if config.provider.trim().is_empty() {
        default_memory_provider()
    } else {
        config.provider.trim().to_string()
    };

    Ok(MemoryProviderConfig {
        provider: provider.clone(),
        enabled: config.enabled,
        base_url: normalize_provider_base_url(&provider, &config.base_url),
        access_token: config
            .access_token
            .and_then(|token| {
                let trimmed = token.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            }),
    })
}

fn memory_provider_configured(config: &MemoryProviderConfig) -> bool {
    config.enabled
        && !config.provider.trim().is_empty()
        && !config.base_url.is_empty()
        && config.access_token.is_some()
}

fn provider_uses_memos_api(config: &MemoryProviderConfig) -> bool {
    config.provider.trim().eq_ignore_ascii_case("memos")
}

fn provider_uses_openmem_api(config: &MemoryProviderConfig) -> bool {
    config.provider.trim().eq_ignore_ascii_case("openmem")
}

fn sanitize_openmem_key(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>()
}

fn openmem_user_id() -> String {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "default".to_string());
    format!("agenthub-user-{}", sanitize_openmem_key(&user.to_lowercase()))
}

fn openmem_conversation_id_for_item(item: &MemoryItem) -> String {
    match item.scope.as_str() {
        "thread" => item
            .scope_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "agenthub-thread".to_string()),
        "agent" => format!(
            "agenthub-agent-{}",
            sanitize_openmem_key(item.scope_id.as_deref().unwrap_or("default"))
        ),
        "workspace" => format!(
            "agenthub-workspace-{}",
            sanitize_openmem_key(item.scope_id.as_deref().unwrap_or("default"))
        ),
        _ => "agenthub-global".to_string(),
    }
}

fn openmem_role_from_item(item: &MemoryItem) -> String {
    if item.tags.iter().any(|tag| tag == "assistant") {
        "assistant".to_string()
    } else {
        "user".to_string()
    }
}

fn derive_global_capability_profile() -> Result<CapabilityProfile, String> {
    let hub = super::config::read_hub_config()?;

    let enabled_skills = hub
        .get("skills")
        .and_then(|skills| skills.get("directories"))
        .and_then(|dirs| dirs.as_array())
        .map(|dirs| {
            dirs.iter()
                .filter_map(|dir| dir.as_str())
                .map(compact_display_name)
                .filter(|name| !name.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let enabled_mcp_servers = hub
        .get("mcpServers")
        .and_then(|raw| raw.as_array())
        .map(|servers| {
            servers
                .iter()
                .filter(|server| server.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true))
                .filter_map(|server| {
                    server
                        .get("name")
                        .and_then(|value| value.as_str())
                        .or_else(|| server.get("id").and_then(|value| value.as_str()))
                        .map(|value| value.to_string())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let preferred_models = hub
        .get("models")
        .and_then(|raw| raw.as_array())
        .map(|models| {
            models
                .iter()
                .filter(|model| model.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false))
                .filter_map(|model| {
                    model
                        .get("name")
                        .and_then(|value| value.as_str())
                        .or_else(|| model.get("id").and_then(|value| value.as_str()))
                        .map(|value| value.to_string())
                })
                .take(8)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let preferred_providers = hub
        .get("providers")
        .and_then(|raw| raw.as_array())
        .map(|providers| {
            providers
                .iter()
                .filter_map(|provider| {
                    provider
                        .get("name")
                        .and_then(|value| value.as_str())
                        .or_else(|| provider.get("id").and_then(|value| value.as_str()))
                        .map(|value| value.to_string())
                })
                .take(8)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let secret_refs = hub
        .get("secrets")
        .and_then(|raw| raw.as_array())
        .map(|secrets| {
            secrets
                .iter()
                .filter_map(|secret| {
                    secret
                        .get("refKey")
                        .and_then(|value| value.as_str())
                        .or_else(|| secret.get("name").and_then(|value| value.as_str()))
                        .map(|value| value.to_string())
                })
                .take(12)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(CapabilityProfile {
        id: "profile.global.derived".to_string(),
        scope: "global".to_string(),
        scope_id: None,
        source: "system".to_string(),
        enabled_skills,
        enabled_mcp_servers,
        preferred_models,
        preferred_providers,
        secret_refs,
        default_agent_id: None,
        updated_at: now_iso(),
    })
}

fn score_memory_scope(item: &MemoryItem, thread_id: Option<&str>, agent_id: Option<&str>) -> Option<u8> {
    match item.scope.as_str() {
        "global" => Some(0),
        "thread" if item.scope_id.as_deref() == thread_id => Some(2),
        "agent" if item.scope_id.as_deref() == agent_id => Some(1),
        _ => None,
    }
}

fn scan_dir_for_md_files(dir: &PathBuf) -> Vec<(String, String, String)> {
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

fn parse_agenthub_memo(content: &str) -> Option<(AgentHubMemoMeta, String)> {
    let trimmed = content.trim();
    if !trimmed.starts_with(AGENTHUB_MEMO_PREFIX) {
        return None;
    }

    let end = trimmed.find("-->")?;
    let meta_json = trimmed[AGENTHUB_MEMO_PREFIX.len()..end].trim();
    let meta = serde_json::from_str::<AgentHubMemoMeta>(meta_json).ok()?;
    let body = trimmed[end + 3..].trim().to_string();
    Some((meta, body))
}

fn serialize_agenthub_memo(item: &MemoryItem) -> Result<String, String> {
    if item.content.trim().is_empty() {
        return Err("Memory content cannot be empty".to_string());
    }

    let meta = AgentHubMemoMeta {
        scope: item.scope.trim().to_string(),
        scope_id: item.scope_id.clone().and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }),
        kind: item.kind.trim().to_string(),
        visibility: item.visibility.trim().to_string(),
        source: item.source.trim().to_string(),
        confidence: item.confidence,
        hidden: item.hidden,
        created_by: item.created_by.clone(),
        tags: item
            .tags
            .iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect(),
        last_used_at: item.last_used_at.clone(),
    };

    let meta_json = serde_json::to_string(&meta)
        .map_err(|error| format!("Failed to encode AgentHub memo metadata: {}", error))?;

    Ok(format!(
        "{} {} -->\n\n{}",
        AGENTHUB_MEMO_PREFIX,
        meta_json,
        item.content.trim()
    ))
}

fn memo_to_memory_item(memo: MemosMemo) -> Option<MemoryItem> {
    let (meta, body) = parse_agenthub_memo(&memo.content)?;
    let created_at = memo.create_time.unwrap_or_else(now_iso);
    let updated_at = memo.update_time.unwrap_or_else(|| created_at.clone());

    Some(MemoryItem {
        id: memo.name,
        content: body,
        kind: if meta.kind.trim().is_empty() {
            "note".to_string()
        } else {
            meta.kind
        },
        scope: if meta.scope.trim().is_empty() {
            "global".to_string()
        } else {
            meta.scope
        },
        scope_id: meta.scope_id,
        visibility: if meta.visibility.trim().is_empty() {
            "visible".to_string()
        } else {
            meta.visibility
        },
        source: if meta.source.trim().is_empty() {
            "memos".to_string()
        } else {
            meta.source
        },
        confidence: if meta.confidence <= 0.0 { 0.8 } else { meta.confidence },
        pinned: memo.pinned,
        hidden: meta.hidden,
        created_by: meta.created_by,
        tags: meta.tags,
        created_at,
        updated_at,
        last_used_at: meta.last_used_at,
    })
}

async fn build_memos_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("AgentHub/Memos")
        .build()
        .map_err(|error| format!("Failed to initialize Memos client: {}", error))
}

async fn send_memos_request(
    config: &MemoryProviderConfig,
    request: reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let request = if let Some(token) = config.access_token.as_ref() {
        if provider_uses_openmem_api(config) {
            request.header("Authorization", format!("Token {}", token))
        } else {
            request.bearer_auth(token)
        }
    } else {
        request
    };

    let response = request
        .send()
        .await
        .map_err(|error| format!("Failed to call memory provider API: {}", error))?;

    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let message = if body.trim().is_empty() {
        format!("Memory provider API returned {}", status)
    } else {
        format!("Memory provider API returned {}: {}", status, body)
    };
    Err(message)
}

async fn fetch_current_memos_user(config: &MemoryProviderConfig) -> Result<Option<String>, String> {
    let client = build_memos_client().await?;
    let url = format!("{}/api/v1/auth/me", config.base_url);
    let response = send_memos_request(config, client.get(url)).await?;
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Failed to decode Memos auth response: {}", error))?;

    let user = body.get("user");
    let name = user
        .and_then(|raw| raw.get("nickname").and_then(|value| value.as_str()))
        .or_else(|| user.and_then(|raw| raw.get("username").and_then(|value| value.as_str())))
        .or_else(|| user.and_then(|raw| raw.get("name").and_then(|value| value.as_str())))
        .map(|value| value.to_string());

    Ok(name)
}

async fn fetch_agenthub_memory_items(config: &MemoryProviderConfig) -> Result<Vec<MemoryItem>, String> {
    if !memory_provider_configured(config) {
        return Ok(Vec::new());
    }

    let client = build_memos_client().await?;
    let mut memos = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let url = format!("{}/api/v1/memos", config.base_url);
        let query = vec![("pageSize", "100"), ("orderBy", "display_time desc")];

        let mut request = client.get(url).query(&query);
        if let Some(next_page_token) = page_token.as_ref() {
            request = request.query(&[("pageToken", next_page_token.as_str())]);
        }

        let response = send_memos_request(config, request).await?;
        let payload = response
            .json::<MemosListResponse>()
            .await
            .map_err(|error| format!("Failed to decode Memos list response: {}", error))?;

        memos.extend(payload.memos);
        page_token = payload.next_page_token.filter(|token| !token.is_empty());

        if page_token.is_none() || memos.len() >= 500 {
            break;
        }
    }

    let mut items = memos
        .into_iter()
        .filter_map(memo_to_memory_item)
        .collect::<Vec<_>>();

    items.sort_by(|left, right| {
        right
            .pinned
            .cmp(&left.pinned)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });

    Ok(items)
}

async fn create_memos_memory_item(config: &MemoryProviderConfig, item: &MemoryItem) -> Result<MemoryItem, String> {
    let client = build_memos_client().await?;
    let url = format!("{}/api/v1/memos", config.base_url);
    let payload = MemosMemoUpsertPayload {
        name: None,
        state: "NORMAL".to_string(),
        content: serialize_agenthub_memo(item)?,
        visibility: "PRIVATE".to_string(),
        pinned: item.pinned,
    };

    let response = send_memos_request(config, client.post(url).json(&payload)).await?;
    let memo = response
        .json::<MemosMemo>()
        .await
        .map_err(|error| format!("Failed to decode created Memos memo: {}", error))?;

    memo_to_memory_item(memo).ok_or("Created memo is missing AgentHub metadata".to_string())
}

async fn update_memos_memory_item(config: &MemoryProviderConfig, item: &MemoryItem) -> Result<MemoryItem, String> {
    if item.id.trim().is_empty() {
        return create_memos_memory_item(config, item).await;
    }

    let client = build_memos_client().await?;
    let name = item.id.trim().trim_start_matches('/');
    let url = format!("{}/api/v1/{}", config.base_url, name);
    let payload = MemosMemoUpsertPayload {
        name: Some(name.to_string()),
        state: "NORMAL".to_string(),
        content: serialize_agenthub_memo(item)?,
        visibility: "PRIVATE".to_string(),
        pinned: item.pinned,
    };

    let response = send_memos_request(config, client.patch(url).json(&payload)).await?;
    let memo = response
        .json::<MemosMemo>()
        .await
        .map_err(|error| format!("Failed to decode updated Memos memo: {}", error))?;

    memo_to_memory_item(memo).ok_or("Updated memo is missing AgentHub metadata".to_string())
}

fn build_openmem_info(item: &MemoryItem) -> Option<serde_json::Map<String, Value>> {
    let mut info = serde_json::Map::new();
    info.insert("scope".to_string(), Value::String(item.scope.clone()));
    if let Some(scope_id) = item.scope_id.as_ref() {
        info.insert("scope_id".to_string(), Value::String(scope_id.clone()));
    }
    info.insert("kind".to_string(), Value::String(item.kind.clone()));
    info.insert("visibility".to_string(), Value::String(item.visibility.clone()));
    info.insert("source".to_string(), Value::String(item.source.clone()));
    info.insert("hidden".to_string(), Value::String(item.hidden.to_string()));
    info.insert("pinned".to_string(), Value::String(item.pinned.to_string()));
    info.insert("scene".to_string(), Value::String(AGENTHUB_OPENMEM_SCENE.to_string()));
    if info.is_empty() { None } else { Some(info) }
}

async fn send_openmem_payload<T: for<'de> Deserialize<'de> + Default>(
    config: &MemoryProviderConfig,
    path: &str,
    payload: &impl Serialize,
) -> Result<T, String> {
    let client = build_memos_client().await?;
    let url = format!("{}/{}", config.base_url, path.trim_start_matches('/'));
    let response = send_memos_request(config, client.post(url).json(payload)).await?;
    let envelope = response
        .json::<OpenMemEnvelope<T>>()
        .await
        .map_err(|error| format!("Failed to decode OpenMem response: {}", error))?;

    if envelope.code == 0 {
        Ok(envelope.data)
    } else {
        Err(
            envelope
                .message
                .unwrap_or_else(|| format!("OpenMem returned code {}", envelope.code)),
        )
    }
}

async fn append_openmem_messages(
    config: &MemoryProviderConfig,
    conversation_id: String,
    agent_id: Option<String>,
    tags: Vec<String>,
    info: Option<serde_json::Map<String, Value>>,
    messages: Vec<OpenMemMessagePayload>,
) -> Result<(), String> {
    let payload = OpenMemAddMessagePayload {
        user_id: openmem_user_id(),
        conversation_id,
        agent_id,
        app_id: Some(AGENTHUB_OPENMEM_APP_ID.to_string()),
        tags,
        info,
        messages,
    };

    let _: Value = send_openmem_payload(config, "add/message", &payload).await?;
    Ok(())
}

fn openmem_memory_detail_to_item(detail: OpenMemMemoryDetail) -> MemoryItem {
    let created_at = detail.create_time.unwrap_or_else(now_iso);
    let updated_at = detail.update_time.unwrap_or_else(|| created_at.clone());
    let content = if !detail.memory_key.trim().is_empty()
        && !detail.memory_value.trim().starts_with(detail.memory_key.trim())
    {
        format!("{}: {}", detail.memory_key.trim(), detail.memory_value.trim())
    } else {
        detail.memory_value.trim().to_string()
    };

    MemoryItem {
        id: format!("openmem-memory:{}", detail.id),
        content,
        kind: "project_fact".to_string(),
        scope: if detail.conversation_id.trim().is_empty() {
            "global".to_string()
        } else {
            "thread".to_string()
        },
        scope_id: if detail.conversation_id.trim().is_empty() {
            None
        } else {
            Some(detail.conversation_id)
        },
        visibility: "visible".to_string(),
        source: "openmem.search".to_string(),
        confidence: detail.relativity.unwrap_or(detail.confidence.max(0.8)),
        pinned: false,
        hidden: false,
        created_by: None,
        tags: detail.tags,
        created_at,
        updated_at,
        last_used_at: None,
    }
}

fn openmem_preference_to_item(detail: OpenMemPreferenceDetail) -> MemoryItem {
    let created_at = detail.create_time.unwrap_or_else(now_iso);
    let updated_at = detail.update_time.unwrap_or_else(|| created_at.clone());

    MemoryItem {
        id: format!("openmem-preference:{}", detail.id),
        content: detail.preference,
        kind: "preference".to_string(),
        scope: if detail.conversation_id.trim().is_empty() {
            "global".to_string()
        } else {
            "thread".to_string()
        },
        scope_id: if detail.conversation_id.trim().is_empty() {
            None
        } else {
            Some(detail.conversation_id)
        },
        visibility: "visible".to_string(),
        source: "openmem.preference".to_string(),
        confidence: 0.92,
        pinned: false,
        hidden: false,
        created_by: None,
        tags: vec![detail.preference_type],
        created_at,
        updated_at,
        last_used_at: None,
    }
}

async fn search_openmem_memories(
    config: &MemoryProviderConfig,
    query: &str,
    conversation_id: Option<String>,
) -> Result<Vec<MemoryItem>, String> {
    let filter = serde_json::json!({
        "app_id": AGENTHUB_OPENMEM_APP_ID,
    });
    let payload = OpenMemSearchPayload {
        user_id: openmem_user_id(),
        query: query.trim().to_string(),
        conversation_id,
        filter: Some(filter),
        memory_limit_number: 6,
        include_preference: true,
        preference_limit_number: 4,
        include_tool_memory: false,
    };

    let data: OpenMemSearchData = send_openmem_payload(config, "search/memory", &payload).await?;
    let mut items = data
        .memory_detail_list
        .into_iter()
        .map(openmem_memory_detail_to_item)
        .collect::<Vec<_>>();
    items.extend(
        data.preference_detail_list
            .into_iter()
            .map(openmem_preference_to_item),
    );
    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(items)
}

async fn fetch_openmem_messages(
    config: &MemoryProviderConfig,
    conversation_id: String,
    page_size: u32,
) -> Result<Vec<OpenMemStoredMessage>, String> {
    let payload = OpenMemGetMessagePayload {
        user_id: openmem_user_id(),
        conversation_id,
        page_size,
    };
    let data: OpenMemGetMessageData = send_openmem_payload(config, "get/message", &payload).await?;
    Ok(data.message_list)
}

fn recent_thread_refs(limit: usize) -> Vec<(String, String)> {
    let Ok(hub) = super::config::read_hub_config() else {
        return Vec::new();
    };

    let mut threads = hub
        .get("collaboration")
        .and_then(|value| value.get("threads"))
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let title = item
                        .get("title")
                        .and_then(|value| value.as_str())
                        .unwrap_or(&id)
                        .to_string();
                    let updated_at = item
                        .get("updated_at")
                        .and_then(|value| value.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some((id, title, updated_at))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    threads.sort_by(|left, right| right.2.cmp(&left.2));
    threads
        .into_iter()
        .take(limit)
        .map(|(id, title, _)| (id, title))
        .collect()
}

async fn fetch_openmem_dashboard_items(config: &MemoryProviderConfig) -> Result<Vec<MemoryItem>, String> {
    let mut items = Vec::new();

    for (thread_id, thread_title) in recent_thread_refs(6) {
        let messages = fetch_openmem_messages(config, thread_id.clone(), 8).await?;
        items.extend(messages.into_iter().enumerate().map(|(index, message)| MemoryItem {
            id: format!("openmem-message:{}:{}", thread_id, index),
            content: message.content,
            kind: "note".to_string(),
            scope: "thread".to_string(),
            scope_id: Some(thread_id.clone()),
            visibility: "internal".to_string(),
            source: format!("openmem.message.{}", message.role),
            confidence: 1.0,
            pinned: false,
            hidden: false,
            created_by: Some(message.role.clone()),
            tags: vec!["chat".to_string(), message.role, thread_title.clone()],
            created_at: message.chat_time.clone().unwrap_or_else(now_iso),
            updated_at: message.chat_time.unwrap_or_else(now_iso),
            last_used_at: None,
        }));
    }

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    items.truncate(40);
    Ok(items)
}

async fn delete_openmem_memory_item(config: &MemoryProviderConfig, id: &str) -> Result<(), String> {
    let memory_id = id
        .trim()
        .strip_prefix("openmem-memory:")
        .or_else(|| id.trim().strip_prefix("openmem-preference:"))
        .ok_or_else(|| "OpenMem 当前只支持删除已检索到的 memory 片段，不支持删除原始消息".to_string())?;

    let payload = OpenMemDeletePayload {
        user_ids: vec![openmem_user_id()],
        memory_ids: vec![memory_id.to_string()],
    };

    let _: Value = send_openmem_payload(config, "delete/memory", &payload).await?;
    Ok(())
}

fn build_connection_state(
    config: MemoryProviderConfig,
    connected: bool,
    current_user: Option<String>,
    last_error: Option<String>,
) -> MemoryConnectionState {
    MemoryConnectionState {
        provider: config.provider.clone(),
        provider_label: provider_label(&config.provider),
        configured: memory_provider_configured(&config),
        connected,
        current_user,
        last_error,
        config,
    }
}

#[tauri::command]
pub fn scan_agent_memories() -> Result<Vec<AgentMemoryInfo>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let mut all = Vec::new();

    let oc_mem = home.join(".openclaw").join("memory");
    if oc_mem.exists() {
        let files = scan_dir_for_md_files(&oc_mem);
        let entries: Vec<AgentMemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| AgentMemoryEntry {
                id: format!("openclaw-{}", i),
                content: content
                    .lines()
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(200)
                    .collect(),
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

    let claude_projects = home.join(".claude").join("projects");
    if claude_projects.exists() {
        let mut entries = Vec::new();
        if let Ok(project_dirs) = fs::read_dir(&claude_projects) {
            for dir in project_dirs.filter_map(|e| e.ok()).take(10) {
                let claude_md = dir.path().join("CLAUDE.md");
                if claude_md.exists() {
                    let content = fs::read_to_string(&claude_md).unwrap_or_default();
                    let name = dir.file_name().to_string_lossy().to_string();
                    entries.push(AgentMemoryEntry {
                        id: format!("claude-{}", name),
                        content: content
                            .lines()
                            .take(3)
                            .collect::<Vec<_>>()
                            .join(" ")
                            .chars()
                            .take(200)
                            .collect(),
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

    let codex_mem = home.join(".codex").join("memories");
    if codex_mem.exists() {
        let files = scan_dir_for_md_files(&codex_mem);
        let entries: Vec<AgentMemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| AgentMemoryEntry {
                id: format!("codex-{}", i),
                content: content
                    .lines()
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(200)
                    .collect(),
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

    let qc_mem = home.join(".qclaw").join("qmemory");
    if qc_mem.exists() {
        let files = scan_dir_for_md_files(&qc_mem);
        let entries: Vec<AgentMemoryEntry> = files
            .iter()
            .enumerate()
            .map(|(i, (name, content, date))| AgentMemoryEntry {
                id: format!("qclaw-{}", i),
                content: content
                    .lines()
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(200)
                    .collect(),
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

#[tauri::command]
pub async fn get_memory_dashboard() -> Result<MemoryDashboard, String> {
    let config = read_memory_provider_config()?;
    let profiles = vec![derive_global_capability_profile()?];
    let external_sources = scan_agent_memories().unwrap_or_default();

    let (items, connected, current_user, last_error) = if !memory_provider_configured(&config) {
        (Vec::new(), false, None, None)
    } else if provider_uses_memos_api(&config) {
        match fetch_current_memos_user(&config).await {
            Ok(current_user) => match fetch_agenthub_memory_items(&config).await {
                Ok(items) => (items, true, current_user, None),
                Err(error) => (Vec::new(), false, current_user, Some(error)),
            },
            Err(error) => (Vec::new(), false, None, Some(error)),
        }
    } else if provider_uses_openmem_api(&config) {
        match fetch_openmem_messages(&config, "agenthub-healthcheck".to_string(), 1).await {
            Ok(_) => match fetch_openmem_dashboard_items(&config).await {
                Ok(items) => (items, true, Some(openmem_user_id()), None),
                Err(error) => (Vec::new(), false, Some(openmem_user_id()), Some(error)),
            },
            Err(error) => (Vec::new(), false, Some(openmem_user_id()), Some(error)),
        }
    } else {
        (
            Vec::new(),
            false,
            None,
            Some(format!("当前 provider `{}` 还未接入", config.provider)),
        )
    };

    Ok(MemoryDashboard {
        items,
        profiles,
        external_sources,
        connection: build_connection_state(config, connected, current_user, last_error),
    })
}

#[tauri::command]
pub async fn list_memory_items(
    scope: Option<String>,
    scope_id: Option<String>,
    visibility: Option<String>,
) -> Result<Vec<MemoryItem>, String> {
    let config = read_memory_provider_config()?;
    let mut items = if provider_uses_memos_api(&config) {
        fetch_agenthub_memory_items(&config).await?
    } else if provider_uses_openmem_api(&config) {
        if let Some(ref next_scope_id) = scope_id {
            if scope.as_deref() == Some("thread") {
                fetch_openmem_messages(&config, next_scope_id.clone(), 20)
                    .await?
                    .into_iter()
                    .enumerate()
                    .map(|(index, message)| MemoryItem {
                        id: format!("openmem-message:{}:{}", next_scope_id, index),
                        content: message.content,
                        kind: "note".to_string(),
                        scope: "thread".to_string(),
                        scope_id: Some(next_scope_id.clone()),
                        visibility: "internal".to_string(),
                        source: format!("openmem.message.{}", message.role),
                        confidence: 1.0,
                        pinned: false,
                        hidden: false,
                        created_by: Some(message.role.clone()),
                        tags: vec!["chat".to_string(), message.role],
                        created_at: message.chat_time.clone().unwrap_or_else(now_iso),
                        updated_at: message.chat_time.unwrap_or_else(now_iso),
                        last_used_at: None,
                    })
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        } else {
            fetch_openmem_dashboard_items(&config).await?
        }
    } else {
        Vec::new()
    };
    items.retain(|item| {
        if let Some(ref next_scope) = scope {
            if item.scope != *next_scope {
                return false;
            }
        }
        if let Some(ref next_scope_id) = scope_id {
            if item.scope_id.as_deref() != Some(next_scope_id.as_str()) {
                return false;
            }
        }
        if let Some(ref next_visibility) = visibility {
            if item.visibility != *next_visibility {
                return false;
            }
        }
        true
    });
    Ok(items)
}

#[tauri::command]
pub async fn upsert_memory_item(mut item: MemoryItem) -> Result<MemoryItem, String> {
    let config = read_memory_provider_config()?;
    if !memory_provider_configured(&config) {
        return Err("请先在 Memory 页面配置并启用记忆服务".to_string());
    }

    item.content = item.content.trim().to_string();
    item.kind = item.kind.trim().to_string();
    item.scope = item.scope.trim().to_string();
    item.visibility = item.visibility.trim().to_string();
    item.source = item.source.trim().to_string();
    item.tags = item
        .tags
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect();
    item.scope_id = item.scope_id.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    if item.source.is_empty() {
        item.source = "manual".to_string();
    }

    if provider_uses_memos_api(&config) {
        if item.id.trim().is_empty() {
            create_memos_memory_item(&config, &item).await
        } else {
            update_memos_memory_item(&config, &item).await
        }
    } else if provider_uses_openmem_api(&config) {
        let conversation_id = openmem_conversation_id_for_item(&item);
        append_openmem_messages(
            &config,
            conversation_id.clone(),
            if item.scope == "agent" { item.scope_id.clone() } else { None },
            item.tags.clone(),
            build_openmem_info(&item),
            vec![OpenMemMessagePayload {
                role: openmem_role_from_item(&item),
                content: item.content.clone(),
                chat_time: Some(now_iso()),
            }],
        )
        .await?;

        let now = now_iso();
        Ok(MemoryItem {
            id: if item.id.trim().is_empty() {
                format!("openmem-manual:{}:{}", conversation_id, Utc::now().timestamp_millis())
            } else {
                item.id
            },
            updated_at: now.clone(),
            created_at: if item.created_at.trim().is_empty() {
                now
            } else {
                item.created_at
            },
            ..item
        })
    } else {
        Err(format!("当前 provider `{}` 还未接入", config.provider))
    }
}

#[tauri::command]
pub async fn delete_memory_item(id: String) -> Result<(), String> {
    let config = read_memory_provider_config()?;
    if !memory_provider_configured(&config) {
        return Err("请先在 Memory 页面配置并启用记忆服务".to_string());
    }
    if provider_uses_memos_api(&config) {
        let name = id.trim().trim_start_matches('/');
        if name.is_empty() {
            return Err("Missing memory item id".to_string());
        }

        let client = build_memos_client().await?;
        let url = format!("{}/api/v1/{}", config.base_url, name);
        send_memos_request(&config, client.delete(url)).await?;
        Ok(())
    } else if provider_uses_openmem_api(&config) {
        delete_openmem_memory_item(&config, &id).await
    } else {
        Err(format!("当前 provider `{}` 还未接入", config.provider))
    }
}

#[tauri::command]
pub async fn build_chat_memory_context(
    thread_id: Option<String>,
    agent_id: Option<String>,
    query: Option<String>,
) -> Result<ChatMemoryContext, String> {
    let config = read_memory_provider_config()?;
    let mut memories = if memory_provider_configured(&config) && provider_uses_memos_api(&config) {
        fetch_agenthub_memory_items(&config).await.unwrap_or_default()
    } else if memory_provider_configured(&config) && provider_uses_openmem_api(&config) {
        let search_query = query
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        if search_query.is_empty() {
            Vec::new()
        } else {
            search_openmem_memories(&config, &search_query, thread_id.clone())
                .await
                .unwrap_or_default()
        }
    } else {
        Vec::new()
    };

    memories.retain(|item| !item.hidden);
    memories = memories
        .into_iter()
        .filter_map(|item| {
            score_memory_scope(&item, thread_id.as_deref(), agent_id.as_deref()).map(|score| (score, item))
        })
        .collect::<Vec<_>>()
        .into_iter()
        .map(|(_, item)| item)
        .collect::<Vec<_>>();

    memories.sort_by(|left, right| {
        right
            .pinned
            .cmp(&left.pinned)
            .then_with(|| {
                score_memory_scope(right, thread_id.as_deref(), agent_id.as_deref())
                    .cmp(&score_memory_scope(left, thread_id.as_deref(), agent_id.as_deref()))
            })
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });

    memories.truncate(8);

    Ok(ChatMemoryContext {
        memories,
        capability_profile: derive_global_capability_profile()?,
    })
}

#[tauri::command]
pub async fn append_chat_memory_record(
    thread_id: String,
    agent_id: String,
    role: String,
    content: String,
    timestamp: Option<String>,
) -> Result<(), String> {
    let config = read_memory_provider_config()?;
    if !memory_provider_configured(&config) || content.trim().is_empty() {
        return Ok(());
    }

    if provider_uses_memos_api(&config) {
        let item = MemoryItem {
            id: String::new(),
            content: content.trim().to_string(),
            kind: "note".to_string(),
            scope: "thread".to_string(),
            scope_id: Some(thread_id),
            visibility: "internal".to_string(),
            source: "chat-auto".to_string(),
            confidence: 1.0,
            pinned: false,
            hidden: true,
            created_by: Some(if role == "user" { "user".to_string() } else { agent_id.clone() }),
            tags: vec!["chat".to_string(), "auto".to_string(), role],
            created_at: String::new(),
            updated_at: String::new(),
            last_used_at: None,
        };
        let _ = create_memos_memory_item(&config, &item).await?;
        return Ok(());
    }

    if provider_uses_openmem_api(&config) {
        append_openmem_messages(
            &config,
            thread_id.clone(),
            Some(agent_id.clone()),
            vec![
                "chat".to_string(),
                "auto".to_string(),
                role.clone(),
                agent_id.clone(),
            ],
            Some(serde_json::Map::from_iter([
                ("scene".to_string(), Value::String(AGENTHUB_OPENMEM_SCENE.to_string())),
                ("thread_id".to_string(), Value::String(thread_id)),
                ("source".to_string(), Value::String("chat-auto".to_string())),
            ])),
            vec![OpenMemMessagePayload {
                role,
                content: content.trim().to_string(),
                chat_time: timestamp,
            }],
        )
        .await?;
    }

    Ok(())
}
