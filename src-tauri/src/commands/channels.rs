use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

fn default_channel_policy() -> ChannelPolicyConfig {
    ChannelPolicyConfig {
        dm_policy: Some("allow".to_string()),
        group_policy: Some("mentions-only".to_string()),
        require_mention: Some(true),
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
    super::config::write_hub_config_module(
        "channels".to_string(),
        serde_json::to_value(&config)
            .map_err(|error| format!("Failed to serialize channels config: {}", error))?,
    )?;
    Ok(config)
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

    Ok(FeishuConnectionResult {
        domain: domain.to_string(),
        endpoint,
        tested_at: Utc::now().to_rfc3339(),
        expires_in: payload.expire,
        token_preview,
        message: "飞书租户 token 获取成功".to_string(),
    })
}
