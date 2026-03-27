use serde::{Deserialize, Serialize};
use std::fs;

// ── Token Usage from local agent files ──

#[derive(Serialize)]
pub struct AgentActivity {
    pub agent_id: String,
    pub agent_name: String,
    pub agent_icon: String,
    pub daily: Vec<DailyActivity>,
    pub total_messages: u64,
    pub total_sessions: u64,
    pub total_tool_calls: u64,
    pub source_file: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DailyActivity {
    pub date: String,
    #[serde(rename = "messageCount", default)]
    pub message_count: u64,
    #[serde(rename = "sessionCount", default)]
    pub session_count: u64,
    #[serde(rename = "toolCallCount", default)]
    pub tool_call_count: u64,
}

#[derive(Serialize)]
pub struct TokenSummary {
    pub agents: Vec<AgentActivity>,
    pub total_messages: u64,
    pub total_sessions: u64,
    pub total_tool_calls: u64,
    pub proxy_active: bool,
    pub proxy_port: u16,
}

#[derive(Deserialize)]
struct ClaudeStatsFile {
    #[serde(rename = "dailyActivity", default)]
    daily_activity: Vec<DailyActivity>,
}

#[tauri::command]
pub fn get_token_usage() -> Result<TokenSummary, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let mut agents = Vec::new();

    let claude_stats = home.join(".claude").join("stats-cache.json");
    if claude_stats.exists() {
        if let Ok(content) = fs::read_to_string(&claude_stats) {
            if let Ok(stats) = serde_json::from_str::<ClaudeStatsFile>(&content) {
                let daily = stats.daily_activity;
                let total_messages: u64 = daily.iter().map(|d| d.message_count).sum();
                let total_sessions: u64 = daily.iter().map(|d| d.session_count).sum();
                let total_tool_calls: u64 = daily.iter().map(|d| d.tool_call_count).sum();
                agents.push(AgentActivity {
                    agent_id: "claude-code".into(), agent_name: "Claude Code".into(), agent_icon: "🤖".into(),
                    daily, total_messages, total_sessions, total_tool_calls,
                    source_file: claude_stats.to_string_lossy().to_string(),
                });
            }
        }
    }

    let oc_log = home.join(".openclaw").join("logs").join("gateway.log");
    if oc_log.exists() {
        if let Ok(content) = fs::read_to_string(&oc_log) {
            let line_count = content.lines().count() as u64;
            agents.push(AgentActivity {
                agent_id: "openclaw".into(), agent_name: "OpenClaw".into(), agent_icon: "🦞".into(),
                daily: vec![], total_messages: line_count / 5, total_sessions: 0, total_tool_calls: 0,
                source_file: oc_log.to_string_lossy().to_string(),
            });
        }
    }

    let codex_sessions = home.join(".codex").join("session_index.jsonl");
    if codex_sessions.exists() {
        if let Ok(content) = fs::read_to_string(&codex_sessions) {
            let session_count = content.lines().filter(|l| !l.trim().is_empty()).count() as u64;
            agents.push(AgentActivity {
                agent_id: "codex".into(), agent_name: "Codex CLI".into(), agent_icon: "📦".into(),
                daily: vec![], total_messages: 0, total_sessions: session_count, total_tool_calls: 0,
                source_file: codex_sessions.to_string_lossy().to_string(),
            });
        }
    }

    let total_messages: u64 = agents.iter().map(|a| a.total_messages).sum();
    let total_sessions: u64 = agents.iter().map(|a| a.total_sessions).sum();
    let total_tool_calls: u64 = agents.iter().map(|a| a.total_tool_calls).sum();

    Ok(TokenSummary {
        agents, total_messages, total_sessions, total_tool_calls,
        proxy_active: false, proxy_port: 18800,
    })
}

// ── API Usage ──

#[derive(Serialize)]
pub struct ProviderUsage {
    pub provider_id: String,
    pub provider_name: String,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cost_usd: f64,
    pub balance: Option<BalanceInfo>,
    pub period: String,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct BalanceInfo {
    pub currency: String,
    pub total_balance: String,
    pub is_available: bool,
}

#[derive(Serialize)]
pub struct UsageSummary {
    pub providers: Vec<ProviderUsage>,
    pub total_cost_usd: f64,
}

fn read_hub_providers() -> Result<Vec<serde_json::Value>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let hub_path = home.join(".agenthub").join("hub.json");
    if !hub_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&hub_path).map_err(|e| e.to_string())?;
    let hub: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // New format: providers is a top-level array
    if let Some(arr) = hub.get("providers").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    // Old format fallback
    if let Some(arr) = hub.pointer("/models/providers").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    Ok(vec![])
}

fn get_provider_base_domain(p: &serde_json::Value) -> String {
    // Extract base domain from endpoints or legacy baseUrl
    if let Some(endpoints) = p.get("endpoints").and_then(|v| v.as_array()) {
        if let Some(first) = endpoints.first() {
            if let Some(url) = first.get("baseUrl").and_then(|v| v.as_str()) {
                return url.replace("https://", "").replace("http://", "").split('/').next().unwrap_or("").to_string();
            }
        }
    }
    if let Some(url) = p.get("baseUrl").and_then(|v| v.as_str()) {
        return url.replace("https://", "").replace("http://", "").split('/').next().unwrap_or("").to_string();
    }
    String::new()
}

#[tauri::command]
pub async fn get_api_usage() -> Result<UsageSummary, String> {
    let hub_providers = read_hub_providers()?;

    if hub_providers.is_empty() {
        return Ok(UsageSummary { providers: vec![], total_cost_usd: 0.0 });
    }

    let mut providers = Vec::new();

    for p in &hub_providers {
        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let name = p.get("name").and_then(|v| v.as_str()).unwrap_or(id);
        let api_key = p.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
        let base_domain = get_provider_base_domain(p);

        if api_key.is_empty() {
            providers.push(ProviderUsage {
                provider_id: id.into(), provider_name: name.into(),
                total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                balance: None, period: String::new(), error: Some("No API key configured".into()),
            });
            continue;
        }

        // DeepSeek — GET /user/balance
        if id == "deepseek" || base_domain.contains("deepseek") {
            match fetch_deepseek_balance(api_key).await {
                Ok(balance) => {
                    providers.push(ProviderUsage {
                        provider_id: id.into(), provider_name: name.into(),
                        total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                        balance: Some(balance), period: String::new(), error: None,
                    });
                }
                Err(e) => providers.push(ProviderUsage {
                    provider_id: id.into(), provider_name: name.into(),
                    total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                    balance: None, period: String::new(), error: Some(e),
                }),
            }
        }
        // Moonshot/Kimi — GET /v1/users/me/balance
        else if id.starts_with("moonshot") || base_domain.contains("moonshot") {
            let api_host = if base_domain.contains("moonshot.cn") {
                "https://api.moonshot.cn"
            } else {
                "https://api.moonshot.ai"
            };
            match fetch_moonshot_balance(api_key, api_host).await {
                Ok(balance) => {
                    providers.push(ProviderUsage {
                        provider_id: id.into(), provider_name: name.into(),
                        total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                        balance: Some(balance), period: String::new(), error: None,
                    });
                }
                Err(e) => providers.push(ProviderUsage {
                    provider_id: id.into(), provider_name: name.into(),
                    total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                    balance: None, period: String::new(), error: Some(e),
                }),
            }
        }
        // Anthropic — needs admin key
        else if id == "anthropic" || base_domain.contains("anthropic") {
            if api_key.starts_with("sk-ant-admin") {
                match fetch_anthropic_usage(api_key).await {
                    Ok(mut u) => { u.provider_id = id.into(); u.provider_name = name.into(); providers.push(u); }
                    Err(e) => providers.push(ProviderUsage {
                        provider_id: id.into(), provider_name: name.into(),
                        total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                        balance: None, period: String::new(), error: Some(e),
                    }),
                }
            } else {
                providers.push(ProviderUsage {
                    provider_id: id.into(), provider_name: name.into(),
                    total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                    balance: None, period: String::new(), error: Some("Needs Admin key (sk-ant-admin...)".into()),
                });
            }
        }
        // Others — no usage API, show as configured
        else {
            providers.push(ProviderUsage {
                provider_id: id.into(), provider_name: name.into(),
                total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0.0,
                balance: None, period: String::new(),
                error: Some("No usage API available — use provider dashboard".into()),
            });
        }
    }

    let total_cost_usd: f64 = providers.iter().map(|p| p.total_cost_usd).sum();
    Ok(UsageSummary { providers, total_cost_usd })
}

async fn fetch_deepseek_balance(api_key: &str) -> Result<BalanceInfo, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://api.deepseek.com/user/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("DeepSeek API error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{}: {}", status, &body[..body.len().min(200)]));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let is_available = data.get("is_available").and_then(|v| v.as_bool()).unwrap_or(false);

    // balance_infos is an array, take the first one
    let balance_info = data
        .get("balance_infos")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first());

    let currency = balance_info
        .and_then(|b| b.get("currency").and_then(|v| v.as_str()))
        .unwrap_or("CNY")
        .to_string();

    let total_balance = balance_info
        .and_then(|b| b.get("total_balance").and_then(|v| v.as_str()))
        .unwrap_or("0.00")
        .to_string();

    Ok(BalanceInfo {
        currency,
        total_balance,
        is_available,
    })
}

async fn fetch_moonshot_balance(api_key: &str, api_host: &str) -> Result<BalanceInfo, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/v1/users/me/balance", api_host);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Moonshot API error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{}: {}", status, &body[..body.len().min(200)]));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    // Moonshot balance response format:
    // { "data": { "available_balance": 12.34, "voucher_balance": 0, "cash_balance": 12.34 } }
    let balance_data = data.get("data");

    let available = balance_data
        .and_then(|d| d.get("available_balance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let cash = balance_data
        .and_then(|d| d.get("cash_balance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Ok(BalanceInfo {
        currency: "CNY".to_string(),
        total_balance: format!("{:.2}", available),
        is_available: available > 0.0 || cash > 0.0,
    })
}

async fn fetch_anthropic_usage(admin_key: &str) -> Result<ProviderUsage, String> {
    let client = reqwest::Client::new();
    let now = chrono::Local::now();
    let start = now.format("%Y-%m-01").to_string();
    let end = now.format("%Y-%m-%d").to_string();

    let url = format!(
        "https://api.anthropic.com/v1/organizations/usage?start_date={}&end_date={}&granularity=daily",
        start, end
    );

    let response = client.get(&url)
        .header("x-api-key", admin_key)
        .header("anthropic-version", "2023-06-01")
        .send().await.map_err(|e| format!("API error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{}: {}", status, &body[..body.len().min(200)]));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;

    if let Some(daily) = data.get("data").and_then(|d| d.as_array()) {
        for day in daily {
            total_input += day.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            total_output += day.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        }
    }

    let cost = (total_input as f64 * 3.0 + total_output as f64 * 15.0) / 1_000_000.0;

    Ok(ProviderUsage {
        provider_id: String::new(), provider_name: String::new(),
        total_input_tokens: total_input, total_output_tokens: total_output,
        total_cost_usd: cost, balance: None,
        period: format!("{} ~ {}", start, end), error: None,
    })
}

// ── Fetch models from provider's /v1/models endpoint ──

#[derive(Serialize)]
pub struct FetchedModel {
    pub id: String,
    pub owned_by: Option<String>,
}

#[derive(Serialize)]
pub struct FetchModelsResult {
    pub provider_id: String,
    pub models: Vec<FetchedModel>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn fetch_provider_models(provider_id: String) -> Result<FetchModelsResult, String> {
    let hub_providers = read_hub_providers()?;

    let provider = hub_providers.iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&provider_id))
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let api_key = provider.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");

    // New format: endpoints array; old format: single baseUrl + apiType
    let (base_url, api_type) = if let Some(endpoints) = provider.get("endpoints").and_then(|v| v.as_array()) {
        // Find the first openai-compatible endpoint for model listing
        let openai_ep = endpoints.iter().find(|e| e.get("apiType").and_then(|v| v.as_str()) == Some("openai"));
        let first_ep = openai_ep.or_else(|| endpoints.first());
        match first_ep {
            Some(ep) => (
                ep.get("baseUrl").and_then(|v| v.as_str()).unwrap_or(""),
                ep.get("apiType").and_then(|v| v.as_str()).unwrap_or("openai"),
            ),
            None => ("", "openai"),
        }
    } else {
        // Old format fallback
        (
            provider.get("baseUrl").and_then(|v| v.as_str()).unwrap_or(""),
            provider.get("apiType").and_then(|v| v.as_str()).unwrap_or("openai"),
        )
    };

    if api_key.is_empty() {
        return Ok(FetchModelsResult {
            provider_id, models: vec![], error: Some("No API key configured".into()),
        });
    }

    let client = reqwest::Client::new();

    // Build models URL
    let models_url = if api_type == "anthropic" {
        // Anthropic doesn't have /models endpoint in the same way
        return Ok(FetchModelsResult {
            provider_id,
            models: vec![
                FetchedModel { id: "claude-opus-4-6".into(), owned_by: Some("anthropic".into()) },
                FetchedModel { id: "claude-sonnet-4-6".into(), owned_by: Some("anthropic".into()) },
                FetchedModel { id: "claude-haiku-4-5".into(), owned_by: Some("anthropic".into()) },
            ],
            error: None,
        });
    } else {
        // OpenAI-compatible: GET /models or /v1/models
        let base = base_url.trim_end_matches('/');
        if base.ends_with("/v1") || base.ends_with("/v3") || base.ends_with("/v4") {
            format!("{}/models", base)
        } else {
            format!("{}/v1/models", base)
        }
    };

    let response = client.get(&models_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("User-Agent", "AgentHub/0.1.0")
        .send().await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Ok(FetchModelsResult {
            provider_id,
            models: vec![],
            error: Some(format!("{}: {}", status, &body[..body.len().min(200)])),
        });
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let mut models = Vec::new();
    if let Some(arr) = data.get("data").and_then(|d| d.as_array()) {
        for model in arr {
            if let Some(id) = model.get("id").and_then(|v| v.as_str()) {
                models.push(FetchedModel {
                    id: id.to_string(),
                    owned_by: model.get("owned_by").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
    }

    // Sort by id
    models.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(FetchModelsResult { provider_id, models, error: None })
}
